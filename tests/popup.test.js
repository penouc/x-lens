import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../content.js',import.meta.url),'utf8');
const start=source.indexOf('  function canPrompt('),end=source.indexOf('  function closePrompt(',start);
const canPrompt=vm.runInNewContext(source.slice(start,end)+'\ncanPrompt;');
const config={enabled:true,autoBlockPrompt:true};
test('popup is opt-in and requires detection enabled',()=>{
  assert.equal(canPrompt({enabled:true},{isSlop:true},false,false,40000,0),false);
  assert.equal(canPrompt({...config,enabled:false},{isSlop:true},false,false,40000,0),false);
  assert.equal(canPrompt(config,{isSlop:true},false,false,40000,0),true);
});
test('AI-only and ad-only results never trigger automatic block prompts',()=>{
  for(const result of [{isAI:true},{isAd:true},{isAI:true,isAd:true,isSlop:false}])
    assert.equal(canPrompt(config,result,false,false,40000,0),false);
});
test('one account per page, one open popup, and 30 second cooldown',()=>{
  assert.equal(canPrompt(config,{isSlop:true},true,false,40000,0),false);
  assert.equal(canPrompt(config,{isSlop:true},false,true,40000,0),false);
  assert.equal(canPrompt(config,{isSlop:true},false,false,29999,0),false);
  assert.equal(canPrompt(config,{isSlop:true},false,false,30000,0),true);
});
