import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
function harness(phase = 'idle') {
  const calls = [], listeners = new Map();
  const dialog = { open: false, innerHTML: '', querySelector: () => null, showModal() { this.open = true; }, close() { this.open = false; }, replaceChildren() { this.innerHTML = ''; } };
  const context = vm.createContext({
    document: { activeElement: null, getElementById: () => dialog, querySelectorAll: () => [] },
    on: (target, type, fn) => { listeners.set(type, fn); },
    icon: () => '', escapeText: s => String(s).replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
    config: { settings: {} }, invoke: async (c, a) => { calls.push({ c, a }); },
    subscribe: async (name, fn) => listeners.set(name, fn),
  });
  vm.runInContext(readFileSync(new URL('../app/updates.js', import.meta.url), 'utf8'), context);
  vm.runInContext(`updateState = {currentVersion:'0.2.0',status:{phase:'${phase}',version:'0.3.0',notes:'<script>alert(1)</script>'}}`, context);
  return {
    calls, dialog,
    run: s => vm.runInContext(s, context),
    click: action => listeners.get('click')({ target: { closest: () => ({ dataset: { update: action } }) } }),
  };
}
test('Given a check in flight, when update details are opened, then no second check is sent', async () => {
  const h = harness('checking'); await h.click('open'); assert.equal(h.dialog.open, true); assert.equal(h.calls.length, 0);
});
test('Given an available update, when details are opened, then no installation starts before the user chooses it', async () => {
  const h = harness('available'); await h.click('open'); assert.equal(h.calls.length, 0);
  assert.doesNotMatch(h.dialog.innerHTML, /<script>/); assert.match(h.dialog.innerHTML, /&lt;script&gt;/);
});
test('Given an available update, when install is clicked twice, then only one installation is requested', async () => {
  const h = harness('available'); await h.click('install'); await h.click('install');
  assert.deepEqual(h.calls.map(c => c.c), ['install_update']);
});
test('Given a completed installation, when restart is selected, then the guarded backend restart command is requested', async () => {
  const h = harness('ready'); await h.click('restart'); assert.deepEqual(h.calls.map(c => c.c), ['restart_updated_app']);
});
test('Given update details are closed, when background status changes, then no popup opens automatically', () => {
  const h = harness('available'); h.run('renderUpdateStatus()'); assert.equal(h.dialog.open, false);
});
