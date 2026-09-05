#!/bin/sh
set -eu

test_dir=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
cargo build --manifest-path "$test_dir/Cargo.toml" --bins
"$test_dir/target/debug/native-process-regression"
