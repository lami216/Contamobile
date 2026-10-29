import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../approved-runtime/native-adapter.js',import.meta.url),'utf8');
const flush=async()=>{for(let n=0;n<20;n++)await Promise.resolve()};
function harness(){
 let now=0,sequence=0;const timers=new Map(),events=new Map(),calls=[];
 const context={crypto:{randomUUID:()=>String(++sequence)},Map,Set,Promise,Error,Uint8Array,Blob,btoa:value=>Buffer.from(value,'binary').toString('base64'),document:{documentElement:{lang:'ar'},querySelector:()=>null},MutationObserver:class{observe(){}},NativeHost:{},setTimeout(fn,ms){const id=++sequence;timers.set(id,{at:now+ms,fn});return id},clearTimeout:id=>timers.delete(id),addEventListener(name,fn){events.set(name,fn)}};
 for(const method of ['activationStatus','scanBarcode','ownerRecovery','beginExport','appendExport','finishExport','openActivation','printDocument','language','theme'])context.NativeHost[method]=(...args)=>calls.push({method,args});
 context.window=context;vm.createContext(context);vm.runInContext(source,context);
 return {context,calls,timers,files:context.NativeFiles,reply:(id,result)=>context.__nativeResult(id,result),event:name=>events.get(name)?.(),async advance(ms){const until=now+ms;while(true){const next=[...timers.entries()].sort((a,b)=>a[1].at-b[1].at)[0];if(!next||next[1].at>until)break;timers.delete(next[0]);now=next[1].at;next[1].fn();await flush()}now=until;await flush()}};
}
const pending=promise=>{const result={status:'pending',value:null,error:null};promise.then(value=>{result.status='resolved';result.value=value},error=>{result.status='rejected';result.error=error});return result};
const latest=(h,method)=>h.calls.filter(c=>c.method===method).at(-1);

