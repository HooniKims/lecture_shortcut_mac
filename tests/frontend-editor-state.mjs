import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const main = await readFile(new URL('../app/main.js', import.meta.url), 'utf8');
const dialogs = await readFile(new URL('../app/dialogs.js', import.meta.url), 'utf8');
const entry = {id:'one',label:'Saved name',shortcut:'Super+Shift+1',tabMode:'window',target:{kind:'tab',title:'Original tab',app:'Browser'}};
async function editorHarness(write = async () => {}) {
  const listeners = new Map(), status = {textContent:''}, button = {disabled:false};
  const form = {dataset:{entryId:'one'}, values:{label:entry.label,shortcut:entry.shortcut,tabMode:entry.tabMode}, querySelector:s=>s==='[type="submit"]'?button:s==='[data-reset-edit]'?null:status};
  const context = vm.createContext({
    URLSearchParams, location:{search:''}, structuredClone,
    document:{getElementById:id=>id==='edit-form'?form:{},querySelector:()=>null},
    window:{__TAURI__:{core:{invoke:async(command,args)=>{await write(command,args);if(command==='save_config'){context.saved=structuredClone(args.config);vm.runInContext('config=saved',context);}}}}},
    FormData:class {constructor(form){this.values={...form.values};}get(key){return this.values[key]??null;}},
    on:(_,event,handler)=>listeners.set(event,handler), boot:async()=>{}, refresh:async()=>{},
    icon:()=>'', keys:s=>s, escapeText:s=>s, setTimeout,clearTimeout
  });
  vm.runInContext(dialogs,context);
  vm.runInContext(main,context);
  context.seed={entries:[structuredClone(entry)],presets:[],settings:{panelShortcut:"Super+Shift+Space"}};
  vm.runInContext('config=seed; selected="one"; render=()=>{}; notice=()=>{};',context);
  context.form=form;
  return {form,status,button,context,
    edit(label){form.values.label=label;vm.runInContext('rememberEdit(form)',context);},
    submit(){return listeners.get('submit')({target:{...form,id:'edit-form'},preventDefault(){}});},
    html(){return vm.runInContext('inspector()',context);},
    dirty(){return vm.runInContext('editDrafts.has("one")',context);}
  };
}
test('An unsaved name survives inspector reconstruction and selection changes',async()=>{
  const h=await editorHarness();h.edit('My draft');
  vm.runInContext('selected=null; inspector(); selected="one";',h.context);
  assert.match(h.html(),/value="My draft"/);
  assert.equal(h.button.disabled,false);
  assert.match(h.status.textContent,/저장하지 않은/);
});
test('Failed saves retain the draft and allow retry',async()=>{
  const h=await editorHarness(async()=>{throw new Error('disk full');});h.edit('Keep this');await h.submit();
  assert.equal(h.dirty(),true);assert.match(h.html(),/value="Keep this"/);
});
test('Repeated save submissions produce one write; later edits remain unsaved',async()=>{
  let complete,calls=0;
  const h=await editorHarness(()=>{calls++;return new Promise(resolve=>{complete=resolve;});});
  h.edit('First draft');const saving=h.submit();await h.submit();
  assert.equal(calls,1);assert.equal(h.button.disabled,true);
  h.edit('Newer draft');complete();await saving;
  assert.equal(h.dirty(),true);assert.match(h.html(),/value="Newer draft"/);
});
test('A successful save clears only the submitted draft',async()=>{
  const h=await editorHarness();h.edit('Saved draft');await h.submit();assert.equal(h.dirty(),false);
});

test('A disconnected saved monitor falls back to the audience display and open settings refresh safely',async()=>{
  let options='';
  const select={value:'missing',set innerHTML(html){options=html;},disabled:false};
  const standby={disabled:false,checked:true};const help={textContent:''};
  const context=vm.createContext({
    document:{getElementById:()=>({querySelector:s=>s.includes('select')?select:s.includes('standby-help')?help:standby})},
    window:{},on(){},escapeText:s=>s,displays:[{id:'main',name:'Laptop',primary:true},{id:'projector',name:'Projector',primary:false}]
  });
  vm.runInContext(dialogs,context);vm.runInContext('syncDisplaySettings()',context);
  assert.match(options,/value="projector" selected/);assert.equal(standby.disabled,false);
  context.displays=[{id:'main',name:'Laptop',primary:true}];vm.runInContext('syncDisplaySettings()',context);
  assert.equal(options.includes('projector'),false);assert.equal(standby.disabled,true);assert.equal(standby.checked,false);
});

test('Returning to the original name while a save is pending preserves the latest input after commit', async () => {
  let complete;
  const h=await editorHarness(()=>new Promise(resolve=>{complete=resolve;}));
  h.edit('Pending name');const saving=h.submit();
  h.edit('Saved name');complete();await saving;
  assert.equal(h.dirty(),true);
  assert.match(h.html(),/value="Saved name"/);
});

test('Returning to the saved name during a failed save does not leave a false dirty state', async () => {
  let fail;
  const h=await editorHarness(()=>new Promise((_,reject)=>{fail=reject;}));
  h.edit('Pending name');const saving=h.submit();
  h.edit('Saved name');fail(new Error('disk full'));await saving;
  assert.equal(h.dirty(),false);
  assert.match(h.html(),/value="Saved name"/);
});
