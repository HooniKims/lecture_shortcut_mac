const isPanel = new URLSearchParams(location.search).has('panel');
const isCapture = new URLSearchParams(location.search).has('capture');
const api = window.__TAURI__;
const root = document.getElementById('root');
let config = { entries: [], presets: [], settings: {} };
let displays = [], prepared = null, selected = null, active = null, search = '', startupShown = false;
let displayPolling = false;
const editDrafts = new Map(), editSaving = new Set();
function matchesSavedEdit(draft, entry) {
  return entry && draft.label === entry.label && draft.shortcut === entry.shortcut && draft.tabMode === entry.tabMode;
}
function rememberEdit(form) {
  const id = form.dataset.entryId;
  const entry = config.entries.find(e => e.id === id);
  if (!entry) return;
  const data = new FormData(form);
  const draft = {label: String(data.get('label')), shortcut: String(data.get('shortcut')), tabMode: String(data.get('tabMode') || 'detach')};
  if (!editSaving.has(id) && matchesSavedEdit(draft, entry)) editDrafts.delete(id);
  else editDrafts.set(id, draft);
  updateEditStatus(form);
}
function updateEditStatus(form) {
  if (!form) return;
  const id = form.dataset.entryId, saving = editSaving.has(id), dirty = editDrafts.has(id);
  const button = form.querySelector('[type="submit"]');
  button.disabled = saving || !dirty;
  button.textContent = saving ? '저장 중…' : '변경 저장';
  const reset = form.querySelector('[data-reset-edit]');
  if (reset) { reset.hidden = !dirty; reset.disabled = saving; }
  form.querySelector('.edit-status').textContent = saving ? '변경 사항을 저장하고 있습니다.' : dirty ? '저장하지 않은 변경 사항이 있습니다.' : '변경 사항이 저장되어 있습니다.';
}
const invoke = (command, args = {}) => api.core.invoke(command, args);
const kindName = kind => ({ app: '앱', window: '창', tab: '브라우저 탭' })[kind] || kind;
const defaultName = target => target.title || target.app;
function sameTarget(a, b) {
  return a.id === b.id || (a.kind === 'tab' && b.kind === 'tab' && a.bundleId === b.bundleId
    && !['com.apple.Safari', 'com.apple.SafariTechnologyPreview'].includes(a.bundleId)
    && a.pid != null && a.pid === b.pid && a.tabId != null && a.tabId === b.tabId);
}
const shortcutGlyphs = {
  commandorcontrol: '⌘', cmdorctrl: '⌘', super: '⌘', command: '⌘', cmd: '⌘', meta: '⌘',
  control: '⌃', ctrl: '⌃', shift: '⇧', alt: '⌥', option: '⌥',
  enter: '↩', return: '↩', space: '␣', tab: '⇥', escape: '⎋', esc: '⎋',
  arrowleft: '←', left: '←', arrowright: '→', right: '→', arrowup: '↑', up: '↑', arrowdown: '↓', down: '↓',
  backspace: '⌫', delete: '⌦', home: '↖', end: '↘', pageup: '⇞', pagedown: '⇟',
};
const prettyKey = key => key.split('+').map(part => {
  const token = part.trim();
  return shortcutGlyphs[token.toLowerCase()] || token.replace(/^(?:Key|Digit)([a-z0-9])$/i, '$1');
}).join(' ');
const keycap = key => keys(prettyKey(key));
function shortcutPreview(value) {
  return `${value ? keycap(value) : '<span class="shortcut-placeholder">원하는 키 조합 누르기</span>'}${icon('keyboard')}`;
}
function shortcutField(name, value, describedBy = '') {
  return `<span class="shortcut-field"><input name="${escapeText(name)}" class="shortcut-input" data-hotkey value="${escapeText(value)}" ${describedBy ? `aria-describedby="${escapeText(describedBy)}"` : ''} autocomplete="off" spellcheck="false" required><span class="shortcut-preview" aria-hidden="true">${shortcutPreview(value)}</span></span>`;
}
function updateShortcutPreview(field) {
  field.nextElementSibling.innerHTML = shortcutPreview(field.value);
  const form = field.closest?.('#edit-form'); if (form) rememberEdit(form);
}
const targetIcon = target => icon(target.kind === 'tab' ? 'browser' : target.kind === 'window' ? 'monitor' : 'grid');
function notice(message) {
  const toast = document.getElementById('toast');
  toast.textContent = String(message); toast.classList.add('show');
  clearTimeout(notice.timer); notice.timer = setTimeout(() => toast.classList.remove('show'), 6500);
}
async function save(next) { await invoke('save_config', { config: next }); await refresh(); }
function modeLabel() { return config.settings.standby && displays.length > 1 ? '대기 모드' : '즉시 송출'; }
function monitorLabel() { return (displays.find(d => d.id === config.settings.displayId) || displays.find(d => !d.primary) || displays[0])?.name || '모니터 확인 중'; }
function tile(entry, compact = false) {
  if (compact) return `<button class="pad panel-row ${active === entry.id ? 'active' : ''}" data-activate="${escapeText(entry.id)}" title="${escapeText(entry.label)}"><span class="target-symbol ${entry.target.kind}">${targetIcon(entry.target)}</span><span class="panel-row-copy"><strong>${escapeText(entry.label)}</strong><small>${escapeText(entry.target.app)} · ${kindName(entry.target.kind)}</small><span class="pad-status">${prepared === entry.id ? '대기' : active === entry.id ? '마지막 호출' : ''}</span></span>${keycap(entry.shortcut)}</button>`;
  return `<button class="pad ${selected === entry.id && !compact ? 'selected' : ''} ${active === entry.id ? 'active' : ''}" data-${compact ? 'activate' : 'select'}="${escapeText(entry.id)}" title="${escapeText(entry.label)}" ${!compact ? `aria-pressed="${selected === entry.id}"` : ''}>
    <span class="pad-status">${prepared === entry.id ? '대기' : active === entry.id ? '마지막 호출' : ''}</span>${keycap(entry.shortcut)}
    <span class="target-symbol ${entry.target.kind}">${targetIcon(entry.target)}</span><strong>${escapeText(entry.label)}</strong><small>${escapeText(entry.target.app)} · ${kindName(entry.target.kind)}</small></button>`;
}
function render() {
  const focused = root.contains(document.activeElement) ? document.activeElement : null;
  const focusId = focused?.id, focusName = focused?.name, focusSelect = focused?.dataset?.select;
  const focusEntry = focused?.closest('#edit-form')?.dataset.entryId;
  const selectionStart = focused?.selectionStart, selectionEnd = focused?.selectionEnd;
  for (const id of editDrafts.keys()) if (!config.entries.some(e => e.id === id)) editDrafts.delete(id);
  if (isCapture) { document.body.classList.add('capture'); root.replaceChildren(); return; }
  document.body.classList.toggle('panel', isPanel);
  if (isPanel) { renderPanel(); return; }
  root.innerHTML = `<div class="shell"><aside class="sidebar"><div class="brand"><span class="cue-mark">c</span><span>cue<small>${(themePreview || config.settings.theme) === 'paper' ? 'PAPER' : 'STUDIO'}</small></span></div>
    <button class="nav-item current" data-action="all">${icon('grid')}내 화면<span>${config.entries.length}</span></button>
    <div class="nav-heading">강의 프리셋<button class="icon-button" data-action="preset" aria-label="현재 목록을 프리셋으로 저장">${icon('plus')}</button></div>
    <div class="presets">${config.presets.map(p => `<div class="preset-row"><button class="nav-item" data-preset="${escapeText(p.id)}">${icon('folder')}<span>${escapeText(p.name)}</span></button><button class="icon-button quiet" data-delete-preset="${escapeText(p.id)}" aria-label="${escapeText(p.name)} 프리셋 삭제">${icon('close')}</button></div>`).join('') || '<p class="sidebar-note">강의마다 필요한 화면을<br>프리셋으로 저장하세요.</p>'}</div>
    <div class="sidebar-bottom"><button class="nav-item" data-action="help">${icon('keyboard')}사용 방법</button><button class="nav-item" data-action="settings">${icon('settings')}환경 설정</button><span class="version">MAC PREVIEW</span></div></aside>
    <main class="workspace"><header class="workspace-header"><div><p class="eyebrow">강의 화면을 한곳에</p><h1>내 화면</h1><p class="secondary">필요한 순간, 한 번의 단축키로.</p></div><button class="button primary" data-action="add">${icon('plus')}화면 등록</button></header>
    <button class="monitor-bar" data-action="settings">${icon('monitor')}<span><strong>${escapeText(monitorLabel())}</strong><small>${displays.length > 1 ? '청중에게 보여줄 모니터' : '현재 모니터에서 전환'}</small></span><span class="mode"><i></i>${modeLabel()}</span>${icon('chevron')}</button>
    <div class="list-toolbar"><label class="search">${icon('search')}<input id="search" type="search" placeholder="등록한 화면 검색" aria-label="등록한 화면 검색" value="${escapeText(search)}"></label><span data-result-count aria-live="polite">${config.entries.length}개 등록됨</span></div>
    <div class="pad-grid">${config.entries.map(e => tile(e)).join('')}</div><div class="empty search-empty" hidden><h2>검색 결과가 없습니다</h2><p>이름이나 앱 이름으로 다시 검색해 보세요.</p><button class="button" data-action="clear-search">검색 지우기</button></div>
    ${!config.entries.length ? `<div class="empty"><span class="empty-symbol">${icon('keyboard')}</span><h2>다음 화면을 준비해 보세요</h2><p>열려 있는 앱, 창, 브라우저 탭을 골라<br>나만의 단축키에 연결하세요.</p><button class="button primary" data-action="add">${icon('plus')}첫 화면 등록</button><small>직접 띄운 화면은 ${keycap(config.settings.captureShortcut)} 로 등록</small></div>` : '<p class="hint">패드를 선택해 편집하고, 단축키를 눌러 화면을 전환하세요.</p>'}
    <footer class="workspace-footer"><span>${icon('keyboard')}같은 단축키를 다시 누르면 최소화</span><button class="button" data-action="panel">${icon('panel')}발표자 패널</button></footer></main>
    <aside class="inspector">${inspector()}</aside></div>`;
  filterPads();
  updateEditStatus(document.getElementById('edit-form'));
  const restored = focusSelect ? [...root.querySelectorAll('[data-select]')].find(el => el.dataset.select === focusSelect) : focusId === 'search' ? document.getElementById('search') : focusEntry === selected && focusName ? document.getElementById('edit-form')?.elements.namedItem(focusName) : null;
  if (restored) { restored.focus({preventScroll: true}); if (selectionStart != null && restored.setSelectionRange) restored.setSelectionRange(selectionStart, selectionEnd); }
  renderUpdateStatus();
}
function filterPads() {
  const query = search.trim().toLowerCase();
  let visible = 0;
  for (const pad of root.querySelectorAll('.pad-grid .pad')) {
    pad.hidden = !pad.textContent.toLowerCase().includes(query);
    if (!pad.hidden) visible++;
  }
  const empty = root.querySelector('.search-empty');
  if (empty) empty.hidden = visible > 0 || config.entries.length === 0;
  const count = root.querySelector('[data-result-count]');
  if (count) count.textContent = query ? `${config.entries.length}개 중 ${visible}개` : `${config.entries.length}개 등록됨`;
}
function updatePads() {
  for (const pad of root.querySelectorAll('.pad')) {
    const id = pad.dataset.select || pad.dataset.activate;
    pad.classList.toggle('active', active === id);
    pad.querySelector('.pad-status').textContent = prepared === id ? '대기' : active === id ? '마지막 호출' : '';
  }
}
function inspector() {
  const entry = config.entries.find(e => e.id === selected);
  if (!entry) return `<p class="eyebrow">화면 편집</p><div class="inspector-empty">${icon('grid')}<h3>화면을 연결하세요</h3><p>등록한 화면의 이름과<br>단축키를 여기서 수정합니다.</p></div><div class="tip"><strong>발표자를 위한 작은 패널</strong><p>등록 목록을 다른 모니터에 띄워두고 편하게 확인하세요.</p>${keycap(config.settings.panelShortcut)}</div>`;
  const draft = editDrafts.get(entry.id) || entry;
  return `<p class="eyebrow">선택한 화면</p><div class="identity"><span class="target-symbol">${targetIcon(entry.target)}</span><h2>${escapeText(entry.label)}</h2><p>${escapeText(entry.target.app)} · ${kindName(entry.target.kind)}</p></div>
    <form id="edit-form" data-entry-id="${escapeText(entry.id)}"><label>표시 이름<input name="label" value="${escapeText(draft.label)}" placeholder="${escapeText(defaultName(entry.target))}"></label><label>단축키${shortcutField('shortcut', draft.shortcut, 'shortcut-help')}</label><p id="shortcut-help" class="field-help">필드를 누른 후 원하는 키 조합을 누르세요.</p>
    ${entry.target.kind === 'tab' ? `<label>송출할 때<select name="tabMode"><option value="detach" ${draft.tabMode === 'detach' ? 'selected' : ''}>이 탭만 새 창으로 이동</option><option value="window" ${draft.tabMode === 'window' ? 'selected' : ''}>브라우저 창 전체 이동</option></select></label>` : ''}
    <div class="source-info"><span>연결된 원래 화면</span><p>${escapeText(defaultName(entry.target))}</p></div><div class="edit-actions"><button class="button full" type="submit">${icon('check')}변경 저장</button><button class="button full" type="button" data-reset-edit="${escapeText(entry.id)}" hidden>변경 취소</button></div><p class="field-help edit-status" role="status"></p></form>
    <button class="button primary full" data-activate="${escapeText(entry.id)}">${icon('play')}${config.settings.standby && displays.length > 1 ? '이 화면 준비' : '화면 띄우기'}</button>
    ${prepared === entry.id ? `<button class="button primary full" data-send="${escapeText(entry.id)}">${icon('arrow')}청중 모니터로 송출</button>` : ''}
    <button class="text-button danger" data-remove="${escapeText(entry.id)}">목록에서 제거</button>`;
}
function renderPanel() {
  root.innerHTML = `<header class="panel-header" data-tauri-drag-region="deep"><div data-drag><span class="cue-mark" data-drag>c</span><span class="panel-heading" data-drag><strong data-drag>화면 바로가기</strong><small data-drag>발표자 패널 · 끌어서 이동</small></span></div><button class="icon-button" data-action="panel" aria-label="패널 숨기기">${icon('close')}</button></header><section class="panel-intro"><div class="panel-monitor">${icon('monitor')}<div><small>청중에게 보여줄 화면</small><strong title="${escapeText(monitorLabel())}">${escapeText(monitorLabel())}</strong></div></div><span class="mode"><i></i>${modeLabel()}</span></section><div class="panel-list-heading"><span>등록한 화면</span><span>${config.entries.length}개</span></div><div class="panel-grid">${config.entries.map(e => tile(e, true)).join('')}${!config.entries.length ? '<div class="empty"><span class="empty-symbol">'+icon('keyboard')+'</span><h2>강의 화면을 모아두세요</h2><p>Cue에서 화면을 등록하면<br>이곳에서 단축키와 함께 볼 수 있어요.</p></div>' : ''}</div>${prepared ? `<div class="panel-send"><button class="button primary full" data-send="${escapeText(prepared)}">${icon('arrow')}준비한 화면 송출 ${keycap(config.settings.sendShortcut)}</button></div>` : ''}<footer class="panel-footer">${icon('keyboard')}단축키 또는 목록을 눌러 화면을 전환하세요</footer>`;

}
async function activate(id, send = false) {
  try { const result = await invoke('activate_entry', { id, send }); notice(({shown:'화면을 불러왔습니다.', minimized:'화면을 최소화했습니다.', prepared:'화면을 준비했습니다.', reopened:'닫힌 화면을 다시 열었습니다.'})[result.outcome] || '화면 전환 완료'); }
  catch (error) { notice(error); }
}
on(document, 'click', async event => {
  const button = event.target.closest('button'); if (!button) return;
  try {
    if (button.dataset.select) { selected = button.dataset.select; render(); }
    else if (button.dataset.activate) await activate(button.dataset.activate);
    else if (button.dataset.send) await activate(button.dataset.send, true);
    else if (button.dataset.resetEdit) { editDrafts.delete(button.dataset.resetEdit); render(); document.querySelector('#edit-form input')?.focus(); }
    else if (button.dataset.remove) confirmRemove(button.dataset.remove);
    else if (button.dataset.preset) confirmPreset(button.dataset.preset);
    else if (button.dataset.deletePreset) confirmDeletePreset(button.dataset.deletePreset);
    else switch (button.dataset.action) {
      case 'add': await addDialog(); break;
      case 'settings': await settingsDialog(); break;
      case 'help': helpDialog(); break;
      case 'panel': await invoke('toggle_panel'); break;
      case 'preset': presetDialog(); break;
      case 'all': search = ''; render(); break;
      case 'clear-search': search = ''; render(); document.getElementById('search')?.focus(); break;
      case 'close-dialog': closeDialog(); break;
    }
  } catch (error) { notice(error); }
});
on(document, 'input', event => {
  if (event.target.id === 'search') { search = event.target.value; filterPads(); }
  if (event.target.matches('[data-hotkey]')) { updateShortcutPreview(event.target); return; }
  const form = event.target.closest?.('#edit-form'); if (form) rememberEdit(form);
});
on(document, 'change', event => { const form = event.target.closest?.('#edit-form'); if (form) rememberEdit(form); });
on(document, 'submit', async event => {
  if (event.target.id !== 'edit-form') return;
  event.preventDefault();
  const form = event.target, id = form.dataset.entryId;
  if (editSaving.has(id)) return;
  rememberEdit(form);
  const draft = editDrafts.get(id); if (!draft) return;
  const next = structuredClone(config);
  const entry = next.entries.find(e => e.id === id); if (!entry) return;
  Object.assign(entry, draft, {label: draft.label.trim() || defaultName(entry.target)});
  editSaving.add(id); updateEditStatus(form);
  try {
    await save(next);
    if (editDrafts.get(id) === draft) editDrafts.delete(id);
    notice('변경 사항을 저장했습니다.');
  } catch (error) { notice(error); }
  finally {
    editSaving.delete(id);
    const latest = editDrafts.get(id);
    if (latest && matchesSavedEdit(latest, config.entries.find(e => e.id === id))) editDrafts.delete(id);
    render();
  }

});

boot().catch(notice);
