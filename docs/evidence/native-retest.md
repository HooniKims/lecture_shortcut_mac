# Native desktop retest — 2026-09-05

## Fixed and verified

The native helper returned a connected display with valid geometry but an empty `NSScreen.localizedName`. The UI therefore kept showing its loading fallback and the settings selector displayed no monitor name. Both the packaged and source-built helper reproduced this.

`allDisplays()` now preserves the OS-provided name exactly when it is nonblank. Only an empty or whitespace-only name receives `모니터 N`. The fresh-source integration test failed before the change and passed afterward:

```text
FAIL: display 26 name was ""; expected "모니터 1"
PASS: 1 connected display names match the OS name or indexed fallback
```

Run with `sh tests/native-display-names.sh`. The test imports the real Swift sources and queries connected screens; it requires a macOS graphical session. This environment provided one unnamed display. Named-monitor preservation is implemented by retaining the original string; no physical named monitor was available for that branch's live validation.

After rebuilding, the running process path was explicitly verified as `src-tauri/target/release/bundle/macos/Cue.app/Contents/MacOS/cue` (PID 34572). The actual native main window, settings dialog, and presenter panel all displayed `모니터 1`; screenshots were inspected. The settings selector showed `모니터 1 · 기본 모니터` and the single-monitor standby checkbox remained disabled. Presenter show/hide also worked. No browser IPC fixture or debugger injection was used for these UI observations.

`npm test` passed all eight frontend regressions and eleven native process scenarios. The release app and DMG rebuilt successfully, and strict deep code-signature verification passed. This retest did not repeat the earlier memory stress audit; those results are not claimed as new measurements.

## Remaining blocked or inconclusive cases

- macOS's Accessibility list showed Cue enabled, but its stored code requirement referenced an earlier ad-hoc signature. The current release's designated requirement differs. Real `화면 띄우기` clicks still returned the Accessibility-permission warning after restart. No TCC database writes, permission bypasses, or signing-requirement weakening were used. The user needs to replace the old Cue permission entry with the exact rebuilt app, then the actual switch/minimize/restore/tab tests can continue.
- A same-identifier old development app was selected during one generic relaunch (PID 32665). Its observations are excluded from the corrected-build verdict. `open -n -a <absolute release app path>` plus checking the process executable selected the intended release. Every final observation above targets its PID.
- Presenter drag did not produce observed displacement. The automation tool marked synthetic input unverified; a control drag on the ordinary native title bar also did not move. The provider sometimes mixed the presenter's accessibility tree with the main window's metadata, so CoreGraphics window IDs and bounds were independently checked. This remains inconclusive, not a confirmed app defect or a pass.
- Search AXSetValue reported an expected/actual value mismatch. A separate OS input attempt was denied Accessibility access. Neither proves an application search failure; automated input delivery remains unverified.
- Physical dual-monitor movement/disconnection, Zoom sharing, and every browser remain untested in this run.

The latest user settings, registrations, and presets were preserved. The actual release app remains available for the permission step. Raw action JSON and screenshots are local under `.codex/live-qa/`; unrelated System Settings content is not committed.
