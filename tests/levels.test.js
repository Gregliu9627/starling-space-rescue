import test from 'node:test';
import assert from 'node:assert/strict';
import { VOCABULARY } from '../vocabulary.js';
import { LEVELS, getLevel, levelPlan, nextLevelId, newCampaign, loadCampaign, completeLevel } from '../levels.js';
import { flightTargets, wordMission } from '../word-flight.js';

test('all 186 words are shootable across 37 distinct selectable levels',()=>{
  assert.equal(LEVELS.length,37);
  const covered=LEVELS.flatMap(l=>l.keys);
  assert.equal(covered.length,186);assert.equal(new Set(covered).size,186);
  assert.deepEqual(new Set(covered),new Set(Object.keys(VOCABULARY)));
  for(const level of LEVELS){
    assert.ok(level.keys.length>=5&&level.keys.length<=6);
    for(const key of level.keys){
      const mission=wordMission(key,{targetHits:12});assert.equal(mission.key,key);assert.equal(mission.goal,12);
      const targets=flightTargets(key,level.keys);assert.equal(targets.length,3);assert.equal(new Set(targets.map(t=>t.key)).size,3);
      assert.ok(targets.some(t=>t.key===key));assert.ok(targets.every(t=>level.keys.includes(t.key)));
    }
  }
});

test('next levels use different word sets; replay changes order without changing the selected set',()=>{
  for(let i=0;i<LEVELS.length-1;i++){
    assert.equal(nextLevelId(LEVELS[i].id),LEVELS[i+1].id);
    assert.ok(LEVELS[i+1].keys.every(k=>!LEVELS[i].keys.includes(k)));
  }
  assert.equal(nextLevelId(LEVELS.at(-1).id),null);assert.equal(nextLevelId('random'),null);
  const first=levelPlan('animals-1',[],()=>.9999),again=levelPlan('animals-1',first.keys,()=>.9999);
  assert.notDeepEqual(first.keys,again.keys);assert.deepEqual(new Set(first.keys),new Set(again.keys));
  assert.throws(()=>levelPlan('missing'),RangeError);
});

test('random levels and rerolls choose unique words and avoid the previous combination',()=>{
  const a=levelPlan('random',[],()=>.5),b=levelPlan('random',a.keys,()=>.5);
  assert.equal(a.keys.length,6);assert.equal(new Set(a.keys).size,6);assert.ok(b.keys.every(k=>!a.keys.includes(k)));
});

test('each hit changes the answer lane and at least one distractor, even for deterministic random input',()=>{
  for(const r of [0,.5,.9999])for(const level of LEVELS){
    for(const key of level.keys){
      let previous=flightTargets(key,level.keys,[],()=>r);
      for(let i=0;i<5;i++){
        const next=flightTargets(key,level.keys,previous,()=>r);
        assert.notEqual(next.find(t=>t.key===key).slot,previous.find(t=>t.key===key).slot);
        assert.notDeepEqual(new Set(next.map(t=>t.key)),new Set(previous.map(t=>t.key)));
        assert.ok(next.every(t=>level.keys.includes(t.key)));previous=next;
      }
    }
  }
  assert.equal(flightTargets('because',['because']).length,3);
});

test('level history validates storage and records only valid completed levels',()=>{
  for(const raw of [null,'bad','null','[]','{"version":9}'])assert.deepEqual(loadCampaign(raw),newCampaign());
  const campaign=newCampaign();completeLevel(campaign,'sentence-1');completeLevel(campaign,'sentence-1');completeLevel(campaign,'random');completeLevel(campaign,'bad');
  assert.equal(campaign.completed['sentence-1'],2);assert.equal(campaign.completed.random,1);assert.equal(campaign.completed.bad,undefined);
  assert.deepEqual(loadCampaign(JSON.stringify(campaign)),campaign);
  const clean=loadCampaign('{"version":1,"lastLevelId":"bad","completed":{"animals-1":-2,"food-1":2.5,"sentence-1":3,"bad":5}}');
  assert.equal(clean.lastLevelId,LEVELS[0].id);assert.deepEqual(clean.completed,{'sentence-1':3});
  assert.ok(getLevel(clean.lastLevelId));
});
