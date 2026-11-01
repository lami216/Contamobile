import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../approved-runtime/native-adapter.js',import.meta.url),'utf8');
function harness(){
 let next=0;const calls=[],timers=new Map(),events=new Map();
 const scope={crypto:{randomUUID:()=>String(++next)},Map,Set,Promise,Error,Uint8Array,Blob,document:{documentElement:{lang:'ar'},querySelector:()=>null},MutationObserver:class{observe(){}},NativeHost:{accountingReset:(...args)=>calls.push(args)},setTimeout(fn){const id=++next;timers.set(id,fn);return id},clearTimeout:id=>timers.delete(id),addEventListener:(name,fn)=>events.set(name,fn)};
 scope.window=scope;vm.createContext(scope);vm.runInContext(source,scope);return {scope,calls,timers,events};
}

test('accounting reset bridge does nothing until explicitly called and preserves signed intent identifiers',async()=>{
 const h=harness();assert.equal(h.calls.length,0);
 const payload={requestId:'request-fixture',shopId:'shop-fixture',ownerId:'owner-fixture',accepted:true};
 const result=h.scope.NativeFiles.accountingReset('prepare',payload);assert.equal(h.calls.length,1);const [id,command,json]=h.calls[0];assert.equal(command,'prepare');assert.deepEqual(JSON.parse(json),payload);
 h.scope.__nativeResult(id,{stage:'prepared',requestId:payload.requestId,grantId:'grant-fixture',intentId:'intent-fixture'});
 assert.equal((await result).intentId,'intent-fixture');assert.equal(h.timers.size,0);
});

test('lost native confirmation is an error and late response cannot pretend reset completion',async()=>{
 const h=harness(),result=h.scope.NativeFiles.accountingReset('finish',{requestId:'r',grantId:'g',intentId:'i'});const check=assert.rejects(result,error=>error.code==='NATIVE_TIMEOUT');
 for(const timeout of [...h.timers.values()])timeout();await check;h.scope.__nativeResult(h.calls[0][0],{stage:'complete'});assert.equal(h.timers.size,0);
});

test('page departure rejects pending consent command and requires a fresh page call',async()=>{
 const h=harness(),result=h.scope.NativeFiles.accountingReset('prepare',{accepted:true});const check=assert.rejects(result,error=>error.code==='NATIVE_PAGE_HIDDEN');
 h.events.get('pagehide')();await check;
 const closed=h.scope.NativeFiles.accountingReset('poll',{});await assert.rejects(closed,error=>error.code==='NATIVE_PAGE_HIDDEN');assert.equal(h.calls.length,1);
 h.events.get('pageshow')();const resumed=h.scope.NativeFiles.accountingReset('resume-local');const call=h.calls.at(-1);assert.equal(call[1],'resume-local');assert.equal(call[2],'{}');h.scope.__nativeResult(call[0],{stage:'awaiting-network'});assert.equal((await resumed).stage,'awaiting-network');
});

test('service errors keep permanent and retry information without claiming a local wipe succeeded',async()=>{
 const h=harness(),result=h.scope.NativeFiles.accountingReset('poll',{shopId:'shop',ownerId:'owner'});const check=assert.rejects(result,error=>error.status===503&&error.retryAt===99&&!error.permanent&&error.code==='RESET_SERVICE');
 h.scope.__nativeResult(h.calls[0][0],{error:'Service unavailable',code:'RESET_SERVICE',status:503,retryAt:99,permanent:false});await check;assert.equal(h.timers.size,0);
});
