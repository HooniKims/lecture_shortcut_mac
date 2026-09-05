# Bug and memory audit — 2026-09-05

## Verdict and scope

No additional application-owned leak was detected in the exercised paths. This is a bounded runtime result, not proof that every operation on every Mac is bug-free. The reproduced shortcut and process-lifecycle bugs were fixed; delayed dialog DOM cleanup was also addressed. No reproduced application defect remains open in this audit.

Environment: Apple Silicon, macOS 26.6.2 (25G83), Tauri 2, bundled Swift helper. The shipped app remains `dev.cue.desktop`, ad-hoc signed, without `get-task-allow`. Diagnostics used a separately identified `dev.cue.audit` debug bundle with that entitlement; production configuration and entitlements were not used for stress data.

## Reproduced defects and fixes

1. **Shortcut capture remains active after leaving its field.** Independent asynchronous start/stop IPC calls could arrive out of order. `app/dialogs.js` now allows one outstanding write and retains only the latest requested state. Rapid focus changes cannot build an unbounded promise queue. The presenter webview, which has no shortcut editor, no longer overwrites the main window's capture state.
2. **Helper exits but its inherited pipes prevent completion.** A descendant could retain stdout/stderr after the helper exited, causing worker joins to bypass the timeout. The red reproducer took 3.357 seconds. Each invocation now creates its own process group and terminates that group before joining pipe workers, on normal completion and error/timeout exits. The corrected reproducer completed in 51 ms. A review caught a follow-on ownership race: `try_wait` could reap the leader before group termination, permitting numeric PID reuse. The final implementation uses Darwin `waitid` with `WNOWAIT` to observe completion while retaining the leader until group termination and explicit reaping. A deterministic regression confirms the exited leader is still a zombie before cleanup. This targets only the helper's owned group; applications launched through macOS LaunchServices are outside that group.

3. **Closed modal waits for the browser close event before releasing its DOM.** A background browser delayed that event, temporarily retaining the form. App close/submit/cancel paths now release it immediately; the guarded late-close handler preserves a newly reopened form. This is bounded retention, not evidence of an accumulating leak.

## Regression and resource checks

`npm test` runs eight real-source frontend concurrency/dialog scenarios and a Rust driver that imports the actual `src-tauri/src/native.rs`. The native scenarios cover non-reaping exit observation, success, 5 MB stderr, malformed JSON, helper-reported failure, spawn failure, inherited descendant pipes, timeout, blocked 2 MB stdin, two-call admission with a third rejected, and busy-guard release. Direct child count returned to zero and thread count returned to baseline after every process scenario. The earlier seven-scenario driver also passed ten consecutive runs.

`npm run check`, backend `cargo test`, backend and harness `cargo clippy -- -D warnings`, formatting checks, and the release build passed. Backend `cargo test` currently contains zero unit tests; the process driver is the meaningful backend regression check. Rust Analyzer, Miri, and the Rust ASan runtime were unavailable; compiler/Clippy checks and real process tests were used without installing global tools. No sanitizer pass is claimed.

## Browser UI evidence

The requested **ego-browser** drove the real frontend with an isolated IPC fixture; this does not prove macOS integration. The final frontend completed two batches of 1,000 theme saves, after earlier exploratory runs totaling 4,000 saves. The final warmed batch showed:

| Measurement after garbage collection | Before | After |
| --- | ---: | ---: |
| JavaScript heap, bytes | 1,673,936 | 1,673,972 |
| DOM nodes (CDP) | 202 | 202 |
| DOM event listeners | 18 | 18 |
| Retained dialog children | 0 | 0 |

The added cancel listener is intentional and registered once. A 1,000-pair focus/blur stress used actual settings fields plus CDP focus emulation because the task tab was in the background. It produced exactly two bridge writes, at most one outstanding write, and ended with capture disabled. A zero-write attempt outside the modal was rejected as unexercised, not counted as a pass. Each backend event retained one subscription.

The final UI also passed 1,000 app-triggered dialog close cycles with zero children immediately after each close. Reopening before the previous native close event delivered preserved the new form; cancellation cleared the form immediately. The earlier delayed-cleanup QA failure is addressed by these code changes and checks.

## Native memory attribution and runtime evidence

The initial instrumented baseline used `MallocStackLogging=1` and a diagnostic entitlement, allowing complete stacks instead of the earlier restricted release scan. An independent Cocoa-only program (`tests/macos-cocoa-control.m`) reproduced the same three root cycles:

`libdispatch → AppIntents LNProcessInstanceRegistryClient.makeXPCConnection → LinkServices → NSXPCConnection`

| Full instrumented scan | Objects | Bytes | Root attribution |
| --- | ---: | ---: | --- |
| Cocoa-only control, no Cue/Tauri code | 287 | 18,752 | 3 AppIntents/NSXPCConnection cycles |
| Cue baseline | 288 | 18,816 | Same 3 cycles |

