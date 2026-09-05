# macOS implementation verification

Date: 2026-09-05. Environment: macOS 26.6.2, Apple Silicon, Korean UI, one 1680 × 896 virtual display.

## Build and static checks

- `node --check app/main.js`, `node --check app/dialogs.js`: pass.
- `cargo check` and `cargo clippy -- -D warnings`: pass.
- Tauri debug `.app` and release `.app` / `.dmg`: built with local ad-hoc signing. No Apple notarization credentials were supplied.
- No installed Biome / rust-analyzer LSP was available; compiler, clippy and JS syntax checks were used. No global LSP installation was requested or performed.
- Source review: [spec review](spec-review.md) and [code review](code-review.md). Findings were fixed before handoff.

## ego-browser UI checks

Used task space 2 (`Cue mac app QA`) against the actual `app/` assets served temporarily on loopback port 4318. The old design mockup server on 4317 stayed stopped. Tauri IPC was replaced with an isolated test adapter; these results cover UI behavior, not the Rust backend or OS automation.

Verified through ego-browser DOM actions and observed resulting state:

- Source window/tab title defaults, custom registration name, later name edit retaining original source identity.
- Preset save/load; loading restores the saved registration count and alias.
- Search empty state; presenter panel displays the same alias and shortcut.
- Single-display standby field is disabled and unchecked.
- Duplicate shortcut error stays in the dialog; a different key permits registration.
- Non-tab registration uses `tabMode: detach` even though its mode select is disabled.
- Failed target scan shows an error and an enabled retry button.
- An old scan resolved after a replacement dialog did not replace the new dialog's target or suggested name.
- Normal desktop width has no horizontal overflow.

The ego screenshot API timed out/failed; no successful ego screenshot is claimed. Native application screenshots were inspected separately. Earlier assertions affected by CDP viewport override / action timing were discarded and rerun using fresh DOM state.

## Native adapter integration checks

See [native results](../../native/evidence/results.json). These run the real compiled Swift adapter with owned temporary browser pages and TextEdit documents. Root reran the drivers after the Safari existing-window exclusion fix.

- Chrome: real tab detachment preserves tab ID and URL, leaves source sibling; repeat minimizes, next call restores; capture and closed URL reopen pass.
- Safari: selection, minimize and native-menu detachment pass.
- TextEdit: window lookup, position/size preservation on the available display, raise/minimize/restore/capture, prepare repeat toggle, and invalid-input error pass.
- Saved browser process-ID mismatch must not reuse another tab's numeric runtime ID.
- `--help`, permission lookup, display lookup and invalid-operation response pass.

These adapter checks ran under the existing development host's permissions. They do not establish that a new Finder-launched Cue build already has its own macOS permissions.

## Installed application surface

The actual Tauri `.app` was launched and inspected with native accessibility snapshots/screenshots. Observed: empty C Studio screen, registration dialog, real running-app discovery, missing-permission warning, quick-register global hotkey, registered entry persisted by Rust, and separate presenter window.

A real registered shortcut pressed while its input was focused produced `shift+super+Digit1` in that field without switching the target. Display formatting was then normalized to key symbols. App/window registration initially failed because a disabled tab-mode field serialized as `null`; the fallback was fixed and the packaged UI registration then succeeded.

## Remaining external validation

- Actual two-monitor movement, relative placement above/below the primary display, unplug handling, and Zoom whole-screen sharing require the user's dual-monitor setup. UI single-monitor behavior and native coordinate code are not substitutes for this test.
- Finder-launched builds need Cue's own Accessibility and browser Automation grants. Local ad-hoc rebuilds may invalidate previous grants.
- Chrome/Safari were tested; other browsers' tab automation is unverified or unsupported as described in the README. Generic closed documents cannot be recreated without a path.
- OS-level failure of unregistering an existing shortcut was not fault-injected; the rollback path was source-reviewed.

## Final release follow-up

- Finder-launched release app reopened with the edited alias, registered shortcut and named preset intact. Native screenshots were visually inspected for the selected Studio design.
- Presenter show/hide and synchronized alias/key display were observed. Drag uses Tauri's native `data-tauri-drag-region` integration. The current computer-use provider mixed main/presenter window metadata and synthetic drags did not produce confirmed displacement; **presenter movement is not certified by this run** and needs a real desktop drag check.
- Release signature verification (`codesign --verify --deep --strict`) and DMG checksum verification (`hdiutil verify`) passed.
- Final DMG: `Cue_0.1.0_aarch64.dmg`, SHA-256 `b16a13610aa2a07d63b899d0ce6a098b9b4fcc93d263133b359f760b1748834b`.
- ego task-space cleanup returned `done: true`; temporary UI server port 4318 was stopped.
