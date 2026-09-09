import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type { DashboardSummary, DocumentRecord } from '@/domain/types';
import { dashboardSummary, listDocuments } from '@/db/queries';
import { AppText, Badge, Card, Money, Screen, SectionTitle } from '@/components/ui';
import { CompactMetric, HeroAction } from '@/components/mobile-interactions';
import { useI18n } from '@/i18n/provider';
import { useAuth } from '@/auth/provider';
import { colors, radius, spacing, touch } from '@/theme';

const empty:DashboardSummary={todaySales:0,todayProfit:0,todayExpenses:0,receivable:0,payable:0,inventoryValue:0,lowStockCount:0};

export function HomeScreen(){
  const db=useSQLiteContext(),{t,isRTL,locale,money,number}=useI18n(),auth=useAuth(),ar=locale==='ar';
  const [summary,setSummary]=useState(empty),[recent,setRecent]=useState<DocumentRecord[]>([]),[refreshing,setRefreshing]=useState(false);
  const canSale=auth.has('pos.create'),canRecords=auth.has('records.view'),canReports=auth.has('reports.view'),canExpenses=auth.has('expenses.view'),canCustomers=auth.has('customers.view'),canSuppliers=auth.has('suppliers.view'),canInventory=auth.has('warehouses.inventory.view')||auth.has('reports.view');
  const canPurchases=auth.has('purchases.view')||auth.has('purchases.create');

  const load=useCallback(async()=>{
    const [nextSummary,nextRecent]=await Promise.all([dashboardSummary(db),canRecords?listDocuments(db,{limit:5}):Promise.resolve([])]);
    setSummary(nextSummary);setRecent(nextRecent);setRefreshing(false);
  },[canRecords,db]);

  useFocusEffect(useCallback(()=>{void load()},[load]));

  const date=new Intl.DateTimeFormat(isRTL?'ar-MR':'fr-MR',{weekday:'long',day:'numeric',month:'long'}).format(new Date());
  const documentLabel=(doc:DocumentRecord)=>{
    if(doc.kind==='sale')return t('sales');
    if(doc.kind==='purchase')return t('purchases');
    if(doc.kind==='expense')return t('expenses');
    if(doc.kind==='payment')return ar?'دفعة':'Paiement';
    if(doc.kind==='transfer')return t('transfer');
    if(doc.kind==='adjustment')return t('adjustment');
    return doc.title??doc.kind;
  };
  const time=(value:string)=>new Intl.DateTimeFormat(isRTL?'ar-MR':'fr-MR',{hour:'2-digit',minute:'2-digit'}).format(new Date(value));

  return <Screen padded={false}><ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);void load()}}/>} contentContainerStyle={styles.content}>
    <View style={styles.header}><AppText variant="title">{t('appName')}</AppText><AppText variant="caption" muted>{date}</AppText></View>

    {canSale?<HeroAction eyebrow={t('todaySales')} title={money(summary.todaySales)} subtitle={ar?'ابدأ البيع من هنا؛ السلة والإجمالي يبقون أمامك حتى الإتمام.':'Commencez ici ; panier et total restent visibles jusqu’au paiement.'} actionLabel={t('newSale')} onPress={()=>router.push('/sales/pos')}/>:<Card tone="primary"><AppText variant="subheading">{t('todaySales')}</AppText><Money value={summary.todaySales} large/></Card>}

    <View style={[styles.metrics,{flexDirection:isRTL?'row-reverse':'row'}]}>{canReports?<CompactMetric label={t('todayProfit')} value={summary.todayProfit} tone="positive"/>:null}{canExpenses?<CompactMetric label={t('todayExpenses')} value={summary.todayExpenses} tone="negative"/>:null}{canInventory?<CompactMetric label={t('inventoryValue')} value={summary.inventoryValue}/>:null}</View>

    {(canPurchases||canExpenses||canInventory)?<View style={styles.section}><SectionTitle title={ar?'اختصارات العمل':'Raccourcis'}/><View style={[styles.actions,{flexDirection:isRTL?'row-reverse':'row'}]}>{canPurchases?<QuickAction label={t('purchases')} hint={ar?'تسجيل شراء':'Nouvel achat'} onPress={()=>router.push('/sales/purchases')}/>:null}{canExpenses?<QuickAction label={t('expenses')} hint={ar?'تسجيل مصروف':'Saisir une dépense'} onPress={()=>router.push('/sales/expenses')}/>:null}{canInventory?<QuickAction label={t('stock')} hint={ar?'راجع الكميات':'Voir les quantités'} onPress={()=>router.push('/inventory/stock')}/>:null}</View></View>:null}

    {(canInventory||canCustomers||canSuppliers)?<View style={styles.section}><SectionTitle title={ar?'يحتاج انتباهك':'À surveiller'} subtitle={ar?'الأشياء التي قد تحتاج تدخلًا اليوم':'Éléments qui peuvent demander une action aujourd’hui'}/><Card style={styles.attentionCard}>{canInventory?<AttentionRow label={t('lowStock')} value={number(summary.lowStockCount)} tone={summary.lowStockCount>0?'warning':'neutral'} onPress={()=>router.push('/inventory/stock')} isRTL={isRTL}/>:null}{canCustomers?<AttentionRow label={t('receivable')} value={money(summary.receivable)} tone={summary.receivable>0?'primary':'neutral'} onPress={()=>router.push('/parties/customers')} isRTL={isRTL}/>:null}{canSuppliers?<AttentionRow label={t('payable')} value={money(summary.payable)} tone={summary.payable>0?'negative':'neutral'} onPress={()=>router.push('/parties/suppliers')} isRTL={isRTL}/>:null}</Card></View>:null}

    {canRecords?<View style={styles.section}><SectionTitle title={ar?'آخر العمليات':'Activité récente'} action={<Pressable accessibilityRole="button" onPress={()=>router.push('/sales/records')} style={({pressed})=>pressed&&styles.pressed}><AppText variant="caption" style={styles.link}>{ar?'عرض الكل':'Tout voir'}</AppText></Pressable>}/><Card style={styles.recentCard}>{recent.length?recent.map((doc,index)=><Pressable accessibilityRole="button" key={doc.id} onPress={()=>router.push('/sales/records')} style={({pressed})=>[styles.recentRow,{flexDirection:isRTL?'row-reverse':'row'},pressed&&styles.rowPressed,index===recent.length-1&&styles.lastRow]}><View style={styles.recentBody}><View style={[styles.recentTitle,{flexDirection:isRTL?'row-reverse':'row'}]}><Badge label={documentLabel(doc)} tone={doc.status==='voided'?'negative':doc.kind==='sale'?'positive':'neutral'}/><AppText variant="caption" muted>{time(doc.occurredAt)}</AppText></View><AppText variant="subheading" numberOfLines={1}>{doc.partyName||doc.title||doc.number}</AppText></View><Money value={doc.total} tone={doc.status==='voided'?'negative':'normal'}/></Pressable>):<View style={styles.noRecent}><AppText muted>{ar?'لا توجد عمليات حديثة بعد.':'Aucune opération récente.'}</AppText></View>}</Card></View>:null}
  </ScrollView></Screen>;
}

