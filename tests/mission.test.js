import test from 'node:test';
import assert from 'node:assert/strict';
import { MISSIONS, evaluateAnswer, recordTask, newProgress, loadProgress } from '../mission.js';

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
