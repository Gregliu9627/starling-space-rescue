import { COLORS, WORDS, MISSIONS, configuredMission, evaluateAnswer, newProgress, loadProgress, recordTask } from './mission.js?v=5';
import { SETTINGS_KEY, PRESETS, SETTING_LIMITS, DEFAULT_SETTINGS, normalizeSettings, loadSettings, presetName, settingsSummary, hazardWave } from './settings.js?v=5';
import { READING_KEY, VOCABULARY, highlightInstruction, picture, readingChoices, newReading, loadReading, recordReading, CORE_KEYS, THEMES, wordKeys, practiceKeys, escapeHtml } from './vocabulary.js?v=5';

import { wordMission, flightTargets } from './word-flight.js?v=5';
import { LEVELS_KEY, LEVELS, getLevel, levelPlan, nextLevelId, newCampaign, loadCampaign, completeLevel } from './levels.js?v=5';

const $=id=>document.getElementById(id);
const canvas=$('space'),ctx=canvas.getContext('2d');
const STORAGE_KEY='starling-progress-v1';
let progress;
try{progress=loadProgress(localStorage.getItem(STORAGE_KEY));}catch{progress=newProgress();}
let storageAvailable=true;
let reading;try{reading=loadReading(localStorage.getItem(READING_KEY));}catch{reading=newReading();}
const seenWords=new Set();let quiz=null;
let libraryState={theme:'all',level:'starter',search:'',page:0};
let activeRun={kind:'rescue',keys:[],levelId:null};
let campaign;try{campaign=loadCampaign(localStorage.getItem(LEVELS_KEY));}catch{campaign=newCampaign();}
const saveCampaign=()=>{try{localStorage.setItem(LEVELS_KEY,JSON.stringify(campaign));}catch{storageAvailable=false;}};
let levelView={theme:'all',page:0},pendingLevel=null;
const runLength=()=>activeRun.kind==='vocab'?activeRun.keys.length:MISSIONS.length;
const saveReading=()=>{try{localStorage.setItem(READING_KEY,JSON.stringify(reading));}catch{storageAvailable=false;}};
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
const spokenInstruction=()=>mission().kind==='vocab'?`Find ${VOCABULARY[mission().key].word}.`:mission().text;
const fieldTop=()=>height>width?270:height<660?185:225;
const playerMin=()=>Math.max(fieldTop()+180,height*.49);
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
  englishVoice=voices.find(v=>v.lang==='en-GB'&&/Daniel|Serena|Google UK|Natural/i.test(v.name))||voices.find(v=>v.lang==='en-GB')||voices.find(v=>v.lang.startsWith('en'));
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
    const utterance=new SpeechSynthesisUtterance(text);utterance.lang=englishVoice?.lang||'en-GB';utterance.rate=.82;utterance.pitch=1.05;
    if(englishVoice)utterance.voice=englishVoice;
    utterance.onstart=()=>{state.voiceFailed=false;if($('voice-status'))$('voice-status').textContent='正在播放英文语音。听清后就可以出发了。';};
    utterance.onerror=e=>{if(!['interrupted','canceled'].includes(e.error))voiceUnavailable();};
    speechSynthesis.speak(utterance);
  }catch{voiceUnavailable();}
}
function voiceUnavailable(){state.voiceFailed=true;if($('voice-status'))$('voice-status').textContent='当前浏览器暂时无法播放语音。可以看英文字幕继续，或稍后在 Safari 重试。';if($('word-audio-status'))$('word-audio-status').textContent='语音暂不可用，先看单词和图示也可以。';showFeedback('语音暂不可用，可以看英文字幕继续',true,5);}
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
  previousFocus=document.activeElement;$('modal-content').className='modal-panel';$('modal-content').innerHTML=html;$('modal').hidden=false;
  queueMicrotask(()=>$('modal-content').querySelector('button')?.focus());
}
function closeModal(){$('modal').hidden=true;$('modal-content').innerHTML='';previousFocus?.focus?.();}
function readWord(text){if(!state.sound){state.sound=true;updateSoundButton();}unlockAudio();speak(text);}
function showWordCard(key,back,newWord=false){
  const w=VOCABULARY[key];if(!w)return;
  stopSpeech();
  const pieces=w.word.includes(' ')?w.word.split(' '):[...w.word];
  openModal(`<div class="modal-topline"><span class="overline">${newWord?'WORD DISCOVERY / 认识任务里的词':'WORD CARD / 看一看，读一读'}</span><button id="word-close" class="close-modal" aria-label="关闭单词卡">×</button></div><div class="word-lesson"><div class="lesson-illustration">${picture(key)}</div><div class="lesson-copy"><h2 id="modal-title" class="lesson-word" data-word-key="${key}">${w.word}</h2><p class="lesson-meaning">${w.zh}</p><div class="letter-tiles" aria-label="${w.word.includes(' ')?'短语中的单词':'单词的字母'}">${pieces.map(p=>`<span>${p}</span>`).join('')}</div></div></div><div class="word-example"><b>${highlightInstruction(w.example,key)}</b><span>${w.exampleZh}</span>${w.note?`<p>${w.note}</p>`:''}</div><div class="word-audio-actions"><button id="word-speak" class="secondary-button">♫ 听单词</button><button id="word-example-speak" class="secondary-button">♫ 听例句</button>${!w.word.includes(' ')?'<button id="word-spell" class="secondary-button">ABC 听字母</button>':''}</div><p id="word-audio-status" class="word-audio-status" role="status">点按钮可以反复听，也可以跟着读一遍。</p><button id="word-continue" class="launch-button">${newWord?'带上这个词，出发！ →':state.mode==='learning'?'继续救援 →':'返回 →'}</button>`);
  $('modal-content').classList.add('word-panel');
  const leave=()=>{stopSpeech();back();};
  $('word-close').onclick=leave;$('word-continue').onclick=leave;
  $('word-speak').onclick=()=>readWord(w.word);$('word-example-speak').onclick=()=>readWord(w.example);
  if($('word-spell'))$('word-spell').onclick=()=>readWord(`${[...w.word].join('. ')}. ${w.word}.`);
  speak(`${w.word}. ${w.example}.`);
}
function openMissionWord(newWord=false){
  if(!['playing','paused'].includes(state.mode))return;
  const previousMode=state.mode;state.mode='learning';pointer=null;keys.clear();stopSpeech();
  showWordCard(mission().key,()=>{
    closeModal();state.mode=previousMode;
    if(previousMode==='paused'){pauseGame();return;}
    state.invincible=Math.max(2,state.invincible);state.aimGrace=Math.max(.75,state.aimGrace);speak(spokenInstruction());
  },newWord);
}
function showLibrary(back=closeModal){
  stopSpeech();
  openModal(`<div class="modal-topline"><span class="overline">WORD GALAXY / 主題單詞舱</span><button id="library-close" class="close-modal" aria-label="关闭单词舱">×</button></div><div class="library-heading"><h2 id="modal-title">選一片星空，認識新單詞</h2><span>${Object.keys(VOCABULARY).length} 詞</span></div><div class="library-filters"><label>主題<select id="word-theme"><option value="all">全部主題</option>${Object.entries(THEMES).map(([key,t])=>`<option value="${key}" ${libraryState.theme===key?'selected':''}>${t.label}</option>`).join('')}</select></label><label>難度<select id="word-level"><option value="all">全部難度</option><option value="starter" ${libraryState.level==='starter'?'selected':''}>起步</option><option value="extend" ${libraryState.level==='extend'?'selected':''}>拓展</option></select></label><label class="word-search-label">找單詞<input id="word-search" type="search" placeholder="英文 / 中文" value="${escapeHtml(libraryState.search)}" autocomplete="off"></label></div><div class="library-pagebar"><span id="word-page-label" role="status"></span><div><button id="word-prev" aria-label="上一页">←</button><button id="word-next" aria-label="下一页">→</button></div></div><div id="word-list" class="vocabulary-grid"></div><div class="library-actions"><button id="library-flight" class="launch-button">詞彙巡航 →</button><button id="library-quiz" class="secondary-button">認詞小挑戰 →</button></div><p class="library-note">每輪最多 6 詞 · 優先練未見過或需要重溫的詞</p>`);
  $('modal-content').classList.add('library-panel');
  const filtered=()=>wordKeys(libraryState);
  const render=()=>{
    const pool=filtered(),pages=Math.max(1,Math.ceil(pool.length/6));libraryState.page=Math.max(0,Math.min(libraryState.page,pages-1));
    const shown=pool.slice(libraryState.page*6,libraryState.page*6+6);
    $('word-page-label').textContent=pool.length?`${pool.length} 詞 · 第 ${libraryState.page+1} / ${pages} 頁`:'沒有符合的詞，試試其他主題或關鍵字';
    $('word-prev').disabled=libraryState.page===0;$('word-next').disabled=libraryState.page===pages-1;
    $('library-quiz').disabled=!pool.length;$('library-flight').disabled=!pool.length;
    $('word-list').innerHTML=shown.length?shown.map(key=>{const w=VOCABULARY[key],r=reading.records[key],f=reading.flightRecords[key];return `<button class="vocabulary-card" data-card="${key}">${picture(key)}<b>${escapeHtml(w.word)}</b><span>${escapeHtml(w.zh)}</span><small>${r?`認詞首次選對 ${r.firstTry} / ${r.completed}`:f?`巡航練過 ${f.completed} 次`:`${w.level==='starter'?'起步':'拓展'} · ${THEMES[w.theme].label}`}</small></button>`;}).join(''):'<p class="library-empty">沒有找到？換一個詞再試試。</p>';
    document.querySelectorAll('[data-card]').forEach(b=>b.onclick=()=>showWordCard(b.dataset.card,()=>showLibrary(back)));
  };
  for(const [id,field] of [['word-theme','theme'],['word-level','level'],['word-search','search']])$(id).addEventListener(id==='word-search'?'input':'change',e=>{libraryState[field]=e.target.value;libraryState.page=0;render();});
  $('word-prev').onclick=()=>{libraryState.page--;render();};$('word-next').onclick=()=>{libraryState.page++;render();};
  $('library-close').onclick=()=>{stopSpeech();back();};
  $('library-quiz').onclick=()=>startReadingQuiz(()=>showLibrary(back),filtered());
  $('library-flight').onclick=()=>startRun(practiceKeys(filtered(),reading));
  render();
}
function startReadingQuiz(back=()=>showLibrary(),pool=CORE_KEYS){
  const order=practiceKeys(pool,reading);if(!order.length)return;
  stopSpeech();quiz={order,pool:[...pool],index:0,firstTry:0,mistakes:0,answered:false,finished:false,back};showReadingQuestion();
}
function clozeExample(key){return highlightInstruction(VOCABULARY[key].example,key).replace(/<mark class="vocab-highlight">.*?<\/mark>/g,'<span class="sentence-blank">______</span>');}
function showReadingQuestion(){
  if(!quiz)return;
  if(quiz.index>=quiz.order.length){finishReadingQuiz();return;}
  quiz.key=quiz.order[quiz.index];quiz.options=readingChoices(quiz.key);quiz.mistakes=0;quiz.answered=false;
  const w=VOCABULARY[quiz.key];
  openModal(`<div class="modal-topline"><span class="overline">READ & MATCH / ${quiz.index+1} OF ${quiz.order.length}</span><button id="quiz-exit" class="close-modal" aria-label="结束认词挑战">×</button></div><h2 id="modal-title">${w.kind==='card'?'哪個英文表達這個意思？':'哪個單詞和圖片相配？'}</h2><div class="quiz-picture">${picture(quiz.key)}<p>${w.zh}</p>${w.kind==='card'?`<div class="quiz-context">${clozeExample(quiz.key)}<small>${w.exampleZh}</small></div>`:''}</div><div class="reading-options">${quiz.options.map(key=>`<button data-choice="${key}">${VOCABULARY[key].word}</button>`).join('')}</div><p id="quiz-feedback" class="quiz-feedback" role="status" aria-live="polite">仔细看看单词，慢慢选。</p><button id="quiz-next" class="launch-button" disabled>${quiz.index+1===quiz.order.length?'看看这次的收获 →':'下一个词 →'}</button>`);
  $('modal-content').classList.add('reading-panel');if(w.kind==='card')$('modal-content').classList.add('abstract-question');
  $('quiz-exit').onclick=()=>{stopSpeech();quiz.back();};
  document.querySelectorAll('[data-choice]').forEach(b=>b.onclick=()=>{
    if(quiz.answered)return;
    const chosen=b.dataset.choice;
    if(chosen!==quiz.key){quiz.mistakes++;b.disabled=true;b.classList.add('try-again');$('quiz-feedback').textContent=`${VOCABULARY[chosen].word} = ${VOCABULARY[chosen].zh}。再找找「${w.zh}」。`;readWord(VOCABULARY[chosen].word);return;}
    quiz.answered=true;if(quiz.mistakes===0)quiz.firstTry++;
    recordReading(reading,quiz.key,quiz.mistakes);saveReading();
    b.classList.add('matched');document.querySelectorAll('[data-choice]').forEach(option=>option.disabled=true);
    $('quiz-feedback').textContent=`${w.word} · ${w.zh}，配对成功！`;$('quiz-next').disabled=false;readWord(w.word);
  });
  $('quiz-next').onclick=()=>{if(!quiz.answered)return;stopSpeech();quiz.index++;showReadingQuestion();};
}
function finishReadingQuiz(){
  if(!quiz.finished){quiz.finished=true;reading.sessions++;saveReading();}
  openModal(`<span class="overline">READING COMPLETE / 认词练习完成</span><h2 id="modal-title">又和这些单词见面啦！</h2><div class="reading-score"><strong>${quiz.firstTry} <small>/ ${quiz.order.length}</small></strong><span>这次首次选对</span></div><p>点下面的单词，再看一看、听一听。<br>下次探险见到它们，还能认出来吗？</p><div class="word-grid">${quiz.order.map(key=>`<button class="word-chip" data-review-card="${key}">${VOCABULARY[key].word}<small>${VOCABULARY[key].zh}</small></button>`).join('')}</div><button id="reading-done" class="launch-button">返回 →</button><button id="reading-again" class="secondary-button">再练一次</button>`);
  $('reading-done').onclick=()=>{stopSpeech();quiz.back();};$('reading-again').onclick=()=>startReadingQuiz(quiz.back,quiz.pool);
  document.querySelectorAll('[data-review-card]').forEach(b=>b.onclick=()=>showWordCard(b.dataset.reviewCard,finishReadingQuiz));
}
function showLevelMap(){
  if(state.mode!=='home')returnHome();
  stopSpeech();
  openModal(`<div class="modal-topline"><span class="overline">MISSION SELECT / 射擊選關</span><button id="levels-close" class="close-modal" aria-label="关闭选关">×</button></div><div class="level-map-heading"><h2 id="modal-title">今天飛去哪一關？</h2><span>${LEVELS.length} 關 · ${Object.keys(VOCABULARY).length} 詞</span></div><p class="level-map-intro">全部關卡都能選。每關一組單詞，瞄準帶英文的太空無人機。</p><div class="level-toolbar"><label>選主題<select id="level-theme"><option value="all">全部主題</option>${[...new Set(LEVELS.map(l=>l.theme))].map(theme=>`<option value="${theme}" ${levelView.theme===theme?'selected':''}>${THEMES[theme].label}</option>`).join('')}</select></label><button id="random-level" class="secondary-button">⤨ 隨機混合關</button></div><div class="library-pagebar"><span id="level-page-label" role="status"></span><div><button id="level-prev" aria-label="上一页关卡">←</button><button id="level-next" aria-label="下一页关卡">→</button></div></div><div id="level-grid" class="level-grid"></div><div class="level-map-footer"><span id="level-completion"></span><button id="classic-training" class="text-button">經典救援練習 ↗</button></div>`);
  $('modal-content').classList.add('level-panel');
  const render=()=>{
    const levels=LEVELS.filter(l=>levelView.theme==='all'||l.theme===levelView.theme),pages=Math.max(1,Math.ceil(levels.length/6));levelView.page=Math.max(0,Math.min(levelView.page,pages-1));
    $('level-page-label').textContent=`${levels.length} 關 · 第 ${levelView.page+1} / ${pages} 頁`;
    $('level-prev').disabled=levelView.page===0;$('level-next').disabled=levelView.page===pages-1;
    $('level-completion').textContent=`已完成 ${LEVELS.filter(l=>campaign.completed[l.id]).length} / ${LEVELS.length} 關`;
    $('level-grid').innerHTML=levels.slice(levelView.page*6,levelView.page*6+6).map(level=>`<button class="level-tile ${campaign.lastLevelId===level.id?'last-played':''}" data-level="${level.id}"><div><span>MISSION ${String(LEVELS.indexOf(level)+1).padStart(2,'0')}</span><small>${campaign.completed[level.id]?'✓ 已完成':'可出發'}</small></div><b>${level.title}</b><p>${level.keys.map(k=>VOCABULARY[k].word).join(' · ')}</p><span class="level-tile-foot">${level.keys.length} 詞 · ${level.keys.every(k=>VOCABULARY[k].level==='starter')?'起步':level.keys.every(k=>VOCABULARY[k].level==='extend')?'拓展':'混合'} <i>→</i></span></button>`).join('');
    document.querySelectorAll('[data-level]').forEach(button=>button.onclick=()=>showLevelBriefing(button.dataset.level));
  };
  $('level-theme').onchange=e=>{levelView.theme=e.target.value;levelView.page=0;render();};
  $('level-prev').onclick=()=>{levelView.page--;render();};$('level-next').onclick=()=>{levelView.page++;render();};
  $('levels-close').onclick=closeModal;$('random-level').onclick=()=>showLevelBriefing('random');$('classic-training').onclick=showBriefing;
  render();
}
function showLevelBriefing(id,keepPlan=false){
  if(!keepPlan||pendingLevel?.id!==id)pendingLevel=levelPlan(id,pendingLevel?.keys||activeRun.keys);
  const plan=pendingLevel;
  openModal(`<div class="modal-topline"><span class="overline">READY TO LAUNCH / 射擊任務</span><button id="level-brief-close" class="close-modal" aria-label="返回选关">×</button></div><h2 id="modal-title">${plan.title}</h2><p>這關要找的 ${plan.keys.length} 個詞都在這裏。<br>每詞先看卡片，再駕駛飛船瞄準英文無人機。</p><div class="level-word-preview">${plan.keys.map(key=>`<button data-level-word="${key}"><b>${VOCABULARY[key].word}</b><span>${VOCABULARY[key].zh}</span></button>`).join('')}</div><p class="level-rules">隨機出場 · 命中後換干擾詞和位置 · 每詞命中 ${settings.targetHits} 次</p><button id="level-difficulty" class="brief-difficulty">⚙ ${presetName(settings)}難度 <span>調整 ↗</span></button>${id==='random'?'<button id="reroll-level" class="secondary-button">⤨ 換一組單詞</button>':''}<button id="begin-level" class="launch-button">駕駛飛船，開始這關 →</button><button id="level-back" class="quiet-button">返回選關</button>`);
  $('modal-content').classList.add('level-brief-panel');
  document.querySelectorAll('[data-level-word]').forEach(b=>b.onclick=()=>showWordCard(b.dataset.levelWord,()=>showLevelBriefing(id,true)));
  $('level-brief-close').onclick=showLevelMap;$('level-back').onclick=showLevelMap;
  $('level-difficulty').onclick=()=>showDifficulty('level');
  if($('reroll-level'))$('reroll-level').onclick=()=>showLevelBriefing('random');
  $('begin-level').onclick=()=>startRun(plan.keys,plan.id);
}
function refreshDifficultySummary(){
  $('difficulty-name').textContent=presetName(settings);
  $('difficulty-summary').textContent=settingsSummary(settings);
}
function showDifficulty(origin='home'){
  let draft={...settings};
  const fields=[['meteorSpeed','陨石速度','下降速度，也影响 Boss 弹幕'],['meteorCount','陨石数量','每波同时出现的陨石 / 能量弹'],['targetHits','每项射击任务命中','颜色任务、词汇巡航和每层 Boss 护盾的目标次数']];
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
  const back=()=>{if(origin==='pause')pauseGame();else if(origin==='briefing')showBriefing();else if(origin==='level')showLevelBriefing(pendingLevel.id,true);else closeModal();};
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
function startRun(wordList=null,levelId=null){
  activeRun=Array.isArray(wordList)?{kind:'vocab',keys:[...new Set(wordList)].filter(k=>Object.hasOwn(VOCABULARY,k)).slice(0,6),levelId}:{kind:'rescue',keys:[],levelId:null};
  if(activeRun.kind==='vocab'&&!activeRun.keys.length)return;
  if(levelId){campaign.lastLevelId=levelId;saveCampaign();}
  closeModal();unlockAudio();
  Object.assign(state,{mode:'playing',index:0,count:0,score:0,hearts:3,elapsed:0,clock:0,phaseTime:0,shotTime:0,hazardTime:0,transition:0,wrongCooldown:0,shield:3,shieldCooldown:0,invincible:3,feedback:0,mistakes:0,replays:0,runMistakes:0,runReplays:0,rescued:0});
  targets=[];hazards=[];bullets=[];particles=[];keys.clear();pointer=null;
  seenWords.clear();
  ship.x=width*.5;ship.y=height-140;ship.tx=ship.x;ship.ty=ship.y;
  $('home').hidden=true;$('play').hidden=false;$('flight-guide').style.opacity='1';
  setMission(0);updateHud();
}
function setMission(index){
  state.index=index;activeMission=activeRun.kind==='vocab'?wordMission(activeRun.keys[index],settings):configuredMission(index,settings);state.count=0;state.phaseTime=0;state.shotTime=0;state.hazardTime=0;state.mistakes=0;state.replays=0;state.wrongCooldown=0;state.aimGrace=0;
  bullets=[];hazards=[];targets=[];
  const m=mission();
  $('instruction').innerHTML=highlightInstruction(m.text,m.key);
  const word=VOCABULARY[m.key];$('focus-word').innerHTML=m.kind==='vocab'?`<b>${word.emoji||'✦'}</b><span>${word.zh}</span><small>♫ 單詞卡</small>`:`<b>${word.word}</b><span>${word.zh}</span><small>♫ 单词卡</small>`;
  $('task-hint').textContent=m.hint;
  $('task-tag').textContent=['MISSION 01 / 收集能量','MISSION 02 / 听音瞄准','MISSION 03 / 营救伙伴','MISSION 04 / 守卫挑战'][m.section];
  $('stage-progress').innerHTML=['能量','瞄准','救援','守卫'].map((label,i)=>`<div class="stage-marker ${i===m.section?'active':i<m.section?'done':''}"><b>${i<m.section?'✓':i+1}</b><span>${label}</span></div>`).join('');
  if(m.kind==='vocab'){
    $('task-tag').textContent=activeRun.levelId?`MISSION / ${getLevel(activeRun.levelId)?.title||'隨機混合關'}`:`WORD FLIGHT / ${THEMES[word.theme].label}`;
    $('stage-progress').innerHTML=activeRun.keys.map((key,i)=>`<div class="stage-marker ${i===index?'active':i<index?'done':''}"><b>${i<index?'✓':i+1}</b></div>`).join('');
  }
  if(m.kind==='vocab')targets=flightTargets(m.key,activeRun.keys);
  else if(m.kind==='collect')targets=Array.from({length:3},(_,i)=>({key:'star',slot:i,active:true}));
  else if(m.kind==='position')targets=shuffle(['behind','front']).map((key,slot)=>({key,slot,active:true}));
  else targets=shuffle(Object.keys(COLORS)).map((key,slot)=>({key,slot,active:true}));
  layoutTargets();updateHud();
  if(!seenWords.has(m.key)){seenWords.add(m.key);openMissionWord(true);}else speak(spokenInstruction());
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
    else{t.y=fieldTop()+65;t.r=m.kind==='vocab'?Math.min(102.5,width*.125):33;}
    t.x=t.baseX;t.cooldown=0;
  }
}
function updateHud(){
  $('score').textContent=String(state.score).padStart(3,'0');
  $('hearts').textContent='◆ '.repeat(state.hearts)+'◇ '.repeat(3-state.hearts);
  const m=mission();
  $('objective').innerHTML=m.kind==='boss'?`第 ${state.index-4} / 3 层护盾 <b>${state.count} / ${m.goal}</b>`:`${m.kind==='collect'?'能量星':m.kind==='color'?'命中目标':m.kind==='vocab'?`單詞 ${state.index+1} / ${runLength()}`:'机器人'} <b>${state.count} / ${m.goal}</b>`;
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
    if(m.kind==='vocab'){
      const w=VOCABULARY[target.key];showFeedback(`${w.word} = ${w.zh}；再找「${VOCABULARY[m.key].zh}」`,true,3);
      tone(160,.15,'sine');speak(`${w.word}. Find ${VOCABULARY[m.key].word}.`);return;
    }
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
    if(m.kind==='vocab'){recordReading(reading,m.key,state.mistakes,'flight');saveReading();}
    else{recordTask(progress,m.key,{mistakes:state.mistakes,replays:state.replays});save();}
    state.transition=2;state.invincible=Math.max(state.invincible,2.5);
    showFeedback(m.kind==='position'?'伙伴获救！Nice rescue!':m.kind==='boss'?'护盾解除！Great shot!':'任务完成！Well done!',false,1.8);
    speak(m.kind==='position'?'Thank you, pilot!':'Well done!');
  }else{
    showFeedback(m.kind==='collect'?`${state.count===1?'One':'Two'} star${state.count>1?'s':''}!`:`Great shot! ${state.count} / ${m.goal}`,false,1.1);
    if(['color','boss','vocab'].includes(m.kind)){target.respawn=1;state.aimGrace=1.75;}
  }
  updateHud();
}

