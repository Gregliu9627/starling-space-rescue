import { COLORS, WORDS, MISSIONS, configuredMission, evaluateAnswer, newProgress, loadProgress, recordTask } from './mission.js?v=2';
import { SETTINGS_KEY, PRESETS, SETTING_LIMITS, DEFAULT_SETTINGS, normalizeSettings, loadSettings, presetName, settingsSummary, hazardWave } from './settings.js?v=2';

const $=id=>document.getElementById(id);
const canvas=$('space'),ctx=canvas.getContext('2d');
const STORAGE_KEY='starling-progress-v1';
let progress;
try{progress=loadProgress(localStorage.getItem(STORAGE_KEY));}catch{progress=newProgress();}
let storageAvailable=true;
let settings;
try{settings=loadSettings(localStorage.getItem(SETTINGS_KEY));}catch{settings={...DEFAULT_SETTINGS};}
let activeMission=configuredMission(0,settings);
const state={mode:'home',index:0,count:0,score:0,hearts:3,elapsed:0,clock:0,phaseTime:0,shotTime:0,hazardTime:0,transition:0,wrongCooldown:0,aimGrace:0,shield:0,shieldCooldown:0,invincible:0,feedback:0,mistakes:0,replays:0,runMistakes:0,runReplays:0,rescued:0,sound:true,voiceFailed:false};
let width=innerWidth,height=innerHeight,dpr=1,stars=[],targets=[],bullets=[],hazards=[],particles=[],pointer=null,keys=new Set(),audioContext,englishVoice,previousFocus;
const ship={x:0,y:0,tx:0,ty:0};
let lastFrame=0,ambient=0;
const rnd=(a,b)=>a+Math.random()*(b-a);
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const mission=()=>activeMission;
const fieldTop=()=>height<660?150:190;
const playerMin=()=>Math.max(fieldTop()+125,height*.49);
const save=()=>{try{localStorage.setItem(STORAGE_KEY,JSON.stringify(progress));}catch{storageAvailable=false;}};

function resize(){
  const oldW=width,oldH=height;
  width=canvas.clientWidth;height=canvas.clientHeight;dpr=Math.min(devicePixelRatio||1,2);
  canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
  stars=Array.from({length:95},()=>({x:rnd(0,width),y:rnd(0,height),r:rnd(.5,1.5),a:rnd(.13,.7),v:rnd(5,21)}));
  ship.x=clamp((ship.x/oldW||.5)*width,35,width-35);ship.y=clamp((ship.y/oldH||.75)*height,playerMin(),height-95);ship.tx=ship.x;ship.ty=ship.y;
  if(state.mode!=='home'){layoutTargets();bullets=[];hazards=[];}
}
window.addEventListener('resize',resize);resize();

function pickVoice(){
  if(!('speechSynthesis' in window))return;
  const voices=speechSynthesis.getVoices();
  englishVoice=voices.find(v=>v.lang==='en-US'&&/Samantha|Aria|Google US|Natural/i.test(v.name))||voices.find(v=>v.lang==='en-US')||voices.find(v=>v.lang.startsWith('en'));
}
if('speechSynthesis' in window){pickVoice();speechSynthesis.addEventListener('voiceschanged',pickVoice);}
function unlockAudio(){
  try{const Audio=window.AudioContext||window.webkitAudioContext;if(Audio){audioContext??=new Audio();if(audioContext.state==='suspended')audioContext.resume().catch(()=>{});}}catch{}
}
function speak(text){
  if(!state.sound)return;
  if(!('speechSynthesis' in window)){voiceUnavailable();return;}
  try{
    speechSynthesis.cancel();pickVoice();
    const utterance=new SpeechSynthesisUtterance(text);utterance.lang='en-US';utterance.rate=.82;utterance.pitch=1.05;
    if(englishVoice)utterance.voice=englishVoice;
    utterance.onstart=()=>{state.voiceFailed=false;if($('voice-status'))$('voice-status').textContent='正在播放英文语音。听清后就可以出发了。';};
    utterance.onerror=e=>{if(!['interrupted','canceled'].includes(e.error))voiceUnavailable();};
    speechSynthesis.speak(utterance);
  }catch{voiceUnavailable();}
}
function voiceUnavailable(){state.voiceFailed=true;if($('voice-status'))$('voice-status').textContent='当前浏览器暂时无法播放语音。可以看英文字幕继续，或稍后在 Safari 重试。';showFeedback('语音暂不可用，可以看英文字幕继续',true,5);}
function stopSpeech(){if('speechSynthesis' in window)speechSynthesis.cancel();}
function tone(freq=440,duration=.08,kind='sine',volume=.035){
  if(!state.sound||!audioContext||audioContext.state!=='running')return;
  try{const oscillator=audioContext.createOscillator(),gain=audioContext.createGain(),now=audioContext.currentTime;
    oscillator.type=kind;oscillator.frequency.setValueAtTime(freq,now);oscillator.frequency.exponentialRampToValueAtTime(freq*.5,now+duration);
    gain.gain.setValueAtTime(volume,now);gain.gain.exponentialRampToValueAtTime(.0001,now+duration);
    oscillator.connect(gain);gain.connect(audioContext.destination);oscillator.start();oscillator.stop(now+duration);
  }catch{}
}

