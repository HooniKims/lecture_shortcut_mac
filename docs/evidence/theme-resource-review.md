# Theme and resource audit — 2026-09-05

## Implemented

Settings now offer C / Studio (dark, default) and B / Paper (light). The palette uses shared semantic tokens across the main screen, editor, dialogs, keycaps, notices and presenter panel. The setting is persisted independently of session restoration and native window appearance follows it. No dependency was added.

Resource corrections:

- Closed-stdin subprocess failure previously left a child alive; the real baseline fixture reproduced it. Managed children now kill/wait on all exits, scoped pipe workers join, bounded readers continue draining, and concurrency is capped at two helpers.
- Monitor signatures are checked by the main webview only. Unchanged topology uses cached native display IDs, avoiding periodic Swift launches from both webviews and extra display launches per hotkey.
- Search filters existing pads instead of replacing the whole UI and input on each keystroke. Unchanged state skips rendering; overlapping refreshes coalesce, with a follow-up read if a change invalidated an in-flight snapshot.
- Event subscriptions, DOM listeners and timers have teardown; closed dialogs release their contents. Repeated actions avoid unchanged target writes and whole-preset copies.

## Observed verification

- `npm run check`, Rust Clippy (`--all-targets --all-features -- -D warnings`), formatting and release app/DMG build pass.
- ego-browser drove the actual frontend against isolated Tauri IPC fixtures: Paper save, Studio change, cancel, search/input-node preservation, single-monitor standby disabling, delayed state/change race, presenter appearance/event update and teardown. Browser fixtures do not certify actual OS control or cross-webview IPC.
- Final-source 300 theme saves: 203 DOM nodes and 17 JS event listeners before and after forced GC. JS heap changed from 1,568,384 to 1,647,716 bytes (+79,332 bytes); this is not a zero-growth or leak-free claim. Dialog contents were empty and each backend event retained one subscription. Earlier warmed runs also held node/listener counts stable.
- Native process driver exercised normal output, 5 MB stderr, early stdin failure, actual 60-second timeout, concurrency cap and guard release. All updated cases left zero child processes and returned worker thread count to baseline. See [backend report](resource-backend.md) and raw fixture outputs.
- Final packaged app starts. Its main-process 8-second idle sample reported RSS 107,312 → 101,392 KiB, CPU 0.0% at samples, and physical footprint 27.5 MB. This excludes WebKit subprocesses and does not establish an app-wide improvement over the short baseline sample.

## Unresolved validation limits

- Native `leaks` reported 288 objects / 14,400 bytes, with three AppIntents / NSXPCConnection root cycles. It also warned that the release process is not debuggable and only restricted read-only memory can be analyzed. Framework origin is an inference from the reported stacks; causality and growth remain unconfirmed. The native memory audit is **INCONCLUSIVE**, not leak-free.
- Orca reported no accessible Cue AX window despite its permission status being granted, including after restarting the final bundle. ego's screenshot operation timed out and OS window capture failed. Native screenshot/visual fidelity, native theme selection + restart persistence, and two-live-window synchronization could not be certified in this run. UI behavior and theme serialization were tested separately.
- Physical dual-monitor hot-plug, mixed scaling and Zoom sharing remain untested. The monitor signature cannot distinguish replacement with an identical descriptor between polls; the backend report records that edge case.
- Installer is still an ad-hoc-signed development preview, not notarized.

Exact-commit independent review results are recorded locally under `.codex/reviews/<commit>/`; this implementation report does not predeclare their verdicts.
