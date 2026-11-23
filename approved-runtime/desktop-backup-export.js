// Business-only interchange with offline-conta 0.1.30 / 2327ccc83b3f76f7a30d13c0ca8d356c4cd7483b.
// The normal phone backup, authentication, activation and cloud envelopes stay separate.
import {validateState} from './database.js';
import {sha256Hex} from './accounting-hash.js';
import {mobileLineTotal} from './invoice-amount.js';
import {stockBalanceAfter} from './accounting-numbers.js';
import {canonicalMobileCostBasisSignature,currentProductCosts} from './cost-provenance.js';
import {payrollCanonicalDocuments} from './payroll-domain.js';

export const DESKTOP_BUSINESS_FORMAT='alkarna-mobile-business-backup';
export const DESKTOP_BUSINESS_COLLECTIONS=['employees','parties','warehouses','products','productCategories','expenseCategories','documents','stockMovements','financialMovements','paymentAccounts','recurringExpenses','accountTransfers','counters','auditEvents','appSettings','users','importMappings'];
const clone=value=>structuredClone(value),own=(row,key)=>Object.hasOwn(row||{},key),key=value=>String(value??'');
const payroll=row=>['employee-opening','employee-accrual','employee-payment','employee-closure'].includes(row.kind);
const active=row=>!row.voided&&row.status!=='voided';
const currentMovement=row=>row.status!=='reversed'&&row.isReversal!==true;
const fail=message=>{throw Error('تعذر تجهيز بيانات التبادل: '+message)};
const finite=value=>typeof value==='number'&&Number.isFinite(value)&&Math.abs(value)<=1e14;
function sourceBaseline(card,net,saved,stats){
 const inferred=card-net;if(!finite(saved))return inferred;
 // A saved source opening is stronger than a residual caused by adding many
 // IEEE-754 postings. This bound scales with the actual operands, never an
 // absolute floor that could erase a real tiny balance with no movements.
 const tolerance=Math.min(1e-7,Number.EPSILON*(Math.abs(card)+Math.abs(saved)+(stats?.magnitude||0))*Math.max(1,stats?.count||0)*2);
 return Math.abs(inferred-saved)<=tolerance?saved:inferred;
}
const mobileKeys=new Set(['desktop','desktopId','canonicalId','importKey','importRevisions','qty','price','cost','wholesale','sku','stocks','balance','type','archived','active','records','users','cloudBackup','ownerRecovery','installation','device']);
const documentTransportKeys=['desktop','desktopId','canonicalId','importKey','importRevisions','payrollDocumentId','sourceDocumentId','party','otherParty','account','to','warehouse','from','toWarehouse','date','time','paid','due','revisions','voided','nonProductLines','subtitle'];
function retained(row){return Object.fromEntries(Object.entries(clone(row?.desktop||row||{})).filter(([name])=>!mobileKeys.has(name)));}
function unique(rows,label){const seen=new Set();for(const row of rows){const id=key(row.id??row._id);if(!id||seen.has(id))fail('هوية '+label+' مفقودة أو مكررة');seen.add(id);}return rows;}
function note(row){return own(row,'note')?{note:clone(row.note)}:{};}
function date(row,createdAt){const value=row.occurredAt||`${row.date}T${row.time||'12:00'}:00.000Z`;if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))fail('تاريخ مستند غير صالح');return value||createdAt;}
function sourceBackups(state){return [state.desktopOriginal,...(state.desktopImportSources||[]).map(row=>row.backup)].filter(row=>row?.format==='conta-backup'&&row.collections);}
function mergeOpaque(sources,name){const result=[],seen=new Map();for(const source of sources)for(const input of source.collections[name]||[]){const row=clone(input),id=key(row.id??row._id);if(!id){result.push(row);continue;}if(seen.has(id)){if(JSON.stringify(seen.get(id))!==JSON.stringify(row))fail('نسختان مختلفتان من '+name+': '+id);continue;}result.push(row);seen.set(id,row);}return result;}
function businessEvidence(state){
 const names=['originId','featureSchema','products','parties','accounts','records','warehouses','warehouseMeta','warehouse','salesWarehouse','categories','expenseCategories','employees','payrollFinancialMovements','financialMovements','stockEvents','stockEventSequence','auditEvents','opening','sequences','counters','branding','brandInfo','currency'];
 const strip=value=>Array.isArray(value)?value.map(strip):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([name])=>!['desktop','desktopOriginal','desktopImportSources','canonicalId','desktopId','importKey','importRevisions'].includes(name)).map(([name,item])=>[name,strip(item)])):value;
 return Object.fromEntries(names.filter(name=>state[name]!==undefined).map(name=>[name,strip(state[name])]));
}
const stableJson=value=>JSON.stringify((function order(input){return Array.isArray(input)?input.map(order):input&&typeof input==='object'?Object.fromEntries(Object.keys(input).sort().map(name=>[name,order(input[name])])):input})(value));
function withoutSourceCredentials(value){
 if(Array.isArray(value))return value.map(withoutSourceCredentials);
 if(!value||typeof value!=='object')return value;
 const result=Object.fromEntries(Object.entries(value).map(([name,item])=>[name,withoutSourceCredentials(item)]));
 if(result.format==='conta-backup'&&result.collections)result.collections.users=[];
 if(result.format==='alkarna-web-backup'&&result.state){result.users=[];delete result.state.users;}
 return result;
}

