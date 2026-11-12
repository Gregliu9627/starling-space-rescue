import test from 'node:test';
import assert from 'node:assert/strict';
import { VOCABULARY, THEMES, CORE_KEYS, highlightInstruction, readingChoices, newReading, loadReading, recordReading, wordKeys, practiceKeys, picture } from '../vocabulary.js';
import { wordMission } from '../word-flight.js';
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
  assert.deepEqual(reading.records.red,{completed:2,firstTry:1,mistakes:2,lastFirstTry:false});
  assert.deepEqual(reading.records.behind,{completed:1,firstTry:0,mistakes:1,lastFirstTry:false});
  assert.deepEqual(loadReading(JSON.stringify(reading)),reading);
  const before=structuredClone(reading);recordReading(reading,'unknown',0);assert.deepEqual(reading,before);
});

test('expanded bank has 180 unique contextual entries and preserves all original IDs',()=>{
  assert.equal(Object.keys(VOCABULARY).length,186);assert.equal(Object.keys(THEMES).length,13);
  assert.equal(new Set(Object.values(VOCABULARY).map(w=>w.word.toLowerCase())).size,186);
  for(const theme of Object.keys(THEMES))assert.equal(wordKeys({theme}).length,theme==='space'?6:15);
  for(const [key,w] of Object.entries(VOCABULARY)){
    assert.ok(THEMES[w.theme]);assert.ok(['starter','extend'].includes(w.level));
    assert.ok(w.zh&&w.example&&w.exampleZh);assert.ok(highlightInstruction(w.example,key).includes('<mark'),key+' appears in its example');
    assert.ok(picture(key).length>0,key+' has a visible picture or text-card design');
    if(w.kind==='emoji')assert.ok(w.emoji);if(w.kind==='card')assert.equal(w.emoji,'');
  }
  assert.deepEqual(wordKeys({theme:'space'}),CORE_KEYS);
  assert.ok(wordKeys({search:'港鐵'}).includes('mtr'));assert.deepEqual(wordKeys({search:'BECAUSE'}),['because']);
  assert.ok(wordKeys({level:'starter'}).every(k=>VOCABULARY[k].level==='starter'));
  assert.equal(wordKeys({search:'not_a_real_word'}).length,0);
});

test('small sessions rotate new words and review mistakes until a successful retry session',()=>{
  const r=newReading(),pool=wordKeys({theme:'animals'});
  const first=practiceKeys(pool,r,6,()=>.5);assert.equal(first.length,6);assert.equal(new Set(first).size,6);
  first.forEach(k=>recordReading(r,k,0));assert.ok(practiceKeys(pool,r,6,()=>.5).every(k=>!first.includes(k)));
  for(const k of pool)if(!r.records[k])recordReading(r,k,0);
  recordReading(r,'cat',1);assert.equal(practiceKeys(pool,r,1,()=>.5)[0],'cat');
  recordReading(r,'cat',0);assert.notEqual(practiceKeys(pool,r,1,()=>.5)[0],'cat');
  assert.deepEqual(practiceKeys(['because','because','missing'],r),['because']);assert.deepEqual(practiceKeys([],r),[]);
});

test('flight missions use selected words and settings, with separate persistent practice records',()=>{
  const old=loadReading(JSON.stringify({version:1,sessions:2,records:{red:{completed:2,firstTry:1,mistakes:1}}}));
  assert.equal(old.sessions,2);assert.equal(old.records.red.firstTry,1);assert.deepEqual(old.flightRecords,{});
  const m=wordMission('because',{targetHits:12});assert.equal(m.goal,12);assert.equal(m.key,'because');assert.ok(m.hint.includes('因為'));
  assert.throws(()=>wordMission('missing',{}),RangeError);
  recordReading(old,'because',1,'flight');assert.equal(old.records.because,undefined);assert.equal(old.flightRecords.because.completed,1);
  assert.deepEqual(loadReading(JSON.stringify(old)),old);
});

test('damaged storage is recoverable and unrelated old learning history stays valid',()=>{
  for(const raw of [null,'not json','null','[]','{"version":2,"records":{}}','{"version":1,"records":[]}'])assert.deepEqual(loadReading(raw),newReading());
  const data=loadReading(JSON.stringify({version:1,sessions:-1,records:{red:{completed:2,firstTry:99,mistakes:-5},blue:{completed:1.3},unknown:{completed:5}}}));
  assert.equal(data.sessions,0);assert.deepEqual(data.records.red,{completed:2,firstTry:2,mistakes:0});assert.equal(data.records.blue.completed,0);assert.equal(data.records.unknown,undefined);
  assert.equal(loadProgress(JSON.stringify({version:1,runs:2,records:{red:{completed:2,firstTry:1,mistakes:1,replays:2}}})).runs,2);
  assert.equal(loadSettings(JSON.stringify({version:1,meteorSpeed:2,meteorCount:5,targetHits:12})).targetHits,12);
});
