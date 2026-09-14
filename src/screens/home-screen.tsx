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
import { colors, radius, spacing } from '@/theme';

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
    <View style={styles.header}><AppText variant="caption" muted>{date}</AppText><AppText variant="title">{t('appName')}</AppText></View>

    {canSale?<HeroAction eyebrow={t('todaySales')} title={money(summary.todaySales)} subtitle={ar?'ابدأ البيع مباشرة. أبقينا السلة والإجمالي والإتمام في مسار واحد سريع.':'Démarrez une vente directement. Panier, total et paiement restent dans un seul flux rapide.'} actionLabel={t('newSale')} onPress={()=>router.push('/sales/pos')}/>:<Card tone="primary"><AppText variant="subheading">{t('todaySales')}</AppText><Money value={summary.todaySales} large/></Card>}

    <View style={[styles.metrics,{flexDirection:isRTL?'row-reverse':'row'}]}>{canReports?<CompactMetric label={t('todayProfit')} value={summary.todayProfit} tone="positive"/>:null}{canExpenses?<CompactMetric label={t('todayExpenses')} value={summary.todayExpenses} tone="negative"/>:null}{canInventory?<CompactMetric label={t('inventoryValue')} value={summary.inventoryValue}/>:null}</View>

    {(canPurchases||canExpenses||canInventory)?<View style={styles.section}><SectionTitle title={ar?'العمل السريع':'Actions rapides'}/><View style={styles.actionPanel}>{canPurchases?<QuickActionRow label={t('purchases')} hint={ar?'سجل فاتورة شراء جديدة':'Nouvel achat'} onPress={()=>router.push('/sales/purchases')} isRTL={isRTL}/>:null}{canExpenses?<QuickActionRow label={t('expenses')} hint={ar?'أضف مصروفًا بدون التنقل بين صفحات':'Saisir une dépense'} onPress={()=>router.push('/sales/expenses')} isRTL={isRTL}/>:null}{canInventory?<QuickActionRow label={t('stock')} hint={ar?'راجع الكميات الحالية':'Voir les quantités actuelles'} onPress={()=>router.push('/inventory/stock')} isRTL={isRTL} last/>:null}</View></View>:null}

    {(canInventory||canCustomers||canSuppliers)?<View style={styles.section}><SectionTitle title={ar?'يحتاج انتباهك':'À surveiller'} subtitle={ar?'مختصر لما قد يحتاج تدخلاً اليوم':'Les éléments qui peuvent demander une action aujourd’hui'}/><Card style={styles.listCard}>{canInventory?<AttentionRow label={t('lowStock')} value={number(summary.lowStockCount)} tone={summary.lowStockCount>0?'warning':'neutral'} onPress={()=>router.push('/inventory/stock')} isRTL={isRTL}/>:null}{canCustomers?<AttentionRow label={t('receivable')} value={money(summary.receivable)} tone={summary.receivable>0?'primary':'neutral'} onPress={()=>router.push('/parties/customers')} isRTL={isRTL}/>:null}{canSuppliers?<AttentionRow label={t('payable')} value={money(summary.payable)} tone={summary.payable>0?'negative':'neutral'} onPress={()=>router.push('/parties/suppliers')} isRTL={isRTL} last/>:null}</Card></View>:null}

    {canRecords?<View style={styles.section}><SectionTitle title={ar?'آخر العمليات':'Activité récente'} action={<Pressable accessibilityRole="button" onPress={()=>router.push('/sales/records')} style={({pressed})=>pressed&&styles.pressed}><AppText variant="caption" style={styles.link}>{ar?'عرض الكل':'Tout voir'}</AppText></Pressable>}/><Card style={styles.listCard}>{recent.length?recent.map((doc,index)=><Pressable accessibilityRole="button" key={doc.id} onPress={()=>router.push('/sales/records')} style={({pressed})=>[styles.recentRow,{flexDirection:isRTL?'row-reverse':'row'},pressed&&styles.rowPressed,index===recent.length-1&&styles.lastRow]}><View style={styles.recentBody}><View style={[styles.recentTitle,{flexDirection:isRTL?'row-reverse':'row'}]}><Badge label={documentLabel(doc)} tone={doc.status==='voided'?'negative':doc.kind==='sale'?'positive':'neutral'}/><AppText variant="caption" muted>{time(doc.occurredAt)}</AppText></View><AppText variant="subheading" numberOfLines={1}>{doc.partyName||doc.title||doc.number}</AppText></View><Money value={doc.total} tone={doc.status==='voided'?'negative':'normal'}/></Pressable>):<View style={styles.noRecent}><AppText muted>{ar?'لا توجد عمليات حديثة بعد.':'Aucune opération récente.'}</AppText></View>}</Card></View>:null}
  </ScrollView></Screen>;
}

