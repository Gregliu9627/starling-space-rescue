export const SETTINGS_KEY='starling-difficulty-v1';
export const PRESETS=Object.freeze({
  training:{label:'练习',description:'熟悉操作，轻松起飞',meteorSpeed:1,meteorCount:1,targetHits:2},
  adventure:{label:'探险',description:'更多目标，更有挑战',meteorSpeed:1.5,meteorCount:3,targetHits:6},
  ace:{label:'王牌',description:'密集陨石，考验走位',meteorSpeed:2.25,meteorCount:5,targetHits:12}
});
export const DEFAULT_SETTINGS=Object.freeze({meteorSpeed:1.5,meteorCount:3,targetHits:6});
export const SETTING_LIMITS=Object.freeze({meteorSpeed:{min:.5,max:3,step:.25},meteorCount:{min:1,max:6,step:1},targetHits:{min:2,max:20,step:1}});
export function normalizeSettings(input){
  const value=input&&typeof input==='object'&&!Array.isArray(input)?input:{};
  return Object.fromEntries(Object.entries(SETTING_LIMITS).map(([key,{min,max,step}])=>{
    const raw=typeof value[key]==='number'&&Number.isFinite(value[key])?value[key]:DEFAULT_SETTINGS[key];
    return [key,Math.round((Math.min(max,Math.max(min,raw))-min)/step)*step+min];
  }));
}
export function loadSettings(raw){try{return normalizeSettings(JSON.parse(raw));}catch{return {...DEFAULT_SETTINGS};}}
export function presetName(settings){return Object.values(PRESETS).find(p=>Object.keys(DEFAULT_SETTINGS).every(k=>p[k]===settings[k]))?.label??'自定义';}
export function settingsSummary(settings){return `速度 ${settings.meteorSpeed}× · 每波 ${settings.meteorCount} 颗 · 每项命中 ${settings.targetHits} 次`;}
export function hazardWave(settings,isBoss=false){
  const s=normalizeSettings(settings);
  return {count:s.meteorCount,interval:isBoss?1.9:3.1,baseSpeed:isBoss?105:65,speed:(isBoss?105:65)*s.meteorSpeed};
}
