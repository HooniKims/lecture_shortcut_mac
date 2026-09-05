# Cue macOS code-quality review

Review date: 2026-09-05

Scope: `app/`, `src-tauri/`, and `native/` in the current uncommitted worktree. This review is read-only and does not replace the root agent's native UI QA.

## Result

- `codeQualityStatus`: **WATCH**
- `recommendation`: **APPROVE**

The prior implementation findings have been re-read after the four fixes. No remaining CRITICAL or HIGH source-level correctness defect was found. Runtime exercise of the new failure paths remains required before release.

## Findings

### CRITICAL

None.

### HIGH

None.

### MEDIUM

None.

### LOW

None.

## Skill-perspective check

The `remove-ai-slops` and `programming` skills were explicitly consulted. The production code is compact (each source module is below 250 nonblank/noncomment lines), has no added test tautologies or implementation-mirroring tests, and does not add gratuitous parsing/data-normalization layers. The Swift `unsafeBitCast` uses a checked Core Foundation type boundary and is not itself a slop finding. The revised diff does not violate either skill perspective.

## Resolved findings rechecked

- [src-tauri/src/shortcuts.rs](/Volumes/exDisk/vibecoding%20project/31.lecture_shortcut/src-tauri/src/shortcuts.rs:43) now tracks keys added and removed during replacement. Any failed phase unregisters additions, restores removals, and reports a partial rollback clearly. [commands.rs](/Volumes/exDisk/vibecoding%20project/31.lecture_shortcut/src-tauri/src/commands.rs:25) now surfaces a persistence-rollback failure instead of discarding it.
- [native/BrowserActions.swift](/Volumes/exDisk/vibecoding%20project/31.lecture_shortcut/native/BrowserActions.swift:76) compares the post-detach candidate against every pre-action window ID. A pre-existing same-URL Safari tab is therefore excluded before the target is updated.
- [app/dialogs.js](/Volumes/exDisk/vibecoding%20project/31.lecture_shortcut/app/dialogs.js:32) binds scan and submit work to the exact form instance. The initial scan now writes a retry message and error into that form; a stale result exits when the form has been replaced. The picker uses actual buttons with `aria-pressed`, which remains discoverable to native accessibility automation.

## Remaining runtime coverage

Before release, manually exercise: an unavailable/failed old-hotkey unregistration (via a controllable test seam if macOS cannot induce it), Safari detach with a pre-existing duplicate-URL window, initial scan failure followed by retry, and actual native key recording. These are coverage gaps, not a source-level blocker.

## Evidence consulted

- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings`: passed.
- `cargo test --manifest-path src-tauri/Cargo.toml`: passed, with zero Rust unit tests discovered.
- `node --check app/main.js`, `node --check app/dialogs.js`, and `node --check app/icons.js`: passed.
- `bash native/build.sh` and the helper `--help` path: passed.
- Existing native integration evidence: [native/evidence/results.json](/Volumes/exDisk/vibecoding%20project/31.lecture_shortcut/native/evidence/results.json). It covers Chrome, Safari, and generic-window happy paths on one display, but does not cover the failing conditions above.

No code was modified during this review.
