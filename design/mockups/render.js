const directions = {
  focus: { letter:'A', name:'Focus', caption:'필요한 정보만, 정확한 자리에.', note:'짧은 목록과 입체적인 키캡. 좁은 공간에서도 빠르게 읽히는 화면.', title:'작게 띄워도, 확실하게.', points:['정교한 명암과 얇은 경계선','한 줄에 읽히는 이름과 단축키','필요한 순간에만 나타나는 작은 패널'], link:'https://www.raycast.com/press' },
  paper: { letter:'B', name:'Paper', caption:'강의 준비도, 마음도 가볍게.', note:'밝은 종이 같은 표면과 여유로운 간격. 자료를 차분하게 정리하는 화면.', title:'강의 준비가 편안해지는 화면.', points:['화이트와 부드러운 블루','자료 이름을 중심으로 한 넉넉한 목록','작성한 강의 노트 같은 발표자 패널'], link:'https://culturedcode.com/things/features/' },
  studio: { letter:'C', name:'Studio', caption:'다음 화면이, 손끝에.', note:'위치로 기억하는 큰 버튼. 준비한 강의 화면을 나만의 제어판에 담습니다.', title:'보는 순간, 누를 곳을 알도록.', points:['입체적인 버튼과 선명한 활성 표시','앱 아이콘으로 기억하는 격자 배열','마우스로도 편하게 누르는 발표자 패널'], link:'https://www.elgato.com/us/en/s/stream-deck-app' }
};
const originalItems = [
  {id:1,title:'AI 활용 연수.pptx — PowerPoint',name:'강의 슬라이드',app:'PowerPoint',detail:'AI 활용 연수.pptx',type:'앱 창',icon:'presentation',key:'⌥ 1'},
  {id:2,title:'ChatGPT — AI 수업 실습',name:'ChatGPT 실습',app:'Google Chrome',detail:'chatgpt.com',type:'브라우저 탭',icon:'browser',key:'⌥ 2'},
  {id:3,title:'교실에서 활용하는 AI 수업 사례 - YouTube',name:'참고 영상',app:'Google Chrome',detail:'youtube.com · AI 수업 사례',type:'브라우저 탭',icon:'video',key:'⌥ 3'},
  {id:4,title:'index.html — 수업 예제 — Visual Studio Code',name:'실습 코드',app:'Visual Studio Code',detail:'수업 예제 · index.html',type:'앱 창',icon:'code',key:'⌥ 4'},
  {id:5,title:'AI 활용 연수 실습 활동지 - Google Docs',name:'활동 자료',app:'Safari',detail:'docs.google.com · 실습 활동지',type:'브라우저 탭',icon:'document',key:'⌥ 5'},
  {id:6,title:'',name:'질문 모음',app:'Notion',detail:'연수 질문과 답변',type:'앱',icon:'note',key:'⌥ 6'}
];
const state = {theme:'studio', items:structuredClone(originalItems),selected:2,active:1,panel:true,standby:false,dual:true,restore:true,preset:'AI 활용 연수',query:'',tabMode:'separate',chosen:'studio',prepared:null};
function defaultTargetName(item) { return item.title || item.app; }
function targetMarkup(item, panel = false) {
  const live = state.active === item.id;
  return `<button class="target ${panel ? 'panel-target' : ''} ${state.selected === item.id && !panel ? 'selected' : ''} ${live ? 'is-live' : ''}" title="${escapeText(item.name)}" data-${panel ? 'activate' : 'select'}="${item.id}" aria-pressed="${panel ? live : state.selected === item.id}">${appIcon(item)}<span class="target-copy"><strong>${escapeText(item.name)}</strong><small>${escapeText(item.app)}</small></span>${live ? '<span class="live-label"><i></i> 송출 중</span>' : ''}${keys(item.key)}${!panel ? '<span class="target-more" aria-hidden="true">···</span>' : ''}</button>`;
}
function renderSidebar() {
  return `<aside class="sidebar"><div class="app-brand"><span class="cue-symbol">${icon('play')}</span><strong>Cue</strong><small>강의의 다음 장면</small></div><button class="side-nav active" data-action="home">${icon('grid')}<span>내 단축키</span><b>${state.items.length}</b></button><button class="side-nav" data-action="settings">${icon('settings')}<span>설정</span></button><div class="sidebar-heading">강의 프리셋<button data-action="save" aria-label="프리셋 저장">${icon('plus')}</button></div>${['AI 활용 연수','엑셀 기초','새 강의 준비'].map(name => `<button class="preset ${state.preset === name ? 'active' : ''}" data-preset="${name}" aria-pressed="${state.preset === name}">${icon('folder')}<span>${name}</span>${state.preset === name ? '<i></i>' : ''}</button>`).join('')}<div class="sidebar-bottom"><div class="connection-dot"></div><div><strong>강의 준비 완료</strong><small>모든 단축키 사용 가능</small></div></div></aside>`;
}
function renderInspector() {
  const item = state.items.find(item => item.id === state.selected) || state.items[0];
  if (!item) return '';
  return `<aside class="inspector"><div class="inspector-eyebrow">선택한 화면</div><div class="inspector-identity">${appIcon(item)}<div><h3>${escapeText(item.name)}</h3><span>${item.type}</span></div></div><div class="inspector-form"><label>등록 이름<input id="item-name" value="${escapeText(item.name)}" placeholder="${escapeText(defaultTargetName(item))}"></label><label>단축키<button class="shortcut-field" data-action="shortcut" title="단축키 변경">${keys(item.key)}<span>변경</span></button></label><div class="target-address">${icon('link')}<span title="${escapeText(defaultTargetName(item))}">${escapeText(defaultTargetName(item))}</span></div><label class="tab-behavior">탭을 보여주는 방식<select id="tab-mode" ${item.type !== '브라우저 탭' ? 'disabled' : ''}><option value="separate" ${state.tabMode === 'separate' ? 'selected' : ''}>이 탭만 별도 창으로</option><option value="window" ${state.tabMode === 'window' ? 'selected' : ''}>기존 창 전체 이동</option></select></label></div><div class="inspector-bottom"><p>${icon('monitor')} 기존 창 크기 유지</p><button class="primary" data-activate="${item.id}">${icon('play')} 화면 띄우기</button><small>다시 누르면 최소화됩니다</small></div></aside>`;
}
function renderApp() {
  const list = state.items.filter(item => `${item.name} ${item.app}`.toLowerCase().includes(state.query.toLowerCase()));
  document.querySelector('#app-root').innerHTML = `<header class="window-bar"><div class="traffic-lights" aria-hidden="true"><i></i><i></i><i></i></div><span>Cue</span><button class="icon-button" data-action="panel" aria-label="발표자 패널 ${state.panel ? '숨기기' : '보이기'}">${icon('panel')}</button></header><div class="window-body">${renderSidebar()}<section class="workspace"><header class="workspace-header"><div><p class="workspace-eyebrow">MY SHORTCUTS</p><h2>${escapeText(state.preset)}</h2><p>화면 전환은 짧게, 강의의 흐름은 길게.</p></div><button class="primary add-button" data-action="add">${icon('plus')}<span>화면 등록</span></button></header><div class="monitor-bar"><div class="monitor-icon">${icon('monitor')}</div><div><small>${state.dual ? '송출 모니터' : '현재 모니터'}</small><button data-action="settings">${state.dual ? 'DELL U2723QE' : 'MacBook 디스플레이'} ${icon('chevron')}</button></div><span class="monitor-mode">${state.dual ? '듀얼 모니터' : '싱글 모니터'}</span><button class="standby-control ${state.standby ? 'on' : ''}" data-action="standby" aria-pressed="${state.standby}" ${!state.dual ? 'disabled' : ''}>대기 모드<span class="switch"><i></i></span></button></div><div class="list-toolbar"><span>등록한 화면 <b>${state.items.length}</b></span><label class="search">${icon('search')}<input id="search" placeholder="화면 검색" aria-label="등록한 화면 검색" value="${escapeText(state.query)}"></label></div><div class="target-list">${list.length ? list.map(item => targetMarkup(item)).join('') : '<div class="empty-state">일치하는 화면이 없습니다.<br><small>다른 이름으로 검색해 보세요.</small></div>'}</div><button class="inline-add" data-action="add">${icon('plus')} 새로운 화면 추가</button><footer class="workspace-footer"><span>${icon('keyboard')} 단축키를 다시 누르면 최소화</span><button data-action="save">${icon('save')} 프리셋 저장</button></footer></section>${renderInspector()}</div>`;
}
function renderPanel() {
  const current = state.items.find(item => item.id === (state.standby ? state.prepared : state.active));
  document.querySelector('#panel-root').innerHTML = state.panel ? `<section class="presenter-panel" aria-label="발표자 단축키 패널"><header class="panel-header" title="드래그해서 패널 이동"><span class="panel-grip" aria-hidden="true">⠿</span><strong>Cue</strong><span class="panel-header-end">${icon('pin')}<button class="icon-button" data-action="panel" aria-label="발표자 패널 닫기">${icon('close')}</button></span></header><div class="panel-intro"><span>${escapeText(state.preset)}</span><span class="status ${state.standby ? 'waiting' : ''}"><i></i>${state.standby ? '대기 모드' : '즉시 송출'}</span></div><div class="panel-targets">${state.items.map(item => targetMarkup(item,true)).join('')}</div><div class="panel-bottom"><div><i class="connection-dot"></i><span>${state.dual ? 'DELL U2723QE' : 'MacBook 디스플레이'}</span></div><button data-action="standby" ${!state.dual ? 'disabled' : ''} aria-pressed="${state.standby}">${state.standby ? '대기 해제' : '대기'}</button></div>${state.standby ? `<button class="primary send-button" data-action="send" ${state.prepared ? '' : 'disabled'}>${icon('arrow')} ${current ? escapeText(current.name) + ' 송출' : '준비할 화면을 선택하세요'}</button>` : ''}</section><p class="panel-help">${icon('panel')} 다른 모니터에 띄워두는 나만의 리모컨</p>` : `<div class="panel-hidden">${icon('panel')}<strong>패널을 숨겼습니다</strong><p>필요할 때 다시 꺼내세요.</p><button class="primary" data-action="panel">발표자 패널 열기</button></div>`;
  setupDrag();
}
function render() { renderApp(); renderPanel(); }
function setDirection(theme) {
  if (!directions[theme]) return;
  state.theme = theme;
  panelOffset = {x:0,y:0};
  document.body.dataset.theme = theme;
  const dir = directions[theme];
  document.querySelectorAll('[data-direction]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.direction === theme)));
  document.querySelector('#direction-label').textContent = `${dir.letter} / ${dir.name.toUpperCase()}`;
  document.querySelector('#direction-caption').textContent = dir.caption;
  document.querySelector('#design-note').textContent = dir.note;
  document.querySelector('#summary-title').textContent = dir.title;
  document.querySelector('#summary-points').innerHTML = dir.points.map((point,index) => `<p><span>0${index+1}</span>${point}</p>`).join('');
  document.querySelector('#choose-design').innerHTML = `${dir.letter} · ${dir.name} 선택하기 <span aria-hidden="true">↗</span>`;
  document.querySelector('#reference-link').href = dir.link;
  history.replaceState(null,'',`#${theme}`);
  render();
}
