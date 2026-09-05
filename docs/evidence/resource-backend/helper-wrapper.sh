#!/bin/sh
if [ "$CUE_HELPER_CASE" = early ]; then
  exec 0<&-
  exec sleep 2
fi
exec /tmp/cue-resource-driver/target/debug/helper-fixture
