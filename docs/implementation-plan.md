# CUE macOS implementation

Scope: the selected C / Studio design as a real Tauri 2 app, with a bundled Swift macOS adapter. No browser extension or separate runtime installation.

1. **Completed:** native app foundation, typed JSON adapter, global shortcuts and C UI.
2. **Completed:** connect live target registration, window/tab actions, display selection and standby, persistence/presets, presenter panel.
3. **Completed (preview):** compile and package the app; exercise the native UI and safe test targets, review the implementation and record supported browser behavior.

The native adapter owns Accessibility, AppKit and browser scripting. Rust owns configuration, shortcut registration, action serialization and application windows. Frontend owns presentation and uses Tauri commands only. Unsupported tab scripting is reported; app/window control remains available.

Validation must distinguish build success, UI behavior and OS automation permission-dependent behavior. The old mockup server remains stopped.

User steering: UI checks must use ego-browser; source must be committed and pushed to https://github.com/HooniKims/lecture_shortcut_mac.git. No mockup server restart.

Final preview artifacts built and signed ad-hoc. UI/adapter/native registration checks recorded in docs/evidence/implementation-qa.md. External acceptance remains: Cue permission grants, real dual monitors/Zoom, and presenter drag confirmation on the user desktop. Git commit/push is the final delivery operation.
