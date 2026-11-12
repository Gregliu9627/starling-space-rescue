import { VOCABULARY, readingChoices } from './vocabulary.js?v=5';
import { normalizeSettings } from './settings.js?v=5';
import { shuffled } from './levels.js?v=5';

export function wordMission(key,settings){
  if(!Object.hasOwn(VOCABULARY,key))throw new RangeError('Unknown flight word');
  return {kind:'vocab',section:0,key,text:'Find the word!',hint:`找出「${VOCABULARY[key].zh}」的英文，移動飛船瞄準詞卡`,goal:normalizeSettings(settings).targetHits};
}

// Keep targets inside this level, and replace both the lane and a distractor
// after a successful hit. A tiny custom library selection gets theme fallbacks.
export function flightTargets(key,pool,previous=[],random=Math.random){
  if(!Object.hasOwn(VOCABULARY,key))throw new RangeError('Unknown flight word');
  let others=[...new Set(pool)].filter(k=>k!==key&&Object.hasOwn(VOCABULARY,k)&&VOCABULARY[k].zh!==VOCABULARY[key].zh);
  if(others.length<2)others=[...new Set([...others,...readingChoices(key,random).filter(k=>k!==key)])];
  let distractors=shuffled(others,random).slice(0,2);
  const previousOthers=previous.filter(t=>t.key!==key).map(t=>t.key);
  if(others.length>2&&distractors.every(k=>previousOthers.includes(k))){const fresh=shuffled(others.filter(k=>!previousOthers.includes(k)),random);distractors[1]=fresh[0];}
  const choices=shuffled([key,...distractors],random),oldSlot=previous.find(t=>t.key===key)?.slot;
  if(choices.indexOf(key)===oldSlot){const swap=(oldSlot+1+Math.floor(random()*2))%3;[choices[oldSlot],choices[swap]]=[choices[swap],choices[oldSlot]];}
  return choices.map((target,slot)=>({key:target,slot,active:true}));
}
