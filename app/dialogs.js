const dialog = document.getElementById('dialog');
let requestedRecording = false, recordingWrite = null;
function setShortcutRecording(recording) {
  if (!api || isPanel) return;
  requestedRecording = recording;
  if (recordingWrite) return;
  const nextRecording = requestedRecording;
  recordingWrite = invoke('record_shortcut', { recording: nextRecording }).catch(notice).finally(() => {
    recordingWrite = null;
    if (requestedRecording !== nextRecording) setShortcutRecording(requestedRecording);
  });
}
function closeDialog() {
  dialog.close();
  dialog.replaceChildren();
}
function showDialog(title, content, submit) {
  dialog.innerHTML = `<form id="dialog-form"><header class="dialog-header"><h2 id="dialog-title">${title}</h2><button type="button" class="icon-button" data-action="close-dialog" aria-label="닫기">${icon('close')}</button></header>${content}<p id="dialog-error" class="form-error" role="alert"></p></form>`;
  if (!dialog.open) dialog.showModal();
  const form = document.getElementById('dialog-form');
  form.addEventListener('submit', async event => {
    event.preventDefault(); const button = event.submitter; if (button) button.disabled = true;
    try { await submit(new FormData(event.target)); if (document.getElementById('dialog-form') === form) closeDialog(); }
    catch (error) { form.querySelector('.form-error').textContent = String(error); }
    finally { if (button) button.disabled = false; }
  });
}
const dialogFooter = label => `<footer class="dialog-footer"><button type="button" class="button" data-action="close-dialog">취소</button><button class="button primary" type="submit">${label}</button></footer>`;
function nextShortcut() {
  const used = new Set(config.entries.map(e => prettyKey(e.shortcut).split(" ").sort().join(" ")));
  for (let i = 1; i <= 9; i++) { const key = `CommandOrControl+Shift+${i}`; if (!used.has(prettyKey(key).split(" ").sort().join(" "))) return key; }
  return '';
}
async function addDialog(captured = null) {
  let targets = captured ? [captured] : [], selectedTarget = captured;
  showDialog('화면 등록', `<p class="dialog-description">열려 있는 화면을 고르고 단축키로 연결하세요.</p>
    <div class="picker-tools"><label class="search">${icon('search')}<input id="target-search" type="search" placeholder="앱, 창 또는 탭 검색" aria-label="등록할 대상 검색"></label><button type="button" id="rescan" class="button">새로고침</button></div>
    <div id="permission-note"></div><div id="target-picker" class="target-picker" role="group" aria-label="등록할 화면">목록을 불러오는 중…</div><p id="browser-note" class="field-help">탭 제어를 제공하지 않는 브라우저도 앱·창으로 등록할 수 있습니다.</p>
    <label>표시 이름<input name="label" id="add-name" placeholder="선택한 화면의 제목" value="${captured ? escapeText(defaultName(captured)) : ''}"></label>
    <div class="form-columns"><label>단축키${shortcutField('shortcut', nextShortcut())}</label><label>탭 이동 방식<select name="tabMode" id="add-tab-mode"><option value="detach">이 탭만 새 창으로 이동</option><option value="window">브라우저 창 전체 이동</option></select></label></div>
    ${dialogFooter('등록하기')}`, async data => {
    if (!selectedTarget) throw new Error('등록할 화면을 선택해 주세요.');
    const next = structuredClone(config); const id = crypto.randomUUID();
    next.entries.push({ id, label: String(data.get('label')).trim() || defaultName(selectedTarget), shortcut: String(data.get('shortcut')), target: selectedTarget, tabMode: String(data.get('tabMode') || 'detach') });
    selected = id; await save(next); notice('화면을 등록했습니다.');
  });
  const form = document.getElementById('dialog-form');
  const picker = form.querySelector('#target-picker');
  let suggested = captured ? defaultName(captured) : '';
  function choose(target) {
    selectedTarget = target; const field = document.getElementById('add-name');
    if (!field.value || field.value === suggested) field.value = defaultName(target);
    suggested = defaultName(target);
    document.getElementById('add-tab-mode').disabled = target.kind !== 'tab';
    renderTargets();
  }
  function renderTargets() {
    const query = document.getElementById('target-search').value.toLowerCase();
    const filtered = targets.filter(t => `${t.title} ${t.app} ${t.kind}`.toLowerCase().includes(query));
    picker.innerHTML = filtered.map(t => `<button type="button" aria-pressed="${t.id === selectedTarget?.id}" data-target-id="${escapeText(t.id)}" class="picker-item ${t.id === selectedTarget?.id ? 'chosen' : ''}"><span class="target-symbol ${t.kind}">${targetIcon(t)}</span><span><strong>${escapeText(defaultName(t))}</strong><small>${escapeText(t.app)} · ${kindName(t.kind)}</small></span>${t.id === selectedTarget?.id ? icon('check') : ''}</button>`).join('') || '<p class="picker-empty">선택할 화면이 없습니다.<br>사용할 앱을 연 뒤 새로고침해 주세요.</p>';
  }
  picker.addEventListener('click', event => { const row = event.target.closest('[data-target-id]'); const target = targets.find(t => t.id === row?.dataset.targetId); if (target) choose(target); });
  document.getElementById('target-search').addEventListener('input', renderTargets);
  async function scan() {
    document.getElementById('rescan').disabled = true;
    try {
      const reply = await invoke('inspect_native', { op: 'snapshot' }); targets = reply.targets || [];
      if (!dialog.open || document.getElementById('dialog-form') !== form) return;
      renderTargets();
      document.getElementById('permission-note').innerHTML = reply.permissions?.accessibility === false ? '<div class="permission-banner"><strong>창 제어 권한이 필요합니다</strong><p>시스템 설정에서 Cue의 손쉬운 사용 권한을 허용해 주세요.</p><button type="button" id="grant-access" class="button">권한 설정 열기</button></div>' : '';
      document.getElementById('grant-access')?.addEventListener('click', () => invoke('inspect_native', { op: 'requestPermissions' }).catch(notice));
      if (reply.warnings?.length) document.getElementById('browser-note').textContent = reply.warnings.join(' ');
    } catch (error) {
      if (document.getElementById('dialog-form') === form) { picker.textContent = '목록을 불러오지 못했습니다. 새로고침해 다시 시도해 주세요.'; form.querySelector('.form-error').textContent = String(error); }
    } finally { form.querySelector('#rescan').disabled = false; }
  }
  document.getElementById('rescan').addEventListener('click', () => scan().catch(error => { document.getElementById('dialog-error').textContent = String(error); }));
  if (captured) choose(captured); else await scan();
}
async function settingsDialog() {
  await pollDisplays();
  const s = config.settings;
  showDialog('환경 설정', `<p class="dialog-description">강의 환경에 맞춰 화면 전환 방식을 설정하세요.</p>
    ${updateCard()}<section class="settings-section"><h3>${icon('grid')}화면 테마</h3><fieldset class="theme-choices"><legend class="sr-only">화면 테마 선택</legend><label class="theme-choice"><input type="radio" name="theme" value="studio" ${s.theme !== 'paper' ? 'checked' : ''}><span class="theme-swatch studio-swatch" aria-hidden="true"></span><span><strong>C · Studio</strong><small>어두운 제어판</small></span></label><label class="theme-choice"><input type="radio" name="theme" value="paper" ${s.theme === 'paper' ? 'checked' : ''}><span class="theme-swatch paper-swatch" aria-hidden="true"></span><span><strong>B · Paper</strong><small>밝고 차분한 화면</small></span></label></fieldset><p class="field-help">메인 화면과 발표자 패널에 함께 적용됩니다.</p></section>
    <section class="settings-section"><h3>${icon('monitor')}화면과 송출</h3><label>청중에게 보여줄 모니터<select name="displayId">${displays.map(d => `<option value="${escapeText(d.id)}" ${d.id === (s.displayId || displays.find(item => !item.primary)?.id || displays[0]?.id) ? 'selected' : ''}>${escapeText(d.name)}${d.primary ? ' · 기본 모니터' : ''}</option>`).join('')}</select></label>
    <label class="toggle-row"><span><strong>대기 모드</strong><small>${displays.length > 1 ? '원래 모니터에서 준비한 뒤 송출합니다.' : '모니터가 2대 이상일 때 사용할 수 있습니다.'}</small></span><input type="checkbox" name="standby" ${s.standby && displays.length > 1 ? 'checked' : ''} ${displays.length < 2 ? 'disabled' : ''}></label>
    <label class="toggle-row"><span><strong>재시작 후에도 등록 유지</strong><small>꺼도 직접 저장한 프리셋과 설정은 남습니다.</small></span><input type="checkbox" name="restore" ${s.restore ? 'checked' : ''}></label></section>
    <section class="settings-section"><h3>${icon('keyboard')}기능 단축키</h3><div class="shortcut-settings"><label>발표자 패널 켜기·끄기${shortcutField('panelShortcut', s.panelShortcut, 'settings-shortcut-help')}</label><label>현재 화면 등록${shortcutField('captureShortcut', s.captureShortcut, 'settings-shortcut-help')}</label><label>대기 화면 송출${shortcutField('sendShortcut', s.sendShortcut, 'settings-shortcut-help')}</label></div><p id="settings-shortcut-help" class="field-help">필드를 선택한 후 원하는 키 조합을 누르세요.</p></section>
    <section class="permission-line"><span>macOS 손쉬운 사용 권한</span><button id="permission-button" type="button" class="button">권한 확인·설정</button></section>${dialogFooter('설정 저장')}`, async data => {
    const next = structuredClone(config);
    next.settings = { checkUpdates: data.has('checkUpdates'), theme: String(data.get('theme') || 'studio'), restore: data.has('restore'), standby: data.has('standby') && displays.length > 1, displayId: String(data.get('displayId') || '') || null, panelShortcut: String(data.get('panelShortcut')), captureShortcut: String(data.get('captureShortcut')), sendShortcut: String(data.get('sendShortcut')) };
    await save(next); notice('설정을 저장했습니다.');
  });
  document.getElementById('permission-button').addEventListener('click', async () => {
    try { const r = await invoke('inspect_native', { op: 'requestPermissions' }); notice(r.permissions?.accessibility ? '손쉬운 사용 권한이 허용되어 있습니다.' : '시스템 설정에서 Cue를 허용한 뒤 다시 시도해 주세요.'); } catch (error) { notice(error); }
  });
}
function presetDialog() {
  showDialog('프리셋 저장', `<p class="dialog-description">현재 등록한 ${config.entries.length}개 화면과 단축키를 저장합니다.</p><label>강의 이름<input name="name" placeholder="예: AI 활용 연수" required autofocus></label>${dialogFooter('프리셋 저장')}`, async data => {
    const name = String(data.get('name')).trim(); if (!name) throw new Error('강의 이름을 입력해 주세요.');
    const next = structuredClone(config); next.presets.push({ id: crypto.randomUUID(), name, entries: structuredClone(config.entries) }); await save(next); notice('프리셋을 저장했습니다.');
  });
}
function confirmPreset(id) {
  const preset = config.presets.find(p => p.id === id); if (!preset) return;
  showDialog('프리셋 불러오기', `<p class="dialog-description"><strong>${escapeText(preset.name)}</strong>의 ${preset.entries.length}개 화면을 불러옵니다. 현재 목록이 바뀌므로 필요한 목록은 먼저 프리셋으로 저장해 주세요.</p>${dialogFooter('불러오기')}`, async () => { const next = structuredClone(config); next.entries = structuredClone(preset.entries); await save(next); notice('프리셋을 불러왔습니다.'); });
}
function confirmRemove(id) {
  const entry = config.entries.find(e => e.id === id); if (!entry) return;
  showDialog('등록 제거', `<p class="dialog-description">${escapeText(entry.label)}의 등록과 단축키를 제거합니다. 실제 앱이나 창은 닫지 않습니다.</p>${dialogFooter('등록 제거')}`, async () => { const next = structuredClone(config); next.entries = next.entries.filter(e => e.id !== id); await save(next); });
}
function confirmDeletePreset(id) {
  const preset = config.presets.find(p => p.id === id); if (!preset) return;
  showDialog('프리셋 삭제', `<p class="dialog-description">${escapeText(preset.name)} 프리셋을 삭제합니다. 현재 등록 목록은 유지됩니다.</p>${dialogFooter('삭제하기')}`, async () => { const next = structuredClone(config); next.presets = next.presets.filter(p => p.id !== id); await save(next); });
}
on(document, 'keydown', event => {
  if (!event.target.matches('[data-hotkey]')) return;
  if (event.key === 'Tab' || event.key === 'Escape') return;
  if (['Meta', 'Control', 'Shift', 'Alt'].includes(event.key)) { event.preventDefault(); return; }
  if (!(event.metaKey || event.ctrlKey || event.altKey)) return;
  event.preventDefault(); event.stopPropagation();
  const parts = [];
  if (event.metaKey) parts.push('CommandOrControl');
  if (event.ctrlKey) parts.push('Control');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  const code = event.code.replace(/^Key/, '').replace(/^Digit/, '');
  parts.push(code); event.target.value = parts.join('+');
  updateShortcutPreview(event.target);
});

on(document, "focusin", event => { if (event.target.matches("[data-hotkey]")) setShortcutRecording(true); });
on(document, "focusout", event => { if (event.target.matches("[data-hotkey]")) setShortcutRecording(false); });
on(window, "blur", () => setShortcutRecording(false));

on(window, "focus", () => setShortcutRecording(document.activeElement?.matches("[data-hotkey]") || false));

on(dialog, "cancel", event => { event.preventDefault(); closeDialog(); });
on(dialog, "close", () => { if (!dialog.open) dialog.replaceChildren(); });
