
import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source = readFileSync(new URL('../content.js',import.meta.url),'utf8');
const start = source.indexOf('  function isOwnContent(');
const end = source.indexOf('  function visible(',start);
const {read} = vm.runInNewContext(source.slice(start,end) + '\n({read});',{URL,location:{href:'https://x.com/home'}});
// Minimal DOM fixture implements the same ancestor semantics as Element.closest.
class Element {
  constructor(tag, attrs={}, parent=null) {this.tagName=tag.toUpperCase();this.attrs=attrs;this.parentElement=parent;this.children=[];parent?.children.push(this);}
  getAttribute(key){return this.attrs[key] ?? null;}
  get href(){return new URL(this.attrs.href,'https://x.com').href;}
  closest(selector){for(let n=this;n;n=n.parentElement){if(selector==='article' && n.tagName==='ARTICLE')return n;}return null;}
  querySelectorAll(selector){
    const all=this.children.flatMap(child=>[child,...child.querySelectorAll('*')]);
    return all.filter(n=>selector==='*' || (selector==='time' && n.tagName==='TIME') || (selector==='a[href*="/status/"]' && n.tagName==='A' && n.attrs.href?.includes('/status/')) || (selector==='[data-testid="tweetText"]' && n.attrs['data-testid']==='tweetText'));
  }
  querySelector(selector){return this.querySelectorAll(selector)[0] || null;}
}
function fixture(parent=null,handle='alice',id='123'){
  const article=new Element('article',{'role':'article'},parent);
  const header=new Element('div',{},article);
  const anchor=new Element('a',{href:'/'+handle+'/status/'+id,role:'link'},header);
  new Element('time',{},anchor);
  const text=new Element('div',{'data-testid':'tweetText'},article);text.innerText='A real text reply.';
  return {article,anchor,text};
}
test('ordinary timestamp role=link does not suppress tweet text',()=>{
  const {article}=fixture();
  assert.equal(read(article)?.handle,'alice');
  assert.equal(read(article)?.text,'A real text reply.');
});
test('detail replies with their own timestamps are readable',()=>{
  const timeline=new Element('section');
  fixture(timeline,'author','1');
  const reply=fixture(timeline,'reply_author','2');
  assert.equal(read(reply.article)?.id,'2');
});
test('role=link above article does not suppress content',()=>{
  const outer=new Element('div',{role:'link'});
  assert.equal(read(fixture(outer).article)?.id,'123');
});
test('quote card cannot replace author text or identity',()=>{
  const {article,text}=fixture();
  const quote=new Element('div',{role:'link'},article);
  const anchor=new Element('a',{role:'link',href:'/quoted/status/999'},quote);
  new Element('time',{},anchor);
  const quoteText=new Element('div',{'data-testid':'tweetText'},quote);quoteText.innerText='Quoted content';
  assert.equal(read(article)?.handle,'alice');
  assert.equal(read(article)?.text,text.innerText);
  text.innerText='';
  assert.equal(read(article),null);
});
test('absolute status links and links without time are accepted',()=>{
  const {article,anchor}=fixture();
  anchor.attrs.href='https://x.com/alice/status/123';
  anchor.children=[];
  assert.equal(read(article)?.id,'123');
});
