import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../approved-runtime/accounting-reset.js',import.meta.url),'utf8');

function harness(){
 const timers=new Map(),events=new Map(),locks=[],calls=[];
 let nextTimer=0,resetBusy=false,actionBusy=false;
 const element=()=>({
  dataset:{},style:{},append(){},remove(){},setAttribute(){},focus(){},
  addEventListener(){},querySelector(){return null},querySelectorAll(){return []}
 });
 const scope={
  document:{hidden:false,activeElement:null,body:element(),createElement:element,
   addEventListener(){},querySelector(){return null}},
  navigator:{onLine:true},
  setTimeout(callback){const id=++nextTimer;timers.set(id,callback);return id},
  clearTimeout(id){timers.delete(id)},
  addEventListener(name,callback){events.set(name,callback)},
  NativeFiles:{accountingReset(command){
   calls.push(command);
   return scope.native(command);
  }},
  native:async()=>({stage:'idle'}),
  api:{
   language:()=> 'ar',actor:()=>({id:'owner',role:'owner'}),
   users:()=>[{id:'owner',role:'owner',active:true}],
   state:()=>({originId:'shop'}),hasModal:()=>false,
   isBusy:()=>actionBusy||resetBusy,
   lock(value){resetBusy=value;locks.push(value)}
  }
 };
 vm.createContext(scope);
 vm.runInContext(source.replace('export function installAccountingReset','function installAccountingReset'),scope);
 const controller=scope.installAccountingReset(scope.api);
 return {
  scope,controller,locks,calls,
  setActionBusy(value){actionBusy=value},
  busy:()=>actionBusy||resetBusy,
  resetBusy:()=>resetBusy,
  async tick(){
   const [id,callback]=timers.entries().next().value||[];
   assert(callback,'A retry should be scheduled');
   timers.delete(id);
   await callback();
  }
 };
}

for(const ackResult of [{stage:'complete'}, {stage:'complete',ackPending:true}, {stage:'idle'}, {stage:'unavailable'}]){
 test('background '+JSON.stringify(ackResult)+' cannot release a normal save lock',async()=>{
  const h=harness();
  let releaseAck;
  h.scope.native=command=>{
   if(command==='resume-local')return Promise.resolve({stage:'complete',ackPending:true});
   assert.equal(command,'ack');
   return new Promise(resolve=>{releaseAck=resolve});
  };
  await h.controller.resume();
  assert.deepEqual(h.locks,[],'No reset lock was acquired by a consumed receipt');
  h.controller.start();
  const ack=h.tick();
  await Promise.resolve();
  assert.equal(typeof releaseAck,'function');
  h.setActionBusy(true);
  releaseAck(ackResult);
  await ack;
  assert.equal(h.busy(),true,'The independent save remains locked');
  assert.deepEqual(h.locks,[],'An ACK must not acquire or release a destructive lock');
  h.setActionBusy(false);
  assert.equal(h.busy(),false);
 });
}

test('an unresolved accepted reset owns one lock and releases only that lock after reconciliation',async()=>{
 const h=harness();
 h.scope.native=async command=>command==='resume-local'?{stage:'awaiting-network'}:{stage:'idle'};
 await h.controller.resume();
 assert.equal(h.resetBusy(),true);
 h.controller.start();
 h.controller.wake();
 assert.deepEqual(h.locks,[true],'Repeated foreground events must not acquire another lock');
 h.setActionBusy(true);
 await h.tick();
 assert.equal(h.resetBusy(),false);
 assert.equal(h.busy(),true,'Reconciliation cannot release another lock owner');
 assert.deepEqual(h.locks,[true,false]);
 h.setActionBusy(false);
 assert.equal(h.busy(),false);
});

test('a failed ACK retains retry bookkeeping without acquiring a destructive lock',async()=>{
 const h=harness();
 h.scope.native=async command=>{
  if(command==='resume-local')return {stage:'complete',ackPending:true};
  throw Error('Synthetic ACK outage');
 };
 await h.controller.resume();
 h.setActionBusy(true);
 h.controller.start();
 await h.tick();
 assert.equal(h.busy(),true);
 assert.deepEqual(h.locks,[]);
 assert.deepEqual(h.calls,['resume-local','ack']);
});