function openModal(html){
  previousFocus=document.activeElement;$('modal-content').classList.remove('difficulty-panel');$('modal-content').innerHTML=html;$('modal').hidden=false;
  queueMicrotask(()=>$('modal-content').querySelector('button')?.focus());
}
function closeModal(){$('modal').hidden=true;$('modal-content').innerHTML='';previousFocus?.focus?.();}
function refreshDifficultySummary(){
  $('difficulty-name').textContent=presetName(settings);
  $('difficulty-summary').textContent=settingsSummary(settings);
}
function showDifficulty(origin='home'){
  let draft={...settings};
  const fields=[['meteorSpeed','陨石速度','下降速度，也影响 Boss 弹幕'],['meteorCount','陨石数量','每波同时出现的陨石 / 能量弹'],['targetHits','每项射击任务命中','颜色任务和每层 Boss 护盾的目标次数']];
  openModal(`<div class="modal-topline"><span class="overline">FLIGHT SETTINGS / 飞行设置</span><button id="difficulty-close" class="close-modal" aria-label="取消难度调整">×</button></div><h2 id="modal-title">选好挑战，再出发</h2><div class="difficulty-presets">${Object.entries(PRESETS).map(([key,p])=>`<button type="button" data-preset="${key}" aria-pressed="false"><b>${p.label}</b><small>${p.description}</small></button>`).join('')}</div><div class="difficulty-controls">${fields.map(([key,label,help])=>{const {min,max,step}=SETTING_LIMITS[key];return `<div class="difficulty-control"><div class="setting-heading"><label for="setting-${key}">${label}</label><output id="value-${key}" for="setting-${key}"></output></div><div class="setting-input"><button type="button" data-adjust="${key}" data-direction="-1" aria-label="减少${label}">−</button><input id="setting-${key}" type="range" min="${min}" max="${max}" step="${step}" value="${draft[key]}"><button type="button" data-adjust="${key}" data-direction="1" aria-label="增加${label}">＋</button></div><small>${help}</small></div>`;}).join('')}</div><p class="settings-note">${origin==='pause'?'速度和数量在继续时生效；目标次数从下一项任务生效，当前进度保留。':'设置会记在这台设备上。收集星星和方位救援保持原来的数量。'}</p><button id="save-difficulty" class="launch-button">保存设置${origin==='pause'?'，返回暂停菜单':''} →</button><button id="cancel-difficulty" class="quiet-button">取消</button>`);
  $('modal-content').classList.add('difficulty-panel');
  const actions=document.createElement('div');actions.className='settings-actions';
  $('save-difficulty').before(actions);actions.append($('save-difficulty'),$('cancel-difficulty'));
  const refresh=()=>{
    for(const [key] of fields){
      $(`setting-${key}`).value=String(draft[key]);
      $(`value-${key}`).textContent=key==='meteorSpeed'?`${draft[key]}×`:key==='meteorCount'?`${draft[key]} 颗 / 波`:`${draft[key]} 次`;
      $(`setting-${key}`).setAttribute('aria-valuetext',$(`value-${key}`).textContent);
      document.querySelectorAll(`[data-adjust="${key}"]`).forEach(b=>b.disabled=Number(b.dataset.direction)<0?draft[key]<=SETTING_LIMITS[key].min:draft[key]>=SETTING_LIMITS[key].max);
    }
    document.querySelectorAll('[data-preset]').forEach(b=>b.setAttribute('aria-pressed',String(Object.keys(DEFAULT_SETTINGS).every(k=>draft[k]===PRESETS[b.dataset.preset][k]))));
  };
  const back=()=>{if(origin==='pause')pauseGame();else if(origin==='briefing')showBriefing();else closeModal();};
  for(const [key] of fields)$(`setting-${key}`).oninput=e=>{draft=normalizeSettings({...draft,[key]:Number(e.target.value)});refresh();};
  document.querySelectorAll('[data-adjust]').forEach(b=>b.onclick=()=>{const key=b.dataset.adjust;draft=normalizeSettings({...draft,[key]:draft[key]+Number(b.dataset.direction)*SETTING_LIMITS[key].step});refresh();});
  document.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>{draft=normalizeSettings(PRESETS[b.dataset.preset]);refresh();});
  $('save-difficulty').onclick=()=>{settings={...draft};try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings));}catch{storageAvailable=false;}refreshDifficultySummary();back();};
  $('cancel-difficulty').onclick=back;$('difficulty-close').onclick=back;refresh();
}
function showBriefing(){
  unlockAudio();speak('Hello, pilot! Ready for takeoff?');
  openModal(`<span class="overline">PILOT TRAINING / 飞行准备</span><h2 id="modal-title">欢迎登舰，小小飞行员！</h2><p>✥　按住空白处拖动，飞船就会跟着走。<br>⌁　激光自动发射，瞄准目标就好。<br>◈　有危险时，点右下角的「能量护盾」。</p><p>听听机器人说什么，再完成任务。没听清，可以随时点「再听一次」。</p><button id="test-voice" class="secondary-button">♫ 听听英文语音</button><p id="voice-status" role="status" style="font-size:11px">点击试听，确认 iPad 音量和英文语音。</p><button id="begin" class="launch-button">准备好了，出发！ →</button><button id="brief-back" class="quiet-button">返回空间站</button>`);
  $('test-voice').onclick=()=>{unlockAudio();speak('Hello, pilot! Collect three stars!');};
  $('begin').insertAdjacentHTML('beforebegin',`<button id="brief-difficulty" class="brief-difficulty">⚙ ${presetName(settings)}难度 · ${settings.targetHits} 次命中 / 项 <span>调整 ↗</span></button>`);
  $('brief-difficulty').onclick=()=>showDifficulty('briefing');
  $('begin').onclick=startRun;$('brief-back').onclick=()=>{stopSpeech();closeModal();};
}
function startRun(){
  closeModal();unlockAudio();
  Object.assign(state,{mode:'playing',index:0,count:0,score:0,hearts:3,elapsed:0,clock:0,phaseTime:0,shotTime:0,hazardTime:0,transition:0,wrongCooldown:0,shield:3,shieldCooldown:0,invincible:3,feedback:0,mistakes:0,replays:0,runMistakes:0,runReplays:0,rescued:0});
  targets=[];hazards=[];bullets=[];particles=[];keys.clear();pointer=null;
  ship.x=width*.5;ship.y=height-140;ship.tx=ship.x;ship.ty=ship.y;
  $('home').hidden=true;$('play').hidden=false;$('flight-guide').style.opacity='1';
  setMission(0);updateHud();
}
function setMission(index){
  state.index=index;activeMission=configuredMission(index,settings);state.count=0;state.phaseTime=0;state.shotTime=0;state.hazardTime=0;state.mistakes=0;state.replays=0;state.wrongCooldown=0;state.aimGrace=0;
  bullets=[];hazards=[];targets=[];
  const m=mission();
  $('instruction').textContent=m.text;
  $('task-hint').textContent=m.hint;
  $('task-tag').textContent=['MISSION 01 / 收集能量','MISSION 02 / 听音瞄准','MISSION 03 / 营救伙伴','MISSION 04 / 守卫挑战'][m.section];
  $('stage-progress').innerHTML=['能量','瞄准','救援','守卫'].map((label,i)=>`<div class="stage-marker ${i===m.section?'active':i<m.section?'done':''}"><b>${i<m.section?'✓':i+1}</b><span>${label}</span></div>`).join('');
  if(m.kind==='collect')targets=Array.from({length:3},(_,i)=>({key:'star',slot:i,active:true}));
  else if(m.kind==='position')targets=shuffle(['behind','front']).map((key,slot)=>({key,slot,active:true}));
  else targets=shuffle(Object.keys(COLORS)).map((key,slot)=>({key,slot,active:true}));
  layoutTargets();updateHud();speak(m.text);
  if(m.kind==='position'&&m.key==='behind')showFeedback('救援激光：瞄准机器人下方的光环',false,3.5);
}
function shuffle(items){const copy=[...items];for(let i=copy.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[copy[i],copy[j]]=[copy[j],copy[i]];}return copy;}
function layoutTargets(){
  if(!targets.length)return;
  const m=mission();
  for(const t of targets){
    const slots=targets.length;
    t.baseX=width*(.20+.60*(slots===1?.5:t.slot/(slots-1)));
    if(m.kind==='collect'){t.baseX=width*(.26+t.slot*.24);t.y=clamp(height*(.57+(t.slot%2)*.10),playerMin()+10,height-140);t.r=23;}
    else if(m.kind==='position'){t.baseX=width*(.30+t.slot*.40);t.y=fieldTop()+100;t.r=39;}
    else if(m.kind==='boss'){t.y=fieldTop()+112;t.r=27;}
    else{t.y=fieldTop()+65;t.r=33;}
    t.x=t.baseX;t.cooldown=0;
  }
}
function updateHud(){
  $('score').textContent=String(state.score).padStart(3,'0');
  $('hearts').textContent='◆ '.repeat(state.hearts)+'◇ '.repeat(3-state.hearts);
  const m=mission();
  $('objective').innerHTML=m.kind==='boss'?`第 ${state.index-4} / 3 层护盾 <b>${state.count} / ${m.goal}</b>`:`${m.kind==='collect'?'能量星':m.kind==='color'?'命中目标':'机器人'} <b>${state.count} / ${m.goal}</b>`;
}
function showFeedback(text,wrong=false,duration=2){
  $('feedback').textContent=text;$('feedback').className='feedback visible'+(wrong?' wrong':'');state.feedback=duration;
}
function answer(target){
  if(state.mode!=='playing'||state.transition>0||(state.aimGrace>0&&mission().kind!=='collect')||!target.active||target.cooldown>0)return;
  const m=mission();
  if(!evaluateAnswer(m,target.key)){
    if(state.wrongCooldown>0)return;
    state.wrongCooldown=2.7;state.mistakes++;state.runMistakes++;target.cooldown=2.7;bullets=[];
    const chosen=WORDS[target.key];
    if(m.kind==='position'){
      showFeedback(`${chosen.en} = ${chosen.zh}；找「${WORDS[m.key].zh}」的伙伴`,true,3.5);
      $('task-hint').textContent=`${WORDS[m.key].en}：${WORDS[m.key].zh}。瞄准对应的救援光环。`;
    }else{
      showFeedback(`${chosen.en} 是${chosen.zh}；这次找 ${m.key}（${WORDS[m.key].zh}）`,true,3);
      $('task-hint').textContent=`${m.key} = ${WORDS[m.key].zh}。移动飞船，瞄准这个颜色。`;
    }
    tone(160,.15,'sine');speak(m.kind==='position'?`${WORDS[target.key].en}. Find the robot ${WORDS[m.key].en} the rock.`:`That is ${target.key}. Find ${m.key}.`);
    return;
  }
  state.count++;state.score+=m.kind==='boss'?100:50;
  burst(target.x,target.y,m.kind==='collect'?'#e9d388':COLORS[target.key]||'#98ead7',24);tone(780,.18,'sine',.07);
  target.active=false;bullets=[];
  if(m.kind==='position')state.rescued++;
  if(state.count>=m.goal){
    recordTask(progress,m.key,{mistakes:state.mistakes,replays:state.replays});save();
    state.transition=2;state.invincible=Math.max(state.invincible,2.5);
    showFeedback(m.kind==='position'?'伙伴获救！Nice rescue!':m.kind==='boss'?'护盾解除！Great shot!':'任务完成！Well done!',false,1.8);
    speak(m.kind==='position'?'Thank you, pilot!':'Well done!');
  }else{
    showFeedback(m.kind==='collect'?`${state.count===1?'One':'Two'} star${state.count>1?'s':''}!`:`Great shot! ${state.count} / ${m.goal}`,false,1.1);
    if(m.kind==='color'||m.kind==='boss'){target.respawn=1;state.aimGrace=1.75;}
  }
  updateHud();
}

