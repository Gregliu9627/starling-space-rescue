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
const getBank=()=>evaluate("import('./vocabulary.js?v=4').then(m=>m.VOCABULARY)");
try{
  await cdp('Page.enable');await cdp('Runtime.enable');
  await cdp('Emulation.setDeviceMetricsOverride',{width:1024,height:768,deviceScaleFactor:1,mobile:true});
  await cdp('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});await cdp('Emulation.setFocusEmulationEnabled',{enabled:true});
  await cdp('Page.navigate',{url:'http://127.0.0.1:4173/'});await waitFor(()=>evaluate("document.readyState==='complete'"),'page ready');
  await evaluate(`localStorage.setItem('starling-progress-v1',JSON.stringify({version:1,runs:3,records:{red:{completed:2,firstTry:1,mistakes:1,replays:2}}}));localStorage.setItem('starling-reading-v1',JSON.stringify({version:1,sessions:1,records:{red:{completed:2,firstTry:1,mistakes:1}}}));localStorage.setItem('starling-difficulty-v1',JSON.stringify({meteorSpeed:.5,meteorCount:1,targetHits:2}));`);
  await cdp('Page.reload');await sleep(600);
  assert.equal((await snapshot()).reading.records.red.completed,2);assert.equal((await snapshot()).progress.runs,3);
  const bank=await getBank();assert.equal(Object.keys(bank).length,186);
  await shot('expanded-home.png');await tap('#start-words');await assertFits('#library-quiz');
  await change('#word-theme','animals');await change('#word-level','all');
  assert.equal(await evaluate("document.querySelectorAll('[data-card]').length"),6);
  const firstPage=await evaluate("[...document.querySelectorAll('[data-card]')].map(b=>b.dataset.card)");
  await tap('#word-next');assert.notDeepEqual(await evaluate("[...document.querySelectorAll('[data-card]')].map(b=>b.dataset.card)"),firstPage);
  await tap('#word-next');assert.equal(await evaluate("document.querySelectorAll('[data-card]').length"),3);await shot('expanded-pagination.png');
  await change('#word-theme','all');await change('#word-search','MTR');assert.equal(await evaluate("document.querySelector('[data-card]').dataset.card"),'mtr');
  await tap('[data-card=mtr]');await assertFits('#word-continue');await shot('expanded-mtr.png');await tap('#word-continue');
  assert.equal(await evaluate("document.querySelector('#word-search').value"),'MTR');
  await change('#word-search','nothingmatches');assert.equal(await evaluate("document.querySelector('#library-flight').disabled"),true);assert.equal(await evaluate("document.querySelector('#library-quiz').disabled"),true);
  await change('#word-search','because');await tap('[data-card=because]');await assertFits('#word-continue');assert.equal(await evaluate("document.querySelector('.word-example mark').textContent"),'because');await shot('expanded-because-card.png');await tap('#word-continue');
  await tap('#library-quiz');assert.equal((await snapshot()).quiz.order.length,1);assert.equal((await snapshot()).quiz.key,'because');
  assert.ok(!(await evaluate("document.querySelector('.quiz-picture').textContent")).toLowerCase().includes('because'));await assertFits('#quiz-next');await shot('expanded-abstract-question.png');
  const q=(await snapshot()).quiz;await tap(`[data-choice=${q.options.find(k=>k!=='because')}]`);await tap('[data-choice=because]');await tap('#quiz-next');
  assert.equal((await snapshot()).reading.records.because.firstTry,0);await tap('#reading-done');
  await change('#word-search','');await change('#word-theme','city');await change('#word-level','starter');await assertFits('#library-flight');await shot('expanded-city-library.png');
  await tap('#library-flight');let startState=await snapshot();assert.equal(startState.activeRun.kind,'vocab');assert.equal(startState.activeRun.keys.length,6);
  assert.ok(startState.activeRun.keys.every(k=>bank[k].theme==='city'&&bank[k].level==='starter'));
  const runKeys=startState.activeRun.keys;let captured=false,wrongTested=false,pausedTested=false;const started=Date.now();
  while(Date.now()-started<160000){
    const s=await snapshot();if(s.mode==='results')break;
    if(s.mode==='learning'){await dismissLesson();continue;}
    if(s.mode==='repair'){await tap('#repair');continue;}
    assert.equal(s.mode,'playing');assert.equal(s.goal,2);
    if(!captured){await shot('expanded-word-flight.png');captured=true;}
    if(!pausedTested){await tap('#pause');await tap('#pause-word');const frozen=await snapshot();await sleep(250);assert.equal((await snapshot()).elapsed,frozen.elapsed);await tap('#word-continue');assert.equal((await snapshot()).mode,'paused');await tap('#resume');pausedTested=true;}
    if(!wrongTested){const wrong=s.targets.find(t=>t.key!==s.missionKey);await flyTo(wrong.baseX,600);await waitFor(async()=>(await snapshot()).mistakes>0,'wrong word flight feedback',12000);wrongTested=true;await shot('expanded-flight-retry.png');}
    if(s.transition>0){await sleep(150);continue;}
    const target=s.targets.find(t=>t.key===s.missionKey&&t.active);if(!target){await sleep(100);continue;}
    if(s.shieldCooldown<=0)await tap('#shield');await flyTo(target.baseX,600);await sleep(160);
  }
  const final=await snapshot();assert.equal(final.mode,'results');assert.equal(final.reading.flightRuns,1);assert.equal(final.progress.runs,3);
  assert.equal(Object.keys(final.reading.flightRecords).length,6);assert.ok(runKeys.every(k=>final.reading.flightRecords[k].completed===1));
  await shot('expanded-flight-complete.png');await tap(`[data-flight-review=${runKeys[0]}]`);await tap('#word-continue');assert.equal((await snapshot()).reading.flightRuns,1);
  await tap('#flight-reading');for(let i=0;i<6;i++){const q=(await snapshot()).quiz;assert.ok(runKeys.includes(q.key));await tap(`[data-choice=${q.key}]`);await tap('#quiz-next');}
  await tap('#reading-done');await tap('#flight-home');const saved=(await snapshot()).reading;await cdp('Page.reload');await sleep(500);assert.deepEqual((await snapshot()).reading,saved);
  for(const [w,h] of [[1133,744],[768,1024]]){
    await cdp('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:true});await sleep(200);if(h>w)await tap('#dismiss-rotate');
    await tap('#open-words');await change('#word-theme','family');await change('#word-level','all');await assertFits('#library-flight');await shot(`expanded-library-${w}.png`);
    await change('#word-search','grandmother');await change('#word-search','aunt');await tap('[data-card=aunt]');await assertFits('#word-continue');await shot(`expanded-long-card-${w}.png`);await tap('#word-continue');await tap('#library-close');
  }
  await tap('#open-parent');assert.ok(await evaluate("document.querySelector('.reading-parent-summary').textContent.includes('詞彙巡航完成 1 輪')"));await tap('#clear-progress');await tap('#confirm-clear');assert.equal((await snapshot()).reading.flightRuns,0);assert.deepEqual((await snapshot()).reading.flightRecords,{});assert.equal((await snapshot()).settings.targetHits,2);
  assert.deepEqual(errors,[]);
  await fs.writeFile(new URL('expanded-browser-result.json',output),JSON.stringify({passed:true,checks:['legacy records migrate','186 words','theme and difficulty filters','pagination','search and empty state','MTR card','abstract word card and cloze quiz','six-word themed flight','frozen card and pause return','wrong-target feedback','flight complete','separate flight and recognition records','review does not increment runs','post-flight quiz','persistence','long cards and iPad layouts','clear flight records'],errors,runKeys,final},null,2));
  console.log('Expanded vocabulary, abstract-word quizzes, full word flight, persistence and iPad layouts: passed');
}finally{ws.close();}
