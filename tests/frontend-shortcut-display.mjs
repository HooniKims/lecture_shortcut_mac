import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

async function createHarness() {
  const listeners = new Map(), nativeEvents = new Map();
  const root = { innerHTML: '' };
  const dialog = { open: false, addEventListener() {}, replaceChildren() {} };
  const document = {
    activeElement: null,
    getElementById(id) { return id === 'root' ? root : dialog; },
    addEventListener(event, handler) {
      const handlers = listeners.get(event) || [];
      handlers.push(handler); listeners.set(event, handlers);
    },
  };
  const window = {
    addEventListener() {},
    __TAURI__: {
      core: { invoke: async () => {} },
      event: { listen: async (event, handler) => { nativeEvents.set(event, handler); return () => {}; } },
    },
  };
  const context = vm.createContext({
    document, window, location: { search: '' }, URLSearchParams, AbortController,
    setTimeout, clearTimeout,
    boot: async () => {},
    on: (target, event, handler) => target.addEventListener(event, handler),
  });
  for (const name of ['icons', 'dialogs', 'updates', 'main', 'runtime']) {
    vm.runInContext(await readFile(new URL(`../app/${name}.js`, import.meta.url), 'utf8'), context, { filename: `app/${name}.js` });
  }
  // Boot the real subscription path without starting display polling or state rendering.
  vm.runInContext('refresh = async () => {}; scheduleDisplayCheck = async () => {}; startUpdates = async () => {};', context);
  await vm.runInContext('boot()', context);
  return {
    run: code => vm.runInContext(code, context),
    field(value = 'CommandOrControl+Shift+1') {
      const field = { value, nextElementSibling: { innerHTML: '' }, matches: selector => selector === '[data-hotkey]' };
      document.activeElement = field;
      return field;
    },
    keydown(field, options = {}) {
      const event = {
        target: field, key: 'ArrowLeft', code: 'ArrowLeft', metaKey: true, ctrlKey: false, altKey: true, shiftKey: true,
        prevented: false, stopped: false,
        preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, ...options,
      };
      for (const handler of listeners.get('keydown')) handler(event);
      return event;
    },
    input(field) { for (const handler of listeners.get('input')) handler({ target: field }); },
    recorded(value) { nativeEvents.get('recorded-shortcut')({ payload: value }); },
  };
}

test('Given shortcut tokens, when rendered as keycaps, then modifiers and navigation have recognizable glyphs', async () => {
  const harness = await createHarness();
  assert.equal(harness.run("prettyKey('CommandOrControl+Control+Alt+Shift+ArrowLeft')"), '⌘ ⌃ ⌥ ⇧ ←');
  assert.equal(harness.run("prettyKey('Enter+Space+ArrowRight+ArrowUp+ArrowDown')"), '↩ ␣ → ↑ ↓');
  assert.equal(harness.run("prettyKey('Super+KeyP+Digit7+F12')"), '⌘ P 7 F12');
  assert.match(harness.run("keycap('Control+ArrowUp')"), /<kbd class="key-modifier">⌃<\/kbd><span class="key-separator">\+<\/span><kbd class="key-trigger">↑<\/kbd>/);
});

test('Given an editable shortcut, when its shared field renders, then its canonical form value and single input remain accessible', async () => {
  const harness = await createHarness();
  const html = harness.run("shortcutField('shortcut', 'CommandOrControl+Shift+1', 'shortcut-help')");
  assert.equal((html.match(/<input /g) || []).length, 1);
  assert.match(html, /name="shortcut"[^>]*value="CommandOrControl\+Shift\+1"/);
  assert.match(html, /aria-describedby="shortcut-help"/);
  assert.match(html, /class="shortcut-preview" aria-hidden="true"/);
  assert.match(html, /<kbd class="key-modifier">⌘<\/kbd><span class="key-separator">\+<\/span><kbd class="key-modifier">⇧<\/kbd><span class="key-separator">\+<\/span><kbd class="key-trigger">1<\/kbd>/);
  assert.doesNotMatch(html, /readonly|tabindex|type="hidden"/);
  assert.match(harness.run("shortcutField('shortcut', '')"), /원하는 키 조합 누르기/);
  assert.match(harness.run(`shortcutField('shortcut', 'Alt+<')`), /<kbd class="key-trigger">&lt;<\/kbd>/);
});

test('Given an active shortcut field, when a chord is captured, then both canonical value and keycaps update while Tab and Escape stay available', async () => {
  const harness = await createHarness(), field = harness.field();
  const event = harness.keydown(field);
  assert.equal(field.value, 'CommandOrControl+Alt+Shift+ArrowLeft');
  assert.match(field.nextElementSibling.innerHTML, /<kbd class="key-modifier">⌘<\/kbd><span class="key-separator">\+<\/span><kbd class="key-modifier">⌥<\/kbd><span class="key-separator">\+<\/span><kbd class="key-modifier">⇧<\/kbd><span class="key-separator">\+<\/span><kbd class="key-trigger">←<\/kbd>/);
  assert.equal(event.prevented, true);
  assert.equal(event.stopped, true);
  for (const key of ['Tab', 'Escape']) {
    assert.equal(harness.keydown(field, { key }).prevented, false);
    assert.equal(field.value, 'CommandOrControl+Alt+Shift+ArrowLeft');
  }
});

test('Given an active shortcut field, when a native recording or input event changes its value, then the same preview stays synchronized', async () => {
  const harness = await createHarness(), field = harness.field();
  harness.recorded('Super+Control+Enter');
  assert.equal(field.value, 'Super+Control+Enter');
  assert.match(field.nextElementSibling.innerHTML, /<kbd class="key-modifier">⌘<\/kbd><span class="key-separator">\+<\/span><kbd class="key-modifier">⌃<\/kbd><span class="key-separator">\+<\/span><kbd class="key-trigger">↩<\/kbd>/);
  field.value = 'Alt+Space'; harness.input(field);
  assert.match(field.nextElementSibling.innerHTML, /<kbd class="key-modifier">⌥<\/kbd><span class="key-separator">\+<\/span><kbd class="key-trigger">␣<\/kbd>/);
  field.value = ''; harness.input(field);
  assert.match(field.nextElementSibling.innerHTML, /원하는 키 조합 누르기/);
});
