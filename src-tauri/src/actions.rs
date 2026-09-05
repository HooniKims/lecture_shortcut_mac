use crate::{
    model::{NativeReply, Theme},
    native,
    store::Store,
};
use serde_json::json;
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Emitter, Manager};

pub fn apply_theme(app: &AppHandle, theme: Theme) -> Result<(), String> {
    app.set_theme(Some(theme.native()));
    for window in app.webview_windows().values() {
        window
            .set_theme(Some(theme.native()))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn panel(app: &AppHandle) -> Result<(), String> {
    let win = app
        .get_webview_window("presenter")
        .ok_or("발표자 패널을 찾을 수 없습니다.")?;
    if win.is_visible().map_err(|e| e.to_string())? {
        win.hide()
    } else {
        win.show()
    }
    .map_err(|e| e.to_string())
}

pub fn show_main(app: &AppHandle) -> Result<(), String> {
    let win = app
        .get_webview_window("main")
        .ok_or("메인 창을 찾을 수 없습니다.")?;
    win.show()
        .and_then(|()| win.unminimize())
        .and_then(|()| win.set_focus())
        .map_err(|e| e.to_string())
}

pub fn perform(app: &AppHandle, id: &str, send: bool) -> Result<NativeReply, String> {
    let store = app.state::<Store>();
    if store.busy.swap(true, Ordering::SeqCst) {
        return Err("이전 화면을 전환 중입니다.".into());
    }
    let result = perform_inner(app, id, send);
    store.busy.store(false, Ordering::SeqCst);
    result
}

fn perform_inner(app: &AppHandle, id: &str, send: bool) -> Result<NativeReply, String> {
    let store = app.state::<Store>();
    let (entry, settings) = {
        let config = store.config.lock().map_err(|e| e.to_string())?;
        let entry = config
            .entries
            .iter()
            .find(|e| e.id == id)
            .ok_or("등록한 항목을 찾을 수 없습니다.")?
            .clone();
        (entry, config.settings.clone())
    };
    let displays = crate::displays::refresh(app)?;
    let standby = settings.standby && displays.len() > 1;
    let display = settings
        .display_id
        .as_ref()
        .and_then(|id| displays.iter().find(|d| &d.id == id))
        .or_else(|| displays.iter().find(|d| !d.primary))
        .or_else(|| displays.first());
    let op = if send {
        "send"
    } else if standby {
        "prepare"
    } else {
        "toggle"
    };
    let reply = native::call(
        json!({"op":op, "target":entry.target, "displayId":display.map(|d| &d.id), "tabMode":entry.tab_mode}),
    )?;
    *store.prepared.lock().map_err(|e| e.to_string())? =
        if standby && !send && reply.outcome.as_deref() != Some("minimized") {
            Some(id.into())
        } else {
            None
        };
    if let Some(target) = &reply.target {
        let mut current = store.config.lock().map_err(|e| e.to_string())?;
        if let Some(item) = current.entries.iter_mut().find(|e| e.id == id)
            && item.target != *target
        {
            item.target = target.clone();
            store.persist(&current)?;
        }
    }
    app.emit("action", json!({"id":id,"outcome":reply.outcome}))
        .map_err(|e| e.to_string())?;
    app.emit("changed", ()).map_err(|e| e.to_string())?;
    Ok(reply)
}

pub fn capture(app: &AppHandle) -> Result<(), String> {
    let reply = native::call(json!({"op":"capture", "ignoreBundleId":"dev.cue.desktop"}))?;
    let target = reply
        .target
        .ok_or("등록할 화면을 먼저 앞으로 가져와 주세요.")?;
    show_main(app)?;
    app.emit("captured", target).map_err(|e| e.to_string())
}

pub fn dispatch(app: AppHandle, action: String) {
    static DISPATCHING: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
    let Some(guard) = native::BusyGuard::acquire(&DISPATCHING) else {
        return;
    };
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = guard;
        let result = match action.as_str() {
            "panel" => panel(&app),
            "capture" => capture(&app),
            "send" => {
                let id = app
                    .state::<Store>()
                    .prepared
                    .lock()
                    .ok()
                    .and_then(|id| id.clone());
                match id {
                    Some(id) => perform(&app, &id, true).map(|_| ()),
                    None => Err("대기 중인 화면이 없습니다.".into()),
                }
            }
            id => perform(&app, id, false).map(|_| ()),
        };
        if let Err(error) = result {
            let _ = app.emit("notice", error);
        }
    });
}
