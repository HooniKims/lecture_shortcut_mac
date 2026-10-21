import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source = readFileSync(new URL('../app/onboarding.js', import.meta.url), 'utf8');
const entry = {id:'one',label:'강의 자료',shortcut:'Super+Shift+1'};
function harness({storage = new Map(), isPanel = false, isCapture = false} = {}) {
  const handlers = new Map();
  const document = {getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[]};
  const context = vm.createContext({document,window:{},dialog:{open:false,classList:{remove(){}}},isPanel,isCapture,config:{entries:[],settings:{panelShortcut:'Super+Shift+Space'}},selected:null,
    localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},
    on:(target,name,fn)=>handlers.set(`${target===document?'document':'window'}:${name}`,fn),
    closeDialog(){},escapeText:s=>String(s).replaceAll('<','&lt;').replaceAll('>','&gt;'),keycap:s=>`<kbd>${s}</kbd>`
  });
  vm.runInContext(source,context);
  // Geometry/DOM is covered in the browser; exercise the real transition functions here.
  vm.runInContext('renderOnboarding = () => {}',context);
  return {context,storage,run:code=>vm.runInContext(code,context),
    click(dataset){handlers.get('document:click')({target:{closest:()=>({dataset,disabled:false})}});},
    add(value=entry){context.config.entries.push({...value});vm.runInContext('syncOnboarding()',context);}
  };
}
test('First run starts at the real registration button and dismissal survives another session',()=>{
  const h=harness();h.run('startFirstRun()');assert.equal(h.run('onboarding.step'),'register');
  h.run('dismissOnboarding()');const again=harness({storage:h.storage});again.run('startFirstRun()');assert.equal(again.run('onboarding'),null);
  again.click({onboard:'welcome'});assert.equal(again.run('onboarding.step'),'register');
});
test('Presenter and capture windows never start the tour',()=>{
  for(const options of [{isPanel:true},{isCapture:true}]){const h=harness(options);h.run('startFirstRun();beginOnboarding()');assert.equal(h.run('onboarding'),null);assert.equal(h.storage.size,0);}
});
test('Registration practice follows actual selection, field confirmation, and successful save',()=>{
  const h=harness();h.run('beginOnboarding();onboardingRegistrationOpened()');assert.equal(h.run('onboarding.step'),'choose');
  h.click({onboard:'next'});assert.equal(h.run('onboarding.step'),'choose');
  h.run('onboardingPicked()');assert.equal(h.run('onboarding.step'),'name');
  h.click({onboard:'next'});assert.equal(h.run('onboarding.step'),'shortcut');
  h.click({onboard:'next'});assert.equal(h.run('onboarding.step'),'save');
  h.run('syncOnboarding()');assert.equal(h.run('onboarding.step'),'save');
  h.add();assert.equal(h.run('onboarding.step'),'pad');
  h.click({select:'other'});assert.equal(h.run('onboarding.step'),'pad');
  h.click({select:'one'});assert.equal(h.run('onboarding.step'),'call');
  assert.match(h.run('onboardingGuide().copy'),/Super\+Shift\+1/);
});
test('Existing entries do not skip first registration and target labels are escaped',()=>{
  const h=harness();h.add();h.run('beginOnboarding();syncOnboarding()');assert.equal(h.run('onboarding.step'),'register');
  h.add({...entry,id:'two',label:'<img onerror=x>'});assert.doesNotMatch(h.run('onboardingGuide().copy'),/<img/);
});
test('Cancelling registration returns to its button; closing after saving preserves pad practice',()=>{
  const h=harness();h.run('beginOnboarding();onboardingRegistrationOpened();onboardingPicked();onboardingDialogClosed()');assert.equal(h.run('onboarding.step'),'register');
  h.add();h.run('onboardingDialogClosed()');assert.equal(h.run('onboarding.step'),'pad');
});
test('Only successful activation of the selected practice screen advances to the panel',()=>{
  const h=harness();h.run('beginOnboarding()');h.add();h.click({select:'one'});
  h.run("onboardingAction({id:'other',outcome:'shown'});onboardingAction({id:'one',outcome:'error'})");assert.equal(h.run('onboarding.step'),'call');
  h.run("onboardingAction({id:'one',outcome:'shown'})");assert.equal(h.run('onboarding.step'),'panel');
  h.run('onboardingPanel(false)');assert.equal(h.run('onboarding.step'),'panel');
  h.run('onboardingPanel(true)');assert.equal(h.run('onboarding.step'),'done');assert.equal(h.storage.get('cue.onboarding.v2'),'completed');
});
test('Removing the practice entry resets the tour, and dismissal preserves user data',()=>{
  const h=harness();h.run('beginOnboarding()');h.add();h.context.config.entries=[];h.run('syncOnboarding()');assert.equal(h.run('onboarding.step'),'register');
  h.add({...entry,id:'two'});h.run('dismissOnboarding()');assert.equal(h.context.config.entries.length,1);
});
test('Unavailable storage does not prevent starting or dismissing practice',()=>{
  const h=harness();h.context.localStorage={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}};
  h.run('startFirstRun()');assert.equal(h.run('onboarding.step'),'register');h.run('dismissOnboarding()');assert.equal(h.run('onboarding'),null);
});
test('Callouts stay inside the viewport and do not cover typical target controls',()=>{
  const h=harness();
  for(const [width,height] of [[1160,748],[820,588],[640,620]]){
    for(const rect of [{left:width-130,right:width-30,top:50,bottom:90},{left:140,right:width-140,top:180,bottom:230},{left:width-220,right:width-30,top:height-70,bottom:height-30}]){
      h.context.rect=rect;h.context.viewport={width,height};
      const p=h.run('tourPlacement(rect,{width:280,height:210},viewport)');
      assert.ok(p.x>=12&&p.y>=12&&p.x+280<=width-12&&p.y+210<=height-12);
      assert.ok(p.x+280<=rect.left||p.x>=rect.right||p.y+210<=rect.top||p.y>=rect.bottom);
    }
  }
});
