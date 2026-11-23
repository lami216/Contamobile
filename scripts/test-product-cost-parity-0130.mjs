import assert from 'node:assert/strict';
import {canonicalMobileCostBasisSignature,resolveProductCost,accountingProduct,accountingDocuments,resolveCurrentProductCost,currentProductCosts,refreshCurrentProductCosts,saleLineCost,inventoryValue} from '../approved-runtime/cost-provenance.js';
import {postingLines,applyRecordEffect} from '../approved-runtime/business-accounting.js';
import {profitSummary,saleFacts} from '../approved-runtime/commerce-facts.js';
import {desktopToMobileState} from '../approved-runtime/desktop-state-862.js';
import {references,proof} from './desktop-0130-test-fixture.mjs';
const refs=await references(),clone=structuredClone,cases=[];
const check=async(name,fn)=>{await fn();cases.push(name);console.log('PASS '+name)};
const projection=result=>({cost:result.cost,source:result.source,at:result.at});
const acquisition=(id='source',price=10,extra={})=>({id,kind:'purchase',status:'posted',occurredAt:'2026-11-01T10:00:00.000Z',sequence:1,lines:[{productId:'p',quantity:3,unitPrice:price}],...extra});
const product=(documents,cost=12)=>({id:'p',pieceCost:999,mobileSource:{format:'alkarna-web-backup'},mobileImportedCurrentCost:cost,mobileImportedCostBasis:refs.cost.mobileCostBasisSignature('p',documents)});
function state(){
 const doc=acquisition('canonical-source'),p=product([doc]);
 return {products:[{...p,id:7,desktopId:'p',canonicalId:'p',cost:999,price:20,name:'زيت',stocks:{Main:12},qty:12}],records:[{...doc,id:45,desktopId:doc.id,canonicalId:doc.id,date:'2026-11-01',time:'10:00',warehouse:'Main',paid:30,total:30,due:0,account:1,lines:[{id:'source-line',product:7,name:'زيت',qty:3,price:10}]}],accounts:[{id:1,balance:1000,name:'Cash'}],parties:[],warehouses:['Main'],warehouse:'Main',opening:{accounts:{1:1030},parties:{},stocks:{7:{Main:9}}},auditEvents:[],stockEvents:[]};
}
await check('canonical SHA-256 basis matches actual Desktop across acquisition kinds, timestamps, notes, malformed costs and input order',()=>{
 let vectors=0;
 for(const cost of [null,undefined,0,1,12.5,'12.5','',NaN,-1])for(const quantity of [undefined,null,0,3,1e-20])for(const kind of ['purchase','sale','adjustment']){
  const docs=[acquisition('a',cost,{kind,lines:[{productId:'p',unitPrice:cost,quantity}],...(kind==='adjustment'?{openingCorrection:true,openingStockAfter:5}:{}),note:'لا يدخل في الأساس',revision:8}),acquisition('z',4,{status:'voided'}),acquisition('other',8,{lines:[{productId:'q',unitPrice:8}]})];
  assert.equal(canonicalMobileCostBasisSignature('p',docs),refs.cost.mobileCostBasisSignature('p',docs));
  assert.equal(canonicalMobileCostBasisSignature('p',docs.toReversed()),refs.cost.mobileCostBasisSignature('p',docs));vectors++;
 }
 assert.equal(vectors,135);
});
await check('snapshot authority matches source through notes, new acquisitions, voids, opening changes and invalid provenance',()=>{
 const original=acquisition(),p=product([original]),newer=acquisition('new',15,{occurredAt:'2026-11-21T10:00:00.000Z'});
 const scenarios=[[p,[original]],[p,[{...original,note:'new',revision:2}]],[p,[original,newer]],[p,[original,{...newer,status:'voided'}]],[p,[{...original,lines:[{productId:'p',unitPrice:13}]}]],[p,[{...original,status:'voided'}]],[{id:'p',pieceCost:999},[original]],[{...p,mobileImportedCurrentCost:0},[original]],[{...p,mobileImportedCostBasis:'0'.repeat(64)},[original]],[{...p,mobileSource:{format:'other'}},[original]],[p,[original,acquisition('correction',17,{kind:'adjustment',openingCorrection:true,openingCostAfter:17,occurredAt:'2026-11-22'})]]];
 for(const [card,docs]of scenarios){const before=clone({card,docs});assert.deepEqual(projection(resolveProductCost(card,docs)),refs.cost.resolveProductCost(card,docs));assert.deepEqual({card,docs},before);}
});
await check('phone numeric references preserve the canonical acquisition basis without changing the source stamp or raw identity',()=>{
 const s=state(),before=clone(s);assert.notEqual(refs.cost.mobileCostBasisSignature('7',accountingDocuments(s)),s.products[0].mobileImportedCostBasis,'A naive local-ID signature must not accidentally match');
 assert.equal(resolveCurrentProductCost(s,s.products[0],'Main').cost,12);assert.equal(currentProductCosts(s).get(7).cost,12);assert.deepEqual(s,before);
 const edited=clone(s);edited.records[0].note='تمت المراجعة';edited.records[0].revision=9;assert.equal(resolveCurrentProductCost(edited,edited.products[0]).cost,12);
 const ids=clone(s);ids.products[0].id=700;ids.records[0].id=450;ids.records[0].lines[0].product=700;assert.equal(resolveCurrentProductCost(ids,ids.products[0]).cost,12);
});
await check('future purchase and cancellation change current cost only; native sale posting keeps old independent sale snapshots intact',()=>{
 const s=state(),historical={id:46,kind:'sale',date:'2026-11-02',time:'10:00',warehouse:'Main',total:60,paid:60,due:0,account:1,lines:[{id:'old-a',product:7,qty:1,price:18,costAtSale:8},{id:'old-b',product:7,qty:2,price:21,costAtSale:11}]};
 s.records.push(historical);const old=clone(historical),before=profitSummary(saleFacts(s));
 const add={id:47,kind:'purchase',date:'2026-11-21',occurredAt:'2026-11-21T10:00:00.000Z',postingOrder:2,warehouse:'Main',total:15,paid:15,due:0,account:1,lines:postingLines(s,[{id:7,qty:1,price:15}],'purchase','Main')};
 applyRecordEffect(s,add,1);s.records.push(add);refreshCurrentProductCosts(s);assert.equal(s.products[0].lastPurchaseCost,15);assert.equal(postingLines(s,[{id:7,qty:1,price:20}],'sale','Main')[0].costAtSale,15);
 applyRecordEffect(s,add,-1);add.voided=true;add.status='voided';refreshCurrentProductCosts(s);assert.equal(s.products[0].lastPurchaseCost,12);assert.equal(postingLines(s,[{id:7,qty:1,price:20}],'sale','Main')[0].costAtSale,12);
 assert.deepEqual(historical,old);assert.deepEqual(profitSummary(saleFacts(s)),before);assert.deepEqual([s.accounts[0].balance,s.products[0].stocks.Main],[1000,12]);
});
await check('zero imported valuation remains zero for inventory/cache but unknown for future sales and never falls through to count evidence',async()=>{
 const s=state(),p=s.products[0];p.mobileImportedCurrentCost=0;refreshCurrentProductCosts(s);assert.equal(p.lastPurchaseCost,0);assert.equal(inventoryValue(s,p),0);
 assert.equal(resolveCurrentProductCost(s,p,'Main').cost,null);assert.equal(saleLineCost(s,p,null,'Main'),null);assert.equal(postingLines(s,[{id:7,qty:1,price:20}],'sale','Main')[0].costAtSale,null);
 assert.equal(saleLineCost(s,p,{costAtSale:0},'Main'),0);assert.equal(saleLineCost(s,p,{costAtSale:8},'Main'),8);
 const counted=state(),countedProduct=counted.products[0],occurredAt='2026-11-03T10:00:00.000Z';
 counted.records=[{id:1,kind:'adjustment',number:'ADJ-1',status:'posted',revision:0,occurredAt,warehouse:'Main',total:0,paid:0,due:0,lines:[{id:'count-line',product:7,qty:1,delta:1,price:5,balanceBefore:0,balanceAfter:1}]}];
 counted.stockEvents=[{id:'count-row',documentId:'1',documentNumber:'ADJ-1',documentRevision:0,productId:'7',warehouseId:'Main',type:'adjustment',balanceBefore:0,quantityDelta:1,balanceAfter:1,occurredAt}];countedProduct.stocks.Main=1;countedProduct.mobileImportedCurrentCost=0;countedProduct.mobileImportedCostBasis=refs.cost.mobileCostBasisSignature('p',[]);
 assert.equal(resolveCurrentProductCost(counted,countedProduct,'Main').cost,null);const ordinaryCountCard={...countedProduct};delete ordinaryCountCard.mobileSource;assert.equal(resolveCurrentProductCost(counted,ordinaryCountCard,'Main').cost,5,'The same real count proof is eligible without the explicit zero snapshot barrier');
 const canonical=product([acquisition()],0),writes=[];
 const db={collection(name){return{find(){assert.equal(name,'documents');return{async toArray(){return [acquisition()]}}},async updateOne(query,changes){assert.equal(name,'products');writes.push(clone(changes.$set))}}}};
 assert.equal(await refs.cost.currentProductCost(db,{},canonical,'Main'),null);assert.equal(canonical.lastPurchaseCost,0);assert.equal(writes[0].lastPurchaseCost,0);
});
await check('actual Mobile23 converter valuation and metadata survive Desktop-to-phone adaptation and state serialization',()=>{
 const raw=refs.fixture.mobileBackupV23();raw.state.products[0].cost=12;
 const before=clone(raw),canonical=refs.backup.convertMobileBackup(raw),s=desktopToMobileState(canonical),p=s.products.find(p=>p.desktopId===refs.fixture.mobileBackupV23Expected.productId);
 const dp=canonical.collections.products.find(row=>row.id===p.desktopId),docs=canonical.collections.documents;
 assert.deepEqual(projection(resolveProductCost(accountingProduct(p),accountingDocuments(s))),refs.cost.resolveProductCost(dp,docs));assert.equal(p.mobileImportedCostBasis,dp.mobileImportedCostBasis);assert.equal(p.mobileImportedCurrentCost,dp.mobileImportedCurrentCost);
 const roundTrip=JSON.parse(JSON.stringify(s));assert.deepEqual(currentProductCosts(roundTrip).get(p.id),currentProductCosts(s).get(p.id));assert.deepEqual(raw,before);assert.deepEqual(s.desktopOriginal,canonical);
});
await check('large native acquisition histories remain deterministic and note-only edits cannot reprice saved sales',()=>{
 const docs=Array.from({length:3000},(_,i)=>acquisition('purchase-'+String(i).padStart(5,'0'),i%19+1,{sequence:i+1,occurredAt:'2026-11-20T10:00:00.000Z'})),p=product(docs,12);
 assert.equal(canonicalMobileCostBasisSignature('p',docs),refs.cost.mobileCostBasisSignature('p',docs));assert.equal(resolveProductCost(p,docs).cost,12);
 const revised=docs.map((d,i)=>({...d,note:'ملاحظة '+i,revision:i}));assert.equal(resolveProductCost(p,revised).cost,12);assert.equal(resolveProductCost(p,docs.toReversed()).cost,12);
});
await proof('product-cost-parity-0130',cases,{basisVectors:135,largeAcquisitions:3000});
