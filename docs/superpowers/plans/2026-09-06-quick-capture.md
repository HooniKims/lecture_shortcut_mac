# Quick registration implementation plan

Goal: register the foreground browser tab or app window through a compact keyboard-first window without moving the source.
Architecture: Swift captures the foreground target before Cue takes focus. A reusable hidden Tauri capture window reads an in-memory draft and submits only registration fields. Backend merges into current configuration, validates shortcuts, then hides and restores source focus. Existing list registration remains available with tab-first filters.
Tech stack: existing Tauri/Rust, Swift/AppKit/AppleScript, vanilla HTML/CSS/JS.

1. Native tab capture/discovery fails explicitly on missing tab; restoreFocus never reopens or moves a target. Tests: capture a known tab, empty/browser error, generic app, restore closed app.
2. Add capture session commands/window and compact form with title, URL, alias, suggested shortcut, tab movement mode, Enter save and Escape cancel. Validate stale submissions and concurrent configuration changes in backend.
3. Tab-first list filters, clear URL metadata and registration instructions; preserve explicit app/window choices. Test empty search, many tabs, names and HTML escaping.
4. Run frontend, Rust, Swift and native process suites; Ego browser UI scenarios across themes, narrow width, failure/duplicate/saturated shortcuts; native end-to-end where desktop permits.
5. Two independent visual reviews; build installation package, commit/push authorized changes, remove owned test resources and report limitations honestly.
