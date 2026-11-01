import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../approved-runtime/native-adapter.js',import.meta.url),'utf8');
const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve()};
function harness(){
 let sequence=0,now=0;const calls=[],timers=new Map(),events=new Map();
 const context={crypto:{randomUUID:()=>String(++sequence)},Map,Set,Promise,Error,Uint8Array,Blob,btoa:value=>Buffer.from(value,'binary').toString('base64'),document:{documentElement:{lang:'ar'},querySelector:()=>null},MutationObserver:class{observe(){}},NativeHost:{},setTimeout(fn,ms){const id=++sequence;timers.set(id,{at:now+ms,fn});return id},clearTimeout:id=>timers.delete(id),addEventListener(name,fn){events.set(name,fn)}};
 for(const method of ['cloudBackup','cloudBackupBegin','cloudBackupAppend','cloudBackupFinish','cloudBackupCancel'])context.NativeHost[method]=(...args)=>calls.push({method,args});
 context.window=context;vm.createContext(context);vm.runInContext(source,context);
 return {context,calls,timers,files:context.NativeFiles,reply:(id,value)=>context.__nativeResult(id,value),event:name=>events.get(name)?.(),async advance(ms){const until=now+ms;while(true){const next=[...timers.entries()].sort((a,b)=>a[1].at-b[1].at)[0];if(!next||next[1].at>until)break;timers.delete(next[0]);now=next[1].at;next[1].fn();await flush()}now=until;await flush()}};
}
const pending=promise=>{const result={status:'pending'};promise.then(value=>Object.assign(result,{status:'resolved',value}),error=>Object.assign(result,{status:'rejected',error}));return result};
const last=(h,name)=>h.calls.filter(c=>c.method===name).at(-1);
const context={shopId:'shop-fixture',ownerId:'owner-fixture'};

test('cloud command keeps structured failure code and its independent timeout',async()=>{
 const h=harness(),state=pending(h.files.cloudBackup('configure',{...context,consent:true})),call=last(h,'cloudBackup');
 assert.equal(call.args[1],'configure');assert.deepEqual(JSON.parse(call.args[2]),{...context,consent:true});h.reply(call.args[0],{error:'unavailable',code:'UPLOAD_DENIED',status:403,retryAt:42});await flush();assert.equal(state.error.code,'UPLOAD_DENIED');assert.equal(state.error.status,403);assert.equal(state.error.retryAt,42);assert.equal(h.timers.size,0);
});
test('staging waits for every chunk ACK and returns only after durable native finish',async()=>{
 const h=harness(),bytes=Buffer.alloc(100000);for(let i=0;i<bytes.length;i++)bytes[i]=i%251;const state=pending(h.files.stageCloudBackup(context,new Blob([bytes]),17)),begin=last(h,'cloudBackupBegin');
 const metadata=JSON.parse(begin.args[1]);assert.equal(metadata.localRevision,'17');assert.equal(metadata.sizeBytes,bytes.length);assert.equal(metadata.shopId,context.shopId);assert(!last(h,'cloudBackupAppend'));h.reply(begin.args[0],{accepted:true});await flush();
 const chunks=[];for(let i=0;i<3;i++){const chunk=last(h,'cloudBackupAppend');assert(chunk);assert.equal(h.calls.filter(c=>c.method==='cloudBackupAppend').length,i+1);chunks.push(Buffer.from(chunk.args[2],'base64'));assert.equal(chunk.args[1],begin.args[0]);assert(!last(h,'cloudBackupFinish'));h.reply(chunk.args[0],{accepted:true});await flush()}
 assert.deepEqual(Buffer.concat(chunks),bytes);assert.equal(state.status,'pending');h.reply(last(h,'cloudBackupFinish').args[0],{stagedRevision:'17',changesPending:true});await flush();assert.equal(state.status,'resolved');assert.equal(state.value.stagedRevision,'17');assert.equal(h.timers.size,0);assert(!last(h,'cloudBackupCancel'));
});
test('lost begin or chunk confirmation cancels the staging ID and never finishes',async()=>{
 for(const phase of ['begin','chunk']){const h=harness(),state=pending(h.files.stageCloudBackup(context,new Blob(['{}']),1)),begin=last(h,'cloudBackupBegin');if(phase==='chunk'){h.reply(begin.args[0],{accepted:true});await flush();assert(last(h,'cloudBackupAppend'))}await h.advance(30000);assert.equal(state.status,'rejected');assert.equal(state.error.code,'NATIVE_TIMEOUT');assert.equal(last(h,'cloudBackupCancel').args[0],begin.args[0]);assert(!last(h,'cloudBackupFinish'));assert.equal(h.timers.size,0)}
});
test('pagehide during file reading immediately cancels and cannot resume after pageshow',async()=>{
 const h=harness();let release;const data=new Promise(resolve=>release=resolve);class SlowBlob extends Blob{slice(){return {arrayBuffer:()=>data}}}
 const state=pending(h.files.stageCloudBackup(context,new SlowBlob(['{}']),1)),begin=last(h,'cloudBackupBegin');h.reply(begin.args[0],{accepted:true});await flush();h.event('pagehide');await flush();assert.equal(state.status,'rejected');assert.equal(state.error.code,'NATIVE_PAGE_HIDDEN');assert.equal(last(h,'cloudBackupCancel').args[0],begin.args[0]);h.event('pageshow');release(new Uint8Array([123,125]).buffer);await flush();assert(!last(h,'cloudBackupAppend'));assert(!last(h,'cloudBackupFinish'));assert.equal(h.timers.size,0);
});
test('oversize or non-Blob stage fails before creating a native transfer',async()=>{
 for(const blob of [new Blob([new Uint8Array(8*1024*1024+1)]),{size:2},new Blob(['x'])]){const h=harness(),state=pending(h.files.stageCloudBackup(context,blob,1));await flush();assert.equal(state.status,'rejected');assert.equal(state.error.code,'SNAPSHOT_TOO_LARGE');assert.equal(h.calls.length,0);assert.equal(h.timers.size,0)}
});
