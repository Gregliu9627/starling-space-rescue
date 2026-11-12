import { VOCABULARY, THEMES, wordKeys } from './vocabulary.js?v=5';

export const LEVELS_KEY='starling-levels-v1';
const THEME_ORDER=['animals','food','school','family','body','home','city','nature','time','actions','describing','sentence','space'];
export const LEVELS=Object.freeze(THEME_ORDER.flatMap(theme=>{
  const keys=wordKeys({theme}),size=theme==='space'?6:5;
  return Array.from({length:Math.ceil(keys.length/size)},(_,i)=>Object.freeze({id:`${theme}-${i+1}`,theme,part:i+1,title:`${THEMES[theme].label} ${i+1}`,keys:Object.freeze(keys.slice(i*size,(i+1)*size))}));
}));
export const getLevel=id=>LEVELS.find(level=>level.id===id);
export function shuffled(items,random=Math.random){
  const out=[...items];for(let i=out.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[out[i],out[j]]=[out[j],out[i]];}return out;
}
export function levelPlan(id,previous=[],random=Math.random){
  if(id==='random'){
    const all=Object.keys(VOCABULARY),fresh=all.filter(key=>!previous.includes(key));
    return {id,title:'隨機混合關',keys:shuffled(fresh.length>=6?fresh:all,random).slice(0,6)};
  }
  const level=getLevel(id);if(!level)throw new RangeError('Unknown level');
  let keys=shuffled(level.keys,random);
  if(previous.length===keys.length&&keys.every((key,i)=>key===previous[i]))keys=[...keys.slice(1),keys[0]];
  return {id,title:level.title,keys};
}
export function nextLevelId(id){const index=LEVELS.findIndex(level=>level.id===id);return index>=0&&index<LEVELS.length-1?LEVELS[index+1].id:null;}
export function newCampaign(){return {version:1,lastLevelId:LEVELS[0].id,completed:{}};}
export function loadCampaign(raw){
  try{
    const value=JSON.parse(raw),clean=newCampaign();if(value?.version!==1)return clean;
    if(value.lastLevelId==='random'||getLevel(value.lastLevelId))clean.lastLevelId=value.lastLevelId;
    for(const id of [...LEVELS.map(l=>l.id),'random']){const count=value.completed?.[id];if(Number.isSafeInteger(count)&&count>0)clean.completed[id]=Math.min(count,1000000);}
    return clean;
  }catch{return newCampaign();}
}
export function completeLevel(campaign,id){
  if(id!=='random'&&!getLevel(id))return campaign;
  campaign.completed[id]=(campaign.completed[id]||0)+1;campaign.lastLevelId=id;return campaign;
}
