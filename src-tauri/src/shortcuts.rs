use crate::{model::Config, store::Store};
use std::collections::HashSet;
use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

pub fn bindings(config: &Config) -> Result<Vec<(Shortcut, String)>, String> {
    let mut list = Vec::new();
    for (key, action) in [
        (&config.settings.panel_shortcut, "panel"),
        (&config.settings.capture_shortcut, "capture"),
        (&config.settings.send_shortcut, "send"),
    ] {
        list.push((parse(key)?, action.to_string()));
    }
    for entry in &config.entries {
        if entry.label.trim().is_empty() {
            return Err("등록 이름을 입력해 주세요.".into());
        }
        list.push((parse(&entry.shortcut)?, entry.id.clone()));
    }
    let mut keys = HashSet::new();
    let mut ids = HashSet::new();
    for (shortcut, action) in &list {
        if !keys.insert(shortcut.id()) {
            return Err(format!("중복된 단축키가 있습니다: {shortcut}"));
        }
        if !ids.insert(action) {
            return Err("중복된 항목 식별자입니다.".into());
        }
    }
    Ok(list)
}

fn parse(key: &str) -> Result<Shortcut, String> {
    key.parse::<Shortcut>()
        .map_err(|e| format!("단축키를 확인해 주세요 ({key}): {e}"))
}

struct BindingPlan {
    before: Vec<Shortcut>,
    after: Vec<(Shortcut, String)>,
}

// A readable config can still contain invalid shortcuts. It must remain repairable.
// Validate the proposed bindings before touching OS registrations, but only parse
// the old keys needed for cleanup; old labels/duplicates must not block a save.
fn replacement_bindings(old: &Config, new: &Config) -> Result<BindingPlan, String> {
    let after = bindings(new)?;
    let mut seen = HashSet::new();
    let before = [
        &old.settings.panel_shortcut,
        &old.settings.capture_shortcut,
        &old.settings.send_shortcut,
    ]
    .into_iter()
    .chain(old.entries.iter().map(|entry| &entry.shortcut))
    .filter_map(|key| parse(key).ok())
    .filter(|key| seen.insert(key.id()))
    .collect();
    Ok(BindingPlan { before, after })
}

#[derive(Default)]
pub struct BindingChanges {
    added: Vec<Shortcut>,
    removed: Vec<Shortcut>,
}

impl BindingChanges {
    pub fn rollback(self, app: &AppHandle) -> Result<(), String> {
        self.undo(
            |key| {
                app.global_shortcut()
                    .unregister(key)
                    .map_err(|e| e.to_string())
            },
            |key| {
                app.global_shortcut()
                    .register(key)
                    .map_err(|e| e.to_string())
            },
        )
    }

    fn undo(
        self,
        mut unregister: impl FnMut(Shortcut) -> Result<(), String>,
        mut register: impl FnMut(Shortcut) -> Result<(), String>,
    ) -> Result<(), String> {
        let mut errors = Vec::new();
        for key in self.added {
            if let Err(error) = unregister(key) {
                errors.push(error);
            }
        }
        for key in self.removed {
            if let Err(error) = register(key) {
                errors.push(error);
            }
        }
        if errors.is_empty() {
            Ok(())
        } else {
            Err(errors.join(", "))
        }
    }
}

pub fn replace(app: &AppHandle, old: &Config, new: &Config) -> Result<BindingChanges, String> {
    let BindingPlan { before, after } = replacement_bindings(old, new)?;
    let after_ids: HashSet<_> = after.iter().map(|(s, _)| s.id()).collect();
    let mut changes = BindingChanges::default();
    let result = (|| {
        for (key, _) in &after {
            if !app.global_shortcut().is_registered(*key) {
                app.global_shortcut().register(*key).map_err(|e| {
                    format!("다른 앱이 사용 중이거나 등록할 수 없는 단축키입니다 ({key}): {e}")
                })?;
                changes.added.push(*key);
            }
        }
        for key in before {
            if !after_ids.contains(&key.id()) && app.global_shortcut().is_registered(key) {
                app.global_shortcut()
                    .unregister(key)
                    .map_err(|e| e.to_string())?;
                changes.removed.push(key);
            }
        }
        Ok::<(), String>(())
    })();
    if let Err(error) = result {
        return Err(match changes.rollback(app) {
            Ok(()) => error,
            Err(rollback) => format!(
                "{error}. 이전 단축키 복구도 실패했습니다. Cue를 재시작해 주세요: {rollback}"
            ),
        });
    }
    Ok(changes)
}

pub fn install(app: &AppHandle) -> Result<(), String> {
    let store = app.state::<Store>();
    let config = store.config.lock().map_err(|e| e.to_string())?;
    let mut failures = Vec::new();
    for (key, _) in bindings(&config)? {
        if let Err(e) = app.global_shortcut().register(key) {
            failures.push(format!("{key}: {e}"));
        }
    }
    if failures.is_empty() {
        Ok(())
    } else {
        Err(format!(
            "일부 단축키를 등록하지 못했습니다. 설정에서 변경해 주세요. {}",
            failures.join(", ")
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn invalid_existing_shortcuts_can_be_repaired_without_losing_valid_cleanup_keys()
    -> Result<(), String> {
        let mut old = Config::default();
        old.settings.capture_shortcut = "invalid-key".into();
        old.settings.send_shortcut = old.settings.panel_shortcut.clone();
        let BindingPlan { before, after } = replacement_bindings(&old, &Config::default())?;
        assert_eq!(before.len(), 1);
        assert_eq!(before[0], parse(&old.settings.panel_shortcut)?);
        assert_eq!(after.len(), 3);
        Ok(())
    }

    #[test]
    fn invalid_replacement_is_rejected_even_if_original_is_invalid() {
        let mut config = Config::default();
        config.settings.capture_shortcut = "invalid-key".into();
        assert!(replacement_bindings(&config, &config).is_err());
    }
    #[test]
    fn failed_persistence_restores_actual_registration_state_without_parsing_old_config()
    -> Result<(), String> {
        use std::cell::RefCell;
        let kept = parse("Super+Shift+1")?;
        let removed = parse("Super+Shift+2")?;
        let added = parse("Super+Shift+3")?;
        let registered = RefCell::new(HashSet::from([kept.id(), added.id()]));
        BindingChanges {
            added: vec![added],
            removed: vec![removed],
        }
        .undo(
            |key| {
                registered.borrow_mut().remove(&key.id());
                Ok(())
            },
            |key| {
                registered.borrow_mut().insert(key.id());
                Ok(())
            },
        )?;
        assert_eq!(
            *registered.borrow(),
            HashSet::from([kept.id(), removed.id()])
        );
        Ok(())
    }

    #[test]
    fn rollback_continues_restoring_keys_after_an_os_error() -> Result<(), String> {
        use std::cell::RefCell;
        let added = parse("Super+Shift+1")?;
        let removed = parse("Super+Shift+2")?;
        let calls = RefCell::new(Vec::new());
        let result = BindingChanges {
            added: vec![added],
            removed: vec![removed],
        }
        .undo(
            |key| {
                calls.borrow_mut().push(key.id());
                Err("OS rejected unregister".into())
            },
            |key| {
                calls.borrow_mut().push(key.id());
                Ok(())
            },
        );
        assert_eq!(result, Err("OS rejected unregister".into()));
        assert_eq!(*calls.borrow(), vec![added.id(), removed.id()]);
        Ok(())
    }
}
