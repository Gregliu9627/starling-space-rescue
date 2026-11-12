import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

if(process.argv.includes('--expanded')){await import('./vocabulary-browser-qa.mjs');process.exit(0);}

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

try{
  await cdp('Page.enable');await cdp('Runtime.enable');
  await cdp('Emulation.setDeviceMetricsOverride',{width:1024,height:768,deviceScaleFactor:1,mobile:true});
  await cdp('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});await cdp('Emulation.setFocusEmulationEnabled',{enabled:true});
  await cdp('Page.navigate',{url:'http://127.0.0.1:4173/'});
  await waitFor(()=>evaluate("document.readyState==='complete'"),'page ready');
  await evaluate(`localStorage.setItem('starling-progress-v1',JSON.stringify({version:1,runs:2,records:{red:{completed:2,firstTry:1,mistakes:1,replays:2}}}));localStorage.removeItem('starling-difficulty-v1');localStorage.removeItem('starling-reading-v1')`);
  await cdp('Page.reload');await sleep(500);
  assert.equal((await snapshot()).settings.targetHits,6);assert.equal((await snapshot()).progress.runs,2);
  await shot('01-home-ipad.png');await tap('#difficulty');await shot('02-difficulty-ipad.png');
  if(process.argv.includes('--layout-only')){
    for(const [w,h] of [[1024,768],[1133,744]]){
      await cdp('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:true});await sleep(200);
      assert.equal(await evaluate("(()=>{const panel=document.querySelector('#modal-content'),b=document.querySelector('#save-difficulty').getBoundingClientRect(),r=panel.getBoundingClientRect();return b.bottom<=r.bottom&&panel.scrollHeight<=panel.clientHeight+2})()"),true);
      await shot(`difficulty-final-${w}.png`);
    }
    await tap('[data-preset=ace]');await tap('#save-difficulty');assert.equal((await snapshot()).settings.targetHits,12);
    await tap('#difficulty');await tap('#cancel-difficulty');assert.equal(await evaluate("document.querySelector('#modal').hidden"),true);
    console.log('Compact iPad settings layout and save/cancel: passed');ws.close();process.exit(0);
  }
  await tap('[data-preset=ace]');await tap('[data-adjust=meteorSpeed][data-direction="-1"]');await tap('[data-adjust=meteorCount][data-direction="1"]');
  await tap('#setting-targetHits',1);
  assert.equal(await evaluate("document.querySelector('#setting-targetHits').value"),'20');
  await tap('#save-difficulty');assert.deepEqual((await snapshot()).settings,{meteorSpeed:2,meteorCount:6,targetHits:20});
  await cdp('Page.reload');await sleep(500);assert.equal((await snapshot()).settings.targetHits,20);assert.equal((await snapshot()).progress.runs,2);
  await tap('#difficulty');await tap('[data-preset=training]');await tap('#cancel-difficulty');assert.equal((await snapshot()).settings.targetHits,20);
  await tap('#open-words');await evaluate("document.querySelector('#word-theme').value='space';document.querySelector('#word-theme').dispatchEvent(new Event('change'))");await assertFits('#library-quiz');await shot('reading-library-ipad.png');
  await tap('[data-card=behind]');await assertFits('#word-continue');await shot('reading-behind-card.png');
  assert.equal(await evaluate("document.querySelector('#modal-title').textContent"),'behind');
  await tap('#word-speak');await tap('#word-continue');await tap('#library-close');
  await tap('#start');await tap('#begin');
  assert.equal(await evaluate("document.querySelector('#modal-title').textContent"),'star');
  await shot('reading-first-word.png');await dismissLesson();
  const firstWave=await waitFor(async()=>{const s=await snapshot();return s.hazards.length?s.hazards:null;},'six meteors in a wave');
  assert.equal(firstWave.length,6);assert.ok(firstWave.every(h=>h.effectiveSpeed===130));
  await shot('03-six-meteors.png');
  await tap('#pause');let paused=await snapshot();await sleep(250);assert.equal((await snapshot()).elapsed,paused.elapsed);
  await tap('#pause-difficulty');await tap('[data-preset=adventure]');await tap('#save-difficulty');
  assert.equal((await snapshot()).mode,'paused');assert.equal((await snapshot()).goal,3);assert.ok((await snapshot()).hazards.every(h=>h.effectiveSpeed===97.5));
  await tap('#resume');
  for(let i=0;i<6;i++){const current=await snapshot();if(current.index!==0||current.transition>0)break;const t=current.targets.find(t=>t.active);if(!t)break;await flyTo(t.x,t.y);await sleep(300);}
  await waitFor(async()=>(await snapshot()).index===1,'collect complete');assert.equal((await snapshot()).goal,6);
  await dismissLesson();
  assert.equal(await evaluate("document.querySelector('#instruction mark').textContent"),'red');
  assert.ok(await evaluate("document.querySelector('#focus-word').textContent.includes('红色')"));
  await tap('#focus-word');await dismissLesson();await shot('reading-battle-labels.png');
  console.log('Touch settings, 20-hit boundary, persistence, cancellation, six-meteor waves and live speed change: passed');
  let quotaChanged=false,lastIndex=-1,start=Date.now(),lastSlot=null,lastCount=-1,layoutChanges=0;
  while(Date.now()-start<210000){
    const s=await snapshot();
    if(s.mode==='results')break;
    if(s.mode==='learning'){await dismissLesson();continue;}
    if(s.mode==='repair'){await tap('#repair');continue;}
    assert.equal(s.mode,'playing');
    if(s.index!==lastIndex){console.log('Mission',s.index,'quota',s.goal);lastIndex=s.index;lastSlot=null;lastCount=-1;}
    if(s.index===1&&s.count>=2&&!quotaChanged){
      assert.equal(s.goal,6);assert.ok(s.transition<=0);
      await tap('#pause');const before=await snapshot();await tap('#pause-difficulty');
      await tap('[data-adjust=targetHits][data-direction="-1"]');await tap('[data-adjust=targetHits][data-direction="-1"]');await tap('#save-difficulty');
      const after=await snapshot();assert.equal(after.goal,6);assert.equal(after.count,before.count);assert.equal(after.settings.targetHits,4);
      await shot('04-pause-current-quota-preserved.png');await tap('#resume');quotaChanged=true;
    }
    if(s.index>=2&&[2,5,6,7].includes(s.index))assert.equal(s.goal,4);
    if(s.transition>0){await sleep(180);continue;}
    const wanted=['star','red','blue','behind','front','green','red','blue'][s.index],target=s.targets.find(t=>t.key===wanted&&t.active);
    if(!target){await sleep(100);continue;}
    if(['red','blue','green'].includes(wanted)&&s.count>lastCount){if(lastSlot!==null){assert.notEqual(target.slot,lastSlot);layoutChanges++;}lastSlot=target.slot;lastCount=s.count;}
    if(s.shieldCooldown<=0)await tap('#shield');
    await flyTo(target.baseX,600);await sleep(160);
  }
  const final=await snapshot();assert.equal(final.mode,'results');assert.ok(quotaChanged);assert.ok(layoutChanges>=10);
  assert.equal(final.progress.runs,3);assert.equal(final.progress.records.red.completed,4);assert.equal(final.progress.records.green.completed,1);
  assert.deepEqual(new Set(final.seenWords),new Set(['stars','red','blue','behind','front','green']));
  await shot('05-complete-ipad.png');
  await tap('[data-result-word=red]');await tap('#word-continue');assert.equal((await snapshot()).progress.runs,3);
  await tap('#result-reading');await assertFits('#quiz-next');await shot('reading-quiz-ipad.png');
  for(let i=0;i<6;i++){
    const s=await snapshot();assert.equal(s.quiz.index,i);assert.equal(await evaluate("document.querySelector('#quiz-next').disabled"),true);
    if(i===0){const wrong=s.quiz.options.find(k=>k!==s.quiz.key);await tap(`[data-choice=${wrong}]`);assert.equal(await evaluate(`document.querySelector('[data-choice=${wrong}]').disabled`),true);assert.equal((await snapshot()).quiz.answered,false);await shot('reading-retry-feedback.png');}
    await tap(`[data-choice=${s.quiz.key}]`);assert.equal((await snapshot()).quiz.answered,true);await tap('#quiz-next');
  }
  let reading=(await snapshot()).reading;assert.equal(reading.sessions,1);assert.equal(Object.values(reading.records).reduce((n,r)=>n+r.completed,0),6);assert.equal(Object.values(reading.records).reduce((n,r)=>n+r.firstTry,0),5);
  await shot('reading-quiz-results.png');await tap('[data-review-card=front]');await tap('#word-continue');assert.equal((await snapshot()).reading.sessions,1);
  await tap('#reading-done');assert.equal((await snapshot()).progress.runs,3);await tap('#result-home');
  await cdp('Page.reload');await sleep(500);assert.equal((await snapshot()).settings.targetHits,4);assert.equal((await snapshot()).progress.runs,3);assert.deepEqual((await snapshot()).reading,reading);
  await cdp('Emulation.setDeviceMetricsOverride',{width:1133,height:744,deviceScaleFactor:1,mobile:true});await sleep(250);await tap('#difficulty');await assertVisible('#save-difficulty');await shot('06-difficulty-ipad-mini.png');await tap('#difficulty-close');
  await tap('#open-words');await assertFits('#library-quiz');await tap('[data-card=front]');await assertFits('#word-continue');await shot('reading-front-ipad-mini.png');await tap('#word-continue');await tap('#library-quiz');await assertFits('#quiz-next');await shot('reading-quiz-ipad-mini.png');await tap('#quiz-exit');await tap('#library-close');
  await cdp('Emulation.setDeviceMetricsOverride',{width:768,height:1024,deviceScaleFactor:1,mobile:true});await sleep(250);await tap('#dismiss-rotate');await tap('#difficulty');await assertVisible('#save-difficulty');await shot('07-difficulty-portrait.png');
  await tap('#difficulty-close');await tap('#open-words');await assertFits('#library-quiz');await shot('reading-library-portrait.png');await tap('#library-close');
  await tap('#open-parent');await shot('reading-parent-records.png');await tap('#clear-progress');await tap('#keep-records');assert.deepEqual((await snapshot()).reading,reading);
  await tap('#clear-progress');await tap('#confirm-clear');assert.equal((await snapshot()).reading.sessions,0);assert.deepEqual((await snapshot()).reading.records,{});assert.equal((await snapshot()).progress.runs,0);assert.equal((await snapshot()).settings.targetHits,4);
  assert.deepEqual(errors,[]);
  await fs.writeFile(new URL('browser-result.json',output),JSON.stringify({passed:true,checks:['touch controls','saved difficulty survives reload','cancel leaves settings unchanged','six-meteor wave','live speed multiplier','mid-task quota preserved','next-task quota updated','targets change lanes','multi-hit Boss completes','learning history preserved','six automatic word lessons','word card freezes hazards and clock','highlighted task words','word library','quiz retry feedback','first-try recognition records','review does not duplicate counts','reading persistence','clear all learning records','iPad word layouts'],layoutChanges,errors,final,reading},null,2));
  console.log('In-progress quota, next-task quota, repeated Boss hits, complete run and iPad layouts: passed');
}finally{ws.close();}
