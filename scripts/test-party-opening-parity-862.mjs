import assert from 'node:assert/strict';
import {partyOpeningCommand,partyOpeningPreview,partyOpeningNetBalance,partyOpeningNetDelta,partyOpeningStoredDelta,validatePartyOpeningState} from '../approved-runtime/party-opening-domain.js';
import {installPartyOpeningFeatures} from '../approved-runtime/feature-party-opening.js';
import {desktop862Modules,memoryDesktop,phoneFixture,uiHarness} from './party-category-862-harness.mjs';

let checks=0;const check=async(label,work)=>{await work();checks++;console.log('PASS '+label)};
const context={actor:{id:'owner',name:'Owner',role:'owner'},now:'2026-11-16T12:00:00.000Z'};
const post=(state,input)=>partyOpeningCommand(state,{type:'party-opening.post',partyId:1,direction:'receivable',amount:100,...input},context);
const change=(state,id,revision,input={})=>partyOpeningCommand(state,{type:'party-opening.update',documentId:id,expectedRevision:revision,direction:'receivable',amount:100,...input},context);
const cancel=(state,id,revision)=>partyOpeningCommand(state,{type:'party-opening.void',documentId:id,expectedRevision:revision},context);
const desktop=await desktop862Modules();

await check('four direction/role combinations change only signed party balance',()=>{
 for(const type of ['customer','supplier'])for(const direction of ['receivable','payable']){
  const before=phoneFixture(type,300),unchanged=structuredClone(before),result=post(before,{direction,amount:'1000',occurredAt:'2026-07-01',note:'Opening'}),net=300+(direction==='receivable'?1000:-1000);
  assert.deepEqual(before,unchanged);assert.equal(partyOpeningNetBalance(result.state.parties[0]),net);
  assert.equal(result.record.occurredAt,'2026-07-01T12:00:00.000Z');
  assert.deepEqual([result.record.account,result.record.cashAmount,result.record.paid,result.record.due,result.record.lines],[null,0,0,0,[]]);
  for(const key of ['accounts','products','opening'])assert.deepEqual(result.state[key],before[key]);
  assert.equal(partyOpeningNetDelta(result.record),direction==='receivable'?1000:-1000);
  assert.equal(partyOpeningStoredDelta(result.state,result.record),(direction==='receivable'?1000:-1000)*(type==='supplier'?-1:1));
 }
});
await check('edits and cancellation preserve later cash and legacy baseline across credit direction',()=>{
 for(const type of ['customer','supplier']){
  let {state,record}=post(phoneFixture(type),{amount:1000});const id=record.id;
  state.parties[0].balance-=400*(type==='supplier'?-1:1);state.accounts[0].balance+=400;
  const baseline=structuredClone(state.opening),cash=structuredClone(state.accounts);
  ({state,record}=change(state,id,0,{amount:800,reason:'Correction'}));assert.equal(partyOpeningNetBalance(state.parties[0]),400);
  assert.deepEqual([record.partyOpeningBalanceBefore,record.partyOpeningAppliedDelta,record.partyOpeningBalanceAfter],[600,-200,400]);
  ({state,record}=cancel(state,id,1));assert.equal(partyOpeningNetBalance(state.parties[0]),-400);assert.equal(record.revision,2);assert.equal(record.status,'voided');
  assert.equal(partyOpeningNetDelta(record),0);assert.deepEqual(state.accounts,cash);assert.deepEqual(state.opening,baseline);
  assert.deepEqual(state.auditEvents.map(event=>event.appliedDelta),[1000,-200,-800]);
 }
});
await check('invalid requests, stale revisions, duplicate and repeated void leave caller intact',()=>{
 const base=phoneFixture();for(const amount of [0,-1,null,'',true,{},'bad','0x64',NaN,Infinity])assert.throws(()=>post(base,{amount}));assert.deepEqual(base,phoneFixture());
 for(const occurredAt of ['2026-02-30','2026-13-01',{},'2026-01-01T12:00:00Z'])assert.throws(()=>post(base,{occurredAt}));
 const {state,record}=post(base),before=structuredClone(state);
 assert.throws(()=>post(state),{status:409});assert.throws(()=>change(state,record.id,8),{status:409});assert.throws(()=>cancel(state,record.id,'0'),{status:409});
 assert.deepEqual(state,before);const result=cancel(state,record.id,0);assert.throws(()=>cancel(result.state,record.id,1),{status:404});
 assert.notEqual(post(result.state).record.id,record.id);
});
await check('neutral edits preserve party raw metadata; archived debt reactivates on reversal',()=>{
 let {state,record}=post(phoneFixture());const party=structuredClone(state.parties[0]);({state,record}=change(state,record.id,0,{note:'Only note'}));assert.deepEqual(state.parties[0],party);
 state.parties[0].balance=0;state.parties[0].archived=true;state.parties[0].archivedAt='2026-11-01';
 const result=cancel(state,record.id,1);assert.equal(result.state.parties[0].balance,-100);assert.equal(result.state.parties[0].archived,false);assert.equal(result.state.parties[0].archivedAt,null);
});
await check('permission, stored consistency and journal failures are atomic',()=>{
 const base=phoneFixture(),before=structuredClone(base);assert.throws(()=>partyOpeningCommand(base,{type:'party-opening.post'},{}),{status:403});
 assert.throws(()=>partyOpeningCommand(base,{type:'party-opening.post',partyId:1,direction:'receivable',amount:100},{...context,uuid(){throw Error('AUDIT_FAILURE')}}),/AUDIT_FAILURE/);assert.deepEqual(base,before);
 const {state,record}=post(base);state.records[0].partyOpeningContribution=999;assert.throws(()=>cancel(state,record.id,0),{status:409});assert.throws(()=>validatePartyOpeningState(state));
 state.records[0].partyOpeningContribution=100;state.parties[0].balance=null;assert.throws(()=>change(state,record.id,0),{status:409});
});
await check('snapshot restore validates without replaying contribution and preview never mutates',()=>{
 const {state,record}=post(phoneFixture('supplier',300),{direction:'payable',amount:250});
 const saved=JSON.stringify(state),restored=JSON.parse(saved);validatePartyOpeningState(restored);assert.equal(JSON.stringify(restored),saved);
 const before=structuredClone(restored);const preview=partyOpeningPreview(restored,{documentId:record.id,expectedRevision:0,direction:'receivable',amount:80});
 assert.deepEqual([preview.before,preview.delta,preview.after],[50,330,380]);assert.deepEqual(restored,before);
});
await check('supplier zero has the same positive-zero normalization as desktop party net',()=>{
 const posted=post(phoneFixture('supplier'));const result=cancel(posted.state,posted.record.id,0);
 assert.equal(result.state.parties[0].balance,0);assert.equal(partyOpeningNetBalance(result.state.parties[0]),0);
});
await check('Arabic/French sheet keeps draft after failed save, success only after durable save',async()=>{
 for(const lang of ['ar','fr']){
  const initial=phoneFixture(),h=uiHarness(installPartyOpeningFeatures,initial,lang);await h.group.action('party-opening','1');assert.match(h.group.sheet(),/inputmode="decimal"/);
  h.fields({direction:'receivable',amount:'125',note:'Client note'});await h.group.action('party-opening-review');assert.equal(h.state().records.length,0);
  await h.group.action('party-opening-save');assert.equal(h.state().records.length,1);assert.equal(h.toasts.length,0);assert.equal(h.committed(),0);
  h.restore(initial,'feature-party-opening-review');h.group.afterFailure();h.group.afterSave();assert.equal(h.committed(),0);assert.equal(h.toasts.length,0);
  await h.group.action('party-opening-back');assert.match(h.group.sheet(),/value="125"/);
  if(lang==='fr')assert.match(h.group.sheet(),/Ajouter le solde initial/);
  await h.group.action('party-opening-review');await h.group.action('party-opening-save');h.group.afterSave();assert.equal(h.committed(),1);assert.equal(h.toasts.length,1);
 }
});
if(desktop)await check('live pinned Desktop862 agrees on post/update/void financial meaning and rejection',async()=>{
 for(const type of ['customer','supplier'])for(const direction of ['receivable','payable']){
  const db=memoryDesktop({parties:[{id:'party',name:'Client',partyType:type,receivable:300,payable:0,net:300}],documents:[],auditEvents:[]});
  const d=desktop.opening,id=await d.postPartyOpening(db,{}, {partyId:'party',direction,amount:'1000',occurredAt:'2026-07-01'});
  let phone=post(phoneFixture(type,300),{direction,amount:'1000',occurredAt:'2026-07-01'});
  const compare=async()=>{const party=await db.collection('parties').findOne({id:'party'}),doc=await db.collection('documents').findOne({id});assert.equal(partyOpeningNetBalance(phone.state.parties[0]),party.net);for(const key of ['partyOpeningVersion','partyOpeningDirection','partyOpeningAmount','partyOpeningContribution','partyBalanceDelta','partyOpeningBalanceBefore','partyOpeningAppliedDelta','partyOpeningBalanceAfter','total','revision','status','occurredAt'])assert.equal(phone.record[key],doc[key],key)};
  await compare();await d.updatePartyOpening(db,{}, {documentId:id,expectedRevision:0,direction:'payable',amount:400,note:'Corrected'});phone=change(phone.state,phone.record.id,0,{direction:'payable',amount:400,note:'Corrected'});await compare();
  await d.voidPartyOpening(db,{}, {documentId:id,expectedRevision:1});phone=cancel(phone.state,phone.record.id,1);await compare();
  await assert.rejects(d.voidPartyOpening(db,{}, {documentId:id,expectedRevision:2}),{status:404});
 }
 const db=memoryDesktop({parties:[{id:'party',name:'Client',partyType:'customer',receivable:0,payable:0}],documents:[],auditEvents:[]});db.failAudit();const before=db.snapshot();
 await assert.rejects(desktop.opening.postPartyOpening(db,{}, {partyId:'party',direction:'receivable',amount:100}),/AUDIT_FAILURE/);assert.deepEqual(db.snapshot(),before);
});
console.log(JSON.stringify({suite:'party-opening-862',checks,livePinnedDesktop:!!desktop}));
