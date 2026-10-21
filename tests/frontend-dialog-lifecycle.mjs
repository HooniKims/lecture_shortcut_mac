import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const flush = async () => new Promise(setImmediate);

async function createHarness() {
  const listeners = new Map();
  let form = null;
  let submitHandler = null;
  const dialog = {
    open: false,
    children: { length: 0 },
    close() { this.open = false; },
    replaceChildren() {
      this.children.length = 0;
      form = null;
    },
    showModal() { this.open = true; },
    set innerHTML(value) {
      this.children.length = value ? 1 : 0;
      form = { addEventListener(name, handler) { if (name === 'submit') submitHandler = handler; }, querySelector() { return { textContent: '' }; }, setAttribute() {}, removeAttribute() {} };
    },
  };
  const root = { innerHTML: '' };
  const document = {
    activeElement: { matches: () => false },
    body: { classList: { toggle() {} } },
    getElementById(id) {
      if (id === 'dialog') return dialog;
      if (id === 'dialog-form') return form;
      if (id === 'root') return root;
      return null;
    },
  };
  let context;
  const targetName = target => target === dialog ? 'dialog' : target === document ? 'document' : 'window';
  context = {
    FormData: class {},
    URL,
    URLSearchParams,
    boot: async () => {},
    document,
    location: { search: '' },
    window: {},
    on(target, event, handler) { listeners.set(`${targetName(target)}:${event}`, handler); },
    escapeText(text) { return text; },
    icon() { return ''; },
    keys() { return ''; },
    notice() {},
    onboardingDialogClosed() {}, renderOnboarding() {},
  };

  vm.createContext(context);
  vm.runInContext(await readFile(new URL('../app/dialogs.js', import.meta.url), 'utf8'), context, { filename: 'app/dialogs.js' });
  vm.runInContext(await readFile(new URL('../app/main.js', import.meta.url), 'utf8'), context, { filename: 'app/main.js' });

  return {
    async clickClose() {
      const button = { dataset: { action: 'close-dialog' }, closest() { return this; } };
      listeners.get('document:click')({ target: button });
      await flush();
    },
    closeEvent() { listeners.get('dialog:close')({}); },
    cancel() {
      let prevented = false;
      listeners.get('dialog:cancel')({ preventDefault() { prevented = true; } });
      return prevented;
    },
    dialog,
    submit() { return submitHandler({preventDefault() {}, target: form, submitter: null}); },
    openWith(submit) { context.submitCallback = submit; vm.runInContext("showDialog('Title', '', submitCallback)", context); },
    open() { vm.runInContext("showDialog('Title', '', async () => {})", context); },
  };
}

test('Given an application close button and a delayed native close event, when the button closes a dialog, then its children are removed immediately', async () => {
  const harness = await createHarness();
  harness.open();
  await harness.clickClose();
  assert.equal(harness.dialog.open, false);
  assert.equal(harness.dialog.children.length, 0);
});

test('Given a delayed close event from a previous form, when a new dialog is already open, then the old event preserves the new form', async () => {
  const harness = await createHarness();
  harness.open();
  await harness.clickClose();
  harness.open();
  harness.closeEvent();
  assert.equal(harness.dialog.open, true);
  assert.equal(harness.dialog.children.length, 1);
});

test('Given Escape cancels an open dialog, when native close notification is delayed, then cancellation prevents default close and clears immediately', async () => {
  const harness = await createHarness();
  harness.open();
  assert.equal(harness.cancel(), true);
  assert.equal(harness.dialog.open, false);
  assert.equal(harness.dialog.children.length, 0);
});


test('Repeated implicit submissions save a dialog only once while the first save is pending', async () => {
  const harness = await createHarness();
  let calls = 0, finish;
  harness.openWith(() => { calls++; return new Promise(resolve => { finish = resolve; }); });
  const first = harness.submit();
  void harness.submit();
  assert.equal(calls, 1);
  finish();
  await first;
});
