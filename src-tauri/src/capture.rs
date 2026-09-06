use crate::{
    commands,
    model::{Config, Entry, TabMode, Target},
    native,
    store::Store,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::{
    Mutex,
    atomic::{AtomicU64, Ordering},
};
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};

#[derive(Clone, Serialize)]
pub struct Draft {
    id: u64,
    target: Option<Target>,
    error: Option<String>,
}
#[derive(Default)]
pub struct Capture(pub Mutex<Option<Draft>>);
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Registration {
    label: String,
    shortcut: String,
    tab_mode: TabMode,
}

static CAPTURE_BUSY: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

pub fn open(app: &AppHandle) -> Result<(), String> {
    let _guard = native::BusyGuard::acquire(&CAPTURE_BUSY).ok_or("등록 화면을 처리 중입니다.")?;
    let window = app
        .get_webview_window("capture")
        .ok_or("빠른 등록창을 찾을 수 없습니다.")?;
    if window.is_visible().map_err(|e| e.to_string())? {
        return window.set_focus().map_err(|e| e.to_string());
    }
    let state = app.state::<Capture>();
    static SEQUENCE: AtomicU64 = AtomicU64::new(1);
    let id = SEQUENCE.fetch_add(1, Ordering::Relaxed);
    let reply = native::call(json!({"op":"capture", "ignoreBundleId":"dev.cue.desktop"}));
    let display = reply
        .as_ref()
        .ok()
        .and_then(|reply| reply.capture_display.clone());
    let captured =
        reply.and_then(|reply| reply.target.ok_or("등록할 화면을 찾지 못했습니다.".into()));
    *state.0.lock().map_err(|e| e.to_string())? = Some(match captured {
        Ok(target) => Draft {
            id,
            target: Some(target),
            error: None,
        },
        Err(error) => Draft {
            id,
            target: None,
            error: Some(error),
        },
    });
    if let Some(display) = display {
        let scale = window.scale_factor().map_err(|e| e.to_string())?;
        let size = window
            .outer_size()
            .map_err(|e| e.to_string())?
            .to_logical::<f64>(scale);
        window
            .set_position(tauri::LogicalPosition::new(
                display.x + ((display.width - size.width) / 2.0).max(0.0),
                display.y + ((display.height - size.height) / 2.0).max(0.0),
            ))
            .map_err(|e| e.to_string())?;
    } else {
        window.center().map_err(|e| e.to_string())?;
    }
    window
        .show()
        .and_then(|()| window.set_focus())
        .map_err(|e| e.to_string())?;
    app.emit_to("capture", "capture-changed", ())
        .map_err(|e| e.to_string())
}

fn capture_window(window: &WebviewWindow) -> Result<(), String> {
    if window.label() == "capture" {
        Ok(())
    } else {
        Err("빠른 등록창에서만 사용할 수 있습니다.".into())
    }
}

#[tauri::command]
pub fn capture_draft(window: WebviewWindow, app: AppHandle) -> Result<Option<Draft>, String> {
    capture_window(&window)?;
    Ok(app
        .state::<Capture>()
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .clone())
}

fn registration_config(
    current: &Config,
    target: &Target,
    input: Registration,
) -> Result<Config, String> {
    if current
        .entries
        .iter()
        .any(|entry| entry.target.id == target.id)
    {
        return Err(
            "이미 등록된 화면입니다. 메인 목록에서 이름과 단축키를 변경할 수 있습니다.".into(),
        );
    }
    let mut next = current.clone();
    let label = input.label.trim();
    next.entries.push(Entry {
        id: format!("capture:{}", target.id),
        label: if label.is_empty() {
            if target.title.is_empty() {
                &target.app
            } else {
                &target.title
            }
        } else {
            label
        }
        .into(),
        shortcut: input.shortcut,
        target: target.clone(),
        tab_mode: input.tab_mode,
    });
    crate::shortcuts::bindings(&next)?;
    Ok(next)
}

