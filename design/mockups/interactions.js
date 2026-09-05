let toastTimeout;
let panelOffset = {x:0,y:0};
function toast(message) {
  const el = document.querySelector('#toast');
  el.textContent = message; el.classList.add('visible');
  clearTimeout(toastTimeout); toastTimeout = setTimeout(() => el.classList.remove('visible'), 4000);
}
function activate(id) {
  const item = state.items.find(item => item.id === id);
  if (!item) return;
  state.selected = id;
  if (state.standby) { state.prepared = id; toast(`준비 화면: ${item.name} · 송출을 누르면 전환됩니다`); }
  else { state.active = state.active === id ? null : id; toast(`${item.name} ${state.active === id ? '표시' : '최소화'} · 목업 미리보기`); }
  render();
}
function dialogFrame(title, note, body, actions) {
  document.querySelector('#dialog-content').innerHTML = `<div class="dialog-top"><h2 id="dialog-title">${title}</h2><button class="icon-button" data-action="close-dialog" aria-label="닫기">${icon('close')}</button></div><p class="dialog-note">${note}</p>${body}<div class="dialog-actions">${actions}</div>`;
  if (!document.querySelector('#demo-dialog').open) document.querySelector('#demo-dialog').showModal();
}
function showSettings() {
  dialogFrame('강의 환경 설정','목업에서 모니터 환경과 대기 모드를 바꿔보세요.',`<label>모니터 구성<select id="monitor-count"><option value="dual" ${state.dual ? 'selected' : ''}>듀얼 모니터 · 발표자 + 청중</option><option value="single" ${!state.dual ? 'selected' : ''}>싱글 모니터</option></select></label><div class="setting-row"><div><strong>대기 모드 사용</strong><small>${state.dual ? '원래 모니터에서 준비한 뒤 송출합니다.' : '싱글 모니터에서는 사용하지 않습니다.'}</small></div><button class="standby-control ${state.standby ? 'on' : ''}" data-action="standby" aria-label="대기 모드 사용" aria-pressed="${state.standby}" ${state.dual ? '' : 'disabled'}><span class="switch"><i></i></span></button></div><div class="setting-row"><div><strong>재시작 후에도 등록 유지</strong><small>저장한 프리셋은 이 설정과 관계없이 보관합니다.</small></div><button class="standby-control ${state.restore ? 'on' : ''}" data-action="restore" aria-label="재시작 후에도 등록 유지" aria-pressed="${state.restore}"><span class="switch"><i></i></span></button></div><div class="setting-row"><div><strong>창 크기</strong><small>기존 크기를 유지하고 위치만 이동합니다.</small></div>${icon('check')}</div>`,`<button class="primary" data-action="close-dialog">완료</button>`);
}
function showAdd() {
  dialogFrame('화면 등록','목업용 예시 목록입니다. 실제 앱에서는 실행 중인 대상을 보여줍니다.',`<label>등록할 앱·창·탭<select id="new-target">${originalItems.map(item => `<option value="${item.id}">${escapeText(item.app)} · ${escapeText(defaultTargetName(item))}</option>`).join('')}</select></label><label>등록 이름 · 수정 가능<input id="new-name" value="${escapeText(defaultTargetName(originalItems[0]))}" data-suggested="${escapeText(defaultTargetName(originalItems[0]))}"><small class="name-help">기본은 창·탭 제목입니다. 원하는 이름으로 바꿀 수 있습니다.</small></label><label>단축키<input id="new-key" value="⌥ ${state.items.length+1}" maxlength="20"></label>`,`<button data-action="close-dialog">취소</button><button class="primary" data-action="confirm-add">등록하기</button>`);
}
const actions = {
  home:() => {state.query='';render();},
  settings:showSettings, add:showAdd,
  panel:() => {state.panel=!state.panel;render();},
  standby:() => {if (!state.dual) return;state.standby=!state.standby;state.prepared=null;render();if (document.querySelector('#demo-dialog').open) showSettings();},
  restore:() => {state.restore=!state.restore;showSettings();},
  send:() => {if (state.prepared) {state.active=state.prepared;state.prepared=null;render();toast('준비한 화면을 송출했습니다 · 목업 미리보기');}},
  'close-dialog':() => document.querySelector('#demo-dialog').close(),
  save:() => {dialogFrame('프리셋 저장','강의별로 이름을 붙여 저장하는 흐름을 확인하세요.',`<label>프리셋 이름<input id="preset-name" value="${escapeText(state.preset)}" maxlength="40"></label>`,`<button class="primary" data-action="confirm-save">목업에 적용</button>`);},
  'confirm-save':() => {const name=document.querySelector('#preset-name').value.trim();if (!name) return toast('프리셋 이름을 입력해 주세요.');state.preset=name;document.querySelector('#demo-dialog').close();render();toast(`${name} 프리셋을 목업에 적용했습니다.`);},
  shortcut:() => {const item=state.items.find(item => item.id===state.selected);if (!item) return;dialogFrame('단축키 변경','목업에서는 키 조합을 텍스트로 입력할 수 있습니다.',`<label>단축키<input id="edit-key" value="${escapeText(item.key)}" maxlength="20" placeholder="⌥ 1"></label>`,`<button class="primary" data-action="confirm-shortcut">적용</button>`);},
  'confirm-shortcut':() => {const key=document.querySelector('#edit-key').value.trim();if(!key)return toast('단축키를 입력해 주세요.');if(state.items.some(item => item.id!==state.selected && item.key===key))return toast('이미 등록된 단축키입니다.');const item=state.items.find(item=>item.id===state.selected);if(item)item.key=key;document.querySelector('#demo-dialog').close();render();},
  'confirm-add':() => {const source=originalItems.find(item => item.id===Number(document.querySelector('#new-target').value));const name=document.querySelector('#new-name').value.trim() || (source ? defaultTargetName(source) : '');const key=document.querySelector('#new-key').value.trim();if(!source||!name||!key)return toast('이름과 단축키를 입력해 주세요.');if(state.items.some(item=>item.key===key))return toast('이미 등록된 단축키입니다.');const item={...source,id:Date.now(),name,key};state.items.push(item);state.selected=item.id;document.querySelector('#demo-dialog').close();render();toast('목업에 화면을 추가했습니다.');}
};
function setupDrag() {
  const panel=document.querySelector('.presenter-panel');
  const header=document.querySelector('.panel-header');
  if(!panel||!header)return;
  let start=null;let {x,y}=panelOffset;
  panel.style.transform=`translate(${x}px,${y}px)`;
  header.addEventListener('pointerdown',event=>{if(event.target.closest('button'))return;const rect=panel.getBoundingClientRect();start={pointerX:event.clientX,pointerY:event.clientY,x,y,left:rect.left-x,top:rect.top-y};header.setPointerCapture(event.pointerId);panel.style.zIndex='5';});
  header.addEventListener('pointermove',event=>{if(!start)return;x=Math.max(-start.left+8,Math.min(innerWidth-start.left-panel.offsetWidth-8,start.x+event.clientX-start.pointerX));y=Math.max(-start.top+8,Math.min(innerHeight-start.top-48,start.y+event.clientY-start.pointerY));panel.style.transform=`translate(${x}px,${y}px)`;});
  header.addEventListener('pointerup',()=>{panelOffset={x,y};start=null;});
  header.addEventListener('pointercancel',()=>{start=null;});
}
function resetDemo() {panelOffset={x:0,y:0};Object.assign(state,{items:structuredClone(originalItems),selected:2,active:1,panel:true,standby:false,dual:true,restore:true,preset:'AI 활용 연수',query:'',tabMode:'separate',prepared:null});render();toast('목업을 처음 상태로 되돌렸습니다.');}
function chooseDesign() {
  const dir=directions[state.theme];state.chosen=state.theme;
  dialogFrame(`${dir.letter} · ${dir.name} 선택`,'선택한 디자인 방향입니다.',`<div class="dialog-choice"><strong>${dir.name}</strong><br>${dir.caption}<br><br>채팅에 “${dir.letter}안으로 하자”라고 알려주세요.<br>마음에 드는 부분을 섞어서 요청해도 좋습니다.</div>`,`<button class="primary" data-action="close-dialog">계속 비교하기</button>`);
}
window.addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button||button.disabled)return;
  if(button.dataset.direction){setDirection(button.dataset.direction);return;}
  if(button.dataset.select){state.selected=Number(button.dataset.select);render();return;}
  if(button.dataset.activate){activate(Number(button.dataset.activate));return;}
  if(button.dataset.preset){state.preset=button.dataset.preset;toast('프리셋 전환 예시 · 비교를 위해 같은 자료를 유지합니다.');render();return;}
  const action=actions[button.dataset.action];if(action)action();
});
window.addEventListener('input',event=>{
  if(event.target.id==='search'){const input=event.target;const position=input.selectionStart;state.query=input.value;renderApp();const next=document.querySelector('#search');next.focus();next.setSelectionRange(position,position);}
});
window.addEventListener('change',event=>{
  if(event.target.id==='monitor-count'){state.dual=event.target.value==='dual';if(!state.dual){state.standby=false;state.prepared=null;}render();showSettings();}
  if(event.target.id==='item-name'){const item=state.items.find(item=>item.id===state.selected);if(item)item.name=event.target.value.trim() || defaultTargetName(item);render();}
  if(event.target.id==='new-target'){const item=originalItems.find(item=>item.id===Number(event.target.value));const name=document.querySelector('#new-name');if(item){const suggested=defaultTargetName(item);if(!name.value.trim() || name.value===name.dataset.suggested)name.value=suggested;name.dataset.suggested=suggested;}}
  if(event.target.id==='tab-mode')state.tabMode=event.target.value;
});
window.addEventListener('keydown',event=>{
  if(event.target.matches('input,select,textarea')||document.querySelector('#demo-dialog').open)return;
  if(event.altKey&&/^Digit[1-9]$/.test(event.code)){const index=Number(event.code.slice(-1))-1;if(state.items[index]){event.preventDefault();activate(state.items[index].id);}}
});
window.addEventListener('hashchange',()=>setDirection(location.hash.slice(1)));
window.addEventListener('resize',()=>{panelOffset={x:0,y:0};const panel=document.querySelector('.presenter-panel');if(panel)panel.style.transform='';});
document.querySelector('#reset-demo').addEventListener('click',resetDemo);
document.querySelector('#choose-design').addEventListener('click',chooseDesign);
setDirection(directions[location.hash.slice(1)] ? location.hash.slice(1) : 'studio');
