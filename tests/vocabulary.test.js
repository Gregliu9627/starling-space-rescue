import test from 'node:test';
import assert from 'node:assert/strict';
import { VOCABULARY, highlightInstruction, readingChoices, newReading, loadReading, recordReading } from '../vocabulary.js';
import { loadProgress } from '../mission.js';
import { loadSettings } from '../settings.js';

test('highlight the complete word or phrase, escape markup, support plural stars',()=>{
  assert.equal(highlightInstruction('Red redder <blue>', 'red'),'<mark class="vocab-highlight">Red</mark> redder &lt;blue&gt;');
  assert.equal((highlightInstruction('star and three stars', 'stars').match(/<mark/g)||[]).length,2);
  assert.equal(highlightInstruction('Find the robot in front of the rock.', 'front'),'Find the robot <mark class="vocab-highlight">in front of</mark> the rock.');
  assert.equal(highlightInstruction('<img src="x">', 'unknown'),'&lt;img src=&quot;x&quot;&gt;');
});

test('every question offers one correct word and two distinct distractors',()=>{
  for(const key of Object.keys(VOCABULARY))for(const value of [0,.2,.5,.9,.999]){
    const choices=readingChoices(key,()=>value);
    assert.equal(choices.length,3);assert.equal(new Set(choices).size,3);
    assert.ok(choices.includes(key));assert.ok(choices.every(k=>VOCABULARY[k]));
    if(key==='behind')assert.ok(choices.includes('front'));
    if(key==='front')assert.ok(choices.includes('behind'));
  }
  assert.throws(()=>readingChoices('unknown'),RangeError);
});

test('reading records distinguish independent answers from retries and survive reload',()=>{
  const reading=newReading();recordReading(reading,'red',0);recordReading(reading,'red',2);recordReading(reading,'behind',1);
  assert.deepEqual(reading.records.red,{completed:2,firstTry:1,mistakes:2});
  assert.deepEqual(reading.records.behind,{completed:1,firstTry:0,mistakes:1});
  assert.deepEqual(loadReading(JSON.stringify(reading)),reading);
  const before=structuredClone(reading);recordReading(reading,'unknown',0);assert.deepEqual(reading,before);
});

test('damaged storage is recoverable and unrelated old learning history stays valid',()=>{
  for(const raw of [null,'not json','null','[]','{"version":2,"records":{}}','{"version":1,"records":[]}'])assert.deepEqual(loadReading(raw),newReading());
  const data=loadReading(JSON.stringify({version:1,sessions:-1,records:{red:{completed:2,firstTry:99,mistakes:-5},blue:{completed:1.3},unknown:{completed:5}}}));
  assert.equal(data.sessions,0);assert.deepEqual(data.records.red,{completed:2,firstTry:2,mistakes:0});assert.equal(data.records.blue.completed,0);assert.equal(data.records.unknown,undefined);
  assert.equal(loadProgress(JSON.stringify({version:1,runs:2,records:{red:{completed:2,firstTry:1,mistakes:1,replays:2}}})).runs,2);
  assert.equal(loadSettings(JSON.stringify({version:1,meteorSpeed:2,meteorCount:5,targetHits:12})).targetHits,12);
});
