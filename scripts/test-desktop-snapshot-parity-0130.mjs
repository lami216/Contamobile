import assert from 'node:assert/strict';
import {references,proof} from './desktop-0130-test-fixture.mjs';
import {desktopToMobileState} from '../approved-runtime/desktop-state-862.js';
import {validateState} from '../approved-runtime/database.js';
import {partyOpeningCommand,validatePartyOpeningState} from '../approved-runtime/party-opening-domain.js';

const {backup,fixture}=await references(),cases=[];
const check=(name,fn)=>{fn();cases.push(name);console.log('PASS '+name)};
const raw=backup.convertMobileBackup(fixture.mobileBackupV23({repeatedCommercialLines:true}));
check('full Desktop snapshot retains exact balances and does not replay historical postings',()=>{
 const original=structuredClone(raw),state=desktopToMobileState(raw);validateState(state);
 const expected=fixture.mobileBackupV23Expected;
 assert.equal(state.accounts.find(a=>a.desktopId===expected.accountId).balance,expected.cash);
 assert.equal(state.accounts.find(a=>a.desktopId===expected.bankId).balance,expected.bank);
 assert.equal(state.parties.find(p=>p.desktopId===expected.customerId).balance,expected.customerReceivable);
 assert.equal(state.parties.find(p=>p.desktopId===expected.supplierId).balance,expected.supplierPayable);
 assert.equal(state.records.filter(r=>r.kind==='settlement').length,2);
 assert.deepEqual(raw,original);
});
check('valid source opening baseline loads, but update and cancellation remain rejected atomically',()=>{
 const state=desktopToMobileState(raw),r=state.records.find(r=>r.kind==='party-opening'&&r.legacyKey);
 assert.ok(r);validatePartyOpeningState(state);const original=structuredClone(state);
 for(const type of ['party-opening.update','party-opening.void'])assert.throws(()=>partyOpeningCommand(state,{type,documentId:r.id,expectedRevision:r.revision,direction:'receivable',amount:10},{actor:{id:'test-owner',role:'owner'}}),/غير قابل للتعديل/);
 assert.deepEqual(state,original);
});
check('historical snapshot validation still rejects inconsistent opening effects and cash movement',()=>{
 for(const mutate of [r=>r.partyOpeningContribution++,r=>r.partyBalanceDelta++,r=>r.total++,r=>r.paid=1,r=>r.cashAmount=1,r=>r.lines=[{product:1,qty:1,price:0}],r=>r.partyOpeningBalanceAfter=null]){
  const state=desktopToMobileState(raw),r=state.records.find(r=>r.kind==='party-opening'&&r.legacyKey);mutate(r);assert.throws(()=>validatePartyOpeningState(state));
 }
});
check('imported cost metadata cannot replace source guards with invalid numeric or hash values',()=>{
 for(const mutate of [p=>p.mobileImportedCurrentCost=-1,p=>p.mobileImportedCurrentCost='12',p=>p.mobileImportedCurrentCost=null,p=>delete p.mobileImportedCostBasis,p=>p.mobileImportedCostBasis='bad']){
  const value=structuredClone(raw),p=value.collections.products.find(p=>p.mobileImportedCostBasis);assert.ok(p);mutate(p);assert.throws(()=>desktopToMobileState(value),/أساس تكلفة/);
 }
});
check('source history without native before-after proof remains opaque and read-only',()=>{
 const value=structuredClone(raw),r=value.collections.documents.find(r=>r.kind==='adjustment'&&r.mobileOpening);
 assert.ok(r);const state=desktopToMobileState(value),mapped=state.records.find(row=>row.desktopId===r.id);
 assert.equal(mapped.openingCorrection,false);assert.deepEqual(mapped.mobileOpening,r.mobileOpening);
 for(const field of ['openingTotalBefore','openingCostBefore','openingTotalAfter','openingCostAfter'])assert.equal(Object.hasOwn(mapped,field),false);
});
await proof('desktop-snapshot0130',cases);
