import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {stripTypeScriptTypes} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {noteForUpdate,currentMovementNote,movementNoteFallback,prepareMovementNote} from '../approved-runtime/movement-note-update.js';
import {cashDelta,storedPartyDelta} from '../approved-runtime/business-accounting.js';
import {lifecycleFixture} from './desktop-882-lifecycle-test-fixture.mjs';
const desktop=process.env.DESKTOP_882_ROOT||process.env.DESKTOP_882_SOURCE||fileURLToPath(new URL('../../Desktop/',import.meta.url));
const source=(await readFile(path.join(desktop,'lib/transaction-lifecycle.ts'),'utf8')).replaceAll('\r\n','\n');
const pin='aeef807657c21e5574ff5454312a00d391b4ac06aeedc05e9aa705e7d903f667';
assert.equal(createHash('sha256').update(source).digest('hex'),pin,'The actual merged Desktop882 lifecycle source must be pinned');
const compiled=stripTypeScriptTypes(source,{mode:'transform'}).replace(/^import .*;\r?\n/gm,'')+'\nexport {noteForUpdate};\n';
const reference=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
const output=new URL('../outputs/desktop882-qa/',import.meta.url);await mkdir(output,{recursive:true});
const checks=[];const check=async(name,fn)=>{await fn();checks.push(name);console.log('PASS '+name)};
const literal='  بيان محفوظ — Client & Co. <texte>\nسطر ثانٍ / deuxième ligne  ';
let compared=0;
await check('actual882 lifecycle omission, explicit clearing and literal-note normalization agree for every source vector',()=>{
 const bodies=[{},...['','   ',null,undefined,literal,'0',0,false,{},[]].map(note=>({note})),Object.create({note:'inherited is omitted'})];
 const originals=[null,undefined,{},...['',null,undefined,literal,7,false].map(note=>({note}))],fallbacks=[undefined,{}, {note:null},{note:literal},{note:'do not revive this'}];
 for(const body of bodies)for(const original of originals)for(const fallback of fallbacks){assert.equal(noteForUpdate(body,original,fallback),reference.noteForUpdate(body,original,fallback));compared++;}
});
await check('native cash records preserve exact omitted notes, clear explicit blanks and keep all money/provenance outside notes intact',()=>{
 const state={accounts:[{id:1,balance:500},{id:2,balance:200}],parties:[{id:3,type:'customer',balance:100}],financialMovements:[]};
 for(const kind of ['receive','pay','deposit','withdraw','transfer']){
  const previous={id:101,kind,account:1,to:kind==='transfer'?2:null,party:['receive','pay'].includes(kind)?3:null,total:25,paid:25,due:0,note:literal,revision:3,sourceEnvelope:{opaque:[1,2]}};
  for(const body of [{},{note:null},{note:''},{note:' \n '},{note:' Nouveau بيان '}]){
   const next={...structuredClone(previous),...body};if(!Object.hasOwn(body,'note'))delete next.note;
   const stable=structuredClone(state),money=[cashDelta(previous,1),cashDelta(previous,2),storedPartyDelta(state,previous,3)];
   prepareMovementNote(state,next,previous);assert.equal(next.note,reference.noteForUpdate(body,previous));assert.deepEqual(state,stable);
   assert.deepEqual([cashDelta(next,1),cashDelta(next,2),storedPartyDelta(state,next,3)],money);assert.deepEqual(next.sourceEnvelope,previous.sourceEnvelope);
  }
 }
});
await check('legacy current journal fallback is identity scoped and never uses reversal reasons or another account document',()=>{
 const record={id:101,kind:'withdraw',account:1,desktopId:'d',desktop:{id:'d'},revision:0,revisions:[]},state={financialMovements:[{id:'wrong',documentId:'other',type:'manual-withdrawal',note:'other party'},{id:'reverse',documentId:'101',type:'manual-withdrawal',isReversal:true,note:'إلغاء سحب أو إيداع'},{id:'reversed',documentId:'101',type:'manual-withdrawal',status:'reversed',note:'prior source'},{id:'current',documentId:'101',type:'manual-withdrawal',status:'posted',note:literal}]};
 assert.equal(movementNoteFallback(state,record).id,'current');assert.equal(currentMovementNote(state,record),literal);
 for(const note of [null,''])assert.equal(currentMovementNote(state,{...record,note,revision:1,revisions:[{}]}),note);
 assert.equal(currentMovementNote({financialMovements:state.financialMovements.slice(0,3)},record),null);
 const transfer={id:102,kind:'transfer',desktopId:'t',desktopTransferId:'bank-transfer',desktopTransfer:{id:'bank-transfer',note:'old projection'}};
 assert.equal(currentMovementNote({desktopAccountTransfers:[{id:'wrong',documentId:'other',note:'wrong'},{id:'bank-transfer',documentId:'102',note:literal}]},transfer),literal);
});
await check('untouched original37 healed aliases recover missing or null authority without reviving a note after a native clear',()=>{
 const active={id:'source',documentId:'101',type:'manual-withdrawal',status:'posted',note:literal},state={financialMovements:[active]};
 for(const [raw,expected]of [[{},literal],[{note:null},null],[{note:7},null]]){
  const record={id:101,kind:'withdraw',note:'',revision:0,revisions:[],desktop:{id:'d',revision:0,...raw}};
  const before=structuredClone(record);assert.equal(currentMovementNote(state,record),expected);assert.deepEqual(record,before);
  assert.equal(currentMovementNote(state,{...record,note:null,revision:1,revisions:[before]}),null);
  assert.equal(currentMovementNote(state,{...record,note:'',revision:1,revisions:[before]}),'');
 }
 const original={id:101,kind:'withdraw',revision:4,revisions:[],note:'',desktop:{id:'d',revision:4}};
 assert.equal(currentMovementNote(state,original),literal,'Untouched imported revisions remain source revisions');
});
await check('new cash note preparation matches Desktop normalization and leaves invoice, stock and worker note behavior untouched',()=>{
 for(const note of [undefined,null,'',literal]){const body={kind:'deposit',note},next=prepareMovementNote({},body);assert.equal(next.note,reference.noteForUpdate(body,null));}
 for(const kind of ['sale','purchase','expense','stocktransfer','adjustment','employee-payment']){const next={kind,note:literal};assert.equal(prepareMovementNote({},next,{note:'old'}),next);assert.equal(next.note,literal);}
});
await check('actual882 bank and all four party-cash commands retain omission, clear explicitly and reverse only the original money',async()=>{
 const specifications=[
  ...['deposit','withdrawal'].map(direction=>({post:{type:'account-adjustment.post',accountId:'cash',direction,amount:25},update:id=>({type:'account-adjustment.update',documentId:id,accountId:'cash',direction,amount:25}),void:id=>({type:'account-adjustment.void',documentId:id})})),
  {post:{type:'account-transfer.post',fromAccountId:'cash',toAccountId:'bank',amount:30},update:id=>({type:'account-transfer.update',transferId:id,fromAccountId:'cash',toAccountId:'bank',amount:30}),void:id=>({type:'account-transfer.void',transferId:id})},
  ...['customer','supplier'].flatMap(partyId=>['receive','pay'].map(direction=>({post:{type:'party-cash.post',partyId,direction,paymentMethod:'cash',amount:20},update:id=>({type:'party-cash.update',documentId:id,direction,paymentMethod:'cash',amount:20}),void:id=>({type:'party-cash.void',documentId:id})})))
 ];
 const money=f=>({accounts:f.db.rows.paymentAccounts.map(row=>[row.id,row.balance]),parties:f.db.rows.parties.map(row=>[row.id,row.receivable,row.payable])});
 for(const spec of specifications){const f=await lifecycleFixture(),before=money(f),id=(await f.command({...spec.post,note:literal})).result,posted=money(f);assert.equal(f.document(id).note,literal.trim());
  const notes=[{}, {note:''},{}, {note:' Nouveau بيان '},{note:null},{}];
  for(const extra of notes){const original=structuredClone(f.document(id)),expected=noteForUpdate(extra,original);await f.command({...spec.update(id),...extra});assert.equal(f.document(id).note,expected);assert(f.active(id).every(row=>row.note===expected));assert.deepEqual(money(f),posted);}
  await f.command(spec.void(id));assert.equal(f.document(id).note,null);assert.equal(f.document(id).status,'voided');assert.deepEqual(money(f),before);const stable=structuredClone(f.db.rows);await assert.rejects(()=>f.command(spec.void(id)));assert.deepEqual(f.db.rows,stable);
 }
});
await check('actual882 legacy journal-only edits/void retain their own source text and a late failure rolls back before explicit retry',async()=>{
 for(const direction of ['withdrawal','deposit']){const f=await lifecycleFixture(),id=(await f.command({type:'account-adjustment.post',accountId:'cash',direction,amount:25,note:literal})).result;
  const m=f.active(id)[0];f.db.rows.financialMovements.find(row=>row.id===m.id).note=literal;await f.db.collection('documents').deleteOne({id});const stable=structuredClone(f.db.rows);
  f.db.failDocumentWrite=true;await assert.rejects(()=>f.command({type:'account-adjustment.update',documentId:id,accountId:'cash',direction,amount:25}),/Synthetic late/);assert.deepEqual(f.db.rows,stable);
  f.db.failDocumentWrite=false;await f.command({type:'account-adjustment.update',documentId:id,accountId:'cash',direction,amount:25});assert.equal(f.document(id).note,literal);assert.equal(f.active(id)[0].note,literal);assert.equal(f.db.rows.paymentAccounts[0].balance,direction==='deposit'?1025:975);
  await f.db.collection('documents').deleteOne({id});await f.command({type:'account-adjustment.void',documentId:id});assert.equal(f.document(id).note,literal);assert.equal(f.db.rows.paymentAccounts[0].balance,1000);const inverse=f.db.rows.financialMovements.filter(row=>row.isReversal).at(-1);assert.equal(inverse.note,'إلغاء سحب أو إيداع');assert.notEqual(f.document(id).note,inverse.note);
 }
 const f=await lifecycleFixture(),id=(await f.command({type:'account-transfer.post',fromAccountId:'cash',toAccountId:'bank',amount:30,note:literal})).result;await f.db.collection('documents').deleteOne({id});await f.command({type:'account-transfer.update',transferId:id,fromAccountId:'cash',toAccountId:'bank',amount:30});assert.equal(f.document(id).note,literal.trim());assert.equal(f.db.rows.accountTransfers[0].note,literal.trim());assert.equal(f.active(id).length,2);
});
await writeFile(new URL('movement-notes-parity-882.json',output),JSON.stringify({sourceCommit:'f1cd62bf6fbd8cbaef49a479aff440027afba37b',sourceSha256:pin,checks:checks.length,passed:checks.length,sourceVectorsCompared:compared,cases:checks},null,2)+'\n');
console.log(JSON.stringify({checks:checks.length,passed:checks.length,sourceVectorsCompared:compared}));
