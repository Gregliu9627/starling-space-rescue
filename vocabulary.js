export const READING_KEY='starling-reading-v1';
export const VOCABULARY=Object.freeze({
  stars:{word:'star',zh:'星星',example:'three stars',exampleZh:'三颗星星',note:'star 是一颗星星；多颗星星写作 stars。',kind:'star'},
  red:{word:'red',zh:'红色',example:'a red drone',exampleZh:'一架红色无人机',note:'看到红色时，看看它旁边的单词 red。',kind:'color',color:'#ff7d7b'},
  blue:{word:'blue',zh:'蓝色',example:'a blue drone',exampleZh:'一架蓝色无人机',note:'看到蓝色时，看看它旁边的单词 blue。',kind:'color',color:'#75c9fa'},
  green:{word:'green',zh:'绿色',example:'a green energy ball',exampleZh:'一颗绿色能量球',note:'瞄准绿色能量球时，也找一找 green。',kind:'color',color:'#b5eb8c'},
  behind:{word:'behind',zh:'在……后面',example:'behind the rock',exampleZh:'在石头后面',note:'机器人被石头挡住了一部分，它在石头后面。',kind:'position'},
  front:{word:'in front of',zh:'在……前面',example:'in front of the rock',exampleZh:'在石头前面',note:'机器人挡住了石头的一部分，它在石头前面。',kind:'position'}
});
export const escapeHtml=text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function highlightInstruction(text,key){
  const word=key==='stars'?'stars?':VOCABULARY[key]?.word;
  if(!word)return escapeHtml(text);
  return String(text).split(new RegExp(`(\\b${word}\\b)`,'gi')).map((part,i)=>i%2?`<mark class="vocab-highlight">${escapeHtml(part)}</mark>`:escapeHtml(part)).join('');
}
export function picture(key){
  const word=VOCABULARY[key];if(!word)return '';
  const robot='<g><path d="M100 47v-9" stroke="#98c7cd" stroke-width="4"/><circle cx="100" cy="35" r="5" fill="#d4f894"/><rect x="74" y="47" width="52" height="42" rx="12" fill="#b3d8dd"/><rect x="81" y="56" width="38" height="21" rx="7" fill="#193449"/><circle cx="92" cy="66" r="4" fill="#d4f894"/><circle cx="108" cy="66" r="4" fill="#d4f894"/><rect x="84" y="94" width="32" height="28" rx="7" fill="#80aebc"/><path d="M79 126h17m8 0h17" stroke="#b3d8dd" stroke-width="8" stroke-linecap="round"/></g>';
  const rock='<path d="m58 82 17-24 43-7 28 24 5 35-23 29-44-1-29-24Z" fill="#4c6177" stroke="#8fa3b4" stroke-width="2"/><circle cx="89" cy="91" r="12" fill="#374d63"/><circle cx="123" cy="116" r="8" fill="#374d63"/>';
  let scene;
  if(word.kind==='color')scene=`<circle cx="100" cy="85" r="63" fill="${word.color}12"/><path d="m71 64-39-17 7 55 32-9m58-29 39-17-7 55-32-9" fill="#243e55" stroke="${word.color}" stroke-width="3"/><rect x="65" y="56" width="70" height="62" rx="17" fill="${word.color}"/><rect x="76" y="74" width="48" height="22" rx="9" fill="#173144"/><circle cx="90" cy="85" r="4" fill="${word.color}"/><circle cx="110" cy="85" r="4" fill="${word.color}"/>`;
  else if(word.kind==='star')scene='<circle cx="100" cy="86" r="65" fill="#f1d68c0c"/><path d="m100 25 18 38 43 6-31 30 7 42-37-20-37 20 7-42-31-30 43-6Z" fill="#f1d68c"/><circle cx="88" cy="85" r="4" fill="#674e2a"/><circle cx="112" cy="85" r="4" fill="#674e2a"/><path d="M91 99q9 8 18 0" fill="none" stroke="#674e2a" stroke-width="3" stroke-linecap="round"/>';
  else scene=key==='behind'?`<g transform="translate(0,-12)">${robot}</g>${rock}`:`<g transform="translate(0,-17)">${rock}</g>${robot}`;
  return `<svg class="word-picture" viewBox="0 0 200 170" role="img" aria-label="${word.zh}图示" xmlns="http://www.w3.org/2000/svg"><ellipse cx="100" cy="150" rx="58" ry="8" fill="#020c1844"/>${scene}</svg>`;
}
export function readingChoices(key,random=Math.random){
  if(!Object.hasOwn(VOCABULARY,key))throw new RangeError('Unknown word');
  const others=Object.keys(VOCABULARY).filter(k=>k!==key);
  const shuffled=list=>{const out=[...list];for(let i=out.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[out[i],out[j]]=[out[j],out[i]];}return out;};
  const related=key==='behind'?['front']:key==='front'?['behind']:[];
  const distractors=[...related,...shuffled(others.filter(k=>!related.includes(k)))].slice(0,2);
  return shuffled([key,...distractors]);
}
export function newReading(){return {version:1,sessions:0,records:{}};}
export function loadReading(raw){
  try{
    const d=JSON.parse(raw);if(d?.version!==1||!d.records||typeof d.records!=='object'||Array.isArray(d.records))return newReading();
    const count=v=>Number.isSafeInteger(v)&&v>=0?Math.min(1000000,v):0;
    const clean=newReading();clean.sessions=count(d.sessions);
    for(const key of Object.keys(VOCABULARY)){const r=d.records[key];if(!r||typeof r!=='object')continue;const completed=count(r.completed);clean.records[key]={completed,firstTry:Math.min(completed,count(r.firstTry)),mistakes:count(r.mistakes)};}
    return clean;
  }catch{return newReading();}
}
export function recordReading(reading,key,mistakes){
  if(!Object.hasOwn(VOCABULARY,key))return reading;
  const old=reading.records[key]??{completed:0,firstTry:0,mistakes:0};
  const errors=Number.isSafeInteger(mistakes)&&mistakes>0?mistakes:0;
  reading.records[key]={completed:old.completed+1,firstTry:old.firstTry+(errors===0?1:0),mistakes:old.mistakes+errors};
  return reading;
}
