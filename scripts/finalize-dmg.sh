#!/bin/bash
set -euo pipefail

image_path=$1
workspace=$(mktemp -d -t cue-dmg)
mounted=false
cleanup() {
  if $mounted; then hdiutil detach "$workspace/volume" >/dev/null; fi
  rm -rf "$workspace"
}
trap cleanup EXIT
hdiutil convert "$image_path" -format UDRW -o "$workspace/edit.dmg" >/dev/null
mkdir "$workspace/volume"
hdiutil attach "$workspace/edit.dmg" -nobrowse -mountpoint "$workspace/volume" >/dev/null
mounted=true
# A custom volume icon appears as an extra file when Finder shows hidden files.
rm -f "$workspace/volume/.VolumeIcon.icns"
xcrun SetFile -a c "$workspace/volume"
osascript - "$workspace/volume" <<'APPLESCRIPT'
on run argv
  set mountFolder to POSIX file (item 1 of argv) as alias
  tell application "Finder"
    tell folder mountFolder
      open
      set current view of container window to icon view
      set toolbar visible of container window to false
      set statusbar visible of container window to false
      set bounds of container window to {200, 160, 860, 560}
      set opts to icon view options of container window
      set arrangement of opts to not arranged
      set icon size of opts to 80
      set position of item "Cue.app" to {180, 170}
      set position of item "Applications" to {480, 170}
      update without registering applications
      delay 3
      close container window
      delay 2
    end tell
  end tell
end run
APPLESCRIPT
hdiutil detach "$workspace/volume" >/dev/null
mounted=false
hdiutil convert "$workspace/edit.dmg" -format UDZO -o "$workspace/final.dmg" >/dev/null
hdiutil verify "$workspace/final.dmg" >/dev/null
mv "$workspace/final.dmg" "$image_path"
