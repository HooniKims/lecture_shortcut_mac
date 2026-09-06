import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
function harness(phase = 'idle', options = {}) {
  let pendingOpen = options.pendingOpen || false;
  const backendStatus = { phase, version: '0.3.0' };
  const restartOption = {checked: options.restart !== false};
  const calls = [], listeners = new Map();
  const dialog = { open: false, innerHTML: '', querySelector: selector => selector === '[data-restart-after-update]' ? restartOption : null, showModal() { this.open = true; }, close() { this.open = false; }, replaceChildren() { this.innerHTML = ''; } };
  const context = vm.createContext({
    document: { activeElement: null, getElementById: () => dialog, querySelectorAll: () => [] },
    on: (target, type, fn) => { listeners.set(type, fn); },
    icon: () => '', escapeText: s => String(s).replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
    config: { settings: {} }, notice: () => {}, invoke: async (c, a) => {
      calls.push({ c, a });
      if (c === 'take_update_request') { const pending = pendingOpen; pendingOpen = false; return pending; }
      if (c === 'update_status') return {currentVersion:'0.2.0',status:{...backendStatus}};
      if (c === 'install_update') backendStatus.phase = options.installResult || 'ready';
    },
    subscribe: async (name, fn) => listeners.set(name, fn),
  });
  vm.runInContext(readFileSync(new URL('../app/updates.js', import.meta.url), 'utf8'), context);
  vm.runInContext(`updateState = {currentVersion:'0.2.0',status:{phase:'${phase}',version:'0.3.0',notes:'<script>alert(1)</script>'}}`, context);
  return {
    calls, dialog,
    emit: (name, payload) => { if (name === 'open-updates') pendingOpen = true; return listeners.get(name)({payload}); },
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
  assert.equal(h.calls.filter(c => c.c === 'install_update').length, 1);
});
test('Given a completed installation, when restart is selected, then the guarded backend restart command is requested', async () => {
  const h = harness('ready'); await h.click('restart'); assert.deepEqual(h.calls.map(c => c.c), ['restart_updated_app']);
});
test('Given update details are closed, when background status changes, then no popup opens automatically', () => {
  const h = harness('available'); h.run('renderUpdateStatus()'); assert.equal(h.dialog.open, false);
});

test('Given an idle updater, when the tray action repeats, then one manual check opens one dialog', async () => {
  const h = harness(); await h.run('startUpdates()'); h.calls.length = 0;
  await h.emit('open-updates'); await h.emit('open-updates');
  assert.equal(h.dialog.open, true);
  assert.deepEqual(h.calls.filter(({c}) => c === 'check_update').map(({c,a}) => [c,a.automatic]), [['check_update',false]]);
});
for (const phase of ['available','downloading','installing','ready']) {
  test(`Given an update is ${phase}, when the tray action opens it, then existing progress is preserved`, async () => {
    const h = harness(phase); await h.run('startUpdates()'); h.calls.length = 0;
    await h.emit('open-updates');
    assert.equal(h.dialog.open, true); assert.equal(h.calls.filter(c => c.c !== 'take_update_request').length, 0);
    assert.equal(h.run('updateState.status.phase'), phase);
  });
}

test('Given a menu click before boot, when the updater starts, then the pending request opens the dialog', async () => {
  const h = harness('idle', {pendingOpen:true}); await h.run('startUpdates()');
  assert.equal(h.dialog.open,true);
  assert.equal(h.calls.filter(c=>c.c==='check_update'&&c.a.automatic===false).length,1);
});
test('Given a new version, when status arrives and is dismissed, then it prompts once per version', async () => {
  const h = harness(); await h.run('startUpdates()');
  await h.emit('update-status',{phase:'available',version:'0.3.0',notes:'Changes'});
  assert.equal(h.dialog.open,true); await h.click('close');
  await h.emit('update-status',{phase:'available',version:'0.3.0',notes:'Changes'});
  assert.equal(h.dialog.open,false);
  await h.emit('update-status',{phase:'available',version:'0.4.0',notes:'More'});
  assert.equal(h.dialog.open,true);
});
for (const [restart,installResult,expected] of [[true,'ready',1],[false,'ready',0],[true,'error',0]]) {
 test(`Given restart=${restart}, when installation finishes ${installResult}, then restart count is ${expected}`, async()=>{
  const h=harness('available',{restart,installResult});await h.click('install');
  assert.equal(h.calls.filter(c=>c.c==='restart_updated_app').length,expected);
 });
}
test('Given no requested installation, when ready status arrives, then no automatic restart occurs',async()=>{
 const h=harness();await h.run('startUpdates()');await h.emit('update-status',{phase:'ready',version:'0.3.0'});
 assert.equal(h.calls.filter(c=>c.c==='restart_updated_app').length,0);
});
