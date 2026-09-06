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
        "startupError": *store.startup_error.lock().map_err(|e| e.to_string())?,
        "displays": store.displays.lock().map_err(|e| e.to_string())?.as_ref().map(|(_, d)| d.clone()).unwrap_or_default() }),
    )
}

#[tauri::command]
pub fn save_config(app: AppHandle, config: Config) -> Result<(), String> {
    let store = app.state::<Store>();
    let mut current = store.config.lock().map_err(|e| e.to_string())?;
    commit_config(&app, &mut current, config)
}

pub fn commit_config(app: &AppHandle, current: &mut Config, config: Config) -> Result<(), String> {
    let store = app.state::<Store>();
    shortcuts::replace(app, current, &config)?;
    if let Err(e) = store.persist(&config) {
        if let Err(rollback) = shortcuts::replace(app, &config, current) {
            return Err(format!(
                "{e}. 이전 단축키 복구 실패: {rollback}. Cue를 재시작해 주세요."
            ));
        }
        return Err(e);
    }
    if current.settings.theme != config.settings.theme
        && let Err(error) = actions::apply_theme(app, config.settings.theme)
    {
        let _ = app.emit("notice", error);
    }
    if current.entries != config.entries
        || current.settings.standby != config.settings.standby
        || current.settings.display_id != config.settings.display_id
    {
        *store.prepared.lock().map_err(|e| e.to_string())? = None;
    }
    *current = config;
    app.emit("changed", ()).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn inspect_native(op: String) -> Result<NativeReply, String> {
    if !["snapshot", "displays", "permissions", "requestPermissions"].contains(&op.as_str()) {
        return Err("지원하지 않는 조회입니다.".into());
    }
    static INSPECTING: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
    let guard = native::BusyGuard::acquire(&INSPECTING)
        .ok_or("목록을 조회 중입니다. 잠시 후 다시 시도하세요.")?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = guard;
        native::call(json!({"op":op}))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn activate_entry(app: AppHandle, id: String, send: bool) -> Result<NativeReply, String> {
    static ACTIVATING: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
    let guard = native::BusyGuard::acquire(&ACTIVATING).ok_or("이전 화면을 전환 중입니다.")?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = guard;
        actions::perform(&app, &id, send)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn toggle_panel(app: AppHandle) -> Result<(), String> {
    actions::panel(&app)
}

#[tauri::command]
pub async fn refresh_displays(app: AppHandle) -> Result<NativeReply, String> {
    static REFRESHING: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
    let guard = native::BusyGuard::acquire(&REFRESHING).ok_or("모니터 정보를 확인 중입니다.")?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = guard;
        crate::displays::refresh(&app).map(|displays| NativeReply {
            ok: true,
            displays: Some(displays),
            ..NativeReply::default()
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn record_shortcut(
    window: tauri::WebviewWindow,
    app: AppHandle,
    recording: bool,
) -> Result<(), String> {
    let store = app.state::<Store>();
    let focused = recording && window.is_focused().map_err(|e| e.to_string())?;
    let mut owner = store.recording.lock().map_err(|e| e.to_string())?;
    if focused {
        *owner = Some(window.label().into());
    } else if !recording && owner.as_deref() == Some(window.label()) {
        *owner = None;
    }
    Ok(())
}
