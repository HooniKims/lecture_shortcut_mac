#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
target_test_dir="$(mktemp -d)"
trap 'rm -f "$target_test_dir/target-tests"; rmdir "$target_test_dir"' EXIT
swiftc -framework AppKit -framework ApplicationServices \
  native/Models.swift native/Accessibility.swift native/Discovery.swift \
  native/WindowActions.swift native/BrowserActions.swift native/TargetResolution.swift \
  tests/native-targets/main.swift -o "$target_test_dir/target-tests"
"$target_test_dir/target-tests"