pub fn finish(app: &AppHandle, id: Option<u64>, input: Option<Registration>) -> Result<(), String> {
    let state = app.state::<Capture>();
    let _guard = native::BusyGuard::acquire(&CAPTURE_BUSY).ok_or("등록 화면을 처리 중입니다.")?;
    let draft = state
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .clone()
        .ok_or("등록할 화면이 없습니다.")?;
    if id.is_some_and(|id| id != draft.id) {
        return Err("등록 화면이 바뀌었습니다. 다시 확인해 주세요.".into());
    }
    let store = app.state::<Store>();
    if let Some(input) = input {
        let target = draft
            .target
            .as_ref()
            .ok_or("대상을 읽지 못해 등록할 수 없습니다.")?;
        let mut current = store.config.lock().map_err(|e| e.to_string())?;
        let next = registration_config(&current, target, input)?;
        commands::commit_config(app, &mut current, next)?;
    }
    let window = app
        .get_webview_window("capture")
        .ok_or("빠른 등록창을 찾을 수 없습니다.")?;
    window.hide().map_err(|e| e.to_string())?;
    {
        let mut owner = store.recording.lock().map_err(|e| e.to_string())?;
        if owner.as_deref() == Some("capture") {
            *owner = None;
        }
    }
    if let Some(target) = &draft.target {
        // Registration is already durable. A disappeared source must not invite a duplicate retry.
        if let Err(error) = native::call(json!({"op":"restoreFocus", "target":target})) {
            let _ = app.emit_to("main", "notice", error);
        }
    }
    *state.0.lock().map_err(|e| e.to_string())? = None;
    Ok(())
}

#[tauri::command]
pub async fn finish_capture(
    window: WebviewWindow,
    app: AppHandle,
    id: u64,
    input: Option<Registration>,
) -> Result<(), String> {
    capture_window(&window)?;
    tauri::async_runtime::spawn_blocking(move || finish(&app, Some(id), input))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::TargetKind;
    fn target(id: &str) -> Target {
        Target {
            id: id.into(),
            kind: TargetKind::Tab,
            app: "Browser".into(),
            bundle_id: "test.browser".into(),
            title: "Lesson".into(),
            window_id: Some("1".into()),
            tab_id: Some(id.into()),
            url: Some("https://example.com/lesson".into()),
            pid: None,
        }
    }
    fn input(key: &str) -> Registration {
        Registration {
            label: " ".into(),
            shortcut: key.into(),
            tab_mode: TabMode::Detach,
        }
    }
    #[test]
    fn capture_preserves_tab_identity_and_latest_config() -> Result<(), String> {
        let mut current = Config::default();
        current.settings.restore = false;
        let next = registration_config(&current, &target("2"), input("Super+Shift+1"))?;
        assert!(next.entries[0].target == target("2"));
        assert_eq!(next.entries[0].label, "Lesson");
        assert!(!next.settings.restore);
        Ok(())
    }
    #[test]
    fn duplicate_target_is_rejected_but_same_url_different_tab_is_allowed() -> Result<(), String> {
        let current =
            registration_config(&Config::default(), &target("2"), input("Super+Shift+1"))?;
        assert!(registration_config(&current, &target("2"), input("Super+Shift+2")).is_err());
        assert!(registration_config(&current, &target("3"), input("Super+Shift+2")).is_ok());
        Ok(())
    }
    #[test]
    fn reserved_or_duplicate_shortcuts_cannot_be_registered() -> Result<(), String> {
        let current = Config::default();
        assert!(
            registration_config(
                &current,
                &target("2"),
                input(&current.settings.capture_shortcut)
            )
            .is_err()
        );
        let next = registration_config(&current, &target("2"), input("Super+Shift+1"))?;
        assert!(
            registration_config(&next, &target("3"), input("CommandOrControl+Shift+1")).is_err()
        );
        Ok(())
    }
}
