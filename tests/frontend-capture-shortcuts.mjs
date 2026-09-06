import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../app/dialogs.js', import.meta.url), 'utf8');
function suggested(entries, settings) {
  const context = vm.createContext({config: {entries, settings}, document: {getElementById: () => ({})}, window: {}, on() {}, prettyKey: key => key.replace(/CommandOrControl|Super/g, '⌘').replace(/Shift/g, '⇧').replaceAll('+', ' ')});
  vm.runInContext(source, context);
  return vm.runInContext('nextShortcut()', context);
}
test('suggestion skips function shortcuts as well as entry shortcuts', () => {
  // Given number 1 is a function binding and 2 an existing entry.
  const entries = [{shortcut:'Super+Shift+2'}];
  // When the next registration asks for a suggestion.
  const actual = suggested(entries, {captureShortcut:'CommandOrControl+Shift+1'});
  // Then no reserved function shortcut is offered.
  assert.equal(actual, 'CommandOrControl+Shift+3');
});
test('no suggestion is fabricated when all numbered bindings are occupied', () => {
  const entries = Array.from({length:9}, (_,i) => ({shortcut:`CommandOrControl+Shift+${i+1}`}));
  assert.equal(suggested(entries, {}), '');
});

test('an older draft response cannot replace the newer registration being edited', async () => {
  // Given a newer draft is already being edited and an older request arrives late.
  let rendered = false;
  const context = vm.createContext({invoke: async () => ({id: 4, target: {id:'old'}}), config: {entries:[]}, showDialog() {rendered = true;}, icon:()=>'', targetIcon:()=>'',kindName:()=>'',escapeText:()=>'',defaultName:()=>'',nextShortcut:()=>'',shortcutField:()=>'',document:{querySelector:()=>null}});
  vm.runInContext(await readFile(new URL('../app/capture.js', import.meta.url), 'utf8'), context);
  vm.runInContext('captureSession={id:5,target:{id:"new"}}', context);
  // When the old read completes.
  await vm.runInContext('loadCapture()', context);
  // Then the newer form stays untouched.
  assert.equal(vm.runInContext('captureSession.id', context), 5);
  assert.equal(rendered, false);
});
