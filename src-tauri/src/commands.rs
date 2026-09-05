use crate::{
    actions,
    model::{Config, NativeReply},
    native, shortcuts,
    store::Store,
};
use serde_json::{Value, json};
use tauri::{AppHandle, Emitter, Manager};

#[tauri::command]
pub fn get_state(app: AppHandle) -> Result<Value, String> {
    let store = app.state::<Store>();
    Ok(
        json!({ "config": *store.config.lock().map_err(|e| e.to_string())?,
        "prepared": *store.prepared.lock().map_err(|e| e.to_string())?,
        "startupError": *store.startup_error.lock().map_err(|e| e.to_string())? }),
    )
}

#[tauri::command]
pub fn save_config(app: AppHandle, config: Config) -> Result<(), String> {
    let store = app.state::<Store>();
    let mut current = store.config.lock().map_err(|e| e.to_string())?;
    shortcuts::replace(&app, &current, &config)?;
    if let Err(e) = store.persist(&config) {
        if let Err(rollback) = shortcuts::replace(&app, &config, &current) {
            return Err(format!(
                "{e}. 이전 단축키 복구 실패: {rollback}. Cue를 재시작해 주세요."
            ));
        }
        return Err(e);
    }
    *current = config;
    *store.prepared.lock().map_err(|e| e.to_string())? = None;
    app.emit("changed", ()).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn inspect_native(op: String) -> Result<NativeReply, String> {
    if !["snapshot", "displays", "permissions", "requestPermissions"].contains(&op.as_str()) {
        return Err("지원하지 않는 조회입니다.".into());
    }
    tauri::async_runtime::spawn_blocking(move || native::call(json!({"op":op})))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn activate_entry(app: AppHandle, id: String, send: bool) -> Result<NativeReply, String> {
    tauri::async_runtime::spawn_blocking(move || actions::perform(&app, &id, send))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn toggle_panel(app: AppHandle) -> Result<(), String> {
    actions::panel(&app)
}

#[tauri::command]
pub async fn refresh_displays(app: AppHandle) -> Result<NativeReply, String> {
    let reply = inspect_native("displays".into()).await?;
    if reply.displays.as_ref().is_some_and(|d| d.len() < 2) {
        let store = app.state::<Store>();
        let mut config = store.config.lock().map_err(|e| e.to_string())?;
        if config.settings.standby {
            config.settings.standby = false;
            *store.prepared.lock().map_err(|e| e.to_string())? = None;
            store.persist(&config)?;
            app.emit("changed", ()).map_err(|e| e.to_string())?;
        }
    }
    Ok(reply)
}

#[tauri::command]
pub fn record_shortcut(app: AppHandle, recording: bool) {
    app.state::<Store>()
        .recording
        .store(recording, std::sync::atomic::Ordering::SeqCst);
}