function finishRun(){
  state.mode='results';stopSpeech();progress.runs++;save();pointer=null;keys.clear();
  speak('Mission complete! You are a space hero!');
  const totalSeconds=Math.floor(state.elapsed),duration=`${Math.floor(totalSeconds/60)}:${String(totalSeconds%60).padStart(2,'0')}`;
  openModal(`<span class="modal-symbol">✦</span><div class="overline">MISSION COMPLETE</div><h2 id="modal-title">欢迎回家，星际英雄！</h2><p>两位机器人伙伴安全回到空间站。<br>今天，你练习了这些星际指令里的词。</p><div class="stats-row"><div class="stat-tile"><strong>${state.score}</strong><span>任务能量</span></div><div class="stat-tile"><strong>${state.rescued}</strong><span>获救伙伴</span></div><div class="stat-tile"><strong>${duration}</strong><span>飞行时间</span></div></div><div class="word-grid">${Object.values(WORDS).map(w=>`<span class="word-chip">${w.en}<small>${w.zh}</small></span>`).join('')}</div><p>休息一下，也可以和爸爸妈妈说说：<br>“behind” 和 “in front of” 有什么不同？</p><button id="result-home" class="launch-button">返回空间站 →</button><button id="result-replay" class="secondary-button">再出发一次</button>`);
  $('result-home').onclick=returnHome;$('result-replay').onclick=startRun;
}
function returnHome(){
  state.mode='home';stopSpeech();closeModal();$('home').hidden=false;$('play').hidden=true;pointer=null;keys.clear();hazards=[];bullets=[];particles=[];targets=[];$('start').focus();
}
function pauseGame(){
  if(!['playing','paused'].includes(state.mode))return;
  state.mode='paused';stopSpeech();pointer=null;keys.clear();
  openModal(`<span class="modal-symbol">☾</span><div class="overline">TAKE A LITTLE BREAK</div><h2 id="modal-title">飞船正在安全停泊</h2><p>喝口水，看看远处。准备好了再继续。</p><button id="resume" class="launch-button">继续救援 →</button><button id="leave" class="secondary-button">结束本次，返回空间站</button>`);
  $('resume').insertAdjacentHTML('beforebegin',`<button id="pause-difficulty" class="brief-difficulty">⚙ 调整任务难度 <span>${presetName(settings)} ↗</span></button><p class="pause-settings-summary">${settingsSummary(settings)}</p>`);
  $('pause-difficulty').onclick=()=>showDifficulty('pause');
  $('resume').onclick=()=>{closeModal();state.mode='playing';state.invincible=Math.max(2,state.invincible);state.aimGrace=Math.max(.75,state.aimGrace);speak(mission().text);};
  $('leave').onclick=returnHome;
}
function repairShip(){
  state.mode='repair';stopSpeech();pointer=null;keys.clear();
  openModal(`<span class="modal-symbol">◇</span><div class="overline">QUICK REPAIR</div><h2 id="modal-title">补充护甲，再出发！</h2><p>工程机器人已经修好了你的飞船。<br>刚才完成的任务都保留着，继续救援吧。</p><button id="repair" class="launch-button">护甲充满，继续 →</button><button id="repair-home" class="quiet-button">返回空间站</button>`);
  $('repair').onclick=()=>{closeModal();state.mode='playing';state.hearts=3;state.shield=4;state.invincible=4;state.shieldCooldown=0;hazards=[];updateHud();speak(mission().text);};
  $('repair-home').onclick=returnHome;
}
function showParent(){
  const total=Object.values(progress.records).reduce((n,r)=>n+r.completed,0);
  openModal(`<div class="modal-topline"><span class="overline">PARENT DECK / 家长舱</span><button id="parent-close" class="close-modal" aria-label="关闭家长舱">×</button></div><h2 id="modal-title">每次冒险，都留下一点进步</h2><p>本设备完成了 <b>${progress.runs}</b> 次救援、<b>${total}</b> 项任务。记录用于观察练习情况，不代表已经掌握单词。</p>${Object.entries(WORDS).map(([key,w])=>{const r=progress.records[key];return `<div class="parent-record"><div><b>${w.en}</b><small>${w.zh}</small></div><div class="record-result">${r?`${r.firstTry} / ${r.completed} 次无误完成`:'等待第一次探索'}<br><small>${r?`选错 ${r.mistakes} 次 · 主动重听 ${r.replays} 次`:key==='stars'?'跟随数量指令收集':'听音与认读练习'}</small></div></div>`;}).join('')}<p style="font-size:11px">记录只保存在当前浏览器，不会跨设备同步。清除浏览器数据也会清除记录。建议陪孩子玩第一关，确认英文语音能正常播放。</p>${!storageAvailable?'<p class="sound-notice">浏览器不允许保存记录；当前记录只在这次打开期间保留。</p>':''}<button id="parent-done" class="launch-button">回到空间站 →</button><button id="clear-progress" class="quiet-button">清除本机学习记录</button>`);
  $('parent-close').onclick=closeModal;$('parent-done').onclick=closeModal;
  $('clear-progress').onclick=()=>{openModal(`<div class="overline">LOCAL RECORDS</div><h2 id="modal-title">清除这台设备的记录？</h2><p>已完成次数和词汇练习记录会归零。</p><button id="keep-records" class="launch-button">保留记录</button><button id="confirm-clear" class="secondary-button">确认清除</button>`);$('keep-records').onclick=showParent;$('confirm-clear').onclick=()=>{progress=newProgress();save();showParent();};};
}

