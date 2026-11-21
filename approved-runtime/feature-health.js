import {financeTranslations} from './finance-language.js';
import {appLanguage,translateText} from './i18n.js';
import {accountingHealth,confirmSaleCostRecovery,recoverAccountingHistory} from './accounting-health.js';
/** Owner review uses the current phone sheet/table primitives. It stages state;
 * the app's existing transaction owns persistence and rollback. */
export function installAccountingHealthFeatures(api){
 let page=1,chosen=null,pending=false;
 const state=()=>api.getState(),owner=()=>api.actor?.role==='owner'||api.actor?.principalType==='owner';
 const requireOwner=()=>{if(!owner())throw Error(t('مراجعة تكاليف المبيعات متاحة للمالك فقط'))};
 const t=value=>appLanguage()==='fr'?financeTranslations[value]||translateText(value,'fr'):value;
 const e=value=>(api.esc||esc)(value),m=value=>(api.money||money)(value,'xs'),i=name=>(api.icon||icon)(name);
 const sectionHtml=title=>(api.section||section)(title);
 const button=()=>owner()?`<button class="feature-button" data-action="site:feature:health-open">${i('report')}${e(t('مراجعة التكلفة'))}</button>`:'';
 function rows(){return accountingHealth(state(),{page,pageSize:25})}
 function viewHtml(){
  requireOwner();const data=rows(),summary=data.summary;
  const table=`<div class="register-table-shell"><div class="register-scroll"><table class="register-table" aria-label="${e(t('مراجعة التكلفة'))}"><thead><tr><th>${e(t('الفاتورة'))}</th><th>${e(t('المنتج'))}</th><th>${e(t('التكلفة'))}</th></tr></thead><tbody>${data.rows.map((row,index)=>`<tr data-action="site:feature:health-review:${index}"><td>${e(row.number)}<small>${e(row.occurredAt.slice(0,10))}</small></td><td data-user-content>${e(row.productName)}</td><td>${row.originalCost===null?e(t('غير مؤكد')):m(row.originalCost)}</td></tr>`).join('')||`<tr><td colspan="3">${e(t('لا توجد تكاليف تحتاج إلى مراجعة'))}</td></tr>`}</tbody></table></div></div>`;
  return `${sectionHtml(t('مراجعة التكلفة'))}<p class="notice">${e(t('التكلفة غير المعروفة تختلف عن الصفر. المراجعة تحفظ سبب التغيير ومصدره دون إعادة ترحيل النقد أو المخزون.'))}</p><div class="metric-grid"><div class="metric-card"><strong>${e(t('غير مؤكدة'))}</strong><b>${summary.unresolved}</b></div><div class="metric-card"><strong>${e(t('صفر يحتاج مراجعة'))}</strong><b>${summary.savedZeroReview}</b></div></div>${api.boundedTableHtml?api.boundedTableHtml(table):table}<div class="management-actions"><button class="feature-button" data-action="site:feature:health-page:${page-1}" ${page===1?'disabled':''}>${e(t('السابق'))}</button><span>${page} / ${data.pagination.totalPages}</span><button class="feature-button" data-action="site:feature:health-page:${page+1}" ${page>=data.pagination.totalPages?'disabled':''}>${e(t('التالي'))}</button></div><div class="management-actions"><button class="feature-button" data-action="site:feature:health-automatic">${e(t('فحص الأدلة المحفوظة'))}</button></div>`;
 }
 return{
  managerButton:button,ownsView:name=>name==='accounting-health',viewHtml,
  handles:command=>command.startsWith('health-'),permission:()=> 'settings.view',
  sheet(){if((typeof modal==='undefined'?null:modal)!=='accounting-health-review'||!chosen)return null;requireOwner();
   const f=(api.field||field),inputHtml=(api.input||input),options=[...(chosen.canApplySuggested?[['apply-suggested','اعتماد المصدر المقترح']]:[]),...(chosen.canSetReviewedCost?[['set-reviewed-cost','تكلفة راجعها المالك']]:[]),...(chosen.canConfirmZero?[['confirm-zero','تأكيد تكلفة صفر']]:[])];
   return api.modalMarkup(t('مراجعة تكلفة البيع'),`<p data-user-content><strong>${e(chosen.productName)}</strong> · ${e(chosen.number)}</p><p class="notice">${chosen.canApplySuggested?e(t('مصدر مقترح'))+': '+e(chosen.sourceNumber)+' · '+m(chosen.suggestedPriorCost):e(t('لا يوجد مصدر تاريخي مؤكد لهذا البند. راجع مستنداتك قبل تحديد التكلفة.'))}</p>${f(t('الإجراء'),`<select name="reviewAction">${options.map(([value,label])=>`<option value="${value}">${e(t(label))}</option>`).join('')}</select>`)}${f(t('التكلفة التي راجعتها'),inputHtml('reviewedUnitCost','text','', 'inputmode="decimal" autocomplete="off"'))}${f(t('سبب المراجعة'),'<textarea name="reason" maxlength="1000" rows="2" required></textarea>')}`,'site:feature:health-confirm',t('حفظ المراجعة'),'feature-sheet');
  },
  async action(command,id){requireOwner();
   if(command==='health-open'){page=1;api.setView('accounting-health');return api.render()}
   if(command==='health-page'){const next=Number(id),data=rows();if(!Number.isSafeInteger(next)||next<1||next>data.pagination.totalPages)throw Error('إعدادات صفحة مراجعة التكاليف غير صالحة');page=next;return api.render()}
   if(command==='health-review'){chosen=structuredClone(rows().rows[Number(id)]);if(!chosen)throw Error('السطر غير متاح للمراجعة');api.showModal('accounting-health-review');return api.render()}
   if(command==='health-confirm'){if(!chosen)throw Error('حدّث قائمة المراجعة وأعد المحاولة');const form=api.form(),result=confirmSaleCostRecovery(state(),{documentId:chosen.documentId,lineId:chosen.lineId,expectedRevision:chosen.revision,reviewToken:chosen.reviewToken,action:form.reviewAction,reviewedUnitCost:form.reviewedUnitCost,reason:form.reason},{principalType:'owner',name:api.actor.name,userId:String(api.actor.id)});api.replaceState(result.state);pending='review';return}
   if(command==='health-automatic'){const before=state(),result=recoverAccountingHistory(before,{context:'owner-review'});if(JSON.stringify(before)===JSON.stringify(result.state)){pending=false;api.toast(t('لا توجد إصلاحات مثبتة جديدة'));return}api.replaceState(result.state);pending='scan';}
  },
  afterSave(){if(!pending)return;const saved=pending;pending=false;chosen=null;page=Math.min(page,accountingHealth(state(),{page:1,pageSize:25}).pagination.totalPages);api.setModal(null);api.render();api.toast(t(saved==='scan'?'تم حفظ الإصلاحات المثبتة':'تم حفظ مراجعة التكلفة'))},afterFailure(){pending=false}
 };
}
