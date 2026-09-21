
import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {requestBody, parseAnswers, flagged} from '../classifier.js';
function harness(data, fetchImpl) {
  let listener;
  const context = {requestBody,parseAnswers,flagged,Map,Promise,Date,Number,Error,AbortSignal,
    fetch:fetchImpl,
    chrome:{storage:{local:{
      setAccessLevel:async()=>{},
      get:async()=>data,
      remove:async key=>{delete data[key];},
      set:async patch=>Object.assign(data,patch)
    },onChanged:{addListener(){}}},runtime:{getURL:()=> 'chrome-extension://test/', onMessage:{addListener(fn){listener=fn;}}}}
  };
  vm.runInNewContext(readFileSync(new URL('../background.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,''),context);
  return (message,sender={tab:{id:1},url:'https://x.com/home'}) => new Promise(resolve=>listener(message,sender,resolve));
}
test('disabled detection explains why without calling API',async()=>{
  const send=harness({apiKey:'dummy',enabled:false},()=>{throw Error('must not fetch');});
  const result=await send({type:'classify',text:'hello'});
  assert.equal(result.skip,true); assert.match(result.reason,/启用/);
});
test('configuration status never exposes saved key',async()=>{
  const send=harness({apiKey:'secret-test-value',enabled:true});
  const result=await send({type:'config'});
  assert.equal(result.configured,true); assert.equal(result.enabled,true);
  assert.equal(JSON.stringify(result).includes('secret'),false);
});
test('connection test validates real response shape',async()=>{
  const send=harness({apiKey:'dummy'},async()=>({ok:true,json:async()=>({answers:{ai:{noul:.2},junk:{noul:.1},ad:{noul:.1}}})}));
  const result=await send({type:'testConnection'},{url:'chrome-extension://test/settings.html'});
  assert.equal(result.ok,true);
});
test('connection test returns HTTP failure to UI',async()=>{
  const send=harness({apiKey:'dummy'},async()=>({ok:false,status:401}));
  const result=await send({type:'testConnection'},{url:'chrome-extension://test/settings.html'});
  assert.match(result.error,/401/);
});


test('new default ignores legacy 85 percent and returns AI-only label',async()=>{
  const send=harness({apiKey:'dummy',enabled:true,threshold:.85},async()=>({ok:true,json:async()=>({answers:{ai:{noul:.7},junk:{noul:.2},ad:{noul:.1}}})}));
  const result=await send({type:'classify',text:'a reply'});
  assert.equal(result.isAI,true); assert.equal(result.isSlop,false); assert.equal(result.flagged,true);
});
test('human spam gets slop independently of AI',async()=>{
  const send=harness({apiKey:'dummy',enabled:true},async()=>({ok:true,json:async()=>({answers:{ai:{noul:.1},junk:{noul:.75},ad:{noul:.1}}})}));
  const result=await send({type:'classify',text:'another reply'});
  assert.equal(result.isAI,false); assert.equal(result.isSlop,true);
});
test('saved new threshold is respected',async()=>{
  const send=harness({apiKey:'dummy',enabled:true,labelThreshold:.9},async()=>({ok:true,json:async()=>({answers:{ai:{noul:.7},junk:{noul:.75},ad:{noul:.1}}})}));
  const result=await send({type:'classify',text:'a post'});
  assert.equal(result.isAI,false); assert.equal(result.isSlop,false); assert.equal(result.flagged,false);
});


test('advertising alone receives a label without AI or slop',async()=>{
  const send=harness({apiKey:'dummy',enabled:true},async()=>({ok:true,json:async()=>({answers:{ai:{noul:.1},junk:{noul:.2},ad:{noul:.9}}})}));
  const result=await send({type:'classify',text:'Try our product with a discount'});
  assert.equal(result.isAd,true);assert.equal(result.isAI,false);assert.equal(result.isSlop,false);assert.equal(result.flagged,true);
});
test('missing advertising score fails safely instead of treating it as zero',async()=>{
  const send=harness({apiKey:'dummy',enabled:true},async()=>({ok:true,json:async()=>({answers:{ai:{noul:.1},junk:{noul:.2}}})}));
  const result=await send({type:'classify',text:'text'});
  assert.match(result.error,/评分/);assert.equal(result.flagged,undefined);
});