The 64-byte difference is inside the same cycle metadata. No exclusion list or scanner suppression was used. Forty actual native settings-dialog saves passed, and the following native diff reported zero new leaks. Studio/Paper screenshots and a real quit/relaunch confirmed Paper persistence during this session.

The final-source debug bundle was then tested without MallocStackLogging. JavaScript executed in the real WKWebView called the actual `save_config` Rust command, persisted settings, and updated both native windows. A fresh 2,000-save run completed in 18,463 ms (including the modal checks) with node counts `[116,116,116,116]`; all 1,000 WeakRefs to first-generation main-screen elements were cleared by normal WebKit collection. Actual WKWebView close/reopen/cancel checks also passed (`closedChildren:0`, `reopenedIntact:true`). A scan taken after the completion result reported **0 new leaks / 0 bytes** relative to its pre-stress memgraph. Its unfiltered full scan remained **192 objects / 9,600 bytes**, identical to that process’s pre-stress baseline, in two cycles of the platform family above. Platform cycle counts varied between launches; comparisons use the same process baseline. Instrumented and uninstrumented byte totals are not directly comparable.

Earlier diagnostic runs also completed 1,000 and 2,000 saves; the fresh final-source run above is the basis for the native verdict. During rapid stress, RSS grew as WebKit caches/heaps warmed. RSS alone is not a leak detector; no zero-growth claim is made. Native malloc accounting remained around 8.7–9.0 MB, while the final clean process's physical footprint was 37.8 MB (32.3 MB before stress). WebContent XPC heaps were assessed using DOM lifetimes, not represented as fully scanned native heaps.

An initial LLDB Objective-C string literal left an 896-byte inspection allocation containing the exact stress script. That failed measurement was retained in the local journal. A fresh process and an explicitly balanced CFString allocation removed the observer artifact; the final unfiltered scan contains no script-string leak. Exploratory overlapping runs shared a global counter; those runs are not used for the final verdict. The committed probe now keeps per-run state and rejects overlapping runs, and the final measurement used a fresh process with one completed run. One attempt terminated during debugger expression execution (exit 0/SIGSTOP, no crash report); it was discarded. The final rerun selected the main WKWebView by inspecting its actual window title and address before injection and completed all checks. A premature read of the WKWebView title was also not treated as completion; the later JSON completion result is the evidence.

## Reproduction

```sh
npm test
npm run check
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
cargo clippy --manifest-path tests/native-process/Cargo.toml -- -D warnings
npm run build
clang -fobjc-arc -g -framework Cocoa tests/macos-cocoa-control.m -o /tmp/cue-cocoa-control
```

For leak inspection, build a separate diagnostic app using a Tauri config override with a unique identifier and a temporary entitlement containing `com.apple.security.get-task-allow`. Do not change shipping entitlements. Launch the Cocoa control and diagnostic app with `MallocStackLogging=1` for root-stack attribution. Capture with `leaks --outputGraph=<baseline.memgraph> <pid>` and analyze using `leaks --fullStacks <baseline.memgraph>`. Repeat without MallocStackLogging for footprint observations.

For the real WebKit stress, obtain the current main WKWebView address from the diagnostic process using LLDB. Evaluate `tests/native-webview-stress.js` through `WKWebView.evaluateJavaScript`, using `CFStringCreateWithCString`, bridging the owned value to `NSString` for the call, and balancing it with `CFRelease` afterward rather than using an Objective-C literal. Detach so the app can run. Wait until that webview's title contains `done:true`, `cycles:2000`, and no `error`, then run `leaks --diffFrom=<baseline.memgraph> <pid>` and an unfiltered `leaks <pid>`. The diagnostic script intentionally uses only the disposable app's configuration. Never reuse a pointer or PID after restarting.

## Limits and artifacts

- These tests do not certify every browser, physical dual-monitor move/disconnect, or Zoom sharing. Those hardware/integration limits from the existing README remain.
- Native Accessibility automation became intermittently unavailable later in the session. Failed AX attempts were recorded, not counted as passed tests; actual WKWebView/Rust stress and process tests continued separately.
- The OS baseline cycles remain visible. The supported verdict is **no new application-owned leak detected in the tested paths**, not zero leaks across all Apple frameworks or a mathematical guarantee of no bugs.
- Production theme was restored to the pre-test Studio choice. Stress used separate app/browser state.
- Release packaging and strict code-signature verification passed. Developer ID signing/notarization remains outside this development preview.

Source hashes, condensed raw scanner output, browser metrics, and regression output are in the companion `memory-bug-audit-data` directory. Full memgraphs and screenshots remain in local `.codex/memory-audit/` to avoid committing machine memory dumps. Exact-commit review verdicts are recorded separately in `.codex/reviews/` after committing this report.
