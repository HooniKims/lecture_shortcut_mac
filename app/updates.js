let updateState = { currentVersion: '', status: { phase: 'idle' } };
const updateDialog = document.getElementById('update-dialog');
function updateMessage(status) {
  switch (status.phase) {
    case 'idle': return '새 버전이 있는지 확인해 보세요.';
    case 'checking': return '새 버전을 확인하고 있습니다…';
    case 'latest': return '최신 버전을 사용하고 있습니다.';
    case 'unavailable': return '배포된 업데이트 정보를 찾지 못했습니다. 아직 첫 배포 전이거나 서버가 응답하지 않을 수 있습니다.';
    case 'available': return `${status.version} 버전을 설치할 수 있습니다.`;
    case 'downloading': return '업데이트 파일을 내려받고 검증하고 있습니다…';
    case 'installing': return '업데이트를 설치하고 있습니다. 잠시만 기다려 주세요.';
    case 'ready': return '설치가 끝났습니다. Cue를 다시 시작하면 새 버전이 적용됩니다.';
    case 'error': return status.message;
    default: return '업데이트 상태를 확인해 주세요.';
  }
}
function updateBusy() { return ['checking', 'downloading', 'installing'].includes(updateState.status.phase); }
function updateCard() {
  return `<section class="settings-section update-card"><div class="update-card-heading"><div><h3>${icon('download')}앱 업데이트</h3><p>개발 프리뷰 · 현재 버전 <span data-current-version>${escapeText(updateState.currentVersion || '확인 중')}</span></p></div><button type="button" class="button" data-update="open">업데이트 확인</button></div><p class="field-help" data-update-summary>${escapeText(updateMessage(updateState.status))}</p><label class="toggle-row"><span><strong>새 버전 자동 확인</strong><small>앱을 열 때 하루 한 번 확인합니다. 설치는 직접 선택합니다.</small></span><input type="checkbox" name="checkUpdates" ${config.settings.checkUpdates !== false ? 'checked' : ''}></label></section>`;
}
function updateDialogContent() {
  const s = updateState.status;
  const version = s.version || updateState.currentVersion;
  const notes = s.phase === 'available' && s.notes ? `<section class="update-notes"><h3>달라진 점</h3><p>${escapeText(s.notes)}</p></section>` : '';
  const progress = s.phase === 'downloading' ? `<progress aria-label="업데이트 다운로드" ${s.total ? `max="${s.total}" value="${Math.min(s.downloaded, s.total)}"` : ''}></progress>` : '';
  const action = s.phase === 'available'
    ? '<p class="field-help">강의를 마친 뒤 설치해 주세요. 설치 후 다시 시작할 때 저장하지 않은 설정은 사라집니다.</p><button class="button primary" data-update="install">업데이트 설치</button>'
    : s.phase === 'ready' ? '<button class="button primary" data-update="restart">Cue 다시 시작</button>'
    : `<button class="button" data-update="check" ${updateBusy() ? 'disabled' : ''}>${s.phase === 'checking' ? '확인 중…' : '다시 확인'}</button>`;
  return `<header class="dialog-header"><h2 id="update-title">Cue 업데이트</h2><button class="icon-button" data-update="close" aria-label="업데이트 창 닫기">${icon('close')}</button></header><p class="update-version">${escapeText(version || '')}</p><p class="update-message" role="status">${escapeText(updateMessage(s))}</p>${progress}${notes}<footer class="dialog-footer update-actions">${action}</footer>`;
}
function renderUpdateStatus() {
  const s = updateState.status;
  for (const el of document.querySelectorAll('[data-update-summary]')) el.textContent = updateMessage(s);
  for (const el of document.querySelectorAll('[data-current-version]')) el.textContent = updateState.currentVersion;
  for (const el of document.querySelectorAll('.sidebar [data-action="settings"]')) {
    const available = ['available', 'ready'].includes(s.phase);
    el.classList.toggle('has-update', available);
    el.setAttribute('aria-label', available ? '환경 설정 · 업데이트 있음' : '환경 설정');
  }
  if (updateDialog.open) {
    if (s.phase === 'downloading' && updateDialog.querySelector('progress')) {
      const progress = updateDialog.querySelector('progress');
      if (s.total) { progress.max = s.total; progress.value = Math.min(s.downloaded, s.total); }
    } else {
      const action = document.activeElement?.dataset?.update;
      updateDialog.innerHTML = updateDialogContent();
      if (action) updateDialog.querySelector(`[data-update="${action}"]:not(:disabled)`)?.focus();
    }
  }
}
async function checkUpdate() {
  try { await invoke('check_update', { automatic: false }); }
  catch (error) { updateState.status = { phase: 'error', message: String(error) }; renderUpdateStatus(); }
}
on(document, 'click', async event => {
  const action = event.target.closest('[data-update]')?.dataset.update;
  if (!action) return;
  try {
    switch (action) {
      case 'open':
        updateDialog.innerHTML = updateDialogContent(); updateDialog.showModal();
        if (!updateBusy() && !['available', 'ready'].includes(updateState.status.phase)) await checkUpdate();
        break;
      case 'close': updateDialog.close(); updateDialog.replaceChildren(); break;
      case 'check': if (!updateBusy()) await checkUpdate(); break;
      case 'install':
        if (updateState.status.phase !== 'available') break;
        updateState.status = { phase: 'downloading', version: updateState.status.version, downloaded: 0, total: null };
        renderUpdateStatus(); await invoke('install_update'); break;
      case 'restart': await invoke('restart_updated_app'); break;
    }
  } catch (error) { updateState.status = { phase: 'error', message: String(error) }; renderUpdateStatus(); }
});
on(updateDialog, 'cancel', () => { updateDialog.replaceChildren(); });
async function startUpdates() {
  await subscribe('update-status', event => { updateState.status = event.payload; renderUpdateStatus(); });
  updateState = await invoke('update_status'); renderUpdateStatus();
  // Only the main window checks, once at boot; the backend enforces the saved daily limit.
  void invoke('check_update', { automatic: true }).catch(error => {
    updateState.status = { phase: 'error', message: String(error) }; renderUpdateStatus();
  });
}
