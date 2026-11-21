import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {desktopToMobileState} from '../approved-runtime/desktop-state-862.js';
import {mergeImport} from '../approved-runtime/import-domain.js';
import {validateState} from '../approved-runtime/database.js';
import {upgradeState} from '../approved-runtime/upgrade-state.js';
import {financialRecordReadOnly,applyRecordRevision,applyRecordEffect} from '../approved-runtime/business-accounting.js';
import {isEditableLegacyBankMovement} from '../approved-runtime/legacy-bank-movement.js';
import {currentMovementNote,prepareMovementNote} from '../approved-runtime/movement-note-update.js';
import {lifecycleFixture,commit} from './desktop-882-lifecycle-test-fixture.mjs';
const clone=structuredClone,checks=[];
const output=new URL('../outputs/desktop882-qa/',import.meta.url);await mkdir(output,{recursive:true});
async function check(name,work){await work();checks.push(name);console.log('PASS '+name);}
const literal='  مبيعات — règlement <literal> & Client\nسطر ثانٍ  ';
function backup(f){return JSON.parse(JSON.stringify({format:'conta-backup',schemaVersion:1,encoding:'json-v2',createdAt:new Date().toISOString(),appVersion:'0.1.26',collections:{...f.db.rows,products:[],productCategories:[],warehouses:[{_id:'main',name:'المخزن الرئيسي',isSalesDefault:true}],stockMovements:[],expenseCategories:[],employees:[],appSettings:[],counters:[],importMappings:[],recurringExpenses:[],users:[]}}));}
const money=s=>({accounts:s.accounts.map(a=>[a.id,a.balance]),parties:s.parties.map(p=>[p.id,p.balance]),stocks:s.products.map(p=>p.stocks)});
async function legacy(direction='withdrawal',note=literal){const f=await lifecycleFixture(),id=(await f.command({type:'account-adjustment.post',accountId:'cash',direction,amount:25,note})).result;f.db.rows.financialMovements.find(row=>row.documentId===id&&row.status==='posted').note=note;await f.db.collection('documents').deleteOne({id});return {f,id,raw:backup(f)};}
await check('official source missing, null and verbatim document notes survive conversion without becoming one empty string',async()=>{
 for(const mode of ['missing','null','text']){const f=await lifecycleFixture(),id=(await f.command({type:'party-cash.post',partyId:'customer',direction:'receive',paymentMethod:'cash',amount:20,note:literal})).result;
  if(mode==='missing')delete f.document(id).note;else f.document(id).note=mode==='null'?null:literal;
  const raw=backup(f),before=clone(raw),state=desktopToMobileState(raw),r=state.records.find(r=>r.desktopId===id);
  assert.equal(Object.hasOwn(r,'note'),mode!=='missing');if(mode!=='missing')assert.equal(r.note,mode==='null'?null:literal);
  assert.equal(state.desktopImportVersion,882);assert.deepEqual(raw,before);validateState(state);
 }
});
await check('genuine Desktop journal-only manual deposits and withdrawals are editable while their original source stays intact',async()=>{
 for(const direction of ['withdrawal','deposit']){const {f,id,raw}=await legacy(direction),state=desktopToMobileState(raw),r=state.records.find(r=>r.desktopMovementId);
  assert(isEditableLegacyBankMovement(state,r));assert.equal(financialRecordReadOnly(state,r),false);assert.equal(r.importReadOnly,true,'Eligibility is derived; boot does not rewrite provenance');
  const before=money(state),next={...r};delete next.note;prepareMovementNote(state,next,r);assert.equal(next.note,literal);
  applyRecordRevision(state,r,next);assert.deepEqual(money(state),before);
  await f.command({type:'account-adjustment.update',documentId:id,accountId:'cash',direction,amount:25});assert.equal(f.document(id).note,next.note);
  assert.equal(state.accounts.find(a=>a.code==='cash').balance,f.db.rows.paymentAccounts.find(a=>a.id==='cash').balance);
  next.revision=r.revision+1;next.revisions=[{...r,revisions:undefined}];state.records[state.records.indexOf(r)]=next;
  assert(isEditableLegacyBankMovement(state,next),'A proven native revision remains editable');
  applyRecordEffect(state,next,-1);await f.command({type:'account-adjustment.void',documentId:id});assert.equal(state.accounts.find(a=>a.code==='cash').balance,1000);assert.equal(f.db.rows.paymentAccounts.find(a=>a.id==='cash').balance,1000);
  assert.deepEqual(state.desktopOriginal,raw);
 }
});
await check('ambiguous, reversed, opening, mismatched or incomplete journal evidence never unlocks a read-only cash source',async()=>{
 const {raw}=await legacy(),base=desktopToMobileState(raw);let rejected=0;
 const mutations=[s=>s.financialMovements.push(clone(s.financialMovements[0])),s=>{s.financialMovements[0].direction='in'},s=>{s.financialMovements[0].amount=30},s=>{s.financialMovements[0].status='reversed'},s=>{s.financialMovements[0].isReversal=true},s=>{s.financialMovements[0].reversedByMovementId='inverse'},s=>{s.financialMovements[0].paymentMethod='999'},s=>{s.records[0].desktop.documentId=''},s=>{s.records[0].desktop.type='opening-balance'},s=>{s.records[0].paid=20},s=>{s.records[0].lines=[{qty:1}]},s=>{s.records[0].revision=1},s=>{s.records[0].desktop.id='different'},s=>{s.records[0].importReadOnlyReason='historical-return'}];
 for(const mutation of mutations){const s=clone(base);mutation(s);assert.equal(isEditableLegacyBankMovement(s,s.records[0]),false);assert.equal(financialRecordReadOnly(s,s.records[0]),true);rejected++;}assert.equal(rejected,14);
});
await check('old37 healed metadata recovers only untouched missing notes and never revives a saved null or native clear',async()=>{
 const {raw}=await legacy(),state=desktopToMobileState(raw),r=state.records.find(r=>r.desktopMovementId);
 delete r.desktop.note;r.note='';assert.equal(currentMovementNote(state,r),literal);
 r.desktop.note=null;assert.equal(currentMovementNote(state,r),null);
 r.desktop.note=literal;r.note=null;r.revision++;r.revisions=[{...r,revision:r.revision-1,revisions:undefined}];assert.equal(currentMovementNote(state,r),null);
});
await check('native backup/restore, repeated merge and cold upgrade retain notes, identities and exact financial balances',async()=>{
 const {raw}=await legacy(),source=desktopToMobileState(raw),baseline=clone(source),current=clone(source);
 const encoded=JSON.stringify(current),restored=JSON.parse(encoded);validateState(restored);upgradeState(restored);assert.equal(JSON.stringify(restored),encoded);
 const merged=mergeImport(current,source,{records:'current'}).state;assert.deepEqual(money(merged),money(current));assert.equal(merged.records.length,current.records.length);assert.equal(currentMovementNote(merged,merged.records[0]),literal);
 assert.deepEqual(source,baseline);assert.deepEqual(JSON.parse(JSON.stringify(merged)).records.map(r=>[r.id,r.note]),current.records.map(r=>[r.id,r.note]));
});
await writeFile(new URL('movement-import-882.json',output),JSON.stringify({sourceCommit:commit,checks:checks.length,passed:checks.length,sourceCommandsExecuted:true,cases:checks},null,2)+'\n');console.log(JSON.stringify({checks:checks.length,passed:checks.length}));
