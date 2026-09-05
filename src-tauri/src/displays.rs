use crate::{model::Display, native, store::Store};
use serde_json::json;
use tauri::{AppHandle, Emitter, Manager};

pub fn refresh(app: &AppHandle) -> Result<Vec<Display>, String> {
    let monitors = app.available_monitors().map_err(|e| e.to_string())?;
    let signature = serde_json::to_string(&monitors).map_err(|e| e.to_string())?;
    let store = app.state::<Store>();
    let cached = store
        .displays
        .lock()
        .map_err(|e| e.to_string())?
        .as_ref()
        .filter(|(previous, _)| previous == &signature)
        .map(|(_, displays)| displays.clone());
    let (displays, changed) = if let Some(displays) = cached {
        (displays, false)
    } else {
        // Tauri reports physical bounds, but the helper uses NSScreen IDs and AX logical bounds.
        // Keep the helper as the source of truth; only rediscover after topology/work-area changes.
        // Do not hold the cache lock while waiting for a helper; get_state reads it on the UI thread.
        let displays = native::call(json!({"op":"displays"}))?
            .displays
            .ok_or("모니터 정보를 읽을 수 없습니다.")?;
        let mut cache = store.displays.lock().map_err(|e| e.to_string())?;
        let changed = cache.as_ref().is_none_or(|(_, old)| old != &displays);
        *cache = Some((signature, displays.clone()));
        (displays, changed)
    };
    if displays.len() < 2 {
        let mut config = store.config.lock().map_err(|e| e.to_string())?;
        if config.settings.standby {
            let mut updated = config.clone();
            updated.settings.standby = false;
            store.persist(&updated)?;
            *config = updated;
            *store.prepared.lock().map_err(|e| e.to_string())? = None;
            app.emit("changed", ()).map_err(|e| e.to_string())?;
        }
    }
    if changed {
        app.emit("displays-changed", &displays)
            .map_err(|e| e.to_string())?;
    }
    Ok(displays)
}
