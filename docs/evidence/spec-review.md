# CUE macOS implementation: requirement review

Review date: 2026-09-05. Source review against `docs/requirements.md`, including follow-up inspection of all reported fixes. This report is not approval of a final commit or certification of runtime behavior.

## Current verdict

**PASS for the reviewed source changes. No unresolved source-review findings remain.** Packaging and matching native-surface QA are separate gates being completed by the parent agent.

## Findings resolved and re-verified

1. **Browser identity after restart.** `native/BrowserActions.swift:31` now compares the saved PID with the browser process before trusting runtime tab/window IDs or preferring the saved window when matching URLs. Across restart, tabs require an unambiguous saved URL and browser windows require an unambiguous original title. Missing or ambiguous targets report an error rather than silently selecting another window.

2. **Repeated shortcuts in standby mode.** `native/WindowActions.swift:48` and `native/BrowserActions.swift:61` now apply the foreground/minimized toggle decision to both `toggle` and `prepare`. Preparation still avoids moving the target. `src-tauri/src/actions.rs:67` clears prepared state when the outcome is minimized.

3. **Shortcut recording versus registered global shortcuts.** `src-tauri/src/main.rs:26` diverts a registered combination into a `recorded-shortcut` event while recording, rather than executing its action. `app/main.js:107` writes that combination to the focused shortcut input. `app/dialogs.js:115` onward arms/disarms recording on input focus-in/out and window blur, and re-evaluates the active input on window focus. Native window close also clears recording. The follow-up window-focus handler resolves the previously reported leave-and-return lifecycle gap. `app/main.js:10` normalizes plugin key strings case-insensitively for display.

## Relevant implemented behavior observed in source

- C Studio UI provides target registration, editable aliases separate from target identity, per-tab detach/window choice, configurable shortcuts, preset save/load, and a draggable separate presenter window.
- Turning restore off removes only current registrations from persisted configuration, retaining presets and settings.
- Display refresh disables standby when fewer than two displays remain; native moves retain existing window dimensions.
- Unsupported browser tab control is distinguished from generic app/window support in user-facing copy. The implementation does not claim verified universal tab support.
- Closed generic document windows report that document paths cannot be restored. Requirements already reserve that behavior for implementation verification.

## Runtime evidence and limits

The parent agent reported manually verifying that an already registered Cmd+Shift+1 combination populated the shortcut field as `shift+super+Digit1` while Cue remained foreground. This is parent-provided evidence, not a runtime test performed by this reviewer.

This reviewer re-read source only. Browser restart identity, repeated standby toggling, physical dual-display movement, and recorder behavior after switching away and returning need matching native-surface evidence. Final packaged-app QA and Ego Browser UI testing remain the parent agent's responsibility.