test('native success clears its deadline and preserves the existing return shape',async()=>{
 const h=harness(),state=pending(h.files.licenseStatus());assert.equal(h.timers.size,1);const call=latest(h,'activationStatus');h.reply(call.args[0],{valid:true,license:{licenseId:'synthetic'}});await flush();assert.equal(state.status,'resolved');assert.equal(state.value.valid,true);assert.equal(h.timers.size,0);await h.advance(60000);assert.equal(state.status,'resolved');
});
test('missing callback rejects after sixty seconds and an old callback cannot revive it',async()=>{
 const h=harness(),state=pending(h.files.scan()),id=latest(h,'scanBarcode').args[0];await h.advance(59999);assert.equal(state.status,'pending');await h.advance(1);assert.equal(state.status,'rejected');assert.equal(state.error.code,'NATIVE_TIMEOUT');assert.equal(h.timers.size,0);h.reply(id,{value:'late-scan'});await flush();assert.equal(state.status,'rejected');const retry=pending(h.files.scan());h.reply(latest(h,'scanBarcode').args[0],{value:'new-scan'});await flush();assert.equal(retry.value.value,'new-scan');
});
test('native structured error keeps retry metadata and clears the timer',async()=>{
 const h=harness(),state=pending(h.files.ownerRecovery('poll','synthetic'));const c=latest(h,'ownerRecovery');assert.deepEqual(c.args.slice(1),['poll','synthetic']);h.reply(c.args[0],{error:'synthetic rejection',retryAt:1234,permanent:true,status:403});await flush();assert.equal(state.status,'rejected');assert.equal(state.error.retryAt,1234);assert.equal(state.error.permanent,true);assert.equal(state.error.status,403);assert.equal(h.timers.size,0);
});
test('synchronous native exceptions reject immediately without stranded requests',async()=>{
 const h=harness();h.context.NativeHost.scanBarcode=()=>{throw Error('synthetic scan failure')};const state=pending(h.files.scan());await flush();assert.equal(state.status,'rejected');assert.match(state.error.message,/synthetic scan failure/);assert.equal(h.timers.size,0);
});
test('export preparation has a thirty-second deadline and never proceeds after timeout',async()=>{
 const h=harness(),state=pending(h.files.saveBlob('synthetic.json',new Blob(['{}'],{type:'application/json'})));await h.advance(29999);assert.equal(state.status,'pending');await h.advance(1);assert.equal(state.status,'rejected');assert.equal(state.error.code,'NATIVE_TIMEOUT');assert.match(state.error.message,/لم يتأكد حفظ الملف/);assert.equal(h.calls.filter(c=>c.method==='appendExport'||c.method==='finishExport').length,0);assert.equal(h.timers.size,0);
});
test('export resolves only after the system picker confirms saved, with intact chunk bytes',async()=>{
 const h=harness(),bytes=Buffer.alloc(100000);for(let i=0;i<bytes.length;i++)bytes[i]=i%251;const state=pending(h.files.saveBlob('synthetic.json',new Blob([bytes],{type:'application/json'}))),id=latest(h,'beginExport').args[0];h.reply(id,{ready:true});await flush();assert.equal(state.status,'pending');assert(latest(h,'finishExport'));const chunks=h.calls.filter(c=>c.method==='appendExport');assert.equal(chunks.length,3);assert.deepEqual(Buffer.concat(chunks.map(c=>Buffer.from(c.args[1],'base64'))),bytes);assert.equal(h.timers.size,1);await h.advance(599999);assert.equal(state.status,'pending');h.reply(id,{saved:true});await flush();assert.equal(state.status,'resolved');assert.equal(state.value.saved,true);assert.equal(h.timers.size,0);
});
test('a lost final picker callback rejects at ten minutes with an uncertainty message',async()=>{
 const h=harness(),state=pending(h.files.saveBlob('synthetic.json',new Blob(['{}']))),id=latest(h,'beginExport').args[0];h.reply(id,{ready:true});await flush();await h.advance(600000);assert.equal(state.status,'rejected');assert.equal(state.error.code,'NATIVE_TIMEOUT');assert.match(state.error.message,/تحقّق من المكان/);assert.doesNotMatch(state.error.message,/لم يُحفظ|لم يتم حفظ/);h.reply(id,{saved:true});await flush();assert.equal(state.status,'rejected');assert.equal(h.timers.size,0);
});
test('pagehide rejects outstanding scan and pageshow permits a fresh independent request',async()=>{
 const h=harness(),state=pending(h.files.scan()),id=latest(h,'scanBarcode').args[0];h.event('pagehide');await flush();assert.equal(state.status,'rejected');assert.equal(state.error.code,'NATIVE_PAGE_HIDDEN');assert.equal(h.timers.size,0);const hidden=pending(h.files.licenseStatus());await flush();assert.equal(hidden.status,'rejected');h.reply(id,{value:'late'});h.event('pageshow');const next=pending(h.files.licenseStatus());h.reply(latest(h,'activationStatus').args[0],{valid:true});await flush();assert.equal(next.status,'resolved');assert.equal(state.status,'rejected');
});
test('pagehide rejects the outstanding export and ignores later saved confirmation',async()=>{
 const h=harness(),state=pending(h.files.saveBlob('synthetic.json',new Blob(['{}']))),id=latest(h,'beginExport').args[0];h.reply(id,{ready:true});await flush();assert(latest(h,'finishExport'));h.event('pagehide');await flush();assert.equal(state.status,'rejected');assert.equal(state.error.code,'NATIVE_PAGE_HIDDEN');assert.match(state.error.message,/لم يتأكد حفظ الملف/);assert.equal(h.timers.size,0);h.reply(id,{saved:true});await flush();assert.equal(state.status,'rejected');
});
test('pagehide during chunk reading rejects immediately and never resumes an old transfer',async()=>{
 const h=harness();let release;const data=new Promise(resolve=>release=resolve),blob={size:4,type:'application/json',slice:()=>({arrayBuffer:()=>data})};const state=pending(h.files.saveBlob('synthetic.json',blob)),id=latest(h,'beginExport').args[0];h.reply(id,{ready:true});await flush();assert.equal(h.calls.filter(c=>c.method==='appendExport').length,0);h.event('pagehide');await flush();assert.equal(state.status,'rejected');h.event('pageshow');release(new Uint8Array([1,2,3,4]).buffer);await flush();assert.equal(h.calls.filter(c=>c.method==='appendExport'||c.method==='finishExport').length,0);assert.equal(h.timers.size,0);
});
test('chunk and finish exceptions reject the export without pending timers',async()=>{
 for(const method of ['appendExport','finishExport']){const h=harness();h.context.NativeHost[method]=()=>{throw Error('synthetic '+method)};const state=pending(h.files.saveBlob('synthetic.json',new Blob(['{}']))),id=latest(h,'beginExport').args[0];h.reply(id,{ready:true});await flush();assert.equal(state.status,'rejected');assert.match(state.error.message,new RegExp(method));assert.equal(h.timers.size,0);}
});
test('oversize export fails before invoking native storage',async()=>{
 const h=harness(),state=pending(h.files.saveBlob('synthetic.json',{size:64*1024*1024+1}));await flush();assert.equal(state.status,'rejected');assert.equal(h.calls.length,0);assert.equal(h.timers.size,0);
});