$('start').onclick=showBriefing;$('open-parent').onclick=showParent;$('pause').onclick=pauseGame;
$('difficulty').onclick=()=>showDifficulty('home');refreshDifficultySummary();
$('dismiss-rotate').onclick=()=>$('rotate-hint').classList.add('dismissed');
$('repeat').onclick=()=>{
  if(state.mode!=='playing')return;
  if(!state.sound){state.sound=true;updateSoundButton();}
  unlockAudio();state.replays++;state.runReplays++;speak(mission().text);showFeedback('仔细听，慢慢来。',false,1.5);
};
function updateSoundButton(){$('sound').setAttribute('aria-pressed',String(!state.sound));$('sound').setAttribute('aria-label',state.sound?'关闭声音':'开启声音');}
$('sound').onclick=()=>{state.sound=!state.sound;updateSoundButton();if(!state.sound)stopSpeech();else{unlockAudio();speak(mission().text);}};
$('shield').onclick=()=>{if(state.mode==='playing'&&state.shieldCooldown<=0){state.shield=3;state.shieldCooldown=12;tone(300,.3,'sine',.08);showFeedback('Shield on! 护盾已开启');}};

canvas.addEventListener('pointerdown',e=>{
  if(state.mode!=='playing'||pointer)return;
  e.preventDefault();canvas.setPointerCapture(e.pointerId);pointer={id:e.pointerId,x:e.clientX,y:e.clientY,sx:ship.x,sy:ship.y};$('flight-guide').style.opacity='0';unlockAudio();
});
canvas.addEventListener('pointermove',e=>{
  if(!pointer||pointer.id!==e.pointerId||state.mode!=='playing')return;
  e.preventDefault();ship.tx=clamp(pointer.sx+(e.clientX-pointer.x)*1.25,38,width-38);ship.ty=clamp(pointer.sy+(e.clientY-pointer.y)*1.15,playerMin(),height-95);
});
function releasePointer(e){if(pointer?.id===e.pointerId)pointer=null;}
canvas.addEventListener('pointerup',releasePointer);canvas.addEventListener('pointercancel',releasePointer);canvas.addEventListener('lostpointercapture',releasePointer);
window.addEventListener('keydown',e=>{
  if(!$('modal').hidden){
    if(e.key==='Tab'){const buttons=[...$('modal-content').querySelectorAll('button:not(:disabled)')];const first=buttons[0],last=buttons.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
    return;
  }
  if(state.mode!=='playing')return;
  if(e.key==='Escape'||e.code==='KeyP'){pauseGame();return;}
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyA','KeyS','KeyD','Space'].includes(e.code)){e.preventDefault();keys.add(e.code);if(e.code==='Space')$('shield').click();}
});
window.addEventListener('keyup',e=>keys.delete(e.code));
document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseGame();});
window.addEventListener('blur',()=>{if(state.mode==='playing')pauseGame();});

