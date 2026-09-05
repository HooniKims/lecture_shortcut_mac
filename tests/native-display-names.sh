#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
display_test_dir="$(mktemp -d "${TMPDIR:-/tmp}/cue-display-names.XXXXXX")"
trap 'rm -rf "$display_test_dir"' EXIT HUP INT TERM
cat > "$display_test_dir/main.swift" <<'SWIFT'
import AppKit

let screens = NSScreen.screens
let displays = allDisplays()
precondition(!screens.isEmpty, "Display-name integration test requires a connected monitor")
precondition(displays.count == screens.count)
for (index, screen) in screens.enumerated() {
    let display = displays[index]
    let expected = screen.localizedName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        ? "모니터 \(index + 1)" : screen.localizedName
    guard display.name == expected else {
        fputs("FAIL: display \(display.id) name was \(String(reflecting: display.name)); expected \(String(reflecting: expected))\n", stderr)
        exit(1)
    }
}
print("PASS: \(displays.count) connected display names match the OS name or indexed fallback")
SWIFT
swiftc -O -framework AppKit -framework ApplicationServices native/Accessibility.swift native/Models.swift "$display_test_dir/main.swift" -o "$display_test_dir/display-name-tests"
"$display_test_dir/display-name-tests"