/** Pure snapshot conversion. It never commits, replays business commands, imports
 * credentials or upgrades the caller's state. Journal projections are identified
 * explicitly; missing before/after proofs are never synthesized. */
export function createDesktopBusinessBackup(input,{createdAt=new Date().toISOString()}={}){
 if(typeof createdAt!=='string'||!Number.isFinite(Date.parse(createdAt)))fail('وقت التصدير غير صالح');
 const state=clone(input);validateState(state);
 if(state.featureSchema!==4||typeof state.originId!=='string'||!state.originId)fail('مصدر الهاتف غير معروف');
 const namespace='mobile:'+sha256Hex(state.originId).slice(0,32),identity=(kind,value)=>namespace+':'+kind+':'+key(value);
 const c=Object.fromEntries(DESKTOP_BUSINESS_COLLECTIONS.map(name=>[name,[]])),sources=sourceBackups(state);
 const ids={};
 for(const [name,kind]of [['products','product'],['parties','party'],['accounts','account'],['categories','category']])ids[name]=new Map((state[name]||[]).map(row=>[key(row.id),key(row.desktopId??row.canonicalId)||identity(kind,row.id)]));
 ids.warehouses=new Map(state.warehouses.map(name=>[name,key(state.warehouseMeta?.[name]?.canonicalId??state.warehouseMeta?.[name]?._id??state.warehouseMeta?.[name]?.id)||identity('warehouse',sha256Hex(name).slice(0,24))]));
 ids.records=new Map(state.records.map(row=>[key(row.id),key(row.payrollDocumentId??row.desktopId??row.canonicalId)||identity('record',row.id)]));
 const canonicalValues=new WeakMap();
 const alias=(map,value,label,{optional=false}={})=>{if(value===null||value===undefined||value==='')return optional?null:fail(label+' مفقود');const raw=key(value);if(map.has(raw))return map.get(raw);let values=canonicalValues.get(map);if(!values){values=new Set(map.values());canonicalValues.set(map,values);}if(values.has(raw))return raw;fail(label+' غير موجود');};
 const accountAliases=new Map(ids.accounts);for(const row of state.accounts)for(const value of [row.desktopId,row.canonicalId,row.code,row.desktop?.code].filter(value=>value!=null))if(!accountAliases.has(key(value)))accountAliases.set(key(value),ids.accounts.get(key(row.id)));
 const recordAliases=new Map(ids.records);for(const row of state.records)for(const value of [row.desktopId,row.canonicalId,row.payrollDocumentId,row.desktopDocumentId,row.desktop?.id].filter(value=>value!=null))if(!recordAliases.has(key(value)))recordAliases.set(key(value),ids.records.get(key(row.id)));
 const productAliases=new Map(ids.products);for(const row of state.products)for(const value of [row.desktopId,row.canonicalId].filter(value=>value!=null))if(!productAliases.has(key(value)))productAliases.set(key(value),ids.products.get(key(row.id)));
 const partyAliases=new Map(ids.parties);for(const row of state.parties)for(const value of [row.desktopId,row.canonicalId].filter(value=>value!=null))if(!partyAliases.has(key(value)))partyAliases.set(key(value),ids.parties.get(key(row.id)));
 const warehouseAliases=new Map(ids.warehouses);for(const [name,meta]of Object.entries(state.warehouseMeta||{}))for(const value of [meta.id,meta._id,meta.canonicalId].filter(value=>value!=null))warehouseAliases.set(key(value),ids.warehouses.get(name));
 const reference=(map,value,label)=>alias(map,value,label,{optional:true});
 const mapKnown=(map,value)=>value==null?value:map.get(key(value))??value;
 const partiesById=new Map(state.parties.map(row=>[row.id,row]));
 for(const name of state.warehouses){const meta=state.warehouseMeta?.[name]||{},id=ids.warehouses.get(name);c.warehouses.push({...retained(meta),_id:id,id,name,isSalesDefault:name===state.salesWarehouse,isArchived:meta.archived===true});}
 c.productCategories=(state.categories||[]).map(row=>({...retained(row),id:ids.categories.get(key(row.id)),name:row.name}));
 c.expenseCategories=clone(state.expenseCategories||[]).map(row=>({...row,id:key(row.id)}));
 c.employees=clone(state.employees||[]);
 c.parties=state.parties.map(row=>{const net=row.balance*(row.type==='supplier'?-1:1);return {...retained(row),id:ids.parties.get(key(row.id)),name:row.name,phone:row.phone??'',partyType:row.type,receivable:Math.max(net,0),payable:Math.max(-net,0),isArchived:row.archived===true};});
 c.paymentAccounts=state.accounts.map(row=>{const id=ids.accounts.get(key(row.id));return {...retained(row),id,code:row.code??row.desktop?.code??id,name:row.name,balance:row.balance,openingBalance:row.openingBalance??state.opening.accounts?.[row.id]??0,isActive:row.active!==false,isArchived:row.archived===true,allowNegativeBalance:true};});
 const canonicalAccounts=new Map(c.paymentAccounts.map(row=>[row.id,row]));
 const numberCounts=new Map();for(const r of state.records){const n=key(r.number)||r.kind.toUpperCase()+'-'+r.id;numberCounts.set(n,(numberCounts.get(n)||0)+1);}
 const sourceInfo=r=>r.desktop?.mobileSource?clone(r.desktop.mobileSource):r.mobileSource?clone(r.mobileSource):r.desktop?undefined:({format:'alkarna-mobile-business-backup',originId:state.originId,id:r.id,number:r.number??null});
 const payrollById=new Map(payrollCanonicalDocuments(state).map(row=>[row.id,row]));
 const docByRecord=new Map();
 for(const r of state.records){
  const docId=ids.records.get(key(r.id));
  if(r.desktopMovementId)continue;
  let document;
  if(payroll(r)){
   document=clone(payrollById.get(r.payrollDocumentId));if(!document)fail('سند عامل بلا مصدر');
   document.paymentMethod=reference(accountAliases,document.paymentMethod,'حساب سند العامل');
   for(const name of documentTransportKeys)delete document[name];
  }else{
   const kinds={receive:'payment',pay:'payment',deposit:'account-adjustment',withdraw:'account-adjustment',transfer:'account-transfer',stocktransfer:'transfer',offset:'settlement'};
   const rawNumber=key(r.number)||r.kind.toUpperCase()+'-'+r.id;
   document={...retained(r),id:docId,kind:kinds[r.kind]||r.kind,number:numberCounts.get(rawNumber)===1?rawNumber:'MOB-'+sha256Hex(state.originId).slice(0,8)+'-'+r.kind.toUpperCase()+'-'+r.id,status:active(r)?'posted':'voided',revision:r.revision??0,occurredAt:date(r,createdAt),total:r.total,cashAmount:r.paid??0,paidTotal:r.paid??0,dueTotal:r.due??0,paymentMethod:reference(accountAliases,r.account,'حساب المستند'),partyId:reference(partyAliases,r.party,'طرف المستند'),...note(r),mobileSource:sourceInfo(r)};
   for(const name of ['title','sequence','settlementSequence','businessDate','dailySequence','createdAt','updatedAt','voidedAt','createdBy','createdByName','updatedBy','updatedByName','voidedBy','voidedByName','voidReason','actor'])if(own(r,name)){
    if(name==='title'&&r.desktop&&!own(r.desktop,'title')&&r.title===(r.revisions?.[0]?.title??r.desktop.partyName??r.kind))continue;
    if(r[name]===undefined)delete document[name];else document[name]=clone(r[name]);
   }
   if(document.partyId)document.partyName=partiesById.get(r.party)?.name??r.partyName??null;
   if(['sale','purchase'].includes(r.kind))document.partyBalanceDelta=(r.kind==='sale'?1:-1)*(r.due??0);
   if(['receive','pay'].includes(r.kind)){document.partyCashDirection=r.kind;document.partyBalanceDelta=(r.kind==='receive'?-1:1)*r.total;}
   if(['deposit','withdraw'].includes(r.kind))document.accountAdjustmentDirection=r.kind==='deposit'?'deposit':'withdrawal';
   if(r.warehouse){document.warehouseId=alias(warehouseAliases,r.warehouse,'مخزن المستند');document.warehouseName=r.warehouse;}
   if(r.kind==='stocktransfer'){document.warehouseId=alias(warehouseAliases,r.from,'مخزن التحويل');document.warehouseName=r.from;document.destinationWarehouseId=alias(warehouseAliases,r.toWarehouse,'مخزن الوجهة');document.destinationWarehouseName=r.toWarehouse;}
   if(r.kind==='transfer'){document.fromAccountId=alias(accountAliases,r.account,'حساب التحويل');document.toAccountId=alias(accountAliases,r.to,'حساب الوجهة');document.transferId=r.transferId??docId;}
   if(r.parentDocumentId!=null)document.parentDocumentId=alias(recordAliases,r.parentDocumentId,'الفاتورة الأصلية');
   document.lines=(r.lines||[]).map((line,index)=>{
    const result={...retained(line),id:key(line.id)||docId+':line:'+(index+1),productId:alias(productAliases,line.product,'منتج السطر'),description:line.name??'',quantity:r.kind==='adjustment'?line.delta:line.qty,unitPrice:line.price,lineTotal:['sale','purchase','return'].includes(r.kind)?mobileLineTotal(line):line.lineTotal??0};
    if(line.warehouse)result.warehouseId=alias(warehouseAliases,line.warehouse,'مخزن السطر');
    if(own(line,'costAtSale'))result.costAtSale=clone(line.costAtSale);
    if(r.kind==='sale'&&(!r.desktop||(r.revision??0)!==(r.desktop.revision??0))){result.grossProfit=typeof line.costAtSale==='number'&&Number.isFinite(line.costAtSale)&&line.costAtSale>=0?result.lineTotal-line.qty*line.costAtSale:null;}
    if(line.lineTotalMode==='exact')result.lineTotalMode='exact';else delete result.lineTotalMode;
    for(const name of ['product','qty','price','name','delta','desktop','importKey','canonicalId','desktopId'])delete result[name];
    return result;
   });
   if(['sale','purchase'].includes(r.kind)&&new Set(r.lines.map(line=>line.product)).size!==r.lines.length){document.legacyKey??=docId;document.mobileReadOnlyReason='Repeated product lines retain their original prices, quantities and costs';}
   if(r.kind==='adjustment'&&r.openingCorrection){Object.assign(document,{openingCorrection:true,openingStockBefore:r.openingTotalBefore,openingStockAfter:r.openingTotalAfter,openingCostBefore:r.openingCostBefore,openingCostAfter:r.openingCostAfter,destinationWarehouseId:reference(warehouseAliases,r.openingWarehouseAfter,'مخزن البداية')});}
   if(r.kind==='adjustment'&&r.openingStock)document.openingStockAfter=r.openingTotalAfter??r.lines.reduce((sum,l)=>sum+l.delta,0);
   if(r.kind==='return'){document.partyBalanceDelta=(r.returnParentKind==='purchase'?1:-1)*(r.due??0);document.legacyKey??=docId;}
   if(r.kind==='settlement'){if(!finite(r.partyBalanceDelta))fail('أثر التسوية التاريخية غير صالح');document.partyBalanceDelta=r.partyBalanceDelta;document.legacyKey??=docId;}
   if(r.kind==='offset'){
    document.legacyKey??=docId;document.partyBalanceDelta=-r.total;document.cashAmount=document.paidTotal=document.dueTotal=0;document.paymentMethod=null;
    const peerId=docId+':counterparty';document.mobileOffsetPeerId=peerId;
    for(const name of ['party','otherParty','account','to','warehouse','from','toWarehouse','date','time','paid','due','revisions'])delete document[name];
    c.documents.push({...clone(document),id:peerId,number:document.number+':counterparty',partyId:alias(partyAliases,r.otherParty,'طرف المقاصة'),partyName:partiesById.get(r.otherParty)?.name??'',partyBalanceDelta:r.total,legacyKey:peerId,mobileOffsetPeerId:docId});
   }
   for(const name of ['party','otherParty','account','to','warehouse','from','toWarehouse','date','time','paid','due','revisions'])delete document[name];
  }
  c.documents.push(document);docByRecord.set(key(r.id),document);
 }
 const currentCosts=currentProductCosts(state),newCostSnapshots=new Set();
 const importedPair=row=>row?.mobileSource?.format==='alkarna-web-backup'&&typeof row.mobileImportedCurrentCost==='number'&&Number.isFinite(row.mobileImportedCurrentCost)&&row.mobileImportedCurrentCost>=0&&typeof row.mobileImportedCostBasis==='string'&&/^[a-f0-9]{64}$/.test(row.mobileImportedCostBasis);
 c.products=state.products.map(row=>{const id=ids.products.get(key(row.id)),base=retained(row),cost=currentCosts.get(row.id)?.cost,result={...base,id,sku:row.desktop?.sku??row.sourceSku??identity('sku',row.id),name:row.name,barcode:row.sku||row.desktop?.barcode||null,note:row.note??null,piecePrice:row.price,wholesalePrice:row.wholesale??row.desktop?.wholesalePrice??row.price,pieceCost:row.cost,categoryId:reference(ids.categories,row.categoryId,'فئة المنتج'),stocks:Object.fromEntries(state.warehouses.map(name=>[ids.warehouses.get(name),row.stocks[name]??0])),isArchived:row.archived===true,...(row.expiry?{expiryDate:row.expiry}:{}),...(row.openingTotal!==undefined?{openingStock:row.openingTotal}:{}),...(row.openingWarehouse?{openingWarehouseId:alias(warehouseAliases,row.openingWarehouse,'مخزن البداية')}:{}),...(row.openingCost!==undefined?{openingCost:row.openingCost,legacyOpeningCost:row.openingCost}:{}),mobileSource:{...(row.desktop?.mobileSource||row.mobileSource||{originId:state.originId,id:row.id}),format:'alkarna-web-backup',interchangeFormat:DESKTOP_BUSINESS_FORMAT}};
  const prior=importedPair(row)?row:importedPair(row.desktop)?row.desktop:null;
  if(prior){result.mobileImportedCurrentCost=prior.mobileImportedCurrentCost;result.mobileImportedCostBasis=prior.mobileImportedCostBasis;}
  else{delete result.mobileImportedCurrentCost;delete result.mobileImportedCostBasis;if(typeof cost==='number'&&Number.isFinite(cost)&&cost>=0){result.mobileImportedCurrentCost=cost;newCostSnapshots.add(id);}}
  const normalizedBlank=row.desktop&&(row.desktop.barcode===null||row.desktop.barcode===undefined||row.desktop.barcode==='')&&row.sku===''&&own(row,'sourceSku')&&row.sourceSku===(row.desktop.sku??null);
  if(row.desktop&&(row.sku===(row.desktop.barcode||row.desktop.sku||'')||normalizedBlank)){
   if(own(row.desktop,'barcode'))result.barcode=clone(row.desktop.barcode);else delete result.barcode;
  }else if(own(row,'sku'))result.barcode=row.sku||'';
  if(own(row,'expiry')&&!(row.desktop&&row.expiry===String(row.desktop.expiryDate??row.desktop.expiry??'').slice(0,10))){result.expiryDate=row.expiry||null;delete result.expiry;}
  if(own(row,'wholesale'))result.wholesalePrice=clone(row.wholesale);else if(row.desktop&&own(row.desktop,'wholesalePrice'))result.wholesalePrice=clone(row.desktop.wholesalePrice);else result.wholesalePrice=null;
  for(const [mobile,canonical]of [['price','piecePrice'],['cost','pieceCost']])if(row.desktop&&row[mobile]===Number(row.desktop[canonical]??0)){
   if(own(row.desktop,canonical))result[canonical]=clone(row.desktop[canonical]);else delete result[canonical];
  }
  return result;});

 const movementIds=new Set(),movements=[];
 const recordsByAlias=new Map();for(const r of state.records)for(const id of [r.id,r.desktopId,r.payrollDocumentId,r.desktopDocumentId,r.desktop?.id].filter(value=>value!=null))if(!recordsByAlias.has(key(id)))recordsByAlias.set(key(id),r);
 const recordOf=row=>recordsByAlias.get(key(row.documentId));
 const mappedMovement=(row,index,isPayroll=false)=>{
  const source=row.desktop||row,r=recordOf(row),id=key(row.id)||identity('financial',index);
  const result={...clone(source),...Object.fromEntries(Object.entries(clone(row)).filter(([name])=>!['desktop','importKey','importRevisions'].includes(name))),id,paymentMethod:alias(accountAliases,row.paymentMethod??row.accountId,'حساب الحركة'),documentId:r&&r.desktopMovementId?source.documentId:mapKnown(recordAliases,row.documentId),partyId:reference(partyAliases,row.partyId,'طرف الحركة')};
  if(row.accountId!=null)result.accountId=alias(accountAliases,row.accountId,'حساب الحركة');
  if(result.paymentCode!=null)result.paymentCode=canonicalAccounts.get(result.paymentMethod)?.code??result.paymentCode;
  if(!isPayroll&&r&&r.desktop&&((r.revision??0)!==(r.desktop.revision??0)||active(r)!==(r.desktop.status!=='voided'))&&currentMovement(result)){
   const changedAt=active(r)?r.updatedAt:r.voidedAt;
   // Older source history without a change timestamp remains inert evidence.
   // A projection must not manufacture a dated reversal event.
   if(typeof changedAt!=='string'||!Number.isFinite(Date.parse(changedAt)))return;
   const reverseId=id+':mobile-reversal:'+(r.revision??0),reason=active(r)?'عكس دفعة تعديل محفوظ في الهاتف':'عكس دفعة إلغاء محفوظ في الهاتف';
   Object.assign(result,{status:'reversed',reversedAt:changedAt,reversalMovementId:reverseId,reversalReason:reason,mobileProjectionRevision:r.revision??0});
   if(!movementIds.has(reverseId)){movementIds.add(reverseId);movements.push({id:reverseId,paymentMethod:result.paymentMethod,paymentCode:result.paymentCode,direction:result.direction==='in'?'out':'in',amount:result.amount,documentId:result.documentId,documentNumber:result.documentNumber,partyId:result.partyId??null,partyName:result.partyName??null,type:String(result.type)+':reversal',occurredAt:changedAt,transferId:result.transferId??null,note:reason,status:'posted',isReversal:true,reversalOfMovementId:id,importedFrom:'mobile-business-v1',mobileProjectionRevision:r.revision??0});}
  }
  if(!movementIds.has(id)){movementIds.add(id);movements.push(result);}else if(JSON.stringify(movements.find(m=>m.id===id))!==JSON.stringify(result))fail('حركة مالية متعارضة: '+id);
 };
 for(const [index,row]of (state.financialMovements||[]).entries())if(!String(row.type).startsWith('employee-payment'))mappedMovement(row,index);
 const effectiveDocuments=new Set(movements.filter(currentMovement).map(row=>row.documentId));
 const emit=(document,account,direction,amount,type,suffix='')=>{
  if(!amount)return;const id=document.id+':mobile-current-financial:'+(document.revision??0)+suffix;
  if(movementIds.has(id))fail('تكرار هوية حركة مالية');movementIds.add(id);
  movements.push({id,documentId:document.id,documentNumber:document.number,paymentMethod:account,paymentCode:canonicalAccounts.get(account)?.code??account,direction,amount,type,occurredAt:document.occurredAt,partyId:document.partyId??null,partyName:document.partyName??null,transferId:document.transferId??null,note:document.note??null,status:'posted',revision:document.revision??0,importedFrom:'mobile-business-v1',mobileCurrentEffect:true});
  effectiveDocuments.add(document.id);
 };
 for(const r of state.records){
  if(payroll(r)||!active(r))continue;let document=docByRecord.get(key(r.id));
  if(!document&&r.desktopMovementId){
   if((r.revision??0)===(r.desktop?.revision??0))continue;
   document={id:r.desktop.documentId,number:r.number,occurredAt:date(r,createdAt),revision:r.revision,note:r.note??null};
  }
  if(!document)continue;
  if(effectiveDocuments.has(document.id))continue;
  const account=reference(accountAliases,r.account,'حساب الحركة الحالية');
  if(['sale','purchase'].includes(r.kind))emit(document,account,r.kind==='sale'?'in':'out',r.paid??0,r.kind);
  else if(['receive','pay','deposit','withdraw','expense','transfer','return'].includes(r.kind)){
   const direction=['receive','deposit'].includes(r.kind)||r.kind==='return'&&r.returnParentKind==='purchase'?'in':'out';
   const type=({receive:'party-receipt',pay:'party-payment',deposit:'manual-deposit',withdraw:'manual-withdrawal',transfer:'transfer-out',return:'return'})[r.kind]||r.kind;
   emit(document,account,direction,r.paid??0,type);
   if(r.kind==='transfer')emit(document,alias(accountAliases,r.to,'حساب وجهة التحويل'),'in',r.total,'transfer-in',':in');
  }
 }
 for(const [index,row]of (state.payrollFinancialMovements||[]).entries())mappedMovement(row,index,true);
 // A baseline is an explicitly reconstructed source fact, never a native posting proof.
 const earliest=[createdAt,...c.documents.map(row=>row.occurredAt)].filter(Boolean).sort()[0],baselineAt=earliest.slice(0,10)+'T00:00:00.000Z';
 const financialTotals=new Map(),financialStats=new Map();for(const m of movements)if(currentMovement(m)){financialTotals.set(m.paymentMethod,(financialTotals.get(m.paymentMethod)||0)+(m.direction==='in'?1:-1)*m.amount);const stats=financialStats.get(m.paymentMethod)||{count:0,magnitude:0};stats.count++;stats.magnitude+=Math.abs(m.amount);financialStats.set(m.paymentMethod,stats);}
 const nativeAccountByCanonical=new Map(state.accounts.map(row=>[ids.accounts.get(key(row.id)),row]));
 for(const account of c.paymentAccounts){const native=nativeAccountByCanonical.get(account.id),baseline=sourceBaseline(account.balance,financialTotals.get(account.id)||0,state.opening.accounts?.[native.id],financialStats.get(account.id));if(baseline!==0){
  const id=identity('account-baseline',account.id);if(movementIds.has(id))fail('تكرار رصيد حساب افتتاحي');movements.push({id,documentId:id,documentNumber:id,paymentMethod:account.id,paymentCode:account.code,partyId:null,direction:baseline>0?'in':'out',amount:Math.abs(baseline),type:'opening-balance',occurredAt:baselineAt,note:null,status:'posted',revision:0,importedFrom:'mobile-business-v1',mobileBaseline:true});
 }}
 c.financialMovements=[...movements.filter(row=>!String(row.type).startsWith('employee-payment')),...movements.filter(row=>String(row.type).startsWith('employee-payment'))];
 const partyTotals=new Map(),partyStats=new Map();for(const d of c.documents)if(d.partyId&&d.status==='posted'&&Number.isFinite(d.partyBalanceDelta)){partyTotals.set(d.partyId,(partyTotals.get(d.partyId)||0)+d.partyBalanceDelta);const stats=partyStats.get(d.partyId)||{count:0,magnitude:0};stats.count++;stats.magnitude+=Math.abs(d.partyBalanceDelta);partyStats.set(d.partyId,stats);}
 const nativePartyByCanonical=new Map(state.parties.map(row=>[ids.parties.get(key(row.id)),row]));
 for(const party of c.parties){const native=nativePartyByCanonical.get(party.id),saved=state.opening.parties?.[native.id]*(native.type==='supplier'?-1:1),baseline=sourceBaseline(party.receivable-party.payable,partyTotals.get(party.id)||0,saved,partyStats.get(party.id));if(baseline!==0)c.documents.push({id:identity('party-baseline',party.id),number:'MOB-'+sha256Hex(state.originId).slice(0,8)+'-BASE-P-'+native.id,kind:'settlement',partyId:party.id,partyName:party.name,total:Math.abs(baseline),partyBalanceDelta:baseline,paymentMethod:null,cashAmount:0,paidTotal:0,dueTotal:0,lines:[],note:null,title:'رصيد مصدر سابق',status:'posted',revision:0,occurredAt:baselineAt,legacyKey:identity('party-baseline',party.id),mobileBaseline:true});}
 c.stockMovements=(state.stockEvents||[]).map((row,index)=>{
  const result={...clone(row.desktop||row),...Object.fromEntries(Object.entries(clone(row)).filter(([name])=>!['desktop','importKey','importRevisions'].includes(name)&&!(name==='at'&&row.desktop&&!own(row.desktop,'at')))),id:key(row.id)||identity('stock-event',index),productId:alias(productAliases,row.productId,'منتج حركة المخزون'),warehouseId:alias(warehouseAliases,row.warehouseId,'مخزن الحركة'),documentId:mapKnown(recordAliases,row.documentId),quantityDelta:row.quantityDelta};if(!result.occurredAt)result.occurredAt=row.at||baselineAt;
  const linked=recordsByAlias.get(key(row.documentId)),document=linked&&docByRecord.get(key(linked.id));
  // Number namespaces change presentation, not evidence eligibility. Adapt only
  // an exact existing reference; never heal a missing or mismatched proof.
  if(document&&row.documentNumber===String(linked.number||linked.id))result.documentNumber=document.number;
  return result;
 });
 const stockTotals=new Map();for(const m of c.stockMovements){const k=m.productId+'\u0000'+m.warehouseId;stockTotals.set(k,stockBalanceAfter(stockTotals.get(k)||0,m.quantityDelta));}
 for(const product of c.products)for(const [warehouseId,quantity]of Object.entries(product.stocks)){
  const baseline=stockBalanceAfter(quantity,-(stockTotals.get(product.id+'\u0000'+warehouseId)||0));
  if(baseline!==0)c.stockMovements.push({id:identity('stock-baseline',product.id+':'+warehouseId),productId:product.id,warehouseId,documentId:identity('stock-baseline-source',product.id+':'+warehouseId),documentNumber:'',quantityDelta:baseline,type:'legacy-opening',occurredAt:baselineAt,importedFrom:'mobile-business-v1',mobileBaseline:true});
 }
 c.accountTransfers=state.records.filter(r=>r.kind==='transfer'&&!r.desktopMovementId).map(r=>{const document=docByRecord.get(key(r.id));return {...clone(r.desktopTransfer||{}),id:key(r.desktopTransferId??r.transferId)||document.id,documentId:document.id,number:document.number,fromAccountId:document.fromAccountId,toAccountId:document.toAccountId,amount:r.total,...note(r),occurredAt:document.occurredAt,status:document.status,revision:document.revision};});
 for(const row of state.desktopAccountTransfers||[]){if(c.accountTransfers.some(t=>t.id===row.id||t.documentId===mapKnown(recordAliases,row.documentId)))continue;c.accountTransfers.push({...clone(row.desktop||row),id:row.id,fromAccountId:alias(accountAliases,row.fromAccountId,'حساب مصدر التحويل'),toAccountId:alias(accountAliases,row.toAccountId,'حساب وجهة التحويل'),documentId:mapKnown(recordAliases,row.documentId)});}
 const mapSnapshot=row=>{if(!row||typeof row!=='object')return row;const out=clone(row);if(row.kind&&Array.isArray(row.lines)){out.id=mapKnown(recordAliases,row.payrollDocumentId??row.id);if(row.paymentMethod!=null)out.paymentMethod=alias(accountAliases,row.paymentMethod,'حساب لقطة التدقيق');if(row.partyId!=null)out.partyId=mapKnown(partyAliases,row.partyId);if(row.parentDocumentId!=null)out.parentDocumentId=mapKnown(recordAliases,row.parentDocumentId);out.lines=row.lines.map(l=>({...clone(l),...(l.productId!=null?{productId:mapKnown(productAliases,l.productId)}:{})}));if(payroll(row))for(const name of documentTransportKeys)delete out[name];}return out;};
 c.auditEvents=(state.auditEvents||[]).map((row,index)=>{const result={...clone(row.desktop||row),...Object.fromEntries(Object.entries(clone(row)).filter(([name])=>!['desktop','importKey','importRevisions'].includes(name))),id:key(row.id)||identity('audit',index)};if(!String(row.action).startsWith('payroll.'))result.entityId=mapKnown(recordAliases,row.entityId);for(const name of ['before','after','beforeDocument','afterDocument'])if(own(result,name))result[name]=mapSnapshot(result[name]);return result;});
 c.counters=clone(state.counters||[]);for(const kind of ['sale','purchase','expense','stock-settlement']){const id='documentSequence:'+kind,max=Math.max(state.sequences?.[kind]??0,...state.records.filter(r=>kind==='stock-settlement'?r.settlementSequence:r.kind===kind).map(r=>kind==='stock-settlement'?r.settlementSequence??0:r.sequence??0),0);const saved=c.counters.find(row=>row._id===id);if(saved)saved.value=Math.max(saved.value??0,max);else if(max)c.counters.push({_id:id,value:max});}
 c.recurringExpenses=mergeOpaque(sources,'recurringExpenses');c.importMappings=mergeOpaque(sources,'importMappings');
 c.appSettings=withoutSourceCredentials(mergeOpaque(sources.slice(0,1),'appSettings')).filter(row=>!['currency-settings','currency','invoice-branding','mobile-business-origin'].includes(key(row._id??row.id)));
 c.appSettings.push({_id:'currency-settings',...clone(state.currency),schemaVersion:1});const b=state.brandInfo||{};c.appSettings.push({_id:'invoice-branding',schemaVersion:1,storeName:state.branding||'الكرنه',storePhone:b.phone||'',storeAddress:b.address||'',storeLogoDataUrl:b.logo||'',registrationNumber:b.registrationNumber||'',taxNumber:b.taxNumber||'',footerNote:b.footer||'',nameFont:b.nameFont||'tahoma',nameFontSize:b.nameFontSize||24,nameFontWeight:b.nameFontWeight||800});
 c.appSettings.push({_id:'mobile-business-origin',schemaVersion:1,originId:state.originId});
 const docsByProduct=new Map();for(const document of c.documents)for(const productId of new Set((document.lines||[]).map(line=>line.productId))){const related=docsByProduct.get(productId)||[];related.push(document);docsByProduct.set(productId,related);}
 for(const product of c.products)if(newCostSnapshots.has(product.id))product.mobileImportedCostBasis=canonicalMobileCostBasisSignature(product.id,docsByProduct.get(product.id)||[]);
 // Retain old originals as flat immutable business snapshots. Archives never
 // contain another archive, login collection or live device configuration.
 const archives=new Map(c.appSettings.filter(row=>row.inertSourceArchive).map(row=>[key(row._id??row.id),row]));
 for(const source of sources){
  for(const row of source.collections.appSettings||[])if(row.inertSourceArchive){const safe=withoutSourceCredentials(row),id=key(safe._id??safe.id);if(id&&!archives.has(id)){archives.set(id,safe);c.appSettings.push(safe);}}
  const flat=withoutSourceCredentials(clone(source));flat.collections.users=[];flat.collections.appSettings=(flat.collections.appSettings||[]).filter(row=>!row.inertSourceArchive);flat.counts=Object.fromEntries(DESKTOP_BUSINESS_COLLECTIONS.map(name=>[name,flat.collections[name]?.length??0]));
  const digest=sha256Hex(stableJson(flat.collections)),id='mobile-business:source:'+digest;
  if(!archives.has(id)){const row={_id:id,sourceFormat:'conta-backup',schemaVersion:1,sourceSha256:digest,inertSourceArchive:true,originalBackup:flat};archives.set(id,row);c.appSettings.push(row);}
 }
 const projected=Object.fromEntries(DESKTOP_BUSINESS_COLLECTIONS.map(name=>[name,name==='appSettings'?c[name].filter(row=>!row.inertSourceArchive):c[name]])),sourceSha256=sha256Hex(stableJson(projected)),archiveId='mobile-business:archive:'+sourceSha256;
 if(!archives.has(archiveId))c.appSettings.push({_id:archiveId,sourceFormat:DESKTOP_BUSINESS_FORMAT,schemaVersion:1,sourceSha256,inertSourceArchive:true,businessState:businessEvidence(state)});
 for(const name of ['employees','parties','warehouses','products','productCategories','expenseCategories','documents','stockMovements','financialMovements','paymentAccounts','accountTransfers','auditEvents'])unique(c[name],name);
 for(const account of c.paymentAccounts)if(!finite(account.balance))fail('رصيد حساب غير صالح');
 const canonical={format:'conta-backup',schemaVersion:1,createdAt,appVersion:'mobile-business-v1',encoding:'json-v2',collections:c,counts:Object.fromEntries(DESKTOP_BUSINESS_COLLECTIONS.map(name=>[name,c[name].length]))};
 return {format:DESKTOP_BUSINESS_FORMAT,schemaVersion:1,createdAt,source:{application:'alkarna-mobile',featureSchema:4,originId:state.originId,businessOnly:true},backup:canonical};
}