function burst(x,y,color,count=15){for(let i=0;i<count&&particles.length<180;i++)particles.push({x,y,vx:rnd(-100,100),vy:rnd(-100,100),life:rnd(.3,.8),max:.8,color,r:rnd(1.5,4)});}
function update(dt){
  state.elapsed+=dt;state.clock+=dt;state.phaseTime+=dt;
  for(const k of ['shield','shieldCooldown','invincible','wrongCooldown','aimGrace'])state[k]=Math.max(0,state[k]-dt);
  if(state.feedback>0){state.feedback-=dt;if(state.feedback<=0)$('feedback').className='feedback';}
  $('shield').disabled=state.shieldCooldown>0;$('shield-status').textContent=state.shield>0?'护盾保护中':state.shieldCooldown>0?`${Math.ceil(state.shieldCooldown)} 秒后准备就绪`:'点击开启 · 3 秒保护';
  if(state.elapsed>10)$('flight-guide').style.opacity='0';
  const directionX=Number(keys.has('ArrowRight')||keys.has('KeyD'))-Number(keys.has('ArrowLeft')||keys.has('KeyA'));
  const directionY=Number(keys.has('ArrowDown')||keys.has('KeyS'))-Number(keys.has('ArrowUp')||keys.has('KeyW'));
  ship.tx=clamp(ship.tx+directionX*380*dt,38,width-38);ship.ty=clamp(ship.ty+directionY*300*dt,playerMin(),height-95);
  ship.x+=(ship.tx-ship.x)*Math.min(1,dt*16);ship.y+=(ship.ty-ship.y)*Math.min(1,dt*16);
  for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;}particles=particles.filter(p=>p.life>0);
  if(state.transition>0){state.transition-=dt;hazards=[];if(state.transition<=0){if(state.index+1>=MISSIONS.length)finishRun();else setMission(state.index+1);}return;}
  const m=mission();
  for(const t of targets){
    t.cooldown=Math.max(0,t.cooldown-dt);
    if(t.respawn){t.respawn-=dt;if(t.respawn<=0){t.active=true;t.respawn=0;const shift=1+Math.floor(Math.random()*(targets.length-1));targets.forEach(v=>v.slot=(v.slot+shift)%targets.length);bullets=[];layoutTargets();}}
    t.x=t.baseX+(m.kind==='color'||m.kind==='boss'?Math.sin(state.phaseTime*.5+t.slot)*Math.min(25,width*.025):0);
    if(t.active&&m.kind==='collect'&&Math.hypot(ship.x-t.x,ship.y-t.y)<t.r+23)answer(t);
  }
  state.shotTime+=dt;
  if(state.shotTime>.24&&state.phaseTime>1.7&&state.wrongCooldown<=0&&state.aimGrace<=0){state.shotTime=0;bullets.push({x:ship.x,y:ship.y-36});if(state.elapsed%2<.25)tone(560,.04,'triangle',.009);}
  for(const b of bullets){
    b.y-=600*dt;
    if(m.kind!=='collect')for(const t of targets){if(t.active&&Math.abs(b.x-t.x)<t.r&&Math.abs(b.y-t.y)<t.r){answer(t);b.y=-100;break;}}
    for(const h of hazards){if(Math.hypot(b.x-h.x,b.y-h.y)<h.r+5){h.dead=true;b.y=-100;burst(h.x,h.y,'#90bec7',8);break;}}
  }
  bullets=bullets.filter(b=>b.y>-20);
  state.hazardTime+=dt;
  const wave=hazardWave(settings,m.kind==='boss');
  if(state.hazardTime>wave.interval&&state.phaseTime>3.5){
    state.hazardTime=0;
    const count=Math.min(wave.count,36-hazards.length),lane=(width-120)/wave.count;
    for(let i=0;i<count;i++)hazards.push({x:60+lane*(i+rnd(.15,.85)),y:fieldTop()-10-rnd(0,30),r:m.kind==='boss'?8:rnd(14,22),vy:wave.baseSpeed,rotation:rnd(0,6.28),kind:m.kind==='boss'?'energy':'rock'});
  }
  for(const h of hazards){
    h.y+=h.vy*settings.meteorSpeed*dt*(state.wrongCooldown>0?.35:1);h.rotation+=dt*.3;
    if(!h.dead&&Math.hypot(h.x-ship.x,h.y-ship.y)<h.r+20){
      h.dead=true;burst(h.x,h.y,'#74d7d1');
      if(state.shield<=0&&state.invincible<=0){state.hearts--;state.invincible=2;tone(95,.2,'triangle',.08);updateHud();showFeedback('留意陨石，护盾可以保护你',true);if(state.hearts<=0){repairShip();return;}}
    }
  }
  hazards=hazards.filter(h=>!h.dead&&h.y<height+30);
}