function finishRun(){
  state.mode='results';stopSpeech();if(activeRun.kind==='vocab'){reading.flightRuns++;saveReading();if(activeRun.levelId){completeLevel(campaign,activeRun.levelId);saveCampaign();}}else{progress.runs++;save();}pointer=null;keys.clear();
  speak('Mission complete! You are a space hero!');
  showResults();
}
function showResults(){
  if(activeRun.kind==='vocab'){showFlightResults();return;}
  const totalSeconds=Math.floor(state.elapsed),duration=`${Math.floor(totalSeconds/60)}:${String(totalSeconds%60).padStart(2,'0')}`;
  openModal(`<span class="modal-symbol">✦</span><div class="overline">MISSION COMPLETE</div><h2 id="modal-title">欢迎回家，星际英雄！</h2><p>两位机器人伙伴安全回到空间站。<br>今天，你练习了这些星际指令里的词。</p><div class="stats-row"><div class="stat-tile"><strong>${state.score}</strong><span>任务能量</span></div><div class="stat-tile"><strong>${state.rescued}</strong><span>获救伙伴</span></div><div class="stat-tile"><strong>${duration}</strong><span>飞行时间</span></div></div><div class="word-grid">${Object.values(WORDS).map(w=>`<span class="word-chip">${w.en}<small>${w.zh}</small></span>`).join('')}</div><p>休息一下，也可以和爸爸妈妈说说：<br>“behind” 和 “in front of” 有什么不同？</p><button id="result-home" class="launch-button">返回空间站 →</button><button id="result-replay" class="secondary-button">再出发一次</button>`);
  const grid=$('modal-content').querySelector('.word-grid');
  grid.innerHTML=CORE_KEYS.map(key=>{const w=VOCABULARY[key];return `<button class="word-chip" data-result-word="${key}">${w.word}<small>${w.zh}</small></button>`;}).join('');
  grid.querySelectorAll('[data-result-word]').forEach(b=>b.onclick=()=>showWordCard(b.dataset.resultWord,showResults));
  $('result-home').insertAdjacentHTML('beforebegin','<button id="result-reading" class="secondary-button">认词小挑战 →</button>');
  $('result-reading').onclick=()=>startReadingQuiz(showResults);
  $('result-home').onclick=returnHome;$('result-replay').onclick=startRun;
}
function showFlightResults(){
  const id=activeRun.levelId,next=id==='random'?'random':nextLevelId(id),title=getLevel(id)?.title||(id==='random'?'隨機混合關':'詞彙巡航');
  openModal(`<div class="modal-symbol">✦</div><span class="overline">MISSION COMPLETE / 射擊過關</span><h2 id="modal-title">${title}，完成！</h2><p>這關練習了 ${activeRun.keys.length} 個詞。下一關，換一組新單詞！</p><div class="word-grid">${activeRun.keys.map(key=>`<button class="word-chip" data-flight-review="${key}">${VOCABULARY[key].word}<small>${VOCABULARY[key].zh}</small></button>`).join('')}</div>${next?`<button id="flight-next" class="launch-button">${next==='random'?'下一組隨機詞':`下一關：${getLevel(next).title}`} →</button>`:''}<button id="flight-more" class="${next?'secondary-button':'launch-button'}">自選其他關卡 →</button>${id?'<button id="flight-replay" class="secondary-button">再玩這關 · 重排出場順序</button>':''}<button id="flight-reading" class="secondary-button">認一認這些詞</button><button id="flight-home" class="quiet-button">返回空間站</button>`);
  document.querySelectorAll('[data-flight-review]').forEach(b=>b.onclick=()=>showWordCard(b.dataset.flightReview,showFlightResults));
  $('flight-reading').onclick=()=>startReadingQuiz(showFlightResults,activeRun.keys);
  $('flight-more').onclick=()=>{returnHome();showLevelMap();};$('flight-home').onclick=returnHome;
  if($('flight-next'))$('flight-next').onclick=()=>{const plan=levelPlan(next,activeRun.keys);pendingLevel=plan;showLevelBriefing(next,true);};
  if($('flight-replay'))$('flight-replay').onclick=()=>{const plan=id==='random'?{id,title,keys:shuffle(activeRun.keys)}:levelPlan(id,activeRun.keys);pendingLevel=plan;showLevelBriefing(id,true);};
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
  $('resume').insertAdjacentHTML('beforebegin','<button id="pause-word" class="secondary-button">♫ 再看看这个单词</button>');
  $('pause-word').onclick=()=>openMissionWord();
  $('resume').onclick=()=>{closeModal();state.mode='playing';state.invincible=Math.max(2,state.invincible);state.aimGrace=Math.max(.75,state.aimGrace);speak(spokenInstruction());};
  $('resume').insertAdjacentHTML('afterend','<button id="pause-levels" class="secondary-button">換一關 →</button>');$('pause-levels').onclick=()=>{returnHome();showLevelMap();};
  $('leave').onclick=returnHome;
}
function repairShip(){
  state.mode='repair';stopSpeech();pointer=null;keys.clear();
  openModal(`<span class="modal-symbol">◇</span><div class="overline">QUICK REPAIR</div><h2 id="modal-title">补充护甲，再出发！</h2><p>工程机器人已经修好了你的飞船。<br>刚才完成的任务都保留着，继续救援吧。</p><button id="repair" class="launch-button">护甲充满，继续 →</button><button id="repair-home" class="quiet-button">返回空间站</button>`);
  $('repair').onclick=()=>{closeModal();state.mode='playing';state.hearts=3;state.shield=4;state.invincible=4;state.shieldCooldown=0;hazards=[];updateHud();speak(spokenInstruction());};
  $('repair-home').onclick=returnHome;
}
function showParent(){
  const total=Object.values(progress.records).reduce((n,r)=>n+r.completed,0);
  openModal(`<div class="modal-topline"><span class="overline">PARENT DECK / 家长舱</span><button id="parent-close" class="close-modal" aria-label="关闭家长舱">×</button></div><h2 id="modal-title">每次冒险，都留下一点进步</h2><p>本设备完成了 <b>${progress.runs}</b> 次救援、<b>${total}</b> 项任务。记录用于观察练习情况，不代表已经掌握单词。</p>${Object.entries(WORDS).map(([key,w])=>{const r=progress.records[key];return `<div class="parent-record"><div><b>${w.en}</b><small>${w.zh}</small></div><div class="record-result">${r?`${r.firstTry} / ${r.completed} 次无误完成`:'等待第一次探索'}<br><small>${r?`选错 ${r.mistakes} 次 · 主动重听 ${r.replays} 次`:key==='stars'?'跟随数量指令收集':'听音与认读练习'}</small></div></div>`;}).join('')}<p style="font-size:11px">记录只保存在当前浏览器，不会跨设备同步。清除浏览器数据也会清除记录。建议陪孩子玩第一关，确认英文语音能正常播放。</p>${!storageAvailable?'<p class="sound-notice">浏览器不允许保存记录；当前记录只在这次打开期间保留。</p>':''}<button id="parent-done" class="launch-button">回到空间站 →</button><button id="clear-progress" class="quiet-button">清除本机学习记录</button>`);
  const summary=Object.values(reading.records).reduce((a,r)=>({completed:a.completed+r.completed,firstTry:a.firstTry+r.firstTry}),{completed:0,firstTry:0});
  $('parent-done').insertAdjacentHTML('beforebegin',`<div class="reading-parent-summary"><b>認詞練習 · 首次選對 ${summary.firstTry} / ${summary.completed} 次</b><p>完成 ${reading.sessions} 轮认词挑战。战斗里有图文提示；这里单独记录看图或释义选英文的表现。</p><p>詞彙巡航完成 ${reading.flightRuns} 輪，練過 ${Object.keys(reading.flightRecords).length} 個詞。巡航有詞卡提示，單獨記錄。</p>${Object.entries(reading.records).slice(-12).map(([key,r])=>`<span>${VOCABULARY[key].word}：${r.firstTry} / ${r.completed}</span>`).join('')}<p>186 詞，按香港小一至小三常見主題編選。「起步／拓展」是遊戲分組，可按孩子程度選擇。</p><p><a class="curriculum-link" href="https://www.edb.gov.hk/attachment/en/curriculum-development/kla/eng-edu/Curriculum%20Document/Pri_ELCG_Primary_1-6_2025.pdf" target="_blank" rel="noopener noreferrer">課程方向參考：香港教育局英語課程指引 ↗</a></p><button id="parent-library" class="secondary-button">進單詞舱查看各詞記錄 →</button></div>`);
  $('parent-library').onclick=()=>showLibrary(showParent);
  $('parent-close').onclick=closeModal;$('parent-done').onclick=closeModal;
  $('clear-progress').onclick=()=>{openModal(`<div class="overline">LOCAL RECORDS</div><h2 id="modal-title">清除这台设备的记录？</h2><p>救援、认词挑战和词汇巡航的练习记录都会归零。</p><button id="keep-records" class="launch-button">保留记录</button><button id="confirm-clear" class="secondary-button">确认清除</button>`);$('keep-records').onclick=showParent;$('confirm-clear').onclick=()=>{progress=newProgress();reading=newReading();campaign=newCampaign();save();saveReading();saveCampaign();showParent();};};
}

