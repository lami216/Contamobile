import test from 'node:test';
import assert from 'node:assert/strict';
import {createDesktopBusinessBackup} from '../approved-runtime/desktop-backup-export.js';
import {desktopToMobileState} from '../approved-runtime/desktop-state-862.js';
import {mergeImport} from '../approved-runtime/import-domain.js';
import {upgradeState} from '../approved-runtime/upgrade-state.js';
import {ordinaryMobileState,currentMobileBusinessFixture,exportedAt} from './desktop-business-fixture.mjs';
import {reportDataset} from '../approved-runtime/report-data.js';
const incoming=state=>desktopToMobileState(createDesktopBusinessBackup(state,{createdAt:exportedAt}).backup);

for(const policy of ['current','imported'])test('own canonical snapshot '+policy+' merge is a repeatable no-op including historical offsets and signed openings',async()=>{
 const original=await currentMobileBusinessFixture(),source=incoming(original),before=structuredClone(original),sourceBefore=structuredClone(source),options={records:policy,stocks:policy,parties:policy,accounts:policy};let current=original;
 for(let i=0;i<3;i++){const result=mergeImport(current,source,options);assert(result.ownBusinessSnapshotUnchanged);assert.equal(result.counts.records,0);assert.equal(result.conflicts.length,0);assert.deepEqual(result.state,before);assert.equal(result.state.records.filter(r=>r.kind==='offset').length,1);for(const type of ['sales','purchases','expenses','financial','debts'])assert.deepEqual(reportDataset(result.state,{type}).metrics,reportDataset(before,{type}).metrics,type);current=result.state;}
 assert.deepEqual(original,before);assert.deepEqual(source,sourceBefore);
});
test('own changed canonical snapshot fails atomically with a review decision instead of guessing a posting or discarding data',()=>{
 const original=ordinaryMobileState(),wrapper=createDesktopBusinessBackup(original,{createdAt:exportedAt});wrapper.backup.collections.documents.find(d=>d.kind==='expense').note='مختلفة';const source=desktopToMobileState(wrapper.backup),before=structuredClone(original),sourceBefore=structuredClone(source);
 for(const policy of ['current','imported'])assert.throws(()=>mergeImport(original,source,{records:policy,stocks:policy,parties:policy,accounts:policy}),error=>error.code==='OWN_BUSINESS_SNAPSHOT_REVIEW_REQUIRED');assert.deepEqual(original,before);assert.deepEqual(source,sourceBefore);
});
test('a foreign origin with reused local IDs does not enter the own-snapshot no-op path',()=>{
 const base=originId=>{const state={originId,products:[],parties:[],accounts:[{id:1,name:'Cash',balance:90,openingBalance:100,active:true}],records:[{id:101,kind:'expense',number:'1',sequence:1,date:'2026-11-01',time:'12:00',total:10,paid:10,due:0,account:1,lines:[],note:originId}],warehouses:['Main'],warehouse:'Main',opening:{accounts:{1:100},parties:{},stocks:{}},stockEvents:[]};upgradeState(state);return state;};
 const current=base('shop-A'),foreign=base('shop-B'),result=mergeImport(current,incoming(foreign));assert(!result.ownBusinessSnapshotUnchanged);assert.equal(result.state.records.filter(r=>r.kind==='expense').length,2);assert.equal(new Set(result.state.records.filter(r=>r.kind==='expense').map(r=>r.importKey||r.id)).size,2);
});
test('the unchanged native mobile backup merge retains its existing key protocol',()=>{
 const state=ordinaryMobileState();state.records=state.records.filter(r=>r.kind!=='offset');const result=mergeImport(state,structuredClone(state));assert(!result.ownBusinessSnapshotUnchanged);assert.equal(result.counts.records,0);assert.equal(result.state.records.length,state.records.length);
});
test('a stale original canonical archive cannot discard a changed live incoming native note or financial record',()=>{
 const current=ordinaryMobileState(),source=incoming(current),expense=source.records.find(r=>r.kind==='expense');expense.note='تعديل حي مختلف';expense.revision++;expense.updatedAt='2026-11-23T14:00:00.000Z';const currentBefore=structuredClone(current),sourceBefore=structuredClone(source);
 for(const policy of ['current','imported'])assert.throws(()=>mergeImport(current,source,{records:policy}),error=>error.code==='OWN_BUSINESS_SNAPSHOT_REVIEW_REQUIRED');assert.deepEqual(current,currentBefore);assert.deepEqual(source,sourceBefore);
 expense.total=expense.paid=25;source.accounts.find(a=>a.id===expense.account).balance-=5;assert.throws(()=>mergeImport(current,source,{records:'imported'}),error=>error.code==='OWN_BUSINESS_SNAPSHOT_REVIEW_REQUIRED');assert.deepEqual(current,currentBefore);
});
