#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
arch="$(uname -m)"
case "$arch" in
  arm64) triple="aarch64-apple-darwin" ;;
  x86_64) triple="x86_64-apple-darwin" ;;
  *) echo "Unsupported architecture: $arch" >&2; exit 1 ;;
esac
mkdir -p src-tauri/binaries
swiftc -O -framework AppKit -framework ApplicationServices native/*.swift -o "src-tauri/binaries/cue-native-$triple"
