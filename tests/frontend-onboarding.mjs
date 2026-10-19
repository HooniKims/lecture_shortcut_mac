import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source = readFileSync(new URL('../app/onboarding.js', import.meta.url), 'utf8');
const entry = {id: 'one', label: '강의 자료', shortcut: 'Super+Shift+1'};
function harness({storage = new Map(), isPanel = false, isCapture = false} = {}) {
  const handlers = new Map(), calls = [], error = {textContent: ''};
  const welcome = {open: false, innerHTML: '', showModal() {this.open = true;}, close() {this.open = false;}, replaceChildren() {this.innerHTML = '';}};
  const slot = {innerHTML: '', contains: () => false, querySelector: () => null};
  const document = {activeElement: null, getElementById: id => id === 'onboarding-slot' ? slot : welcome, querySelector: s => s === '.tour-error' ? error : null, querySelectorAll: () => []};
  const context = vm.createContext({document, isPanel, isCapture, config: {entries: [], settings: {panelShortcut: 'Super+Shift+Space'}}, selected: null,
    localStorage: {getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value)},
    on: (target, name, fn) => handlers.set(`${target === document ? 'document' : 'welcome'}:${name}`, fn),
    closeDialog() {}, icon: () => '', keycap: s => `<kbd>${s}</kbd>`, escapeText: s => String(s).replaceAll('<', '&lt;').replaceAll('>', '&gt;'), notice() {},
    addDialog: async () => calls.push('add'), settingsDialog: async () => calls.push('settings'),
    invoke: async command => calls.push(command)
  });
  vm.runInContext(source, context);
  return {context, welcome, slot, error, calls, storage,
    run: code => vm.runInContext(code, context),
    async click(action) {const button = {dataset: {onboard: action}, disabled: false}; await handlers.get('document:click')({target: {closest: () => button}});},
    cancel() {handlers.get('welcome:cancel')({preventDefault() {}});},
    add(value = entry) {context.config.entries.push({...value}); vm.runInContext('syncOnboarding(); renderOnboarding()', context);}
  };
}

test('First launch offers a welcome once; dismissal survives another webview session', () => {
  const h = harness(); h.run('startFirstRun()'); assert.equal(h.welcome.open, true);
  h.cancel(); assert.equal(h.welcome.open, false);
  const again = harness({storage: h.storage}); again.run('startFirstRun()'); assert.equal(again.welcome.open, false);
  again.run('showOnboardingWelcome()'); assert.equal(again.welcome.open, true);
});
test('Presenter and capture windows never show first-run onboarding', () => {
  for (const options of [{isPanel: true}, {isCapture: true}]) {
    const h = harness(options); h.run('startFirstRun(); showOnboardingWelcome()');
    assert.equal(h.welcome.open, false); assert.equal(h.storage.size, 0);
  }
});
test('Registration progresses only after an entry appears, and uses its actual shortcut', async () => {
  const h = harness(); h.run('beginOnboarding()'); await h.click('register');
  assert.equal(h.run('onboarding.step'), 'register'); assert.deepEqual(h.calls, ['add']);
  h.add(); assert.equal(h.run('onboarding.step'), 'call'); assert.match(h.slot.innerHTML, /Super\+Shift\+1/);
});
test('Existing entries require an explicit choice and tutorial text escapes their labels', async () => {
  const h = harness(); h.add({...entry, label: '<img src=x onerror=alert(1)>'});
  h.run('beginOnboarding(); syncOnboarding()'); assert.equal(h.run('onboarding.step'), 'register');
  await h.click('existing'); assert.equal(h.run('onboarding.entryId'), 'one');
  assert.doesNotMatch(h.slot.innerHTML, /<img/); assert.match(h.slot.innerHTML, /&lt;img/);
});
test('Only a successful action for the tutorial target advances; an unrelated action or minimization does not', () => {
  const h = harness(); h.run('beginOnboarding()'); h.add();
  h.run("onboardingAction({id:'other',outcome:'shown'}); onboardingAction({id:'one',outcome:'minimized'})");
  assert.equal(h.run('onboarding.step'), 'call');
  h.run("onboardingAction({id:'one',outcome:'prepared'})"); assert.equal(h.run('onboarding.step'), 'panel');
});
test('Failure to call a screen keeps the current step and provides a retry message', async () => {
  const h = harness(); h.run('beginOnboarding()'); h.add();
  h.context.invoke = async () => {throw new Error('권한을 확인해 주세요');};
  await h.click('call'); assert.equal(h.run('onboarding.step'), 'call'); assert.match(h.error.textContent, /권한/);
});
test('Opening the panel completes the tour only after native visibility confirms success', async () => {
  const h = harness(); h.run('beginOnboarding()'); h.add();
  h.run("onboardingAction({id:'one',outcome:'shown'})"); await h.click('panel');
  assert.deepEqual(h.calls, ['show_panel']); assert.equal(h.run('onboarding.step'), 'panel');
  h.run('onboardingPanel(false)'); assert.equal(h.run('onboarding.step'), 'panel');
  h.run('onboardingPanel(true)'); assert.equal(h.run('onboarding.step'), 'done'); assert.equal(h.storage.get('cue.onboarding.v1'), 'completed');
});
test('Removing the practice target resets the tour without deleting any user entry', () => {
  const h = harness(); h.run('beginOnboarding()'); h.add(); h.context.config.entries = [];
  h.run('syncOnboarding(); renderOnboarding()'); assert.equal(h.run('onboarding.step'), 'register');
  h.add({...entry, id: 'two'}); assert.equal(h.run('onboarding.entryId'), 'two');
  h.run('dismissOnboarding()'); assert.equal(h.context.config.entries.length, 1);
});
test('Unavailable local storage does not prevent using or dismissing the tour', () => {
  const h = harness(); h.context.localStorage = {getItem() {throw Error('unavailable');}, setItem() {throw Error('unavailable');}};
  h.run('startFirstRun()'); assert.equal(h.welcome.open, true); h.cancel(); assert.equal(h.welcome.open, false);
});
test('A render during a pending screen action cannot cause a duplicate native call', async () => {
  const h = harness(); h.run('beginOnboarding()'); h.add();
  let finish, calls = 0;
  h.context.invoke = () => {calls++; return new Promise(resolve => {finish = resolve;});};
  const pending = h.click('call'); h.run('renderOnboarding()');
  assert.match(h.slot.innerHTML, /data-onboard="call" disabled/);
  await h.click('call'); assert.equal(calls, 1);
  finish(); await pending; assert.equal(h.run('onboardingBusy'), false);
});
