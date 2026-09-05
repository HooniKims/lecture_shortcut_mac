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

pub fn replace(app: &AppHandle, old: &Config, new: &Config) -> Result<(), String> {
    let before = bindings(old)?;
    let after = bindings(new)?;
    let after_ids: HashSet<_> = after.iter().map(|(s, _)| s.id()).collect();
    let mut added = Vec::new();
    let mut removed = Vec::new();
    let result = (|| {
        for (key, _) in &after {
            if !app.global_shortcut().is_registered(*key) {
                app.global_shortcut().register(*key).map_err(|e| {
                    format!("다른 앱이 사용 중이거나 등록할 수 없는 단축키입니다 ({key}): {e}")
                })?;
                added.push(*key);
            }
        }
        for (key, _) in before {
            if !after_ids.contains(&key.id()) && app.global_shortcut().is_registered(key) {
                app.global_shortcut()
                    .unregister(key)
                    .map_err(|e| e.to_string())?;
                removed.push(key);
            }
        }
        Ok::<(), String>(())
    })();
    if let Err(error) = result {
        let mut rollback = Vec::new();
        for key in added {
            if let Err(e) = app.global_shortcut().unregister(key) {
                rollback.push(e.to_string());
            }
        }
        for key in removed {
            if let Err(e) = app.global_shortcut().register(key) {
                rollback.push(e.to_string());
            }
        }
        return Err(if rollback.is_empty() {
            error
        } else {
            format!(
                "{error}. 이전 단축키 복구도 실패했습니다. Cue를 재시작해 주세요: {}",
                rollback.join(", ")
            )
        });
    }
    Ok(())
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