function QuickAction({label,hint,onPress}:{label:string;hint:string;onPress:()=>void}){
  return <Pressable accessibilityRole="button" onPress={onPress} style={({pressed})=>[styles.quickAction,pressed&&styles.pressed]}><View style={styles.quickMark}><AppText variant="heading" style={styles.quickMarkText}>+</AppText></View><AppText variant="subheading">{label}</AppText><AppText variant="caption" muted>{hint}</AppText></Pressable>;
}

function AttentionRow({label,value,tone,onPress,isRTL}:{label:string;value:string;tone:'neutral'|'primary'|'negative'|'warning';onPress:()=>void;isRTL:boolean}){
  return <Pressable accessibilityRole="button" onPress={onPress} style={({pressed})=>[styles.attentionRow,{flexDirection:isRTL?'row-reverse':'row'},pressed&&styles.rowPressed]}><View style={[styles.attentionDot,tone==='primary'&&styles.dotPrimary,tone==='negative'&&styles.dotNegative,tone==='warning'&&styles.dotWarning]}/><AppText variant="subheading" style={styles.attentionLabel}>{label}</AppText><AppText variant="subheading" style={[styles.attentionValue,tone==='primary'&&styles.valuePrimary,tone==='negative'&&styles.valueNegative,tone==='warning'&&styles.valueWarning]}>{value}</AppText></Pressable>;
}

const styles=StyleSheet.create({
  content:{padding:spacing.md,gap:spacing.lg,paddingBottom:spacing.xxl,backgroundColor:colors.background},
  header:{gap:spacing.xxs},
  metrics:{flexWrap:'wrap',gap:spacing.sm},
  section:{gap:spacing.sm},
  actions:{gap:spacing.sm,flexWrap:'wrap'},
  quickAction:{flexGrow:1,flexBasis:104,minHeight:128,borderRadius:radius.lg,backgroundColor:colors.surface,padding:spacing.md,gap:spacing.xs,borderWidth:1,borderColor:colors.border},
  quickMark:{width:touch.min,height:touch.min,borderRadius:radius.full,backgroundColor:colors.primarySoft,alignItems:'center',justifyContent:'center',marginBottom:spacing.xs},
  quickMarkText:{color:colors.primary,lineHeight:24},
  attentionCard:{paddingVertical:spacing.xs,gap:0},
  attentionRow:{minHeight:60,alignItems:'center',gap:spacing.sm,paddingVertical:spacing.sm,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border},
  attentionDot:{width:10,height:10,borderRadius:5,backgroundColor:colors.borderStrong},
  dotPrimary:{backgroundColor:colors.primary},
  dotNegative:{backgroundColor:colors.negative},
  dotWarning:{backgroundColor:colors.warning},
  attentionLabel:{flex:1},
  attentionValue:{fontVariant:['tabular-nums']},
  valuePrimary:{color:colors.primary},
  valueNegative:{color:colors.negative},
  valueWarning:{color:colors.warning},
  recentCard:{paddingVertical:spacing.xs,gap:0},
  recentRow:{minHeight:76,alignItems:'center',gap:spacing.md,paddingVertical:spacing.sm,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border},
  recentBody:{flex:1,gap:spacing.xs},
  recentTitle:{alignItems:'center',gap:spacing.xs},
  lastRow:{borderBottomWidth:0},
  noRecent:{minHeight:100,alignItems:'center',justifyContent:'center'},
  link:{color:colors.primary,fontWeight:'800'},
  pressed:{opacity:.68,transform:[{scale:.99}]},
  rowPressed:{opacity:.65},
});
