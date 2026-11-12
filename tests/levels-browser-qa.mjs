import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const output=new URL('../qa/',import.meta.url);await fs.mkdir(output,{recursive:true});
const tabs=await fetch('http://127.0.0.1:9225/json/list').then(r=>r.json());
const ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
let serial=0;const pending=new Map(),errors=[];
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const job=pending.get(m.id);pending.delete(m.id);if(m.error)job?.reject(new Error(JSON.stringify(m.error)));else job?.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);};
const cdp=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const evaluate=async expression=>{const r=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
const snapshot=()=>evaluate("import(document.querySelector('script[type=module]').src).then(m=>m.inspectGame())");
const waitFor=async(fn,label,timeout=16000)=>{const start=Date.now();while(Date.now()-start<timeout){const value=await fn();if(value)return value;await sleep(100);}throw new Error('Timed out: '+label+' '+JSON.stringify(await snapshot()));};
async function tap(selector,fraction=.5){
  const r=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw new Error('Missing element');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+3+(r.width-6)*${fraction},y:r.y+r.height/2}})()`);
  await cdp('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[r]});await cdp('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await sleep(100);
}
async function flyTo(x,y){
  const s=await snapshot(),start={x:470,y:550};const end={x:start.x+(x-s.ship.x)/1.25,y:start.y+(y-s.ship.y)/1.15};
  await cdp('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[start]});await cdp('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[end]});await sleep(220);await cdp('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
}
async function shot(name){const r=await cdp('Page.captureScreenshot',{format:'png'});await fs.writeFile(new URL(name,output),Buffer.from(r.data,'base64'));}
async function assertVisible(selector){assert.equal(await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return r.width>0&&r.left>=0&&r.right<=innerWidth})()`),true);}
async function assertFits(selector){assert.equal(await evaluate(`(()=>{const panel=document.querySelector('#modal-content'),r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(),p=panel.getBoundingClientRect();return r.bottom<=p.bottom&&r.top>=p.top&&panel.scrollHeight<=panel.clientHeight+2})()`),true,selector+' fits without scrolling');}
async function dismissLesson(){
  const before=await snapshot();assert.equal(before.mode,'learning');
  await assertFits('#word-continue');await sleep(350);const after=await snapshot();
  assert.equal(after.elapsed,before.elapsed);assert.equal(after.count,before.count);assert.equal(after.hearts,before.hearts);
  assert.deepEqual(after.hazards,before.hazards);
  await tap('#word-continue');
}