$('start').onclick=showLevelMap;$('open-parent').onclick=showParent;$('pause').onclick=pauseGame;
$('open-words').onclick=()=>showLibrary();$('start-words').onclick=()=>showLevelBriefing('random');$('focus-word').onclick=()=>openMissionWord();
$('difficulty').onclick=()=>showDifficulty('home');refreshDifficultySummary();
$('dismiss-rotate').onclick=()=>$('rotate-hint').classList.add('dismissed');
$('repeat').onclick=()=>{
  if(state.mode!=='playing')return;
  if(!state.sound){state.sound=true;updateSoundButton();}
  unlockAudio();state.replays++;state.runReplays++;speak(spokenInstruction());showFeedback('仔细听，慢慢来。',false,1.5);
};
function updateSoundButton(){$('sound').setAttribute('aria-pressed',String(!state.sound));$('sound').setAttribute('aria-label',state.sound?'关闭声音':'开启声音');}
$('sound').onclick=()=>{state.sound=!state.sound;updateSoundButton();if(!state.sound)stopSpeech();else{unlockAudio();speak(spokenInstruction());}};
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
  if(state.transition>0){state.transition-=dt;hazards=[];if(state.transition<=0){if(state.index+1>=runLength())finishRun();else setMission(state.index+1);}return;}
  const m=mission();
  if(m.kind==='vocab'){const waiting=targets.find(t=>t.respawn>0);if(waiting){waiting.respawn-=dt;if(waiting.respawn<=0){targets=flightTargets(m.key,activeRun.keys,targets);bullets=[];layoutTargets();}}}
  for(const t of targets){
    t.cooldown=Math.max(0,t.cooldown-dt);
    if(m.kind!=='vocab'&&t.respawn){t.respawn-=dt;if(t.respawn<=0){t.active=true;t.respawn=0;const shift=1+Math.floor(Math.random()*(targets.length-1));targets.forEach(v=>v.slot=(v.slot+shift)%targets.length);bullets=[];layoutTargets();}}
    t.x=t.baseX+(['color','boss','vocab'].includes(m.kind)?Math.sin(state.phaseTime*.5+t.slot)*Math.min(25,width*.025):0);
    if(t.active&&m.kind==='collect'&&Math.hypot(ship.x-t.x,ship.y-t.y)<t.r+23)answer(t);
  }
  state.shotTime+=dt;
  if(state.shotTime>.24&&state.phaseTime>1.7&&state.wrongCooldown<=0&&state.aimGrace<=0){state.shotTime=0;bullets.push({x:ship.x,y:ship.y-36});if(state.elapsed%2<.25)tone(560,.04,'triangle',.009);}
  for(const b of bullets){
    b.y-=600*dt;
    if(m.kind!=='collect')for(const t of targets){if(t.active&&Math.abs(b.x-t.x)<t.r&&Math.abs(b.y-t.y)<(m.kind==='vocab'?38:t.r)){answer(t);b.y=-100;break;}}
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
  ctx.fillStyle=color;ctx.font='700 22px -apple-system, sans-serif';ctx.textAlign='center';ctx.fillText(t.key,0,64);ctx.restore();
}
function drawWordTarget(t){
  const w=VOCABULARY[t.key],cardWidth=Math.min(205,width*.25);
  ctx.save();ctx.translate(t.x,t.y);ctx.globalAlpha=t.cooldown>0?.4:1;
  const edge=cardWidth/2;
  path([[-edge+6,-18],[-edge-13,-35],[-edge-18,17],[-edge+6,23]],'#24445a','#71a9b5');
  path([[edge-6,-18],[edge+13,-35],[edge+18,17],[edge-6,23]],'#24445a','#71a9b5');
  roundedRect(-24,-48,48,21,9,'#254c5e','#83bdc3');circle(-9,-38,3,'#c1f3c0');circle(9,-38,3,'#c1f3c0');
  roundedRect(-edge,-30,cardWidth,66,14,'#142f43','#83bdc3');
  path([[-13,36],[0,49+Math.sin(ambient*8+t.slot)*5],[13,36]],'#9bdad533');
  let fontSize=24;ctx.font=`600 ${fontSize}px -apple-system, sans-serif`;
  while(ctx.measureText(w.word).width>cardWidth-20&&fontSize>14){fontSize--;ctx.font=`600 ${fontSize}px -apple-system, sans-serif`;}
  ctx.fillStyle='#e4f1ec';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(w.word,0,3);ctx.restore();
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
  ctx.font='600 19px -apple-system, sans-serif';ctx.textAlign='center';ctx.fillStyle='#bde9e1';ctx.fillText(VOCABULARY[t.key].word,rx,t.y+49);ctx.restore();
}
function drawBoss(){
  const x=width*.5,y=fieldTop()+8;
  ctx.save();ctx.translate(x,y);ctx.translate(0,Math.sin(state.clock)*4);
  path([[-48,-9],[-90,-25],[-96,15],[-55,23]],'#2b3c54','#66748c');path([[48,-9],[90,-25],[96,15],[55,23]],'#2b3c54','#66748c');
  roundedRect(-53,-31,106,67,18,'#34445d','#78869d');roundedRect(-38,-19,76,29,10,'#101e35');roundedRect(-26,-9,19,9,4,'#e7ce8b');roundedRect(7,-9,19,9,4,'#e7ce8b');
  for(let i=0;i<3;i++)roundedRect(-23+i*18,20,10,4,2,i<3-(state.index-5)?'#c7ef96':'#506075');
  ctx.strokeStyle='#bfdc9a24';ctx.beginPath();ctx.ellipse(0,0,119,58,0,0,Math.PI*2);ctx.stroke();ctx.restore();
  for(const t of targets){if(!t.active)continue;const color=COLORS[t.key];ctx.globalAlpha=t.cooldown>0?.4:1;circle(t.x,t.y,35,color+'13',color+'44');circle(t.x,t.y,24,color+'30',color);drawStar(t.x,t.y,13,color);ctx.fillStyle=color;ctx.font='700 21px -apple-system, sans-serif';ctx.textAlign='center';ctx.fillText(t.key,t.x,t.y+57);ctx.globalAlpha=1;}
}
function draw(dt){
  drawBackground(dt);
  if(state.mode==='home')return;
  const m=mission();
  if(m.kind==='boss')drawBoss();
  for(const t of targets){
    if(!t.active)continue;
    if(m.kind==='collect'){circle(t.x,t.y,34,'#e9d3880b','#e9d38828');drawStar(t.x,t.y,21+Math.sin(ambient*2+t.slot)*2,'#f0d991');ctx.fillStyle='#f0d991';ctx.font='600 19px -apple-system, sans-serif';ctx.textAlign='center';ctx.fillText('star',t.x,t.y+53);}
    else if(m.kind==='color')drawDrone(t);
    else if(m.kind==='vocab')drawWordTarget(t);
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
export function inspectGame(){return JSON.parse(JSON.stringify({mode:state.mode,index:state.index,count:state.count,goal:mission().goal,score:state.score,hearts:state.hearts,elapsed:state.elapsed,transition:state.transition,shield:state.shield,shieldCooldown:state.shieldCooldown,mistakes:state.runMistakes,replays:state.runReplays,settings,ship,targets,hazards:hazards.map(h=>({...h,effectiveSpeed:h.vy*settings.meteorSpeed})),progress,reading,campaign,activeRun,missionKey:mission().key,seenWords:[...seenWords],quiz:quiz?{key:quiz.key,index:quiz.index,order:quiz.order,options:quiz.options,answered:quiz.answered,firstTry:quiz.firstTry,finished:quiz.finished}:null}));}
