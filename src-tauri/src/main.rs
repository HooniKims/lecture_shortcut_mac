#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod actions;
mod commands;
mod displays;
mod model;
mod native;
mod shortcuts;
mod store;
use std::sync::atomic::Ordering;
use tauri::Emitter;
use tauri::{
    Manager,
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
};
use tauri_plugin_global_shortcut::ShortcutState;

fn run() -> Result<(), Box<dyn std::error::Error>> {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            let _ = actions::show_main(app);
        }))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        if app.state::<store::Store>().recording.load(Ordering::SeqCst) {
                            let _ = app.emit("recorded-shortcut", shortcut.to_string());
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
            let quit = MenuItem::with_id(app, "quit", "Cue 종료", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &panel, &quit])?;
            let mut tray = TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("Cue · 강의 화면 전환");
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
                "quit" => app.exit(0),
                _ => (),
            })
            .build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                window
                    .state::<store::Store>()
                    .recording
                    .store(false, Ordering::SeqCst);
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_state,
            commands::save_config,
            commands::inspect_native,
            commands::activate_entry,
            commands::toggle_panel,
            commands::refresh_displays,
            commands::record_shortcut
        ])
        .run(tauri::generate_context!())?;
    Ok(())
}

fn main() {
    if let Err(error) = run() {
        eprintln!("Cue 시작 실패: {error}");
        std::process::exit(1);
    }
}
