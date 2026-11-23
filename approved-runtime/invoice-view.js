import {isArchiveStockClearance} from './archive-stock-clearance.js';
import {recordNumber,recordReference} from './document-presentation.js';
import {partyDisplayName} from './business-identity.js';
import {financialRecordReadOnly} from './business-accounting.js';
import {mobileLineTotal} from './invoice-amount.js';
import {movementStatement} from './movement-statement.js';
import {documentSavedNote} from './document-note.js';
// Document details deliberately use their own markup. Register decorators
// and report metric styles must not turn this document into a list of cards.
export function invoiceDocument(state,record,{esc,money,icon,labels,atSource=false,canViewPartyBalance=false}) {
  const r=record,readOnly=financialRecordReadOnly(state,record),partial=['sale','purchase'].includes(r.kind)&&r.paid>0&&r.due>0,noncash=['stocktransfer','adjustment','offset','settlement','party-opening','employee-opening','employee-accrual','employee-closure'].includes(r.kind);
  const outgoing=['purchase','expense','pay','withdraw',...(record.employeePaymentDirection==='deposit'?[]:['employee-payment'])].includes(r.kind);
  const account=state.accounts.find(a=>a.id===r.account);
  const otherAccount=state.accounts.find(a=>a.id===r.to);
  const party=state.parties.find(p=>p.id===r.party);
  const otherParty=state.parties.find(p=>p.id===r.otherParty);
  const label=labels[r.kind]||'مستند';
  const cashStatement=['receive','pay','deposit','withdraw','transfer'].includes(r.kind),savedNote=documentSavedNote(r),note=savedNote?.value||'';
  const noteInIdentity=savedNote?.label==='البيان'&&partyDisplayName(state,r)===savedNote.value;
  const statement=cashStatement?movementStatement(r,({receive:'استلام من الطرف',pay:'دفع للطرف',deposit:'إيداع',withdraw:'سحب',transfer:'سند تحويل بين الحسابات'})[r.kind]):'';
  const number=recordNumber(r),reference=recordReference(r);
  const paymentNote=partial?'دفعة جزئية محفوظة من المصدر':noncash?'عملية غير نقدية':r.due?'كامل المبلغ ملاحظة على الحساب':r.kind==='transfer'?'تحويل بين الحسابات':(r.kind==='receive'?'استلام مسجل':r.kind==='deposit'?'إيداع مسجل':['pay','withdraw','expense'].includes(r.kind)?'صرف مسجل':'دفع كامل')+' · '+(account?.name||'');
  const datum=(name,value,literal=false)=>value!==undefined&&value!==null&&value!==''?`<div class="document-datum"><dt>${esc(name)}</dt><dd${literal?' data-user-content dir="auto" style="white-space:pre-wrap"':''}>${esc(value)}</dd></div>`:'';
  const lineHeading=r.kind==='adjustment'?'تفاصيل التصحيح':r.kind==='stocktransfer'?'البضاعة المحوّلة':'بنود الفاتورة';
  const lineBody=(r.lines||[]).map((line,i)=>`<tr><td class="document-line-name"><span class="document-product-label"><span class="document-line-number">${i+1}</span><strong>${esc(line.name)}</strong></span></td><td>${esc(line.qty)}</td><td>${money(line.price,'xs')}</td><td>${money(mobileLineTotal(line),'xs')}</td></tr>`).join('');
  return `<div class="document-page">
    <article class="invoice-document" aria-label="${esc(label)}">
      <header class="document-heading"><div>${state.brandInfo?.logo?`<img class="document-brand-logo" src="${esc(state.brandInfo.logo)}" alt="">`:""}<p class="document-shop">${esc(state.branding||'الكرنه')}</p><h2>${esc(label)}</h2></div><span class="document-status ${r.voided?'is-void':''}">${r.voided?'ملغاة':partial?'مدفوعة جزئيًا':noncash?'حركة مسجلة':r.due?'على الحساب':['sale','purchase','expense'].includes(r.kind)?'مدفوعة':'مسجلة'}</span></header>
      <div class="document-reference"><span dir="ltr">${esc(number)}</span><time datetime="${esc(r.date)}">${esc(r.date)} <span dir="ltr">${esc(r.time)}</span></time></div>
      <dl class="document-information">${datum(r.party?'الطرف':'البيان',!r.party&&cashStatement?statement:partyDisplayName(state,r),Boolean(r.party)||cashStatement&&Boolean(note)||noteInIdentity)}${r.party&&cashStatement?datum('البيان',statement,Boolean(note)):''}${number!==reference?datum('المرجع الأصلي',reference):''}${partial?datum('المدفوع',r.paid)+datum('المتبقي',r.due):''}${datum('وسيلة الدفع',noncash?'لا توجد حركة نقدية':partial?account?.name||'—':r.due?'ملاحظة على الحساب':account?.name||'—')}${datum('المخزن',r.from?null:r.warehouse)}${datum('من مخزن',r.from)}${datum('إلى مخزن',r.toWarehouse)}${datum('إلى حساب',otherAccount?.name)}${datum('الطرف المقابل',otherParty?.name)}${datum('الموظف',state.employees?.find(e=>e.id===r.employeeId)?.name)}${r.kind==='employee-opening'?datum('الاتجاه',r.employeeOpeningDirection==='payable'?'مستحق للعامل':'مستحق على العامل'):''}${r.kind==='employee-closure'?datum('احتياطي الأجور المحرر',r.salaryReserveReleased):''}${datum('بداية الفترة',r.periodStart)}${datum('نهاية الفترة',r.periodEnd)}${r.kind==='party-opening'?datum('الاتجاه',r.partyOpeningDirection==='receivable'?'لنا':'علينا'):''}${r.kind==='adjustment'&&Number.isFinite(r.newQty)?datum('الرصيد قبل التصحيح',r.newQty-r.lines[0]?.delta)+datum('الرصيد بعد التصحيح',r.newQty):''}</dl>
      ${lineBody?`<section class="document-items"><h3>${lineHeading}</h3><div class="document-lines-frame"><table class="document-lines" aria-label="${lineHeading}"><colgroup><col style="width:43%"><col style="width:13%"><col style="width:21%"><col style="width:23%"></colgroup><thead><tr><th scope="col">المنتج</th><th scope="col">الكمية</th><th scope="col">سعر الوحدة</th><th scope="col">المجموع</th></tr></thead><tbody>${lineBody}</tbody></table></div></section>`:''}
      ${savedNote&&!cashStatement&&!noteInIdentity?`<div class="document-note"><strong>${savedNote.label==='البيان'?'البيان':'ملاحظات'}</strong><p data-user-content dir="auto" style="white-space:pre-wrap">${esc(savedNote.value)}</p></div>`:''}
      <footer class="document-total"><div><span>${noncash?'قيمة العملية':'الإجمالي'}</span><small>${r.voided?'أُلغي أثر هذا المستند':esc(paymentNote)}</small></div>${money(r.total,'document-total-amount',['employee-opening','employee-closure'].includes(r.kind)?'':outgoing?'negative':'positive')}</footer>
    </article>
    ${r.due&&!r.voided?`<div class="document-note"><strong>المبلغ المسجل على الحساب</strong><p>هذه قيمة الفاتورة عند تسجيلها. الدفعات اللاحقة تظهر في كشف حساب الطرف ولا تغيّر هذا المستند.</p>${canViewPartyBalance&&party?`<div class="report-line"><span>رصيد الحساب الحالي</span>${money(Math.abs(party.balance),'xs',(party.type==='supplier'?-1:1)*party.balance>=0?'positive':'negative')}</div><button class="text-btn" data-action="ledger:${party.id}">عرض كشف الحساب</button>`:''}</div>`:''}
    <div class="document-actions" role="group" aria-label="إجراءات المستند"><button class="document-print" data-action="site:print">${icon('print')}طباعة / حفظ PDF</button>${r.kind!=='offset'?`${!atSource&&!r.voided?`<button data-action="source-location:${r.id}">${icon('arrow')}الانتقال إلى المصدر</button>`:''}${atSource&&!r.voided&&!readOnly&&!isArchiveStockClearance(r)?`<button data-action="source:${r.id}">${icon('edit')}${['sale','purchase','expense'].includes(r.kind)?'تعديل الفاتورة':'تعديل العملية'}</button>`:''}`: ""}${!r.voided&&!readOnly?`<button class="document-delete" data-action="void:${r.id}">${icon('trash')}${['sale','purchase','expense'].includes(r.kind)?'إلغاء الفاتورة':'إلغاء العملية'}</button>`:''}</div>
    <button class="document-history" data-action="explain:document:${r.id}">${icon('activity')}سجل التعديلات <span>${esc(r.revision||0)}</span></button>
    ${r.voided?'<p class="document-void-note">أُلغي أثر العملية مع الاحتفاظ بالمستند وسجل تعديلاته.</p>':''}
  </div>`;
}
