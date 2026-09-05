# Cue macOS helper

`./native/build.sh` builds a self-contained Swift executable for the host architecture into `src-tauri/binaries/`. It uses public AppKit, Accessibility and Core Graphics APIs plus browser Apple Events. The executable is bundled inside the Tauri app; end users do not need Swift or a browser extension.

Run `cue-native-<triple> --help`, or send one JSON request on stdin. The process writes one JSON response to stdout. `ok:false` carries a Korean actionable error. Supported operations: `snapshot`, `displays`, `permissions`, `requestPermissions`, `capture`, `toggle`, `prepare`, `send`. The root app owns persistence, hotkeys, presets and display-selection policy.

- `snapshot`: running regular apps, accessible windows and scriptable browser tabs. Browser automation failures appear in `warnings`; accessible generic windows remain available. Cue (`dev.cue.desktop`) is excluded.
- `capture`: active browser tab, otherwise active window or app. Invoke from a global shortcut while the target is foreground.
- `toggle`: minimize only when the registered window and tab are already foreground; otherwise raise and move to the selected display.
- `prepare`: the same repeat/minimize behavior, but never moves or detaches. `send` raises/moves without toggling.
- Coordinates use the visible work area converted to AX coordinates. Existing window size is retained. If the selected screen disappeared and only one remains, that screen is used.

## Browser behavior

Chrome and Safari were exercised with owned local fixtures. Native **Move Tab to New Window** menu actions preserve the actual tab instead of recreating a page. Chrome's AppleScript `move` command must not be used: runtime testing found that it silently replaced moved page content with a new tab. This implementation uses Accessibility to invoke the real browser menu, then confirms the moved tab in the new window.

Chrome/Edge/Brave/Vivaldi/Opera/Arc bundle identifiers use Chromium-style scripting, but only installed Chrome and Safari were runtime-tested. Their scripting support and menu labels can differ. Korean and common English detach menu labels are recognized, with a few additional localized names. If the menu is unavailable, the helper returns an error and asks the user to select whole-window movement. Firefox and other non-scriptable browsers can still be registered as apps/windows; arbitrary tab discovery is not claimed.

Chrome tab IDs and browser window IDs are only reused when the saved process ID matches. After a restart, tabs resolve by a unique saved URL; windows resolve by unique original title. Duplicate matches return an error. Safari lacks a durable tab ID, so it resolves by URL, preferring the original window within the same process. Returned target identity should be merged into the saved registration after every action.

Generic window matching uses public CG window IDs when position/size mapping is unique and otherwise title matching. AX nib identifiers are intentionally not used because multiple document windows may share them. Ambiguous titles fail explicitly. A closed app or saved browser URL can be reopened. A closed arbitrary document window cannot be recreated without its document path, so the helper reports that limitation instead of selecting a different window.

## Permissions and QA

Accessibility is required for generic windows and tab detachment. Browser tab reading/activation uses macOS Automation permission. `permissions` does not prompt; `requestPermissions` opens the OS Accessibility prompt. A packaged app needs the Automation usage string and appropriate entitlement supplied by the root bundle configuration.

Reproducible manual integration drivers run from the repository root:

```sh
python3 native/qa-chrome.py
python3 native/qa-safari.py
python3 native/qa-windows.py
```

They create and close only named CUE fixtures. Results are in `native/evidence/`. Verified on macOS 26.6.2, Apple Silicon, Korean UI, one virtual display. Actual dual-display movement/unplug, other browsers, unsigned-distribution permission onboarding and Windows remain outside this native helper QA coverage.
