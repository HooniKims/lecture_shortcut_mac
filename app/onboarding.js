const onboardingKey = 'cue.onboarding.v1';
const welcomeDialog = document.getElementById('onboarding-welcome');
let onboarding = null, onboardingBusy = false;

function rememberOnboarding(value) {
  try { localStorage.setItem(onboardingKey, value); } catch { /* The tour still works when storage is unavailable. */ }
}
function startFirstRun() {
  if (isPanel || isCapture) return;
  try { if (localStorage.getItem(onboardingKey)) return; } catch { /* Offer help for this session. */ }
  showOnboardingWelcome();
}
function showOnboardingWelcome() {
  if (isPanel || isCapture) return;
  closeDialog();
  onboarding = {step: 'welcome'};
  welcomeDialog.innerHTML = `<header class="welcome-top"><span class="eyebrow">CUE · 처음 시작하기</span><button class="icon-button" data-onboard="dismiss" aria-label="튜토리얼 닫기">${icon('close')}</button></header>
    <h1 id="welcome-title">다음 화면을 찾느라<br>강의 흐름을 놓치지 않도록.</h1>
    <p class="welcome-description">자주 쓰는 화면 하나를 등록하고,<br>단축키로 불러오는 것부터 함께 해볼까요?</p>
    <ol class="welcome-route"><li><span>1</span><div><strong>화면 하나 등록하기</strong><small>지금 열려 있는 앱이나 자료를 골라요.</small></div></li><li><span>2</span><div><strong>단축키로 불러오기</strong><small>원하는 화면이 바로 앞으로 나와요.</small></div></li><li><span>3</span><div><strong>발표자 패널 열기</strong><small>작은 목록에서도 화면을 바꿀 수 있어요.</small></div></li></ol>
    <footer class="welcome-footer"><button class="button primary" data-onboard="begin" autofocus>함께 해보기 ${icon('arrow')}</button><button class="button" data-onboard="dismiss">나중에 할게요</button></footer><p class="welcome-note">언제든 ‘사용 방법’에서 다시 시작할 수 있어요.</p>`;
  if (!welcomeDialog.open) welcomeDialog.showModal();
  rememberOnboarding('seen');
  renderOnboarding();
}
function beginOnboarding() {
  onboarding = {step: 'register', baseline: new Set(config.entries.map(e => e.id)), entryId: null};
  welcomeDialog.close();
  welcomeDialog.replaceChildren();
  renderOnboarding(true);
}
function dismissOnboarding() {
  rememberOnboarding(onboarding?.step === 'done' ? 'completed' : 'dismissed');
  onboarding = null;
  welcomeDialog.close();
  welcomeDialog.replaceChildren();
  renderOnboarding();
  document.querySelector('[data-action="help"]')?.focus({preventScroll: true});
}
function syncOnboarding() {
  if (!onboarding || onboarding.step === 'welcome') return;
  if (onboarding.entryId && !config.entries.some(e => e.id === onboarding.entryId)) {
    onboarding = {step: 'register', baseline: new Set(config.entries.map(e => e.id)), entryId: null};
  }
  if (onboarding.step === 'register') {
    const added = config.entries.find(e => !onboarding.baseline.has(e.id));
    if (added) { onboarding.entryId = added.id; onboarding.step = 'call'; }
  }
}
function onboardingAction(event) {
  if (onboarding?.step !== 'call' || event.id !== onboarding.entryId) return;
  if (!['shown', 'reopened', 'prepared'].includes(event.outcome)) return;
  onboarding.step = 'panel';
  renderOnboarding();
}
function onboardingPanel(visible) {
  if (!visible || onboarding?.step !== 'panel') return;
  onboarding.step = 'done';
  rememberOnboarding('completed');
  renderOnboarding();
}
function onboardingContent() {
  if (!onboarding || onboarding.step === 'welcome') return '';
  const {step, entryId} = onboarding;
  const entry = config.entries.find(e => e.id === entryId);
  const current = {register: 1, call: 2, panel: 3, done: 3}[step];
  const steps = ['화면 등록', '불러오기', '발표자 패널'];
  let title, body, action;
  if (step === 'register') {
    title = '먼저, 화면 하나를 골라볼까요?';
    body = '강의에 쓸 문서나 웹페이지를 열어 두세요. 아래 버튼을 누르고 목록에서 골라 등록하면 됩니다. 추천 단축키는 그대로 써도 좋아요.';
    action = `<button class="button primary" data-onboard="register">화면 골라 등록하기 ${icon('plus')}</button>${config.entries.length ? '<button class="button" data-onboard="existing">등록된 화면으로 연습</button>' : ''}`;
  } else if (step === 'call' && entry) {
    title = '이제, 단축키를 눌러보세요.';
    body = `<strong>${escapeText(entry.label)}</strong>에 연결된 ${keycap(entry.shortcut)}를 눌러보세요. 화면이 앞으로 나오면 성공이에요. 아래 버튼으로 먼저 해봐도 됩니다.<small class="tour-hint">확인한 뒤 Cue로 돌아오세요. 입력 칸 밖에서 단축키를 누르면 화면을 불러옵니다.</small>`;
    action = `<button class="button primary" data-onboard="call" ${onboardingBusy ? 'disabled' : ''}>이 화면 불러오기</button>`;
  } else if (step === 'panel') {
    title = '잘됐어요! 작은 패널에서도 해볼까요?';
    body = `발표자 패널은 등록한 화면을 모아 둔 작은 창이에요. 목록을 누르면 바로 불러올 수 있어요. ${keycap(config.settings.panelShortcut)}로 열고 닫을 수도 있습니다.`;
    action = `<button class="button primary" data-onboard="panel" ${onboardingBusy ? 'disabled' : ''}>발표자 패널 열기</button>`;
  } else if (step === 'done') {
    title = '이제 강의 화면을 편하게 바꿔보세요.';
    body = '등록하고, 단축키로 불러오고, 패널에서 고르면 됩니다. 같은 단축키를 다시 누르면 화면이 최소화돼요. 모니터를 연결했다면 환경 설정에서 청중에게 보여줄 모니터도 골라주세요.';
    action = '<button class="button primary" data-onboard="dismiss">마치기</button><button class="button" data-onboard="settings">모니터 설정 보기</button>';
  } else return '';
  return `<section class="onboarding-guide" aria-labelledby="tour-title"><div class="tour-top"><span class="eyebrow">${step === 'done' ? '함께 해보기 완료' : `함께 해보기 · ${current}/3`}</span><button class="tour-skip" data-onboard="dismiss">${step === 'done' ? '닫기' : '그만 보기'}</button></div><ol class="tour-progress" aria-label="튜토리얼 진행">${steps.map((label, i) => `<li ${current === i + 1 && step !== 'done' ? 'aria-current="step"' : ''} class="${i + 1 < current || step === 'done' ? 'complete' : ''}"><span>${i + 1 < current || step === 'done' ? '✓' : i + 1}</span>${label}</li>`).join('')}</ol><h2 id="tour-title" tabindex="-1">${title}</h2><p class="tour-copy">${body}</p><div class="tour-actions">${action}</div><p class="tour-error" role="alert"></p></section>`;
}
function renderOnboarding(focus = false) {
  const slot = document.getElementById('onboarding-slot');
  if (!slot) return;
  const focused = slot.contains(document.activeElement) ? document.activeElement?.dataset?.onboard : null;
  slot.innerHTML = onboardingContent();
  if (focus) slot.querySelector('#tour-title')?.focus({preventScroll: true});
  else if (focused) (slot.querySelector(`[data-onboard="${focused}"]`) || slot.querySelector('#tour-title'))?.focus({preventScroll: true});
}
on(welcomeDialog, 'cancel', event => { event.preventDefault(); dismissOnboarding(); });
on(document, 'click', async event => {
  const button = event.target.closest('[data-onboard]');
  if (!button || button.disabled) return;
  const action = button.dataset.onboard;
  const performing = ['call', 'panel'].includes(action);
  if (performing && onboardingBusy) return;
  if (performing) onboardingBusy = true;
  button.disabled = true;
  const error = document.querySelector('.tour-error');
  if (error) error.textContent = '';
  try {
    switch (action) {
      case 'welcome': showOnboardingWelcome(); break;
      case 'begin': beginOnboarding(); break;
      case 'dismiss': dismissOnboarding(); break;
      case 'register': await addDialog(); break;
      case 'existing': {
        if (onboarding?.step !== 'register') break;
        const entry = config.entries.find(e => e.id === selected) || config.entries[0];
        if (entry) { onboarding.entryId = entry.id; onboarding.step = 'call'; renderOnboarding(true); }
        break;
      }
      case 'call': if (onboarding?.step === 'call') await invoke('activate_entry', {id: onboarding.entryId, send: false}); break;
      case 'panel': if (onboarding?.step === 'panel') await invoke('show_panel'); break;
      case 'settings': dismissOnboarding(); await settingsDialog(); break;
    }
  } catch (failure) {
    const field = document.querySelector('.tour-error');
    if (field) field.textContent = `다시 시도해 주세요. ${String(failure)}`;
    else notice(failure);
  } finally {
    button.disabled = false;
    if (performing) {
      onboardingBusy = false;
      for (const current of document.querySelectorAll('[data-onboard="call"], [data-onboard="panel"]')) current.disabled = false;
    }
  }
});
