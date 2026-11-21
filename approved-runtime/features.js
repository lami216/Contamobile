import {isStockSettlementDocument,nextStockSettlementSequence} from './stock-settlement.js';
import {prepareExpenseRecordDateTime} from './expense-date-time.js';
import {installAccountingHealthFeatures} from './feature-health.js';
import {installEmployeeFeatures} from './feature-employees.js';
import {installPartyOpeningFeatures} from './feature-party-opening.js';
import {installExpenseCategoryFeatures} from './feature-expense-categories.js';
import {installBusinessRuntime} from './business-runtime.js';
import {refreshCurrentProductCosts} from './cost-provenance.js';
import {upgradeState,validateFeatureState,nextDocumentNumber,currencyCode,activeWarehouses,cashAccount} from './upgrade-state.js';
import {seedStockEvents,recordStockEvents,recordStockRevision,applyOpeningMetadata,openingState} from './stock-domain.js';
import {installReportFeatures} from './feature-reports.js';
import {installAdminFeatures} from './feature-admin.js';
import {installSystemFeatures} from './feature-system.js';
import {installImportFeatures} from './feature-import.js';
import {installStockFeatures} from './feature-stock.js';
import {repairArchivedBalances,reconcileHistoricalArchives} from './accounting-lifecycle.js';