function QuickActionRow({label,hint,onPress,isRTL,last=false}:{label:string;hint:string;onPress:()=>void;isRTL:boolean;last?:boolean}){
  return <Pressable accessibilityRole="button" onPress={onPress} style={({pressed})=>[styles.quickRow,{flexDirection:isRTL?'row-reverse':'row'},last&&styles.lastRow,pressed&&styles.rowPressed]}><View style={styles.quickRule}/><View style={styles.quickBody}><AppText variant="subheading">{label}</AppText><AppText variant="caption" muted>{hint}</AppText></View><AppText variant="heading" style={[styles.quickArrow,{transform:[{scaleX:isRTL?-1:1}]}]}>›</AppText></Pressable>;
}

function AttentionRow({label,value,tone,onPress,isRTL,last=false}:{label:string;value:string;tone:'neutral'|'primary'|'negative'|'warning';onPress:()=>void;isRTL:boolean;last?:boolean}){
  return <Pressable accessibilityRole="button" onPress={onPress} style={({pressed})=>[styles.attentionRow,{flexDirection:isRTL?'row-reverse':'row'},pressed&&styles.rowPressed,last&&styles.lastRow]}><View style={[styles.attentionDot,tone==='primary'&&styles.dotPrimary,tone==='negative'&&styles.dotNegative,tone==='warning'&&styles.dotWarning]}/><AppText variant="subheading" style={styles.attentionLabel}>{label}</AppText><AppText variant="subheading" style={[styles.attentionValue,tone==='primary'&&styles.valuePrimary,tone==='negative'&&styles.valueNegative,tone==='warning'&&styles.valueWarning]}>{value}</AppText></Pressable>;
}

const styles=StyleSheet.create({
  content:{padding:spacing.md,gap:spacing.lg,paddingBottom:spacing.xxl,backgroundColor:colors.background},
  header:{gap:spacing.xxs},
  metrics:{flexWrap:'wrap',gap:spacing.xs,borderRadius:radius.lg,overflow:'hidden',borderWidth:1,borderColor:colors.border},
  section:{gap:spacing.sm},
  actionPanel:{backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,overflow:'hidden'},
  quickRow:{minHeight:74,alignItems:'center',gap:spacing.sm,paddingHorizontal:spacing.md,paddingVertical:spacing.sm,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border},
  quickRule:{width:3,height:32,borderRadius:2,backgroundColor:colors.accent},
  quickBody:{flex:1,gap:spacing.xxs},
  quickArrow:{color:colors.primary,width:26,textAlign:'center'},
  listCard:{paddingVertical:0,gap:0,overflow:'hidden'},
  attentionRow:{minHeight:60,alignItems:'center',gap:spacing.sm,paddingVertical:spacing.sm,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border},
  attentionDot:{width:8,height:8,borderRadius:4,backgroundColor:colors.borderStrong},
  dotPrimary:{backgroundColor:colors.primary},
  dotNegative:{backgroundColor:colors.negative},
  dotWarning:{backgroundColor:colors.warning},
  attentionLabel:{flex:1},
  attentionValue:{fontVariant:['tabular-nums']},
  valuePrimary:{color:colors.primary},
  valueNegative:{color:colors.negative},
  valueWarning:{color:colors.warning},
  recentRow:{minHeight:74,alignItems:'center',gap:spacing.md,paddingVertical:spacing.sm,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border},
  recentBody:{flex:1,gap:spacing.xs},
  recentTitle:{alignItems:'center',gap:spacing.xs},
  lastRow:{borderBottomWidth:0},
  noRecent:{minHeight:100,alignItems:'center',justifyContent:'center'},
  link:{color:colors.primary,fontWeight:'700'},
  pressed:{opacity:.65},
  rowPressed:{backgroundColor:colors.surfaceMuted},
});
