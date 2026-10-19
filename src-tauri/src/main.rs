#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod actions;
mod capture;
mod commands;
mod displays;
mod model;
mod native;
mod shortcuts;
mod store;
mod update_install;
mod update_state;
mod updates;
use tauri::Emitter;
use tauri::{
    Manager,
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
};
use tauri_plugin_global_shortcut::ShortcutState;

fn run() -> Result<(), Box<dyn std::error::Error>> {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(updates::Updates::default())
        .manage(capture::Capture::default())
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            let _ = actions::show_main(app);
        }))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        let owner = app
                            .state::<store::Store>()
                            .recording
                            .lock()
                            .ok()
                            .and_then(|owner| owner.clone());
                        if let Some(owner) = owner.filter(|label| {
                            app.get_webview_window(label)
                                .is_some_and(|window| window.is_focused().unwrap_or(false))
                        }) {
                            let _ = app.emit_to(owner, "recorded-shortcut", shortcut.to_string());
                            return;
                        }
                        let action = app
                            .state::<store::Store>()
                            .config
                            .lock()
                            .ok()
                            .and_then(|c| shortcuts::bindings(&c).ok())
                            .and_then(|b| b.into_iter().find(|(key, _)| key == shortcut))
                            .map(|(_, action)| action);
                        if let Some(action) = action {
                            actions::dispatch(app.clone(), action);
                        }
                    }
                })
                .build(),
        )
        .setup(|app| {
            let state = store::Store::load(app.handle())?;
            let theme = state
                .config
                .lock()
                .map_err(|e| e.to_string())?
                .settings
                .theme;
            app.manage(state);
            actions::apply_theme(app.handle(), theme)?;
            if let Err(e) = shortcuts::install(app.handle()) {
                *app.state::<store::Store>()
                    .startup_error
                    .lock()
                    .map_err(|e| e.to_string())? = Some(e);
            }
            let show = MenuItem::with_id(app, "show", "Cue 열기", true, None::<&str>)?;
            let panel = MenuItem::with_id(app, "panel", "발표자 패널", true, None::<&str>)?;
            let updates = MenuItem::with_id(app, "updates", "업데이트 확인…", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Cue 종료", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &panel, &updates, &quit])?;
            let mut tray = TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("Cue · 강의 화면 전환");
            #[cfg(target_os = "macos")]
            {
                tray = tray
                    .icon(tauri::include_image!("icons/tray-template.png"))
                    .icon_as_template(true);
            }
            #[cfg(not(target_os = "macos"))]
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.on_menu_event(|app, event| match event.id.as_ref() {
                "show" => {
                    let _ = actions::show_main(app);
                }
                "panel" => {
                    let _ = actions::panel(app);
                }
                "updates" => {
                    if let Err(error) = updates::request_update_dialog(app) {
                        let _ = app.emit_to("main", "notice", error);
                    }
                }
                "quit" => app.exit(0),
                _ => (),
            })
            .build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                if window.label() == "capture" {
                    let app = window.app_handle().clone();
                    tauri::async_runtime::spawn_blocking(move || {
                        if let Err(error) = capture::finish(&app, None, None) {
                            let _ = app.emit_to("capture", "notice", error);
                        }
                    });
                    return;
                }
                if let Ok(mut owner) = window.state::<store::Store>().recording.lock() {
                    if owner.as_deref() == Some(window.label()) {
                        *owner = None;
                    }
                }
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_state,
            commands::save_config,
            commands::inspect_native,
            commands::activate_entry,
            commands::toggle_panel,
            commands::show_panel,
            commands::refresh_displays,
            commands::record_shortcut,
            capture::capture_draft,
            capture::finish_capture,
            updates::take_update_request,
            updates::update_status,
            updates::check_update,
            updates::install_update,
            updates::restart_updated_app
        ])
        .build(tauri::generate_context!())?
        .run(|app, event| {
            if let tauri::RunEvent::ExitRequested { api, .. } = event
                && updates::installing(app)
            {
                api.prevent_exit();
            }
        });
    Ok(())
}

fn main() {
    if let Err(error) = run() {
        eprintln!("Cue 시작 실패: {error}");
        std::process::exit(1);
    }
}

#[cfg(test)]
mod update_transport_tests;
