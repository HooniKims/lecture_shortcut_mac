# Backend resource and theme review

Date: 2026-09-05 (Asia/Seoul). Scope: `src-tauri/src/*` and read-only audit of `native/*.swift`. Source hashes: `resource-backend/source-sha256.txt`. This is implementation evidence, not the later exact-commit independent review.

## Findings and changes

- **Subprocess cleanup failure, reproduced.** The previous implementation returned directly after a broken stdin write, without killing/waiting for its child. An executable fixture closes stdin but stays alive: the baseline left one child running. Every return now drops a managed child that kills/waits; all pipe workers are scoped and joined. Writer failure is detected while waiting, avoiding the full 60-second timeout.
- **Large stderr disrupted an otherwise successful helper, reproduced.** The old capped reader closed its pipe after 100 KB. A helper writing 5 MB to stderr could then fail before delivering its JSON response. Readers now keep draining while retaining bounded output. The same fixture succeeds.
- **Unbounded overlapping helper work, source-confirmed.** Snapshot, activation, display refresh, and global hotkey dispatch acquire non-waiting guards before spawning blocking tasks. At most two helper processes can run concurrently; excess requests fail with a busy message, repeated hotkey dispatch is coalesced. No worker waits in an unbounded application queue.
- **Unnecessary helper launches.** Display refresh compares the Tauri monitor signature (name, bounds, work area, scale). The Swift helper supplies authoritative NSScreen identifiers/logical coordinates on the initial query or a changed signature. An unchanged refresh and normal hotkey no longer launch a separate display helper. The cache lock is released during helper execution so UI state retrieval is not blocked on native responses.
- **Unnecessary disk writes/allocation.** Successful actions persist a target only when its identity/data actually changed. Each hotkey clones its entry and settings rather than all entries and presets. Disk serialization borrows configuration fields, keeping the existing rule that restore-off omits session entries while retaining presets.
- **Theme persistence.** Typed `studio`/`paper` values; old settings default to Studio. Native app/main/presenter appearance synchronizes on launch/theme change. Purely visual theme changes preserve a prepared target. A native appearance error is reported as a notice after persistence rather than misreporting the configuration as unsaved.

## Executed verification

`cargo fmt --manifest-path src-tauri/Cargo.toml` and `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings` pass.

The process driver compiles the real `native.rs` module into a temporary executable and launches controlled helper fixtures through its real stdin/stdout/stderr lifecycle. Recorded output is in `resource-backend/`:

| Scenario | Baseline | Updated |
| --- | --- | --- |
| Normal JSON reply | Not required for finding | Successful; zero residual children; threads return to baseline |
| 5 MB stderr before valid reply | Failed | Successful; zero residual children; threads return to baseline |
| Closed stdin with live helper | One child still running after return | Error returned in 0.12 s; zero residual children; threads return to baseline |
| Native helper timeout | Source lacked explicit worker joins | Actual 60 s timeout; zero residual children; threads return to baseline |
| Three simultaneous calls | No global cap | Two admitted, third rejected; zero residual children/workers after completion |
| Task guard reuse | No pre-spawn guards | Overlap rejected; acquisition succeeds after drop |
| Legacy/malformed theme settings | No theme field | Old settings default to Studio; Paper maps to native Light; unknown theme rejected |

`full-driver.rs`, `helper.rs`, and `helper-wrapper.sh` record the fixtures used in `/tmp/cue-resource-driver` (paths are those of this run). The theme driver imports the real model, substituting only a two-variant Tauri Theme stub to test serialization without constructing a GUI.

## Limits

- These checks demonstrate that the exercised paths release their children and worker threads. They do not prove that the entire app or Apple's frameworks have no memory leaks. Root QA measures the actual app/WebKit and ego browser separately.
- Swift uses ARC/CF-managed references in one-shot helper processes; inspection found no persistent timers, observer registrations, global work queues, or explicit retained-object ownership to release. Its real browser/window correctness is outside these synthetic process fixtures.
- Actual monitor detach/reattach and mixed-scale geometry require physical multi-monitor QA. The cache keeps native IDs; it does not invent IDs from Tauri monitor names. Tauri's public descriptor does not expose numeric display IDs, so replacement by an indistinguishable monitor between polling intervals is not represented in this signature; an invalid target display remains rejected by the native helper (single-monitor fallback remains supported).
- No dependencies, global tools, or LSP servers were installed by this subtask. Clippy supplied Rust diagnostics.