export function prepareFeatureState(state){const before=JSON.stringify(state);upgradeState(state);seedStockEvents(state);refreshCurrentProductCosts(state);validateFeatureState(state);repairArchivedBalances(state);return before!==JSON.stringify(state);}
const stockSnapshot=state=>({products:state.products.map(p=>({id:p.id,stocks:{...p.stocks}}))});
export function installFeatures(api){
 const health=installAccountingHealthFeatures(api),employees=installEmployeeFeatures(api),partyOpening=installPartyOpeningFeatures(api),categories=installExpenseCategoryFeatures(api);
 const report=installReportFeatures(api),admin=installAdminFeatures(api),stock=installStockFeatures(api),importer=installImportFeatures(api),system=installSystemFeatures(api);
 globalThis.karnaCurrency=()=>currencyCode(S);
 const groups=[health,employees,partyOpening,categories,report,admin,stock,importer,system];
 const commandOf=action=>{const parts=action.split(':');return {command:parts[2],id:parts[3],rest:parts[4]}};
 const groupFor=command=>groups.find(g=>g.handles(command));
 const originalSite=api.siteAction;api.siteAction=async function(action){
  if(action==='site:user'||action.startsWith('site:user:')||action==='site:new-user')admin.resetUser();
  if(action.startsWith('site:feature:')){const {command,id,rest}=commandOf(action),group=groupFor(command);if(!group)throw Error('الإجراء غير متاح');const cap=group.permission(command,id);if(cap&&!api.can(cap))throw Error('لا تسمح صلاحيات حسابك بهذا الإجراء');return group.action(command,id,rest);}
  if(action.startsWith('site:archive-product:'))return stock.action('stock-archive',action.split(':')[2]);
  if(action.startsWith('site:unarchive:product:'))return stock.action('stock-restore',action.split(':')[3]);
  if(action==='site:save-user')return admin.saveUser();
  if(action==='site:export-excel')return report.output('excel');if(action==='site:export-pdf')return report.output('pdf');
  if(action.startsWith('site:archive-account:')&&Number(action.split(':')[2])===cashAccount(S)?.id)throw Error('لا يمكن أرشفة وسيلة الدفع النقدية الأساسية');
  return originalSite(action);
 };
 const originalPermission=api.permissionFor;api.permissionFor=function(action){
  if(action.startsWith('site:archive-product:'))return 'products.delete';
  if(action.startsWith('site:unarchive:product:'))return 'products.edit';
  if(action.startsWith('site:feature:')){const {command,id}=commandOf(action);return groupFor(command)?.permission(command,id)||null;}
  const [command,id]=action.split(':'),r=['source','void','confirm-void'].includes(command)?S.records.find(r=>r.id===Number(id||selected)):command==='commit-pending'?pendingRecord:null;
  if(r){const suffix=['void','confirm-void'].includes(command)?'delete':command==='source'||editingId?'edit':'create';
   if(r.openingAccountCorrection)return 'banks.balance_correct'+(suffix==='create'?'':'.'+suffix);
   const cap={stocktransfer:'warehouses.transfer',adjustment:'warehouses.adjust',transfer:'banks.transfer',deposit:'banks.deposit_withdraw',withdraw:'banks.deposit_withdraw'}[r.kind];if(cap)return cap+(suffix==='create'?'':'.'+suffix);
  }
  return originalPermission(action);
 };
 const originalNewRecord=newRecord;newRecord=function(kind){const r=originalNewRecord(kind),old=S.records.find(x=>x.id===editingId);if(['sale','purchase','expense'].includes(kind)){r.sequence=old?.sequence||nextDocumentNumber(S,kind);r.number=old?.number||String(r.sequence);}if(kind==='expense'&&stock.date())r.date=stock.date();return r};
 function currentCosts(){refreshCurrentProductCosts(S)}
 const originalStamp=stampRecordChange;stampRecordChange=function(record,previous){
  const expense=record.kind==='expense',created=expense&&Object.hasOwn(record,'createdAt'),createdAt=record.createdAt,updatedAt=record.updatedAt;
  originalStamp(record,previous);
  if(expense){if(created)record.createdAt=createdAt;else delete record.createdAt;record.updatedAt=previous?updatedAt:record.recordedAt;}
 };
 const originalCommit=commitRecord;commitRecord=function(r){
  const beforeState=stockSnapshot(S),old=S.records.find(x=>x.id===r.id),previous=old?structuredClone(old):null;
  if(old)for(const [key,value]of Object.entries(old))if(!Object.hasOwn(r,key))r[key]=structuredClone(value);
  const now=new Date().toISOString();if(r.kind==='expense'){const timed=prepareExpenseRecordDateTime(r,old,new Date(now));for(const key of ['occurredAt','createdAt','recordedAt'])if(!Object.hasOwn(timed,key))delete r[key];Object.assign(r,timed);if(!old)r.postingOrder=S.records.reduce((n,x)=>Math.max(n,x.postingOrder||0),0)+1;else if(Object.hasOwn(old,'postingOrder'))r.postingOrder=old.postingOrder;else delete r.postingOrder;}else if(!old){r.occurredAt=now;r.postingOrder=S.records.reduce((n,x)=>Math.max(n,x.postingOrder||0),0)+1;}else{for(const key of ['occurredAt','postingOrder']){if(Object.hasOwn(old,key))r[key]=old[key];else delete r[key];}}for(const line of r.lines||[])line.id??=crypto.randomUUID();
  if(old?.openingAccountCorrection){const latest=S.records.find(x=>!x.voided&&x.openingAccountCorrection&&x.account===old.account);if(latest?.id!==old.id)throw Error('يمكن تعديل آخر تصحيح فعال فقط');}
  if(!old&&['sale','purchase','expense'].includes(r.kind)){r.sequence=nextDocumentNumber(S,r.kind);r.number=String(r.sequence);}
  const numberingState=isStockSettlementDocument(r)?structuredClone(S):null;
  if(isStockSettlementDocument(r)){if(old)r.settlementSequence=old.settlementSequence;else{r.canonicalId??='adjustment-'+crypto.randomUUID();r.number??='ADJ-'+Date.now()+'-'+crypto.randomUUID().slice(0,6);r.settlementSequence=nextStockSettlementSequence(S);}}
  if(!originalCommit(r)){if(numberingState)api.replaceState(numberingState);return false;}
  S.auditEvents??=[];S.auditEvents.push({id:crypto.randomUUID(),action:r.kind+(previous?'.update':'.post'),status:'committed',entityId:String(r.id),createdAt:r.updatedAt,actor:{id:api.actor?.id,name:api.actor?.name,principalType:api.actor?.role==='owner'?'owner':'user'}});
  reconcileHistoricalArchives(S,r,previous);
  if(previous)applyOpeningMetadata(S,previous,true);
  recordStockRevision(S,previous,r,beforeState,previous?'edit':'post');applyOpeningMetadata(S,r);
  if(r.openingStock)for(const l of r.lines){const p=S.products.find(p=>p.id===l.product);p.openingTotal=(p.openingTotal||0)+l.delta;p.openingCost=l.price;p.openingWarehouse=r.warehouse;}
  if(r.openingAccountCorrection)S.accounts.find(a=>a.id===r.account).openingBalance=r.openingBalanceAfter;
  if(r.sequence)S.sequences[r.kind]=Math.max(S.sequences[r.kind]||0,r.sequence);
  if(r.kind==='purchase'||r.openingCorrection||r.openingStock)currentCosts();render();return true;
 };
 const originalEngine=api.engineDispatch;api.engineDispatch=async function(action){
  const voidBeforeState=['confirm-void','save-product'].includes(action)?stockSnapshot(S):null;
  const oldView=view,oldModal=modal,oldEditing=editingId,oldSelected=selected,category=action==='save-product'?admin.category():null;
  const oldWarehouse=action==='save-warehouse'?warehouseEdit:null,oldRecord=action==='confirm-void'?structuredClone(S.records.find(r=>r.id===selected)):null,knownIds=new Set(S.records.map(r=>r.id));
  if(oldRecord?.openingCorrection){const latest=S.records.find(r=>!r.voided&&r.openingCorrection&&r.openingProduct===oldRecord.openingProduct);if(latest?.id!==oldRecord.id)throw Error('يمكن إلغاء آخر تصحيح فعال فقط');const p=S.products.find(p=>p.id===oldRecord.openingProduct),origin=await openingState(S,p);if(origin.consumed>oldRecord.openingTotalBefore)throw Error('التصحيح استُهلك بحركات لاحقة؛ راجع سجل المخزون');}
  if(action==='save-product'&&category&&!S.categories.some(c=>c.id===Number(category)))throw Error('الفئة غير موجودة');
  if(action==='save-product'&&oldModal==='product'&&S.warehouseMeta[api.form().openingWarehouse]?.archived)throw Error('اختر مخزنًا فعالًا');
  const chosenWarehouse=action.startsWith('warehouse:')?action.slice('warehouse:'.length):action.startsWith('pos:warehouse-pick:')?action.slice('pos:warehouse-pick:'.length):null;
  if(chosenWarehouse&&S.warehouseMeta[chosenWarehouse]?.archived&&!(action.startsWith('pos:warehouse-pick:')&&S.records.find(r=>r.id===editingId)?.warehouse===chosenWarehouse))throw Error('اختر مخزنًا فعالًا');
  if(action==='confirm-void'&&oldRecord?.openingAccountCorrection){const latest=S.records.find(r=>!r.voided&&r.openingAccountCorrection&&r.account===oldRecord.account);if(latest?.id!==oldRecord.id)throw Error('يمكن إلغاء آخر تصحيح فعال فقط');}
  const sourced=action.startsWith('source:')?S.records.find(r=>r.id===Number(action.split(':')[1])):null;
  if(sourced&&(sourced.openingStock||sourced.openingCorrection)){const product=sourced.openingProduct||sourced.lines[0]?.product;editingId=null;return stock.action('opening',String(product));}
  if(sourced?.openingAccountCorrection){await admin.action('account-opening',String(sourced.account));editingId=sourced.id;render();return;}
  if(await stock.before(action))return;
  if(action==='post-sale'||action==='post-party'||action==='post-cash'){
   const account=Number(api.form().account||paymentAccount),old=S.records.find(r=>r.id===editingId);if(action!=='post-sale'||settlement==='paid')if(!S.accounts.some(a=>a.id===account&&((!a.archived&&a.active!==false)||old?.account===account)))throw Error('اختر وسيلة دفع فعالة');
   const to=Number(api.form().to);if(to&&!S.accounts.some(a=>a.id===to&&((!a.archived&&a.active!==false)||old?.to===to)))throw Error('اختر وسيلة دفع فعالة');
  }
  if(action==='new:sale'&&!cart.length&&activeWarehouses(S).includes(S.salesWarehouse)){S.warehouse=S.salesWarehouse;syncStock();}
  const result=await originalEngine(action);
  if(action==='save-product'&&!['product','productedit'].includes(modal)){const p=oldModal==='productedit'?S.products.find(p=>p.id===oldSelected):S.products.at(-1);if(p)p.categoryId=category?Number(category):null;for(const r of S.records.filter(r=>r.openingStock&&!knownIds.has(r.id))){r.occurredAt=r.createdAt=r.updatedAt=new Date().toISOString();r.postingOrder=S.records.reduce((n,x)=>Math.max(n,x.postingOrder||0),0)+1;for(const line of r.lines)line.id??=crypto.randomUUID();recordStockRevision(S,null,r,voidBeforeState);for(const l of r.lines){const product=S.products.find(p=>p.id===l.product);product.openingTotal=l.delta;product.openingCost=l.price;product.openingWarehouse=r.warehouse;}}currentCosts();render();}
  if(action==='save-account'){const a=S.accounts.at(-1);a.active=true;a.openingBalance=S.opening.accounts[a.id]||0;}
  if(action==='save-warehouse'&&modal!=='warehouse-editor'){
   // The engine closes the form on success; locate its new name through state instead.
   const newName=oldWarehouse&&!S.warehouses.includes(oldWarehouse)?S.warehouses.find(w=>!Object.hasOwn(S.warehouseMeta,w)):S.warehouses.at(-1);
   if(newName){S.warehouseMeta[newName]=oldWarehouse?S.warehouseMeta[oldWarehouse]||{archived:false}:{archived:false};if(oldWarehouse&&oldWarehouse!==newName){delete S.warehouseMeta[oldWarehouse];if(S.salesWarehouse===oldWarehouse)S.salesWarehouse=newName;for(const e of S.stockEvents)if(e.warehouseId===oldWarehouse)e.warehouseId=newName;for(const p of S.products)if(p.openingWarehouse===oldWarehouse)p.openingWarehouse=newName;for(const r of S.records)for(const l of r.lines||[])if(l.warehouse===oldWarehouse)l.warehouse=newName;}}
  }
  if(action==='confirm-void'&&oldRecord&&!oldRecord.voided&&S.records.find(r=>r.id===oldRecord.id)?.voided){const cancelled=S.records.find(r=>r.id===oldRecord.id);cancelled.revision=(oldRecord.revision||0)+1;cancelled.revisions=[...(oldRecord.revisions||[]),{...oldRecord,revisions:undefined}];cancelled.updatedAt=cancelled.voidedAt;S.auditEvents??=[];S.auditEvents.push({id:crypto.randomUUID(),action:oldRecord.kind+'.void',status:'committed',entityId:String(oldRecord.id),createdAt:cancelled.voidedAt,actor:{id:api.actor?.id,principalType:api.actor?.role==='owner'?'owner':'user'}});recordStockRevision(S,oldRecord,null,voidBeforeState,'void');applyOpeningMetadata(S,oldRecord,true);if(oldRecord.openingAccountCorrection)S.accounts.find(a=>a.id===oldRecord.account).openingBalance=oldRecord.openingBalanceBefore;reconcileHistoricalArchives(S,oldRecord,null,true);currentCosts();render();}
  stock.after(action,oldView,oldModal,oldEditing);return result;
 };
 const oldSheet=sheet;sheet=function(){for(const group of groups){const html=group.sheet();if(html)return html;}let html=stock.expenseHtml(oldSheet());if(modal==='expense')html=html.replace('<form id="sheet-form">','<form id="sheet-form">'+categories.expenseField(S.records.find(r=>r.id===editingId))); if(modal==='site-export')html=html.replace(/<button type="button" data-action="site:export-print">[\s\S]*?<\/button>/,'');return html;};
 const oldProduct=productDetail;productDetail=function(){const p=S.products.find(p=>p.id===selected),html=oldProduct().replace(/<button[^>]*data-action="site:(?:archive-product:|unarchive:product:)[^"]*"[^>]*>[\s\S]*?<\/button>/g,'');return html+(p?`<div class="management-actions"><button class="feature-button" data-action="site:feature:opening:${p.id}">رصيد البداية وسجله</button></div>`+stock.productActions(p):'')};
 const oldInvoice=invoice;invoice=function(){return oldInvoice().replace(/<button class="document-print" data-action="site:print">[\s\S]*?<\/button>/,`<button class="document-print" data-action="site:feature:document-output">${icon('receipt')}تصدير الفاتورة</button>`)};
 const oldRender=render;render=function(){oldRender();stock.restoreInputs();
  const root=document.querySelector('#phone');if(!api.actor||!root)return;
  if(view==='reports'){const b=root.querySelector('.data-toolbar [data-action="site:export"]');if(b)b.textContent='تصدير التقرير';}
  for(const option of root.querySelectorAll('#sheet-form select[name=account] option,#sheet-form select[name=to] option')){const a=S.accounts.find(a=>a.id===Number(option.value)),old=S.records.find(r=>r.id===editingId);if(a?.active===false&&a.id!==old?.account&&a.id!==old?.to)option.remove();}
  for(const button of root.querySelectorAll('[data-action^="pos:warehouse-pick:"]'))if(S.warehouseMeta[button.dataset.action.slice('pos:warehouse-pick:'.length)]?.archived&&S.records.find(r=>r.id===editingId)?.warehouse!==button.dataset.action.slice('pos:warehouse-pick:'.length))button.remove();
  for(const button of root.querySelectorAll('[data-action^="warehouse:"]'))if(S.warehouseMeta[button.dataset.action.slice('warehouse:'.length)]?.archived)button.remove();
  if(view!=='reports')for(const option of root.querySelectorAll('select[name=openingWarehouse] option,select[name=warehouse] option'))if(S.warehouseMeta[option.value]?.archived)option.remove();
  for(const group of root.querySelectorAll('.currency'))group.textContent=currencyCode(S);
  api.translateUi(root);
 };
 document.addEventListener('change',event=>{const target=event.target;if(target.dataset.featureChange)act('site:feature:'+target.dataset.featureChange+':'+target.value);if(target.dataset.featurePermission)act('site:feature:permission-toggle:'+target.dataset.featurePermission+':'+target.checked);});
 document.addEventListener('change',async event=>{if(event.target.id!=='feature-brand-logo'||!event.target.files?.[0])return;try{
  const file=event.target.files[0],actorId=api.actor?.id;if(!api.can('settings.branding.manage'))return;if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>5*1024*1024)throw Error('اختر صورة PNG أو JPG أو WebP أصغر من 5 ميغابايت');const bitmap=await createImageBitmap(file),canvas=document.createElement('canvas'),scale=Math.min(1,512/Math.max(bitmap.width,bitmap.height));canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();const logo=canvas.toDataURL('image/png');if(logo.length>700000)throw Error('صورة الشعار كبيرة جدًا');if(api.actor?.id!==actorId||view!=='branding'||!api.can('settings.branding.manage'))return;admin.setLogo(logo);
  }catch(e){api.fail(e.message)}});
 const business=installBusinessRuntime(api,{employees,partyOpening,categories,health});
 return {report,admin,stock,business,async afterSave(){for(const group of [health,employees,partyOpening,categories])await group.afterSave?.();stock.afterSave();await importer.afterSave();system.afterSave()},afterFailure(){for(const group of [health,employees,partyOpening,categories,stock])group.afterFailure?.()}};
}
