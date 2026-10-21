#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
action_test_dir="$(mktemp -d)"
trap 'rm -f "$action_test_dir/Models.swift" "$action_test_dir/action-tests"; rmdir "$action_test_dir"' EXIT
# Keep actual model declarations; substitute runScript at the OS boundary.
python3 - "$action_test_dir/Models.swift" <<'PY'
from pathlib import Path
import sys
source = Path('native/Models.swift').read_text()
Path(sys.argv[1]).write_text(source.split('func runScript(', 1)[0])
PY
swiftc -framework AppKit -framework ApplicationServices \
  "$action_test_dir/Models.swift" native/BrowserActions.swift native/TargetResolution.swift \
  tests/native-browser-actions/main.swift -o "$action_test_dir/action-tests"
"$action_test_dir/action-tests"
