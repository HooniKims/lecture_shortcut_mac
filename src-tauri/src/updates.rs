use crate::update_state::Status;
pub use crate::update_state::Updates;
use crate::{native::BusyGuard, store::Store, update_install};
use std::{
    sync::atomic::{AtomicBool, Ordering},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};
use tauri_plugin_updater::UpdaterExt;

static BUSY: AtomicBool = AtomicBool::new(false);
fn require_main(window: &WebviewWindow) -> Result<(), String> {
    if window.label() == "main" {
        Ok(())
    } else {
        Err("메인 창에서 업데이트를 확인해 주세요.".into())
    }
}
fn publish(app: &AppHandle, status: Status) -> Result<(), String> {
    if matches!(&status, Status::Available { .. }) {
        let _ = crate::actions::show_main(app);
    }
    *app.state::<Updates>()
        .status
        .lock()
        .map_err(|e| e.to_string())? = status.clone();
    app.emit_to("main", "update-status", status)
        .map_err(|e| e.to_string())
}
pub fn installing(app: &AppHandle) -> bool {
    app.state::<Updates>()
        .status
        .lock()
        .map(|s| matches!(*s, Status::Installing { .. }))
        .unwrap_or(true)
}
pub fn request_update_dialog(app: &AppHandle) -> Result<(), String> {
    app.state::<Updates>()
        .open_requested
        .store(true, Ordering::SeqCst);
    crate::actions::show_main(app)?;
    app.emit_to("main", "open-updates", ())
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub fn take_update_request(app: AppHandle, window: WebviewWindow) -> Result<bool, String> {
    require_main(&window)?;
    Ok(app
        .state::<Updates>()
        .open_requested
        .swap(false, Ordering::SeqCst))
}
#[tauri::command]
pub fn update_status(app: AppHandle, window: WebviewWindow) -> Result<serde_json::Value, String> {
    require_main(&window)?;
    Ok(
        serde_json::json!({"currentVersion":app.package_info().version.to_string(),
        "status":*app.state::<Updates>().status.lock().map_err(|e| e.to_string())?}),
    )
}
fn check_due(now: u64, previous: u64) -> bool {
    now < previous || now.saturating_sub(previous) >= 86_400
}
#[tauri::command]
pub async fn check_update(
    app: AppHandle,
    window: WebviewWindow,
    automatic: bool,
) -> Result<(), String> {
    require_main(&window)?;
    let _guard = BusyGuard::acquire(&BUSY).ok_or("업데이트 작업이 진행 중입니다.")?;
    if matches!(
        *app.state::<Updates>()
            .status
            .lock()
            .map_err(|e| e.to_string())?,
        Status::Ready { .. }
    ) {
        return Ok(());
    }
    let stamp = app
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?
        .join("update-check.txt");
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_secs();
    if automatic {
        if !app
            .state::<Store>()
            .config
            .lock()
            .map_err(|e| e.to_string())?
            .settings
            .check_updates
        {
            return Ok(());
        }
        let previous = std::fs::read_to_string(&stamp)
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(0);
        if !check_due(now, previous) {
            return Ok(());
        }
    }
    // A failed stamp write must not turn a manual network check into a false success.
    std::fs::write(stamp, now.to_string()).map_err(|e| e.to_string())?;
    *app.state::<Updates>()
        .pending
        .lock()
        .map_err(|e| e.to_string())? = None;
    publish(&app, Status::Checking)?;
    let result = match app
        .updater_builder()
        .timeout(Duration::from_secs(20))
        .build()
    {
        Ok(updater) => updater.check().await,
        Err(e) => Err(e),
    };
    let status = match result {
        Ok(Some(mut update)) => {
            update.timeout = Some(Duration::from_secs(300));
            if update.download_url.scheme() != "https" {
                Status::Error {
                    message: "안전한 업데이트 주소가 아닙니다. 배포자에게 알려 주세요.".into(),
                }
            } else {
                let status = Status::Available {
                    version: update.version.clone(),
                    notes: update.body.clone().unwrap_or_default(),
                };
                *app.state::<Updates>()
                    .pending
                    .lock()
                    .map_err(|e| e.to_string())? = Some(update);
                status
            }
        }
        Ok(None) => Status::Latest,
        Err(tauri_plugin_updater::Error::ReleaseNotFound) => Status::Unavailable,
        Err(_) => Status::Error {
            message:
                "업데이트 정보를 가져오지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요."
                    .into(),
        },
    };
    publish(&app, status)
}
#[tauri::command]
pub async fn install_update(app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    require_main(&window)?;
    let guard = BusyGuard::acquire(&BUSY).ok_or("업데이트 작업이 진행 중입니다.")?;
    let update = app
        .state::<Updates>()
        .pending
        .lock()
        .map_err(|e| e.to_string())?
        .take()
        .ok_or("먼저 업데이트를 확인해 주세요.")?;
    let version = update.version.clone();
    publish(
        &app,
        Status::Downloading {
            version: version.clone(),
            downloaded: 0,
            total: None,
        },
    )?;
    let mut downloaded = 0u64;
    let mut last = std::time::Instant::now();
    let bytes = update
        .download(
            |size, total| {
                downloaded = downloaded.saturating_add(size as u64);
                if last.elapsed() >= Duration::from_millis(150) {
                    let _ = publish(
                        &app,
                        Status::Downloading {
                            version: version.clone(),
                            downloaded,
                            total,
                        },
                    );
                    last = std::time::Instant::now();
                }
            },
            || {},
        )
        .await;
    let bytes = match bytes {
        Ok(bytes) => bytes,
        Err(_) => return publish(
            &app,
            Status::Error {
                message:
                    "다운로드 또는 파일 서명 검증에 실패했습니다. 기존 앱은 변경하지 않았습니다."
                        .into(),
            },
        ),
    };
    publish(
        &app,
        Status::Installing {
            version: version.clone(),
        },
    )?;
    let installer_app = app.clone();
    let joined = tauri::async_runtime::spawn_blocking(move || {
        let result = (|| {
            let store = installer_app.state::<Store>();
            if store.path.exists() {
                std::fs::copy(
                    &store.path,
                    store.path.with_file_name("config.before-update.json"),
                )
                .map_err(|e| e.to_string())?;
            }
            update_install::install(&bytes, &update_install::current_bundle()?, &update.version)
        })();
        (result, guard)
    })
    .await;
    let (result, _guard) = match joined {
        Ok(value) => value,
        Err(error) => {
            return publish(
                &app,
                Status::Error {
                    message: error.to_string(),
                },
            );
        }
    };
    publish(
        &app,
        match result {
            Ok(()) => Status::Ready { version },
            Err(message) => Status::Error { message },
        },
    )
}
#[tauri::command]
pub fn restart_updated_app(app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    require_main(&window)?;
    let ready = matches!(
        *app.state::<Updates>()
            .status
            .lock()
            .map_err(|e| e.to_string())?,
        Status::Ready { .. }
    );
    if !ready {
        return Err("설치가 끝난 뒤 다시 시작할 수 있습니다.".into());
    }
    app.restart()
}
#[cfg(test)]
mod tests {
    use super::check_due;
    #[test]
    fn auto_check_when_less_than_a_day_elapsed_is_skipped() {
        assert!(!check_due(90_000, 89_000));
    }
    #[test]
    fn auto_check_when_day_elapsed_or_clock_reset_runs() {
        assert!(check_due(90_000, 1));
        assert!(check_due(1, 90_000));
    }
}
