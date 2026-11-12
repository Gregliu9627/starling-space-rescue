import { VOCABULARY } from './vocabulary.js?v=4';
import { normalizeSettings } from './settings.js?v=4';

export function wordMission(key,settings){
  if(!Object.hasOwn(VOCABULARY,key))throw new RangeError('Unknown flight word');
  return {kind:'vocab',section:0,key,text:'Find the word!',hint:`找出「${VOCABULARY[key].zh}」的英文，移動飛船瞄準詞卡`,goal:normalizeSettings(settings).targetHits};
}
