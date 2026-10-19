const onboardingKey = 'cue.onboarding.v2';
const registrationSteps = ['choose', 'name', 'shortcut', 'save'];
let onboarding = null, tourLayer = null, tourFrame = null, tourAnchor = null, tourView = '', tourMarkup = '';

function rememberOnboarding(value) {
  try { localStorage.setItem(onboardingKey, value); } catch { /* Help remains usable without storage. */ }
}
function startFirstRun() {
  if (isPanel || isCapture) return;
  try { if (localStorage.getItem(onboardingKey)) return; } catch { /* Offer this session's tour. */ }
  beginOnboarding();
}
function beginOnboarding() {
  if (isPanel || isCapture) return;
  onboarding = null;
  closeDialog();
  onboarding = {step: 'register', baseline: new Set(config.entries.map(e => e.id)), entryId: null};
  rememberOnboarding('seen');
  renderOnboarding(true);
}
function dismissOnboarding() {
  rememberOnboarding(onboarding?.step === 'done' ? 'completed' : 'dismissed');
  onboarding = null;
  tourLayer?.remove();
  tourAnchor = null;
  dialog.classList.remove('tour-registration');
  document.querySelector(dialog.open ? '#dialog-form button' : '[data-action="help"]')?.focus({preventScroll: true});
}
function setOnboardingStep(step) {
  if (!onboarding || onboarding.step === step) return;
  onboarding.step = step;
  renderOnboarding(true);
}
function onboardingRegistrationOpened() {
  if (onboarding?.step === 'register') setOnboardingStep('choose');
}
function onboardingPicked() {
  if (onboarding?.step === 'choose') setOnboardingStep('name');
}
function onboardingDialogClosed() {
  if (onboarding && registrationSteps.includes(onboarding.step)) onboarding.step = 'register';
  renderOnboarding(true);
}
function syncOnboarding() {
  if (!onboarding) return;
  if (onboarding.entryId && !config.entries.some(e => e.id === onboarding.entryId)) {
    onboarding = {step: 'register', baseline: new Set(config.entries.map(e => e.id)), entryId: null};
  }
  if (['register', ...registrationSteps].includes(onboarding.step)) {
    const added = config.entries.find(e => !onboarding.baseline.has(e.id));
    if (added) { onboarding.entryId = added.id; onboarding.step = 'pad'; selected = added.id; }
  }
}
function onboardingAction(event) {
  if (onboarding?.step !== 'call' || event.id !== onboarding.entryId) return;
  if (['shown', 'reopened', 'prepared', 'minimized'].includes(event.outcome)) setOnboardingStep('panel');
}
function onboardingPanel(visible) {
  if (!visible || onboarding?.step !== 'panel') return;
  rememberOnboarding('completed');
  setOnboardingStep('done');
}
function tourTarget(selector) { return document.querySelector(selector); }
function tourEntryButton(attribute) {
  return [...document.querySelectorAll(`[${attribute}]`)].find(el => el.getAttribute(attribute) === onboarding?.entryId);
}
function onboardingGuide() {
  if (!onboarding) return null;
  const entry = config.entries.find(e => e.id === onboarding.entryId);
  const form = document.getElementById('dialog-form');
  const guides = {
    register: {number: 1, target: () => tourTarget('.workspace-header [data-action="add"]'), title: '여기서 첫 화면을 등록해 볼까요?', copy: '강의에 쓸 앱이나 웹페이지를 열어 두고, 화살표가 가리키는 <strong>화면 등록</strong> 버튼을 눌러보세요.'},
    choose: {number: 2, target: () => tourTarget('#target-picker .picker-item') || tourTarget('#rescan'), title: '목록에서 화면 하나를 눌러보세요.', copy: '연습에 쓸 앱·창·탭을 골라주세요. 다른 항목을 골라도 좋아요. 찾는 화면이 없다면 검색하거나 새로고침해 보세요.'},
    name: {number: 3, target: () => tourTarget('#add-name'), title: '알아보기 쉬운 이름을 붙여보세요.', copy: '예를 들어 <strong>강의 자료</strong>나 <strong>실습 화면</strong>처럼 적어보세요. 지금 이름이 괜찮다면 그대로 사용해도 됩니다.', next: '이 이름으로 계속'},
    shortcut: {number: 4, target: () => form?.querySelector('[name="shortcut"]')?.closest('.shortcut-field'), title: '이 화면을 부를 단축키예요.', copy: '입력칸을 누르고 원하는 키 조합을 함께 눌러보세요. 추천된 단축키를 그대로 써도 됩니다. 기억했다면 아래 버튼을 눌러주세요.', next: '단축키 확인했어요'},
    save: {number: 5, target: () => form?.querySelector('[type="submit"]'), title: '이제 등록하기를 눌러보세요.', copy: '이름과 단축키를 확인했다면 <strong>등록하기</strong>를 눌러주세요. 저장에 성공하면 다음 위치를 안내할게요.'},
    pad: {number: 6, target: () => tourEntryButton('data-select'), title: '방금 만든 화면을 눌러보세요.', copy: `<strong>${escapeText(entry?.label || '')}</strong> 패드가 생겼어요. 패드를 누르면 오른쪽에서 이름·단축키를 편집하거나 화면을 불러올 수 있어요.`},
    call: {number: 7, target: () => tourEntryButton('data-activate'), title: '직접 화면을 불러보세요.', copy: `<strong>${config.settings.standby && displays.length > 1 ? '이 화면 준비' : '화면 띄우기'}</strong> 버튼을 누르거나 ${keycap(entry?.shortcut || '')}를 눌러보세요. 화면을 확인한 뒤 Cue로 돌아오면 다음 안내가 기다리고 있어요.`},
    panel: {number: 8, target: () => tourTarget('.workspace-footer [data-action="panel"]'), title: '작은 발표자 패널도 열어볼까요?', copy: '<strong>발표자 패널</strong> 버튼을 눌러보세요. 강의 중에는 이 작은 창의 목록을 눌러 화면을 바로 불러올 수 있어요.'},
    done: {number: 8, target: () => tourTarget('.workspace-footer [data-action="panel"]'), title: '첫 화면 전환을 마쳤어요.', copy: `이제 화면을 등록하고, 불러오고, 패널도 열어봤어요. ${keycap(config.settings.panelShortcut)}로 패널을 숨길 수 있어요. 다시 연습하려면 <strong>사용 방법 → 직접 따라 해보기</strong>를 누르세요.`}
  };
  return guides[onboarding.step];
}

