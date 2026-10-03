import { useCallback, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { dashboardSummary } from '@/db/queries';
import { Screen } from '@/components/ui';
import { StitchHeader, StitchAction, StitchPanel, StitchSection, StitchText, stitch } from '@/components/stitch';
import { useI18n } from '@/i18n/provider';
import { useAuth } from '@/auth/provider';
export function SalesHubScreen(){
 const {t,locale,isRTL,money}=useI18n(),auth=useAuth(),db=useSQLiteContext(),ar=locale==='ar';
 const [sales,setSales]=useState(0),[expenses,setExpenses]=useState(0);
 useFocusEffect(useCallback(()=>{void dashboardSummary(db).then(s=>{setSales(s.todaySales);setExpenses(s.todayExpenses)})},[db]));
 return <Screen scroll padded={false}><StitchHeader module="SALES HUB"/><View style={s.content}><StitchPanel><StitchSection title={ar?'مؤشرات الخزينة لليوم':'Indicateurs du jour'}/><View style={[s.stats,{flexDirection:isRTL?'row-reverse':'row'}]}><View style={s.stat}><StitchText size={11} color={stitch.muted}>{t('sales')}</StitchText><StitchText bold size={20} color={stitch.green}>{money(sales)}</StitchText></View><View style={s.stat}><StitchText size={11} color={stitch.muted}>{t('expenses')}</StitchText><StitchText bold size={20} color={stitch.red}>{money(expenses)}</StitchText></View></View></StitchPanel><StitchSection title={ar?'العمليات السريعة':'Opérations rapides'}/>
 {auth.has('pos.create')?<StitchAction title={ar?'فاتورة بيع جديدة':t('newSale')} description={t('salesHubNewSaleHint')} button={ar?'بدء البيع الآن':t('salesHubOpenPos')} icon="sale" color={stitch.blue} onPress={()=>router.push('/sales/pos')}/>:null}
 {auth.has('purchases.view')||auth.has('purchases.create')?<StitchAction title={ar?'فاتورة شراء جديدة':t('purchases')} description={t('salesHubPurchaseHint')} button={ar?'تسجيل مشتريات وتوريد':t('purchases')} icon="purchase" color={stitch.amber} onPress={()=>router.push('/sales/purchases')}/>:null}
 {auth.has('expenses.view')?<StitchAction title={ar?'المصروفات وسندات الصرف':t('expenses')} description={t('salesHubExpensesHint')} button={ar?'صرف نقدي من الدرج':t('expenses')} icon="spend" color={stitch.red} onPress={()=>router.push('/sales/expenses')}/>:null}
 {auth.has('records.view')?<StitchAction title={ar?'سجل المعاملات اليومية':t('records')} description={t('salesHubRecordsHint')} button={ar?'فتح دفتر اليومية':t('records')} icon="receipt" onPress={()=>router.push('/sales/records')}/>:null}
 </View></Screen>;
}
const s=StyleSheet.create({content:{padding:16,gap:16},stats:{gap:12},stat:{flex:1,gap:6}});
