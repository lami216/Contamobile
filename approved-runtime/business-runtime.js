import {canReadRecord,recordReadCapability,validatePartyIdentity,partyDisplayName} from './business-identity.js';
import {cashAccount} from './upgrade-state.js';
import {inventoryUnitCost} from './cost-provenance.js';
import {saleFacts,profitSummary} from './commerce-facts.js';
import {applyRecordRevision,financialRecordReadOnly,cartInvoiceTotal,postingLines,invoiceProfit,invoiceDraftLine,mobileInvoiceTotal,mobileLineTotal,saleLineCost,suggestedPurchasePrice,stockBalanceAfter,storedPartyDelta,cashDelta,refreshCurrentProductCosts} from './business-accounting.js';
import {updateMobileInvoiceLine} from './invoice-amount.js';
import {materializePayroll} from './payroll-domain.js';

export function installBusinessRuntime(api,groups){
 const {employees,partyOpening,categories,health}=groups;
 globalThis.karnaBusiness={
  profit:(state,records)=>{const facts=profitSummary(saleFacts(state,{records}));return facts.costKnown?facts.profit:null},
  cashAccount,partyName:partyDisplayName,
  revise:applyRecordRevision,
  unitCost:inventoryUnitCost,
  saleCost:saleLineCost,purchasePrice:suggestedPurchasePrice,stockAfter:stockBalanceAfter,lineTotal:mobileLineTotal,draftLine:invoiceDraftLine,
  cartTotal:(state,lines,old)=>cartInvoiceTotal(lines,old),
  source:r=>r.kind==='party-opening'?{view:'ledger',id:r.party}:r.kind.startsWith('employee-')?{view:'employee-ledger',id:0}:null,
  editedLine(line,fields){
   let next={...line};
   if(Number(fields.quantity)!==Number(line.qty))next=updateMobileInvoiceLine(next,'quantity',fields.quantity);
   if(Number(fields.price)!==Number(line.price))next=updateMobileInvoiceLine(next,'price',fields.price);
   if(document.querySelector('[name=lineTotal]')?.dataset.amountEdited==='true')next=updateMobileInvoiceLine(next,'total',fields.lineTotal);
   if(!Number.isFinite(next.price)||next.price<=0)throw Error('أدخل سعرًا صحيحًا أكبر من صفر');
   return next;
  }
 };
 const previousPost=postSale;
 postSale=function(){
  // Retain mobile stock/expiry/party/payment/warning checks before entering its commit.
  if(new Set(cart.map(line=>line.id)).size!==cart.length)throw Error('لا يمكن تكرار المنتج في الفاتورة');
  const original=S.records.find(r=>r.id===editingId);
  const costs=cart.map(item=>({item:{...item},product:S.products.find(p=>p.id===item.id)}));
  const oldCommit=commitRecord;
  let posted=false;
  commitRecord=function(record){
   if(['sale','purchase'].includes(record.kind)){
    record.lines=postingLines(S,costs.map(row=>row.item),record.kind,record.warehouse,original);
    record.total=mobileInvoiceTotal(record.lines);record.paid=settlement==='note'?0:record.total;record.due=settlement==='note'?record.total:0;
    record.profit=record.kind==='sale'?invoiceProfit(record.lines):0;
   }
   posted=oldCommit(record);return posted;
  };
  try{previousPost();if(posted){const record=S.records.find(r=>r.id===selected);if(record?.kind==='sale')record.profit=invoiceProfit(record.lines);S.lastSale=structuredClone(record);return true}return false}
  finally{commitRecord=oldCommit;}
 };
 const previousUtility=utility;
 utility=function(){return employees.ownsView(view)?employees.viewHtml(view):health?.ownsView?.(view)?health.viewHtml(view):previousUtility()};
 const oldSettings=settings;settings=function(){return oldSettings()+(api.actor?.role==='owner'?health?.managerButton?.()||'':'')};
 const previousMore=more;
 more=function(){return previousMore()+ (api.can('employees.view')?section('الموظفون')+listMenu([['الموظفون','الحسابات والرواتب والحركات','people','site:feature:employees-list']]):'')+(api.actor?.role==='owner'&&health?.managerButton?health.managerButton():'')};
 const previousLedger=ledger;
 ledger=function(){return previousLedger()+partyOpening.panel(selected)};
 const previousExpense=utility;
 utility=function(){const html=previousExpense();return view==='expenses'?categories.managerButton()+html:html};
 const originalEffect=partyDelta,originalCash=accountDelta;
 partyDelta=function(record,id){return ['party-opening','return'].includes(record.kind)?storedPartyDelta(S,record,id):originalEffect(record,id)};
 accountDelta=function(record,id){return record.kind.startsWith('employee-')||['party-opening','return'].includes(record.kind)?cashDelta(record,id):originalCash(record,id)};
 documentLabels.return='مرتجع';
 documentLabels['party-opening']='رصيد بداية طرف';documentLabels['employee-accrual']='استحقاق راتب';documentLabels['employee-payment']='حركة حساب موظف';
 titles.employees='الموظفون';titles['employee-ledger']='حساب الموظف';
 sectionThemes.employees=sectionThemes.parties;sectionThemes['employee-ledger']=sectionThemes.parties;
 const oldRows=rows;rows=function(list,description){return oldRows(list.filter(r=>canReadRecord(S,r,api.can)),description)};
 const oldLive=liveRecords;
 liveRecords=function(){return oldLive().filter(r=>canReadRecord(S,r,api.can))};
 const oldPermission=api.permissionFor;
 api.permissionFor=function(action){
  if(action==='go:employees'||action==='go:employee-ledger')return 'employees.view';
  const pieces=action.split(':');const reading=pieces[0]==='explain'&&pieces[1]==='document'?S.records.find(r=>r.id===Number(pieces[2])):pieces[0]==='invoice'||pieces[0]==='source-location'?S.records.find(r=>r.id===Number(pieces[1])):action.startsWith('site:feature:document-')?S.records.find(r=>r.id===selected):null;if(reading)return recordReadCapability(S,reading,api.can);if(pieces[0]==='explain'&&pieces[1]==='document'&&S.records.find(r=>r.id===Number(pieces[2]))?.kind.startsWith('employee-'))return 'employees.view';if(action.startsWith('site:feature:document-')&&S.records.find(r=>r.id===selected)?.kind.startsWith('employee-'))return 'employees.view';
  const [command,id]=pieces,record=['invoice','source','source-location','void','confirm-void'].includes(command)?S.records.find(r=>r.id===Number(id||selected)):null;
  if(record?.kind.startsWith('employee-'))return ['invoice','source-location'].includes(command)?'employees.view':record.kind==='employee-payment'?'employees.pay':'employees.manage';
  if(record?.kind==='party-opening'&&['source','void','confirm-void'].includes(command))return 'party.opening.manage';
  return oldPermission(action);
 };
 const dispatch=api.engineDispatch;
 api.engineDispatch=async function(action){
  if(action==='save-party'||action==='pos:save-party'){const f=api.form(),editing=action==='save-party'&&modal==='partyedit';const identity=validatePartyIdentity(S,{...f,...(editing?{id:selected}:{}),type:action==='pos:save-party'?(saleType==='sale'?'customer':'supplier'):partyType});for(const key of ['name','phone']){const node=document.querySelector('#sheet-form [name='+key+']');if(node)node.value=identity[key];}}
  const [command,id]=action.split(':'),record=S.records.find(r=>r.id===Number(id||selected));
  if(command==='source-location'&&record?.kind.startsWith('employee-')){clearLocatedRecordFocus();return employees.openRecord(record,'source')}
  if(/^(invoice:|go:|back$|accounts-tab:|resource:)/.test(action))employees.clearHighlight();
  if(record&&financialRecordReadOnly(S,record)&&['source','void','confirm-void'].includes(command))throw Error('هذا المستند التاريخي للعرض فقط؛ راجع المصدر الأصلي.');
  if(record&&['source','void','confirm-void'].includes(command)){
   if(record.kind.startsWith('employee-'))return employees.openRecord(record,command==='source'?'edit':'void');
   if(record.kind==='party-opening')return command==='source'?partyOpening.openRecord(record.id):partyOpening.action('party-opening-void',String(record.id));
  }
  if(await categories.before(action))return;
  if(record&&financialRecordReadOnly(S,record)&&['source','void','confirm-void'].includes(command))throw Error('هذا المستند التاريخي للعرض فقط؛ راجع المصدر الأصلي.');
  const result=await dispatch(action);return result;
 };
 const oldNew=newRecord;
 newRecord=function(kind){const record=oldNew(kind),old=S.records.find(r=>r.id===editingId);if(kind==='expense')Object.assign(record,categories.snapshot(api.form(),old));return record};
 document.addEventListener('input',event=>{
  if(modal!=='pos-line'||!['quantity','price','lineTotal'].includes(event.target.name))return;
  const field=event.target,form=field.closest('form'),quantity=form?.elements.quantity,price=form?.elements.price,total=form?.elements.lineTotal;
  if(!total)return;
  if(field===total){total.dataset.amountEdited='true';if(Number(quantity.value)>0&&Number(total.value)>0)price.value=String(Number(total.value)/Number(quantity.value));}
  else{delete total.dataset.amountEdited;const q=Number(quantity.value),p=Number(price.value);if(Number.isFinite(q*p))total.value=String(q*p);}
 });
 return {
  async materialize(){if(!S.employees?.length)return false;const result=await materializePayroll(S,{actor:api.actor,context:'mobile-read',now:new Date()});if(result.changed){api.replaceState(result.state);return true}return false},
  refreshCosts:()=>refreshCurrentProductCosts(S)
 };
}