// Choose a side that fits, then keep the bubble inside the visible viewport.
function tourPlacement(rect, size, viewport) {
  const margin = 12, gap = 30, clamp = (v, min, max) => Math.max(min, Math.min(v, Math.max(min, max)));
  const centerX = (rect.left + rect.right) / 2, centerY = (rect.top + rect.bottom) / 2;
  const spaces = {right: viewport.width - rect.right, left: rect.left, bottom: viewport.height - rect.bottom, top: rect.top};
  const sides = ['right', 'left', 'bottom', 'top'];
  const side = sides.find(s => spaces[s] >= (['left', 'right'].includes(s) ? size.width : size.height) + gap + margin)
    || sides.reduce((a, b) => spaces[a] / (['left', 'right'].includes(a) ? size.width : size.height) > spaces[b] / (['left', 'right'].includes(b) ? size.width : size.height) ? a : b);
  let x = side === 'right' ? rect.right + gap : side === 'left' ? rect.left - gap - size.width : centerX - size.width / 2;
  let y = side === 'bottom' ? rect.bottom + gap : side === 'top' ? rect.top - gap - size.height : centerY - size.height / 2;
  x = clamp(x, margin, viewport.width - size.width - margin);
  y = clamp(y, margin, viewport.height - size.height - margin);
  const start = side === 'right' ? [x, clamp(centerY, y + 20, y + size.height - 20)] : side === 'left' ? [x + size.width, clamp(centerY, y + 20, y + size.height - 20)] : side === 'bottom' ? [clamp(centerX, x + 20, x + size.width - 20), y] : [clamp(centerX, x + 20, x + size.width - 20), y + size.height];
  const end = side === 'right' ? [rect.right + 7, centerY] : side === 'left' ? [rect.left - 7, centerY] : side === 'bottom' ? [centerX, rect.bottom + 7] : [centerX, rect.top - 7];
  return {x, y, start, end, side};
}
function positionOnboarding() {
  tourFrame = null;
  if (!tourLayer?.isConnected || !tourAnchor?.isConnected) return;
  const rect = tourAnchor.getBoundingClientRect();
  const bubble = tourLayer.querySelector('.tour-bubble');
  const visible = rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;
  tourLayer.hidden = !visible;
  if (!visible) return;
  const spotlight = tourLayer.querySelector('.tour-spotlight');
  Object.assign(spotlight.style, {left: `${rect.left - 5}px`, top: `${rect.top - 5}px`, width: `${rect.width + 10}px`, height: `${rect.height + 10}px`});
  const position = tourPlacement(rect, {width: bubble.offsetWidth, height: bubble.offsetHeight}, {width: innerWidth, height: innerHeight});
  Object.assign(bubble.style, {left: `${position.x}px`, top: `${position.y}px`});
  const [sx, sy] = position.start, [ex, ey] = position.end;
  const middle = ['left', 'right'].includes(position.side) ? `${(sx + ex) / 2} ${sy} ${(sx + ex) / 2} ${ey}` : `${sx} ${(sy + ey) / 2} ${ex} ${(sy + ey) / 2}`;
  tourLayer.querySelector('.tour-arrow path').setAttribute('d', `M ${sx} ${sy} C ${middle} ${ex} ${ey}`);
}
function scheduleTourPosition() {
  if (onboarding && tourFrame === null) tourFrame = requestAnimationFrame(positionOnboarding);
}
function renderOnboarding(focus = false) {
  dialog.classList.toggle('tour-registration', !!onboarding && registrationSteps.includes(onboarding.step));
  const guide = onboardingGuide();
  if (!guide) { tourLayer?.remove(); return; }
  const inRegistration = registrationSteps.includes(onboarding.step);
  const form = document.getElementById('dialog-form');
  if (dialog.open && (!inRegistration || form?.dataset.tour !== 'registration')) { tourLayer?.remove(); return; }
  const target = guide.target();
  if (!target) { tourLayer?.remove(); return; }
  if (!tourLayer) { tourLayer = document.createElement('div'); tourLayer.id = 'tour-layer'; }
  const changed = tourView !== onboarding.step || tourAnchor !== target;
  const focused = tourLayer.contains(document.activeElement) ? document.activeElement?.dataset?.onboard : null;
  const host = dialog.open ? dialog : document.body;
  if (tourLayer.parentElement !== host) host.append(tourLayer);
  const content = `<div class="tour-spotlight" aria-hidden="true"></div><svg class="tour-arrow" aria-hidden="true"><defs><marker id="tour-arrowhead" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto"><polygon points="0 0, 7 3.5, 0 7"/></marker></defs><path marker-end="url(#tour-arrowhead)"/></svg><section class="tour-bubble" role="region" aria-labelledby="tour-title"><div class="tour-top"><span class="eyebrow">${onboarding.step === 'done' ? '실습 완료' : `직접 해보기 · ${guide.number}/8`}</span><button type="button" class="tour-skip" data-onboard="dismiss">${onboarding.step === 'done' ? '닫기' : '그만 보기'}</button></div><h2 id="tour-title" tabindex="-1">${guide.title}</h2><p class="tour-copy">${guide.copy}</p>${guide.next ? `<button type="button" class="button primary tour-next" data-onboard="next">${guide.next}</button>` : onboarding.step === 'done' ? '<button type="button" class="button primary tour-next" data-onboard="dismiss">마치기</button>' : '<p class="tour-instruction">화살표가 가리키는 곳을 직접 눌러보세요.</p>'}</section>`;
  if (tourMarkup !== content) { tourLayer.innerHTML = content; tourMarkup = content; }
  tourView = onboarding.step;
  tourAnchor = target;
  if (changed || focus) target.scrollIntoView({block: 'center', inline: 'nearest', behavior: 'instant'});
  positionOnboarding();
  if (focus) tourLayer.querySelector('#tour-title')?.focus({preventScroll: true});
  else if (focused) tourLayer.querySelector(`[data-onboard="${focused}"]`)?.focus({preventScroll: true});
}
on(document, 'click', event => {
  const button = event.target.closest('button');
  if (!button || button.disabled) return;
  if (button.dataset.onboard === 'welcome') { beginOnboarding(); return; }
  if (!onboarding) return;
  if (button.dataset.onboard === 'dismiss') dismissOnboarding();
  else if (button.dataset.onboard === 'next') {
    if (onboarding.step === 'name') setOnboardingStep('shortcut');
    else if (onboarding.step === 'shortcut') setOnboardingStep('save');
  } else if (onboarding.step === 'pad' && button.dataset.select === onboarding.entryId) setOnboardingStep('call');
});
on(document, 'keydown', event => {
  if (event.key === 'Escape' && onboarding && !dialog.open) { event.preventDefault(); dismissOnboarding(); }
});
on(window, 'resize', () => {
  if (onboarding && tourAnchor?.isConnected) tourAnchor.scrollIntoView({block: 'center', inline: 'nearest', behavior: 'instant'});
  scheduleTourPosition();
});
// Capture scroll events from both the main page and the registration dialog.
on(document, 'scroll', scheduleTourPosition, {capture: true, passive: true});
