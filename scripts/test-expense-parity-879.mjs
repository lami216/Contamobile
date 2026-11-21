import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {stripTypeScriptTypes} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import * as mobile from '../approved-runtime/expense-date-time.js';

const root=fileURLToPath(new URL('../',import.meta.url)),desktop=process.env.DESKTOP_879_ROOT||process.env.DESKTOP_879_SOURCE||path.resolve(root,'../Desktop');
const source=(await readFile(path.join(desktop,'app/expense-date-time.ts'),'utf8')).replaceAll('\r\n','\n');
assert.equal(createHash('sha256').update(source).digest('hex'),'f26bc44c107b8afdd2f3edbc5912b164565743613e086e17172425fad75c915f','Use exact main879 expense timestamp source');
const reference=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source,{mode:'transform'})).toString('base64'));
const results=[],check=async(name,work)=>{await work();results.push({name,passed:true});console.log('PASS '+name)};
const errorResult=work=>{try{return {value:work()}}catch(error){return {error:error.message,status:error.status}}};

await check('new and backdated expense timestamps match actual main879 UTC source at day boundaries and leap days',()=>{
 for(const now of ['2026-11-21T17:28:39.456Z','2026-11-20T00:00:00.001Z','2026-11-19T23:59:59.999Z','2026-11-21T00:30:59+14:00','2026-11-21T23:45:02-12:00'])for(const day of ['2026-11-21','2024-02-29','2026-03-31'])assert.deepEqual(mobile.expensePostDateTime(day,new Date(now)),reference.expensePostDateTime(day,new Date(now)));
});
await check('strict calendar and invalid recording clocks reject with the exact source error status',()=>{
 for(const day of [undefined,null,true,20261121,'','2026-2-03','2026-02-29','2024-02-30','2026-04-31','2026-00-01','2026-13-01','2026-11-21T18:23:45Z','21/11/2026'])assert.deepEqual(errorResult(()=>mobile.expensePostDateTime(day)),errorResult(()=>reference.expensePostDateTime(day)));
 assert.equal(mobile.expenseBusinessDate(' 2024-02-29 '),'2024-02-29');
 assert.deepEqual(errorResult(()=>mobile.expensePostDateTime('2026-11-21',new Date('invalid'))),errorResult(()=>reference.expensePostDateTime('2026-11-21',new Date('invalid'))));
});
await check('ordinary and date-changing edits preserve exact original UTC suffixes like Desktop including legacy noon',()=>{
 const now=new Date('2026-11-21T06:07:08.900Z');
 for(const occurredAt of ['2026-08-01T12:00:00Z','2026-08-01T12:00:00.000Z','2026-08-01T23:59:59.1Z','2026-08-01T00:00:00.12Z','2026-08-01T18:23:45.678Z'])for(const day of ['2026-08-01','2024-02-29'])assert.deepEqual(mobile.expenseEditDateTime(day,{occurredAt},now),reference.expenseEditDateTime(day,{occurredAt},now));
});
await check('corrupt canonical original timestamps reject before modifying the supplied record',()=>{
 for(const occurredAt of [undefined,null,true,'2026-08-01','2026-02-30T12:00:00Z','2026-08-01T24:00:00Z','2026-08-01T12:60:00Z','2026-08-01T12:00:00+00:00','invalid']){
  const previous={kind:'expense',id:101,date:'2026-08-01',time:'12:00',occurredAt,total:100},before=structuredClone(previous);
  assert.deepEqual(errorResult(()=>mobile.expenseEditDateTime('2026-08-02',previous)),errorResult(()=>reference.expenseEditDateTime('2026-08-02',previous)));
  assert.throws(()=>mobile.prepareExpenseRecordDateTime({...previous,date:'2026-08-02'},previous),error=>error.status===409);assert.deepEqual(previous,before);
 }
});
await check('record adapter ignores forged recording metadata and retains immutable known recording proof on edit',()=>{
 const now=new Date('2026-11-21T18:23:45.678Z'),input={id:101,kind:'expense',date:'2026-03-15',time:'00:00',recordedAt:'2000-01-01T00:00:00Z',createdAt:'2000-01-01T00:00:00Z',number:'EXP-101',total:100};
 const posted=mobile.prepareExpenseRecordDateTime(input,null,now),expected=reference.expensePostDateTime(input.date,now);assert.deepEqual({...posted},{...input,...expected,time:'18:23'});
 const before=structuredClone(posted),later=new Date('2026-11-22T09:10:11.012Z');
 for(const day of ['2026-03-15','2026-03-16']){const result=mobile.prepareExpenseRecordDateTime({...posted,date:day,recordedAt:'forged',createdAt:'forged'},posted,later);assert.equal(result.createdAt,posted.createdAt);assert.equal(result.recordedAt,posted.recordedAt);assert.equal(result.occurredAt,reference.expenseEditDateTime(day,posted,later).occurredAt);assert.equal(result.updatedAt,later.toISOString());assert.equal(result.number,posted.number);}
 assert.deepEqual(posted,before);
});
await check('native pre-canonical date/time rows preserve missing recording fields and opaque identity/history evidence',()=>{
 const legacy={id:101,kind:'expense',number:'EXP-original',date:'2026-08-01',time:'11:24',total:100,desktopId:'original-id',sourceEnvelope:{preserve:[1,{opaque:true}]}};
 const before=structuredClone(legacy),now=new Date('2026-11-21T18:23:45.678Z');
 for(const day of ['2026-08-01','2026-08-03']){const result=mobile.prepareExpenseRecordDateTime({...legacy,date:day,createdAt:'forged',recordedAt:'forged'},legacy,now);assert.equal(result.date,day);assert.equal(result.businessDate,day);assert.equal(result.time,'11:24');for(const key of ['occurredAt','recordedAt','createdAt'])assert(!Object.hasOwn(result,key));assert.deepEqual(result.sourceEnvelope,legacy.sourceEnvelope);assert.equal(result.desktopId,legacy.desktopId);assert.equal(result.number,legacy.number);}
 assert.deepEqual(legacy,before);
 for(const time of ['',null,'24:00','11:60','bad'])assert.throws(()=>mobile.prepareExpenseRecordDateTime({...legacy,date:'2026-08-03'},{...legacy,time},now),error=>error.status===409);
 for(const date of ['2026-02-30','invalid'])assert.throws(()=>mobile.prepareExpenseRecordDateTime({...legacy,date:'2026-08-03'},{...legacy,date},now),error=>error.status===409);
 const canonical={...legacy,desktop:{id:'canonical-old-expense',occurredAt:'2026-08-01T12:00:00Z'}},adapted=mobile.prepareExpenseRecordDateTime(canonical,canonical,now);assert.equal(adapted.occurredAt,canonical.desktop.occurredAt);assert.deepEqual(adapted.desktop,canonical.desktop);assert(!Object.hasOwn(adapted,'recordedAt'));assert(!Object.hasOwn(adapted,'createdAt'));
});
await check('canonical legacy noon edits never invent absent createdAt/recordedAt and v36 backdated clock is retained on accounting-day repair',()=>{
 const old={id:101,kind:'expense',date:'2026-08-01',time:'12:00',occurredAt:'2026-08-01T12:00:00Z',total:100},now=new Date('2026-11-21T06:07:08Z');
 const normal=mobile.prepareExpenseRecordDateTime({...old,note:'only note'},old,now);assert.equal(normal.occurredAt,old.occurredAt);assert(!Object.hasOwn(normal,'recordedAt'));assert(!Object.hasOwn(normal,'createdAt'));
 const changed=mobile.prepareExpenseRecordDateTime({...old,date:'2026-08-03'},old,now);assert.equal(changed.occurredAt,'2026-08-03T12:00:00Z');
 const v36={...old,date:'2026-03-15',time:'18:23',occurredAt:'2026-11-19T18:23:45.678Z',createdAt:'2026-11-19T18:23:45.679Z'},repaired=mobile.prepareExpenseRecordDateTime(v36,v36,now);assert.equal(repaired.occurredAt,'2026-03-15T18:23:45.678Z');assert.equal(repaired.createdAt,v36.createdAt);assert(!Object.hasOwn(repaired,'recordedAt'));
});
const output=path.join(root,'outputs/desktop879-qa');await mkdir(output,{recursive:true});const proof={suite:'expense-parity-879',sourceCommit:'8a6cb072c411ee698f3ca5a0f1943be80ccd2955',sourceHash:createHash('sha256').update(source).digest('hex'),actualPinnedDesktop:true,tests:results.length,passed:results.length,results};await writeFile(path.join(output,'expense-parity-879.json'),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify({tests:results.length,passed:results.length}));
