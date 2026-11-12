import { normalizeSettings } from './settings.js?v=5';
export const COLORS = {red:'#ff7d7b',blue:'#75c9fa',green:'#b5eb8c'};
export const WORDS = {
  stars:{en:'three stars',zh:'三颗星星'},red:{en:'red',zh:'红色'},blue:{en:'blue',zh:'蓝色'},green:{en:'green',zh:'绿色'},
  behind:{en:'behind',zh:'在……后面'},front:{en:'in front of',zh:'在……前面'}
};
export const MISSIONS = [
  {kind:'collect',section:0,key:'stars',text:'Collect three stars!',hint:'飞过去，收集三颗能量星',goal:3},
  {kind:'color',section:1,key:'red',text:'Shoot the red drones!',hint:'移动飞船，瞄准红色无人机',goal:2},
  {kind:'color',section:1,key:'blue',text:'Shoot the blue drones!',hint:'仔细听，瞄准这次的目标',goal:2},
  {kind:'position',section:2,key:'behind',text:'Rescue the robot behind the rock!',hint:'用激光点亮机器人下方的救援光环',goal:1},
  {kind:'position',section:2,key:'front',text:'Rescue the robot in front of the rock!',hint:'用激光点亮正确的救援光环',goal:1},
  {kind:'boss',section:3,key:'green',text:'Hit the green energy ball!',hint:'击中指定颜色的能量球，解除守卫护盾',goal:1},
  {kind:'boss',section:3,key:'red',text:'Hit the red energy ball!',hint:'听清颜色，再瞄准能量球',goal:1},
  {kind:'boss',section:3,key:'blue',text:'Hit the blue energy ball!',hint:'最后一层护盾，加油！',goal:1}
];
export function configuredMission(index,settings){
  const base=MISSIONS[index];
  if(!base)throw new RangeError('Unknown mission');
  const goal=['color','boss'].includes(base.kind)?normalizeSettings(settings).targetHits:base.goal;
  return {...base,goal};
}
export function evaluateAnswer(mission, answer) {
  if(mission.kind==='collect') return answer==='star';
  return answer===mission.key;
}
export function newProgress(){return {version:1,runs:0,records:{}};}
export function loadProgress(raw){
  try{
    const data=JSON.parse(raw);
    if(data?.version!==1||typeof data.records!=='object'||!data.records||Array.isArray(data.records))return newProgress();
    const clean=newProgress();clean.runs=safeNumber(data.runs);
    for(const key of Object.keys(WORDS)){
      const item=data.records[key];if(!item||typeof item!=='object')continue;
      clean.records[key]={completed:safeNumber(item.completed),firstTry:safeNumber(item.firstTry),mistakes:safeNumber(item.mistakes),replays:safeNumber(item.replays)};
    }
    return clean;
  }catch{return newProgress();}
}
function safeNumber(value){return Number.isSafeInteger(value)&&value>=0?Math.min(value,1e6):0;}
export function recordTask(progress,key,{mistakes=0,replays=0}={}){
  if(!Object.hasOwn(WORDS,key))return progress;
  const record=progress.records[key]??{completed:0,firstTry:0,mistakes:0,replays:0};
  progress.records[key]={completed:record.completed+1,firstTry:record.firstTry+(mistakes===0?1:0),mistakes:record.mistakes+mistakes,replays:record.replays+replays};
  return progress;
}
