import test from 'node:test';
import assert from 'node:assert/strict';
import {RegistrationEvents,RecoveryPoller} from '../approved-runtime/service-contact.js';

function clock(){let now=1000000,id=0;const timers=new Map();return {now:()=>now,setTimer:(fn,ms)=>{timers.set(++id,{at:now+ms,fn});return id;},clearTimer:n=>timers.delete(n),get size(){return timers.size},async advance(ms){const end=now+ms;for(let guard=0;guard<1000;guard++){const next=[...timers.entries()].sort((a,b)=>a[1].at-b[1].at)[0];if(!next||next[1].at>end)break;timers.delete(next[0]);now=next[1].at;next[1].fn();for(let n=0;n<10;n++)await Promise.resolve();}now=end;}};}
const context=()=>({shopId:'synthetic-shop',owners:[{id:'owner',name:'Synthetic owner',role:'owner'}]});
test('opening/network bursts debounce to one native registration without overlapping calls',async()=>{
 const time=clock();let calls=0,active=0,max=0,release;const first=new Promise(resolve=>release=resolve);
 const registration=new RegistrationEvents({...time,context,visible:()=>true,online:()=>true,call:async()=>{calls++;max=Math.max(max,++active);if(calls===1)await first;active--;return {registered:true};}});
 for(let n=0;n<100;n++)registration.notify();assert.equal(time.size,1);await time.advance(750);assert.equal(calls,1);
 for(let n=0;n<100;n++)registration.notify();assert.equal(calls,1);release();for(let n=0;n<10;n++)await Promise.resolve();await time.advance(750);assert.equal(calls,2);assert.equal(max,1);
});
test('native durable deadline is honored; hidden/offline apps have no scheduled work',async()=>{
 const time=clock();let visible=true,online=true,calls=0;const registration=new RegistrationEvents({...time,context,visible:()=>visible,online:()=>online,call:async()=>{calls++;return {stage:'scheduled',retryAt:time.now()+120000};}});
 registration.notify();await time.advance(750);assert.equal(calls,1);await time.advance(119999);assert.equal(calls,1);visible=false;registration.cancel();await time.advance(100000);assert.equal(calls,1);
 visible=true;online=false;registration.notify();assert.equal(time.size,0);online=true;registration.notify();await time.advance(750);assert.equal(calls,2);
});
test('explicit recovery bypasses scheduled initial delay without parallel registration',async()=>{
 const time=clock(),commands=[];const r=new RegistrationEvents({...time,context,visible:()=>true,online:()=>true,call:async command=>{commands.push(command);return command==='register-now'?{registered:true}:{retryAt:time.now()+180000};}});
 r.notify();await time.advance(750);assert.equal(time.size,1);assert.equal((await r.forRecovery()).registered,true);assert.equal(time.size,0);assert.deepEqual(commands,['register','register-now']);
});
test('pending recovery polls every 45 seconds, two wire calls per operation, and manual refresh has a cooldown',async()=>{
 const time=clock();let operations=0;const p=new RecoveryPoller({...time,visible:()=>true,online:()=>true,poll:async()=>{operations++;return {status:'waiting'};},onResult:()=>{},onError:()=>{}});
 p.pending();await time.advance(44999);assert.equal(operations,0);await time.advance(1);assert.equal(operations,1);assert.equal((await p.refresh()).stage,'cooldown');await time.advance(45000);assert.equal(operations,2);assert.equal(operations*2,4);p.stop();assert.equal(time.size,0);
});
test('only one poll can be in flight; closing ignores a late result and schedules nothing',async()=>{
 const time=clock();let calls=0,applied=0,release;const wait=new Promise(resolve=>release=resolve);const p=new RecoveryPoller({...time,visible:()=>true,online:()=>true,poll:()=>{calls++;return wait;},onResult:()=>applied++,onError:()=>{}});
 p.pending();await time.advance(10000);const a=p.refresh(),b=p.refresh();assert.equal(calls,1);p.stop();release({status:'approved'});await Promise.all([a,b]);assert.equal(applied,0);assert.equal(time.size,0);
});
test('poll failure respects Retry-After, pauses when hidden, and permanent rejection stops polling',async()=>{
 const time=clock();let visible=true,calls=0,permanent=false;const p=new RecoveryPoller({...time,visible:()=>visible,online:()=>true,random:()=>0,poll:async()=>{calls++;throw Object.assign(new Error('synthetic'),{retryAt:time.now()+120000,permanent});},onResult:()=>{},onError:()=>{}});
 p.pending();await time.advance(45000);assert.equal(calls,1);assert.equal((await p.refresh()).stage,'cooldown');visible=false;p.pause();await time.advance(500000);assert.equal(calls,1);visible=true;permanent=true;p.wake();await time.advance(1000);assert.equal(calls,2);assert.equal(time.size,0);
});

test('native timer functions are invoked without replacing their browser receiver',()=>{
 const timers={
  setTimer:function(){assert.equal(this,undefined,'Window timer receiver must not become a scheduler instance');return 1;},
  clearTimer:function(){assert.equal(this,undefined,'Window timer receiver must not become a scheduler instance');}
 };
 const r=new RegistrationEvents({call:async()=>({registered:true}),context:()=>({owners:[{id:'synthetic-owner'}]}),visible:()=>true,online:()=>true,...timers});
 r.notify();r.notify();r.cancel();
 const p=new RecoveryPoller({poll:async()=>({status:'waiting'}),onResult:()=>{},onError:()=>{},visible:()=>true,online:()=>true,...timers});p.pending();p.pause();p.stop();
});