function roundedRect(x,y,w,h,r,fill,stroke){ctx.beginPath();ctx.roundRect(x,y,w,h,r);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.stroke();}}
function circle(x,y,r,fill,stroke){ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.stroke();}}
function path(points,fill,stroke){ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.stroke();}}
function drawStar(x,y,r,fill){const p=[];for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,rad=i%2?r*.44:r;p.push([x+Math.cos(a)*rad,y+Math.sin(a)*rad]);}path(p,fill);}
function drawBackground(dt){
  ctx.fillStyle='#07111f';ctx.fillRect(0,0,width,height);
  const glow=ctx.createRadialGradient(width*.65,height*.42,0,width*.65,height*.42,width*.7);glow.addColorStop(0,'#12344866');glow.addColorStop(.5,'#0a1b3044');glow.addColorStop(1,'#07111f00');ctx.fillStyle=glow;ctx.fillRect(0,0,width,height);
  for(const s of stars){if(state.mode==='playing')s.y=(s.y+s.v*dt)%height;ctx.globalAlpha=s.a*(.85+.15*Math.sin(ambient+s.x));circle(s.x,s.y,s.r,'#c6e3ef');}ctx.globalAlpha=1;
  if(state.mode!=='home'){
    const x=width*.88,y=height*.52,r=Math.min(width,height)*.19;
    const gradient=ctx.createRadialGradient(x-r*.4,y-r*.4,0,x,y,r);gradient.addColorStop(0,'#274554');gradient.addColorStop(.6,'#142c40');gradient.addColorStop(1,'#091625');circle(x,y,r,gradient);
    ctx.strokeStyle='#6c9d9d14';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(x,y,r*1.45,r*.38,-.4,0,Math.PI*2);ctx.stroke();
    ctx.globalAlpha=.1;ctx.strokeStyle='#7cb6bd';ctx.setLineDash([2,12]);ctx.beginPath();ctx.moveTo(width*.5,fieldTop());ctx.lineTo(width*.5,height);ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=1;
  }
}
function drawShip(){
  ctx.save();ctx.translate(ship.x,ship.y);ctx.rotate(clamp((ship.tx-ship.x)*.004,-.18,.18));
  if(state.invincible>0&&state.shield<=0&&Math.floor(state.clock*8)%2)ctx.globalAlpha=.4;
  const flame=ctx.createLinearGradient(0,25,0,65);flame.addColorStop(0,'#cffa9b');flame.addColorStop(.5,'#6ee9d1');flame.addColorStop(1,'#6ee9d100');path([[-9,24],[0,63+Math.sin(ambient*25)*8],[9,24]],flame);
  path([[-12,-6],[-36,27],[-35,35],[-9,22]],'#73aebd','#b3e2e5');path([[12,-6],[36,27],[35,35],[9,22]],'#73aebd','#b3e2e5');
  path([[0,-39],[-13,-12],[-12,24],[0,33],[12,24],[13,-12]],'#d8e9ec','#a5c7d2');
  path([[0,-22],[-6,-8],[-5,4],[5,4],[6,-8]],'#85d9c9','#385a6f');
  roundedRect(-27,18,7,17,3,'#d3f598');roundedRect(20,18,7,17,3,'#d3f598');ctx.restore();
  if(state.shield>0){ctx.globalAlpha=.5+.15*Math.sin(ambient*7);circle(ship.x,ship.y,49,'#81e9df10','#8befe4');ctx.globalAlpha=1;}
}
function drawDrone(t){
  const color=COLORS[t.key];ctx.save();ctx.translate(t.x,t.y);ctx.globalAlpha=t.cooldown>0?.4:1;
  circle(0,0,44,color+'0b');ctx.strokeStyle=color+'36';ctx.setLineDash([4,6]);circle(0,0,42,null,color+'45');ctx.setLineDash([]);
  path([[-14,-9],[-35,-19],[-29,17],[-14,13]],'#263c53',color);path([[14,-9],[35,-19],[29,17],[14,13]],'#263c53',color);
  roundedRect(-19,-16,38,34,10,'#183249',color);roundedRect(-13,-7,26,10,5,color);circle(-5,-2,2,'#13263a');circle(5,-2,2,'#13263a');
  ctx.fillStyle=color;ctx.font='9px ui-monospace, monospace';ctx.textAlign='center';ctx.fillText('DRONE '+String(t.slot+1).padStart(2,'0'),0,59);ctx.restore();
}
function drawRock(x,y,r,rot=0){
  ctx.save();ctx.translate(x,y);ctx.rotate(rot);const points=[];for(let i=0;i<9;i++){const angle=i*Math.PI*2/9,rad=r*(.86+(i%3)*.07);points.push([Math.cos(angle)*rad,Math.sin(angle)*rad]);}path(points,'#43576b','#718598');circle(-r*.23,-r*.17,r*.2,'#31455a');circle(r*.28,r*.22,r*.14,'#34485b');ctx.restore();
}
function drawRobot(x,y){
  ctx.save();ctx.translate(x,y);ctx.strokeStyle='#91bdc5';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,-25);ctx.lineTo(0,-34);ctx.stroke();circle(0,-35,3,'#d4f894');
  roundedRect(-17,-24,34,27,8,'#9ac6ca','#d2eeee');roundedRect(-12,-17,24,13,5,'#1d3c50');circle(-5,-11,2.4,'#d4f894');circle(5,-11,2.4,'#d4f894');roundedRect(-11,6,22,20,5,'#75a1ad');roundedRect(-16,24,10,7,3,'#accbd0');roundedRect(6,24,10,7,3,'#accbd0');ctx.restore();
}
function drawRescue(t){
  const rx=t.x,ry=t.y-38;
  ctx.save();ctx.globalAlpha=t.cooldown>0?.45:1;
  if(t.key==='behind'){drawRobot(rx,ry-20);drawRock(rx,ry+2,36,.3);}else{drawRock(rx,ry-12,36,.3);drawRobot(rx,ry+4);}
  ctx.strokeStyle='#7de2d780';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(rx,t.y+13,38,12,0,0,Math.PI*2);ctx.stroke();
  const beam=ctx.createLinearGradient(0,t.y-12,0,t.y+13);beam.addColorStop(0,'#91ead500');beam.addColorStop(1,'#91ead540');path([[rx-25,t.y-15],[rx+25,t.y-15],[rx+38,t.y+13],[rx-38,t.y+13]],beam);
  ctx.font='10px ui-monospace,monospace';ctx.textAlign='center';ctx.fillStyle='#a1d4cf';ctx.fillText('RESCUE '+(t.slot===0?'A':'B'),rx,t.y+43);ctx.restore();
}
function drawBoss(){
  const x=width*.5,y=fieldTop()+8;
  ctx.save();ctx.translate(x,y);ctx.translate(0,Math.sin(state.clock)*4);
  path([[-48,-9],[-90,-25],[-96,15],[-55,23]],'#2b3c54','#66748c');path([[48,-9],[90,-25],[96,15],[55,23]],'#2b3c54','#66748c');
  roundedRect(-53,-31,106,67,18,'#34445d','#78869d');roundedRect(-38,-19,76,29,10,'#101e35');roundedRect(-26,-9,19,9,4,'#e7ce8b');roundedRect(7,-9,19,9,4,'#e7ce8b');
  for(let i=0;i<3;i++)roundedRect(-23+i*18,20,10,4,2,i<3-(state.index-5)?'#c7ef96':'#506075');
  ctx.strokeStyle='#bfdc9a24';ctx.beginPath();ctx.ellipse(0,0,119,58,0,0,Math.PI*2);ctx.stroke();ctx.restore();
  for(const t of targets){if(!t.active)continue;const color=COLORS[t.key];ctx.globalAlpha=t.cooldown>0?.4:1;circle(t.x,t.y,35,color+'13',color+'44');circle(t.x,t.y,24,color+'30',color);drawStar(t.x,t.y,13,color);ctx.globalAlpha=1;}
}
function draw(dt){
  drawBackground(dt);
  if(state.mode==='home')return;
  const m=mission();
  if(m.kind==='boss')drawBoss();
  for(const t of targets){
    if(!t.active)continue;
    if(m.kind==='collect'){circle(t.x,t.y,34,'#e9d3880b','#e9d38828');drawStar(t.x,t.y,21+Math.sin(ambient*2+t.slot)*2,'#f0d991');}
    else if(m.kind==='color')drawDrone(t);
    else if(m.kind==='position')drawRescue(t);
  }
  for(const h of hazards){if(h.kind==='energy'){circle(h.x,h.y,14,'#e7a67815');circle(h.x,h.y,7,'#efb884','#f7dfb5');}else drawRock(h.x,h.y,h.r,h.rotation);}
  for(const b of bullets){roundedRect(b.x-2,b.y-14,4,20,2,m.kind==='position'?'#99ece0':'#d6fa9a');}
  drawShip();
  for(const p of particles){ctx.globalAlpha=clamp(p.life/p.max,0,1);circle(p.x,p.y,p.r,p.color);}ctx.globalAlpha=1;
}
function frame(now){
  const dt=Math.min((now-lastFrame)/1000||0,.04);lastFrame=now;ambient+=dt;
  if(state.mode==='playing')update(dt);
  draw(dt);requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Read-only snapshot for browser interaction tests; contains no player identity.
export function inspectGame(){return JSON.parse(JSON.stringify({mode:state.mode,index:state.index,count:state.count,goal:mission().goal,score:state.score,hearts:state.hearts,elapsed:state.elapsed,transition:state.transition,shield:state.shield,shieldCooldown:state.shieldCooldown,mistakes:state.runMistakes,replays:state.runReplays,settings,ship,targets,hazards:hazards.map(h=>({...h,effectiveSpeed:h.vy*settings.meteorSpeed})),progress}));}
