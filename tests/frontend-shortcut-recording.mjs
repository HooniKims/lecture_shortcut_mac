import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const flush = async () => {
  await Promise.resolve();
  await new Promise(setImmediate);
};

async function createHarness(isPanel = false) {
  const listeners = new Map();
  const dialog = { open: false, replaceChildren() {} };
  const hotkey = { matches: selector => selector === '[data-hotkey]' };
  const bridge = { calls: [], pending: [], recording: false };
  let context;
  const invoke = (command, args) => context.api.core.invoke(command, args);
  context = {
    api: {
      core: {
        invoke(command, args) {
          bridge.calls.push(args.recording);
          return new Promise((resolve, reject) => {
            bridge.pending.push({
              command,
              recording: args.recording,
              deliver() {
                bridge.recording = args.recording;
                resolve();
              },
              fail(error) { reject(error); },
            });
          });
        },
      },
    },
    document: {
      activeElement: { matches: () => false },
      getElementById(id) { return id === 'dialog' ? dialog : null; },
    },
    window: {},
    isPanel,
    invoke,
    on(target, event, handler) { listeners.set(`${target === context.window ? 'window' : 'document'}:${event}`, handler); },
    notice() {},
    icon() { return ''; },
    config: { entries: [], settings: {} },
    prettyKey(key) { return key; },
    escapeText(text) { return text; },
    defaultName(target) { return target.title || target.app; },
    targetIcon() { return ''; },
    kindName() { return ''; },
    save: async () => {},
    structuredClone(value) { return value; },
    crypto: { randomUUID() { return 'test-id'; } },
    Error,
  };

  vm.createContext(context);
  vm.runInContext(await readFile(new URL('../app/dialogs.js', import.meta.url), 'utf8'), context, { filename: 'app/dialogs.js' });

  return {
    blur: () => listeners.get('window:blur')(),
    focus: () => listeners.get('window:focus')(),
    focusin: () => listeners.get('document:focusin')({ target: hotkey }),
    focusout: () => listeners.get('document:focusout')({ target: hotkey }),
    bridge,
  };
}

async function deliverAll(bridge) {
  while (bridge.pending.length) {
    bridge.pending.pop().deliver();
    await flush();
  }
}

test('Given a hotkey field loses focus before its first bridge write arrives, when bridge delivery is reordered, then global shortcut capture ends disabled', async () => {
  const harness = await createHarness();
  harness.focusin();
  harness.focusout();
  await flush();
  await deliverAll(harness.bridge);
  assert.equal(harness.bridge.recording, false);
});

test('Given rapid hotkey focus changes, when the first bridge write is still pending, then only the final state is sent after it', async () => {
  const harness = await createHarness();
  harness.focusin();
  harness.focusout();
  harness.focusin();
  harness.blur();
  await flush();
  assert.deepEqual(harness.bridge.calls, [true]);

  harness.bridge.pending.pop().deliver();
  await flush();
  assert.deepEqual(harness.bridge.calls, [true, false]);

  harness.bridge.pending.pop().deliver();
  await flush();
  assert.deepEqual(harness.bridge.calls, [true, false]);
  assert.equal(harness.bridge.recording, false);
});

test('Given the initial recording write fails and blur has requested stop, when the bridge settles, then the latest stop write is still sent', async () => {
  const harness = await createHarness();
  harness.focusin();
  harness.blur();
  await flush();
  harness.bridge.pending.pop().fail(new Error('bridge unavailable'));
  await flush();

  assert.deepEqual(harness.bridge.calls, [true, false]);
  harness.bridge.pending.pop().deliver();
  await flush();
  assert.equal(harness.bridge.recording, false);
});

test('Given a hotkey field is active, when the window blurs, then capture finishes disabled after the in-flight start write', async () => {
  const harness = await createHarness();
  harness.focusin();
  harness.blur();
  await flush();
  await deliverAll(harness.bridge);
  assert.equal(harness.bridge.recording, false);
});

test('Given the presenter panel changes window focus, when it has no hotkey field, then it does not change main-window capture state', async () => {
  const harness = await createHarness(true);
  harness.blur();
  harness.focus();
  await flush();
  assert.deepEqual(harness.bridge.calls, []);
});
