import test from 'node:test';
import assert from 'node:assert/strict';
import { MISSIONS, configuredMission, evaluateAnswer, recordTask, newProgress, loadProgress } from '../mission.js';
import { DEFAULT_SETTINGS, PRESETS, normalizeSettings, loadSettings, hazardWave, presetName } from '../settings.js';

test('each mission accepts only its intended target',()=>{
  for(const mission of MISSIONS){
    assert.equal(evaluateAnswer(mission,mission.kind==='collect'?'star':mission.key),true);
    for(const distractor of ['red','green','blue','front','behind','moon']){
      if(distractor!==mission.key)assert.equal(evaluateAnswer(mission,distractor),false);
    }
  }
});
test('mistakes and replays stay separate from independent task completion',()=>{
  const progress=newProgress();
  recordTask(progress,'red',{mistakes:2,replays:1});
  recordTask(progress,'red',{mistakes:0,replays:3});
  assert.deepEqual(progress.records.red,{completed:2,firstTry:1,mistakes:2,replays:4});
  assert.deepEqual(loadProgress(JSON.stringify(progress)),progress);
});
test('corrupt and untrusted saved values do not break progress or become markup',()=>{
  for(const bad of [null,'{broken','[]','null','{"version":2}', '{"version":1,"records":null}'])assert.deepEqual(loadProgress(bad),newProgress());
  const clean=loadProgress('{"version":1,"runs":"<script>","records":{"red":{"completed":-2,"firstTry":"hello","mistakes":3,"replays":4},"arbitrary":{"completed":1}}}');
  assert.equal(clean.runs,0);assert.deepEqual(clean.records.red,{completed:0,firstTry:0,mistakes:3,replays:4});assert.equal(clean.records.arbitrary,undefined);
});

test('shooting quotas scale to 20 without changing collection or rescue tasks',()=>{
  for(const targetHits of [2,6,12,20]){
    for(let i=0;i<MISSIONS.length;i++){
      const base=MISSIONS[i],active=configuredMission(i,{...DEFAULT_SETTINGS,targetHits});
      assert.equal(active.goal,['color','boss'].includes(base.kind)?targetHits:base.goal);
      assert.equal(evaluateAnswer(active,base.kind==='collect'?'star':base.key),true);
    }
  }
  assert.equal(MISSIONS[1].goal,2);
  assert.equal(MISSIONS[5].goal,1);
  const inProgress=configuredMission(1,{targetHits:6});
  const next=configuredMission(2,{targetHits:20});
  assert.equal(inProgress.goal,6);assert.equal(next.goal,20);
});

test('saved settings are bounded and invalid fields recover independently',()=>{
  for(const bad of ['broken','null','[]','true'])assert.deepEqual(loadSettings(bad),DEFAULT_SETTINGS);
  assert.deepEqual(normalizeSettings({meteorSpeed:Infinity,meteorCount:6,targetHits:'<script>'}),{meteorSpeed:1.5,meteorCount:6,targetHits:6});
  assert.deepEqual(normalizeSettings({meteorSpeed:99,meteorCount:-1,targetHits:99}),{meteorSpeed:3,meteorCount:1,targetHits:20});
  assert.deepEqual(normalizeSettings({meteorSpeed:.1,meteorCount:9,targetHits:0}),{meteorSpeed:.5,meteorCount:6,targetHits:2});
  assert.equal(normalizeSettings({meteorSpeed:1.37}).meteorSpeed,1.25);
  assert.deepEqual(loadSettings(JSON.stringify(PRESETS.ace)),{meteorSpeed:2.25,meteorCount:5,targetHits:12});
  assert.equal(presetName(DEFAULT_SETTINGS),'探险');
  assert.equal(presetName({meteorSpeed:.5,meteorCount:6,targetHits:20}),'自定义');
});

test('meteor speed and wave size are independent, including boss projectiles',()=>{
  const training=hazardWave(PRESETS.training),fast=hazardWave({...PRESETS.training,meteorSpeed:3}),dense=hazardWave({...PRESETS.training,meteorCount:6});
  assert.equal(fast.speed,training.speed*3);assert.equal(fast.count,training.count);
  assert.equal(dense.count,6);assert.equal(dense.speed,training.speed);assert.equal(dense.interval,training.interval);
  const boss=hazardWave({meteorSpeed:2,meteorCount:4},true);
  assert.equal(boss.count,4);assert.equal(boss.speed,210);
});
