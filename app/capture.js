let captureSession = null, captureFinishing = false;
async function loadCapture() {
  const draft = await invoke('capture_draft');
  if (!draft || draft.id <= (captureSession?.id ?? -1) || captureFinishing) return;
  captureSession = draft;
  const target = draft.target;
  const duplicate = target && config.entries.some(entry => entry.target.id === target.id);
  const source = target ? `<section class="capture-source" aria-label="등록할 대상"><span class="target-symbol ${target.kind}">${targetIcon(target)}</span><div><span class="capture-kind">${escapeText(target.app)} · ${kindName(target.kind)}</span><h2>${escapeText(defaultName(target))}</h2>${target.url ? `<p class="capture-url">${escapeText(target.url)}</p>` : ''}</div></section>` : `<div class="capture-failure"><span class="empty-symbol">${icon('browser')}</span><h2>화면을 읽지 못했습니다</h2><p>${escapeText(draft.error || '등록할 화면을 먼저 열어 주세요.')}</p></div>`;
  showDialog('빠른 등록', `<p class="dialog-description">지금 보고 있던 화면을 단축키에 연결하세요.</p>${source}
    ${target ? `<label>표시 이름<input name="label" value="${escapeText(defaultName(target))}" autocomplete="off" autofocus></label><label>호출 단축키${shortcutField('shortcut', nextShortcut(), 'capture-key-help')}</label><p id="capture-key-help" class="field-help">${nextShortcut() ? '빈 단축키를 추천했습니다. 눌러서 바꿀 수 있습니다.' : '번호 단축키가 모두 사용 중입니다. 다른 키 조합을 입력하세요.'}</p>${target.kind === 'tab' ? '<label>호출할 때 이동 방식<select name="tabMode"><option value="detach">이 탭만 새 창으로 이동</option><option value="window">브라우저 창 전체 이동</option></select></label>' : ''}${duplicate ? '<p class="capture-warning">이미 등록된 화면입니다. 메인 목록에서 수정하세요.</p>' : ''}` : '<p class="field-help">권한과 브라우저 상태를 확인한 뒤 다시 시도하세요.</p>'}
    <footer class="dialog-footer"><button type="button" class="button" data-action="close-dialog">${target ? '취소' : '닫기'}</button>${target ? `<button class="button primary" type="submit" ${duplicate ? 'disabled' : ''}>${icon('plus')}등록하기 <span aria-hidden="true">↩</span></button>` : ''}</footer>`, async data => {
      if (captureFinishing || !target || duplicate) return false;
      captureFinishing = true;
      try {
        await invoke('finish_capture', {id: draft.id, input: {label: String(data.get('label')), shortcut: String(data.get('shortcut')), tabMode: String(data.get('tabMode') || 'window')}});
        dismissCapture();
      } finally { captureFinishing = false; }
      return false;
    });
  document.querySelector('#dialog input[name="label"]')?.select();
}
function dismissCapture() {
  captureSession = null;
  setShortcutRecording(false);
  dialog.close();
  dialog.replaceChildren();
}
async function cancelCapture() {
  if (!captureSession || captureFinishing) return;
  captureFinishing = true;
  try { await invoke('finish_capture', {id: captureSession.id, input: null}); dismissCapture(); }
  catch (error) { notice(error); }
  finally { captureFinishing = false; }
}
