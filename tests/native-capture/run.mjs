import {execFileSync, spawnSync} from 'node:child_process';
import {resolve} from 'node:path';

const browser = process.argv[2] ?? 'com.google.Chrome';
const safari = browser === 'com.apple.Safari';
const test = process.env.CUE_NATIVE_CAPTURE_TEST ?? resolve('.codex/capture-qa/native-capture-test');
const script = source => execFileSync('osascript', ['-e', source], {encoding:'utf8', timeout:15000}).trim();
let windowId;
try {
  const create = safari ? 'make new document with properties {URL:"https://example.com/#cue-native-capture-a"}' : 'make new window';
  windowId = script(`tell application id "${browser}"
${create}
set w to front window
${safari ? '' : 'set URL of active tab of w to "https://example.com/#cue-native-capture-a"'}
make new tab at end of tabs of w with properties {URL:"https://example.com/#cue-native-capture-b"}
${safari ? 'set current tab of w to last tab of w' : 'set active tab index of w to count of tabs of w'}
return id of w
end tell`);
  const result = spawnSync(test, [browser, windowId], {encoding:'utf8', timeout:30000});
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  if (result.status !== 0) process.exitCode = 1;
} finally {
  if (windowId && /^\d+$/.test(windowId)) script(`tell application id "${browser}" to close window id ${windowId}`);
}