const change=async(selector,value)=>{await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);await sleep(100);};
async function clearToHome(){
  const s=await snapshot();if(s.mode==='learning')await dismissLesson();
  if((await snapshot()).mode==='playing'){await tap('#pause');await tap('#leave');}
}
async function finishSelectedLevel(expectedId){
  const initial=await snapshot();assert.equal(initial.activeRun.levelId,expectedId);
  const expectedKeys=[...initial.activeRun.keys],observed=new Set();let oldIndex=-1,previousWave=null,changedWaves=0;
  const started=Date.now();
  while(Date.now()-started<150000){
    const s=await snapshot();if(s.mode==='results')break;
    if(s.mode==='learning'){observed.add(s.missionKey);await dismissLesson();continue;}
    if(s.mode==='repair'){await tap('#repair');continue;}
    assert.equal(s.mode,'playing');assert.ok(expectedKeys.includes(s.missionKey));assert.ok(s.targets.every(t=>expectedKeys.includes(t.key)));
    if(s.index!==oldIndex){if(oldIndex===-1)await shot('levels-shooting-new-words.png');oldIndex=s.index;previousWave=null;}
    if(s.transition>0){await sleep(150);continue;}
    const target=s.targets.find(t=>t.key===s.missionKey&&t.active);if(!target){await sleep(100);continue;}
    if(!previousWave||previousWave.count!==s.count){
      const current={count:s.count,slot:target.slot,words:s.targets.map(t=>t.key)};
      if(previousWave){assert.notEqual(current.slot,previousWave.slot);assert.notDeepEqual(new Set(current.words),new Set(previousWave.words));changedWaves++;}
      previousWave=current;
    }
    if(s.shieldCooldown<=0)await tap('#shield');await flyTo(target.baseX,600);await sleep(150);
  }
  const final=await snapshot();assert.equal(final.mode,'results');assert.deepEqual(observed,new Set(expectedKeys));assert.ok(changedWaves>=expectedKeys.length);
  assert.equal(final.campaign.completed[expectedId],1);return {final,changedWaves};
}
try{
  await cdp('Page.enable');await cdp('Runtime.enable');
  await cdp('Emulation.setDeviceMetricsOverride',{width:1024,height:768,deviceScaleFactor:1,mobile:true});
  await cdp('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});await cdp('Emulation.setFocusEmulationEnabled',{enabled:true});
  await cdp('Page.navigate',{url:'http://127.0.0.1:4173/'});await waitFor(()=>evaluate("document.readyState==='complete'"),'page ready');
  await evaluate(`localStorage.setItem('starling-progress-v1',JSON.stringify({version:1,runs:3,records:{red:{completed:2,firstTry:1,mistakes:1,replays:2}}}));localStorage.setItem('starling-reading-v1',JSON.stringify({version:1,sessions:2,records:{red:{completed:2,firstTry:1,mistakes:1}},flightRuns:1,flightRecords:{because:{completed:1,firstTry:1,mistakes:0}}}));localStorage.setItem('starling-difficulty-v1',JSON.stringify({meteorSpeed:.5,meteorCount:1,targetHits:2}));localStorage.removeItem('starling-levels-v1');`);
  await cdp('Page.reload');await sleep(600);
  await shot('levels-home.png');await tap('#start');await assertFits('#classic-training');await shot('levels-map-ipad.png');
  assert.equal(await evaluate("document.querySelectorAll('[data-level]').length"),6);assert.ok(await evaluate("document.querySelector('#modal-content').textContent.includes('37 關')"));
  await tap('#level-next');assert.ok(await evaluate("document.querySelector('#level-page-label').textContent.includes('2 / 7')"));
  await change('#level-theme','animals');assert.equal(await evaluate("document.querySelectorAll('[data-level]').length"),3);
  await tap('[data-level=animals-1]');await assertFits('#begin-level');
  const preview=await evaluate("[...document.querySelectorAll('[data-level-word]')].map(b=>b.dataset.levelWord)");assert.deepEqual(new Set(preview),new Set(['cat','dog','bird','fish','rabbit']));
  await tap('#level-difficulty');await tap('[data-preset=training]');await tap('#save-difficulty');assert.deepEqual(await evaluate("[...document.querySelectorAll('[data-level-word]')].map(b=>b.dataset.levelWord)"),preview);
  await tap('[data-level-word=cat]');await tap('#word-continue');assert.deepEqual(await evaluate("[...document.querySelectorAll('[data-level-word]')].map(b=>b.dataset.levelWord)"),preview);
  await shot('levels-briefing.png');await tap('#begin-level');
  const first=await finishSelectedLevel('animals-1');
  await shot('levels-next-button.png');const runs=first.final.reading.flightRuns;
  await tap(`[data-flight-review=${first.final.activeRun.keys[0]}]`);await tap('#word-continue');assert.equal((await snapshot()).campaign.completed['animals-1'],1);assert.equal((await snapshot()).reading.flightRuns,runs);
  await tap('#flight-next');const nextPreview=await evaluate("[...document.querySelectorAll('[data-level-word]')].map(b=>b.dataset.levelWord)");assert.ok(nextPreview.every(k=>!preview.includes(k)));
  await tap('#begin-level');const second=await finishSelectedLevel('animals-2');assert.equal(second.final.reading.flightRuns,runs+1);
  await tap('#flight-home');await cdp('Page.reload');await sleep(500);assert.equal((await snapshot()).campaign.completed['animals-1'],1);assert.equal((await snapshot()).campaign.completed['animals-2'],1);assert.equal((await snapshot()).progress.runs,3);assert.equal((await snapshot()).reading.records.red.completed,2);
  await tap('#start');await change('#level-theme','sentence');await tap('[data-level=sentence-1]');assert.ok(await evaluate("!!document.querySelector('[data-level-word=because]')"));await tap('#begin-level');assert.equal((await snapshot()).activeRun.levelId,'sentence-1');await clearToHome();
  await tap('#start-words');const randomA=await evaluate("[...document.querySelectorAll('[data-level-word]')].map(b=>b.dataset.levelWord)");assert.equal(randomA.length,6);await tap('#reroll-level');const randomB=await evaluate("[...document.querySelectorAll('[data-level-word]')].map(b=>b.dataset.levelWord)");assert.ok(randomB.every(k=>!randomA.includes(k)));await shot('levels-random-combination.png');await tap('#begin-level');assert.equal((await snapshot()).activeRun.levelId,'random');assert.deepEqual((await snapshot()).activeRun.keys,randomB);await dismissLesson();await tap('#pause');await tap('#pause-levels');assert.equal((await snapshot()).mode,'home');assert.ok(await evaluate("!!document.querySelector('#level-grid')"));await tap('#levels-close');
  for(const [w,h] of [[1133,744],[768,1024]]){
    await cdp('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:true});await sleep(200);if(h>w)await tap('#dismiss-rotate');
    await tap('#start');await change('#level-theme','all');await assertFits('#classic-training');await shot(`levels-map-${w}.png`);
    await change('#level-theme','city');await tap('[data-level=city-3]');await assertFits('#begin-level');await shot(`levels-preview-${w}.png`);await tap('#level-back');await tap('#levels-close');
  }
  await tap('#open-parent');await tap('#clear-progress');await tap('#confirm-clear');assert.deepEqual((await snapshot()).campaign.completed,{});assert.equal((await snapshot()).settings.targetHits,2);
  assert.deepEqual(errors,[]);
  await fs.writeFile(new URL('levels-browser-result.json',output),JSON.stringify({passed:true,checks:['main start opens 37 levels','all levels unlocked','theme filter and pagination','word previews','difficulty returns to same plan','preview word cards','two consecutive complete levels','next level disjoint vocabulary','each correct hit changes distractors and lane','completion does not double count','records survive reload','abstract-word level directly selectable','random reroll disjoint','pause switches levels safely','iPad landscape and portrait layouts','clear campaign records preserves settings'],first,second,errors},null,2));
  console.log('Selectable levels, two complete missions, changing word waves, random mode and iPad layouts: passed');
}finally{ws.close();}
