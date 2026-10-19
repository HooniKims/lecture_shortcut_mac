#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
capture_test_dir="$(mktemp -d)"
trap 'rm -f "$capture_test_dir/capture-test"; rmdir "$capture_test_dir"' EXIT
swiftc -framework AppKit -framework ApplicationServices \
  native/Models.swift native/Accessibility.swift native/Discovery.swift \
  native/WindowActions.swift native/BrowserActions.swift native/TargetResolution.swift native/Capture.swift \
  tests/native-capture/main.swift -o "$capture_test_dir/capture-test"
export CUE_NATIVE_CAPTURE_TEST="$capture_test_dir/capture-test"
node tests/native-capture/run.mjs com.google.Chrome
node tests/native-capture/run.mjs com.apple.Safari
