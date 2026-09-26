import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type { DashboardSummary, DocumentRecord } from '@/domain/types';
import { dashboardInsights, dashboardSummary, type DashboardInsights } from '@/db/queries';
import { listDocumentHeaders } from '@/db/document-queries';
import { AppText, Badge, Card, Money, Screen, SectionTitle } from '@/components/ui';
import { useI18n } from '@/i18n/provider';
import { useAuth } from '@/auth/provider';
import { colors, elevation, radius, spacing } from '@/theme';

const empty:DashboardSummary={todaySales:0,todayProfit:0,todayExpenses:0,receivable:0,payable:0,inventoryValue:0,lowStockCount:0};
const emptyInsights:DashboardInsights={trend:[],topProducts:[]};

export function HomeScreen(){
  const db=useSQLiteContext(),{t,isRTL,locale,money,number}=useI18n(),auth=useAuth(),ar=locale==='ar';
  const [summary,setSummary]=useState(empty),[insights,setInsights]=useState(emptyInsights),[recent,setRecent]=useState<DocumentRecord[]>([]),[refreshing,setRefreshing]=useState(false);
  const canSale=auth.has('pos.create'),canRecords=auth.has('records.view'),canReports=auth.has('reports.view'),canExpenses=auth.has('expenses.view'),canCustomers=auth.has('customers.view'),canSuppliers=auth.has('suppliers.view'),canInventory=auth.has('warehouses.inventory.view')||auth.has('reports.view'),canProducts=auth.has('products.view');
  const canPurchases=auth.has('purchases.view')||auth.has('purchases.create');

  const load=useCallback(async()=>{
    try{
      const [nextSummary,nextInsights,nextRecent]=await Promise.all([
        dashboardSummary(db),
        canSale||canReports?dashboardInsights(db,7):Promise.resolve(emptyInsights),
        canRecords?listDocumentHeaders(db,{limit:5}):Promise.resolve([]),
      ]);
      setSummary(nextSummary);setInsights(nextInsights);setRecent(nextRecent);
    }finally{setRefreshing(false)}
  },[canRecords,canReports,canSale,db]);

  useFocusEffect(useCallback(()=>{void load()},[load]));

  const date=new Intl.DateTimeFormat(isRTL?'ar-MR':'fr-MR',{weekday:'long',day:'numeric',month:'long'}).format(new Date());
  const maxTrend=useMemo(()=>Math.max(1,...insights.trend.map(point=>point.sales)),[insights.trend]);
  const documentLabel=(doc:DocumentRecord)=>{
    if(doc.kind==='sale')return t('sales');
    if(doc.kind==='purchase')return t('purchases');
    if(doc.kind==='expense')return t('expenses');
    if(doc.kind==='payment')return ar?'دفعة':'Paiement';
    if(doc.kind==='transfer')return t('transfer');
    if(doc.kind==='adjustment')return t('adjustment');
    if(doc.kind==='account-transfer')return ar?'تحويل حساب':'Transfert';
    if(doc.kind==='account-adjustment')return ar?'حركة حساب':'Mouvement';
    return doc.title??doc.kind;
  };
  const time=(value:string)=>new Intl.DateTimeFormat(isRTL?'ar-MR':'fr-MR',{hour:'2-digit',minute:'2-digit'}).format(new Date(value));

  return <Screen padded={false}><ScrollView showsVerticalScrollIndicator={false} refreshControl={<RefreshControl tintColor={colors.primary} refreshing={refreshing} onRefresh={()=>{setRefreshing(true);void load()}}/>} contentContainerStyle={styles.content}>
    <View style={[styles.appHeader,{flexDirection:isRTL?'row-reverse':'row'}]}>
      <View style={styles.brandBadge}><View style={styles.brandDot}/></View>
      <View style={styles.headerCopy}><AppText variant="title">{t('appName')}</AppText><AppText variant="caption" muted>{date}</AppText></View>
    </View>

    <View style={styles.hero}>
      <View style={[styles.heroHeader,{flexDirection:isRTL?'row-reverse':'row'}]}>
        <View style={styles.heroCopy}><AppText variant="caption" style={styles.heroEyebrow}>{t('todaySales')}</AppText><AppText variant="display" style={styles.heroAmount}>{money(summary.todaySales)}</AppText></View>
        <View style={styles.profitPill}><AppText variant="caption" style={styles.profitLabel}>{t('todayProfit')}</AppText><AppText variant="subheading" style={styles.profitValue}>{money(summary.todayProfit)}</AppText></View>
      </View>
      {insights.trend.length?<View style={styles.chart}><View style={styles.bars}>{insights.trend.map(point=><View key={point.date} style={styles.barColumn}><View style={[styles.bar,{height:12+Math.round((point.sales/maxTrend)*48)}]}/><AppText variant="caption" style={styles.barLabel}>{point.date.slice(8)}</AppText></View>)}</View></View>:null}
      {canSale?<Pressable accessibilityRole="button" onPress={()=>router.push('/sales/pos')} style={({pressed})=>[styles.heroAction,{flexDirection:isRTL?'row-reverse':'row'},pressed&&styles.heroActionPressed]}><View style={styles.heroActionIcon}><AppText variant="heading" style={styles.heroActionPlus}>+</AppText></View><AppText variant="subheading" style={styles.heroActionText}>{t('newSale')}</AppText><AppText variant="heading" style={styles.heroArrow}>{isRTL?'←':'→'}</AppText></Pressable>:null}
    </View>

    <View style={styles.metricGrid}>
      {canExpenses?<MetricCard label={t('todayExpenses')} value={summary.todayExpenses} tone="negative"/>:null}
      {canCustomers?<MetricCard label={t('receivable')} value={summary.receivable} tone="positive"/>:null}
      {canSuppliers?<MetricCard label={t('payable')} value={summary.payable} tone="negative"/>:null}
      {canInventory?<MetricCard label={t('inventoryValue')} value={summary.inventoryValue}/>:null}
    </View>

    {(canSale||canPurchases||canInventory||canReports)?<View style={styles.section}><SectionTitle title={ar?'وصول سريع':'Accès rapide'}/><View style={styles.quickGrid}>
      {canSale?<QuickAction title={t('newSale')} subtitle={ar?'بيع سريع':'Vente rapide'} mark="+" onPress={()=>router.push('/sales/pos')}/>:null}
      {canPurchases?<QuickAction title={t('purchases')} subtitle={ar?'فاتورة شراء':'Nouvel achat'} mark="↓" onPress={()=>router.push('/sales/purchases')}/>:null}
      {canInventory?<QuickAction title={t('stock')} subtitle={ar?'الكميات الحالية':'Quantités'} mark="▦" onPress={()=>router.push('/inventory/stock')}/>:null}
      {canReports?<QuickAction title={t('reports')} subtitle={ar?'النتائج والتحليل':'Analyse'} mark="↗" onPress={()=>router.push('/more/reports')}/>:null}
    </View></View>:null}

    {canInventory&&summary.lowStockCount>0?<Pressable accessibilityRole="button" onPress={()=>router.push('/inventory/stock')} style={({pressed})=>[styles.alertCard,{flexDirection:isRTL?'row-reverse':'row'},pressed&&styles.rowPressed]}><View style={styles.alertIcon}><AppText variant="heading" style={styles.alertIconText}>!</AppText></View><View style={styles.alertCopy}><AppText variant="subheading">{t('lowStock')}</AppText><AppText variant="caption" muted>{ar?'هناك '+number(summary.lowStockCount)+' منتجات وصلت إلى حد إعادة التزويد.':number(summary.lowStockCount)+' produits demandent votre attention.'}</AppText></View><AppText variant="heading" style={styles.alertArrow}>{isRTL?'‹':'›'}</AppText></Pressable>:null}

    {canReports?<View style={styles.section}><SectionTitle title={ar?'الأكثر مبيعًا':'Meilleures ventes'} subtitle={ar?'آخر 7 أيام':'7 derniers jours'}/><Card style={styles.listCard}>{insights.topProducts.length?insights.topProducts.map((product,index)=><Pressable key={(product.productId??product.name)+'-'+index} disabled={!canProducts||!product.productId} onPress={()=>product.productId&&router.push({pathname:'/inventory/products',params:{productId:product.productId}})} style={({pressed})=>[styles.productRow,{flexDirection:isRTL?'row-reverse':'row'},pressed&&styles.rowPressed,index===insights.topProducts.length-1&&styles.lastRow]}><View style={styles.rank}><AppText variant="caption" style={styles.rankText}>{number(index+1)}</AppText></View><View style={styles.productCopy}><AppText variant="subheading" numberOfLines={1}>{product.name}</AppText><AppText variant="caption" muted>{ar?'الكمية '+number(product.quantity):'Quantité '+number(product.quantity)}</AppText></View><Money value={product.revenue}/></Pressable>):<View style={styles.emptyInline}><AppText variant="caption" muted>{ar?'لا توجد مبيعات كافية لهذه الفترة.':'Pas encore de ventes sur cette période.'}</AppText></View>}</Card></View>:null}

    {canRecords?<View style={styles.section}><SectionTitle title={ar?'آخر العمليات':'Activité récente'} action={<Pressable accessibilityRole="button" onPress={()=>router.push('/sales/records')} style={({pressed})=>pressed&&styles.pressed}><AppText variant="caption" style={styles.link}>{ar?'عرض الكل':'Tout voir'}</AppText></Pressable>}/><Card style={styles.listCard}>{recent.length?recent.map((doc,index)=><Pressable accessibilityRole="button" key={doc.id} onPress={()=>router.push({pathname:'/sales/records',params:{documentId:doc.id}})} style={({pressed})=>[styles.recentRow,{flexDirection:isRTL?'row-reverse':'row'},pressed&&styles.rowPressed,index===recent.length-1&&styles.lastRow]}><View style={styles.recentCopy}><View style={[styles.recentMeta,{flexDirection:isRTL?'row-reverse':'row'}]}><Badge label={documentLabel(doc)} tone={doc.status==='voided'?'negative':doc.kind==='sale'?'positive':doc.kind==='purchase'?'warning':'neutral'}/><AppText variant="caption" muted>{time(doc.occurredAt)}</AppText></View><AppText variant="subheading" numberOfLines={1}>{doc.partyName||doc.title||doc.number}</AppText><AppText variant="caption" muted>{doc.number}</AppText></View><Money value={doc.total} tone={doc.status==='voided'?'negative':'normal'}/></Pressable>):<View style={styles.emptyInline}><AppText variant="caption" muted>{ar?'لا توجد عمليات حديثة بعد.':'Aucune opération récente.'}</AppText></View>}</Card></View>:null}
  </ScrollView></Screen>;
}

function MetricCard({label,value,tone='normal'}:{label:string;value:number;tone?:'normal'|'positive'|'negative'}){
  return <View style={styles.metricCard}><View style={[styles.metricIcon,tone==='positive'&&styles.metricIconPositive,tone==='negative'&&styles.metricIconNegative]}/><AppText variant="caption" muted>{label}</AppText><Money value={value} tone={tone}/></View>;
}

function QuickAction({title,subtitle,mark,onPress}:{title:string;subtitle:string;mark:string;onPress:()=>void}){
  return <Pressable accessibilityRole="button" onPress={onPress} style={({pressed})=>[styles.quickCard,pressed&&styles.quickPressed]}><View style={styles.quickIcon}><AppText variant="heading" style={styles.quickMark}>{mark}</AppText></View><AppText variant="subheading" numberOfLines={1}>{title}</AppText><AppText variant="caption" muted numberOfLines={1}>{subtitle}</AppText></Pressable>;
}

const styles=StyleSheet.create({
  content:{padding:spacing.md,gap:spacing.lg,paddingBottom:spacing.xxl,backgroundColor:colors.background},
  appHeader:{alignItems:'center',gap:spacing.sm},
  brandBadge:{width:42,height:42,borderRadius:14,backgroundColor:colors.primarySoft,alignItems:'center',justifyContent:'center'},
  brandDot:{width:18,height:18,borderRadius:6,backgroundColor:colors.primary,transform:[{rotate:'12deg'}]},
  headerCopy:{flex:1,gap:spacing.xxs},
  hero:{backgroundColor:colors.primary,borderRadius:radius.xl,padding:spacing.lg,gap:spacing.md,...elevation.floating},
  heroHeader:{alignItems:'flex-start',justifyContent:'space-between',gap:spacing.sm},
  heroCopy:{flex:1,gap:spacing.xxs},
  heroEyebrow:{color:'#D9E8FF',fontWeight:'700'},
  heroAmount:{color:colors.onPrimary,fontVariant:['tabular-nums']},
  profitPill:{backgroundColor:'rgba(255,255,255,0.14)',borderRadius:radius.md,paddingHorizontal:spacing.sm,paddingVertical:spacing.xs,gap:2,alignItems:'flex-end'},
  profitLabel:{color:'#D9E8FF'},
  profitValue:{color:colors.onPrimary,fontVariant:['tabular-nums']},
  chart:{height:82,justifyContent:'flex-end'},
  bars:{height:76,flexDirection:'row',alignItems:'flex-end',justifyContent:'space-between',gap:spacing.xs},
  barColumn:{flex:1,height:76,alignItems:'center',justifyContent:'flex-end',gap:4},
  bar:{width:'72%',minWidth:12,maxWidth:32,borderRadius:6,backgroundColor:'rgba(255,255,255,0.88)'},
  barLabel:{color:'#D9E8FF',fontSize:10},
  heroAction:{minHeight:52,backgroundColor:colors.surface,borderRadius:radius.md,alignItems:'center',gap:spacing.sm,paddingHorizontal:spacing.md},
  heroActionPressed:{opacity:.9,transform:[{scale:.99}]},
  heroActionIcon:{width:34,height:34,borderRadius:12,backgroundColor:colors.primarySoft,alignItems:'center',justifyContent:'center'},
  heroActionPlus:{color:colors.primary,lineHeight:23},
  heroActionText:{flex:1,color:colors.primary},
  heroArrow:{color:colors.primary,lineHeight:24},
  metricGrid:{flexDirection:'row',flexWrap:'wrap',gap:spacing.sm},
  metricCard:{width:'48%',minHeight:118,backgroundColor:colors.surface,borderRadius:radius.lg,borderWidth:1,borderColor:colors.border,padding:spacing.md,gap:spacing.xs,...elevation.subtle},
  metricIcon:{width:26,height:4,borderRadius:4,backgroundColor:colors.primary},
  metricIconPositive:{backgroundColor:colors.positive},
  metricIconNegative:{backgroundColor:colors.negative},
  section:{gap:spacing.sm},
  quickGrid:{flexDirection:'row',flexWrap:'wrap',gap:spacing.sm},
  quickCard:{width:'48%',minHeight:124,backgroundColor:colors.surface,borderRadius:radius.lg,borderWidth:1,borderColor:colors.border,padding:spacing.md,gap:spacing.xs,...elevation.subtle},
  quickPressed:{backgroundColor:colors.primaryFaint,borderColor:colors.primarySoft,transform:[{scale:.99}]},
  quickIcon:{width:40,height:40,borderRadius:13,backgroundColor:colors.primarySoft,alignItems:'center',justifyContent:'center'},
  quickMark:{color:colors.primary,lineHeight:24},
  alertCard:{minHeight:84,alignItems:'center',gap:spacing.md,backgroundColor:colors.warningSoft,borderRadius:radius.lg,borderWidth:1,borderColor:'#F3D7A8',padding:spacing.md},
  alertIcon:{width:42,height:42,borderRadius:14,backgroundColor:'#FFE4B7',alignItems:'center',justifyContent:'center'},
  alertIconText:{color:colors.warning},
  alertCopy:{flex:1,gap:spacing.xxs},
  alertArrow:{color:colors.warning},
  listCard:{paddingVertical:0,gap:0,overflow:'hidden',...elevation.subtle},
  productRow:{minHeight:74,alignItems:'center',gap:spacing.sm,paddingVertical:spacing.sm},
  rank:{width:34,height:34,borderRadius:12,backgroundColor:colors.primarySoft,alignItems:'center',justifyContent:'center'},
  rankText:{color:colors.primary,fontWeight:'800'},
  productCopy:{flex:1,gap:spacing.xxs},
  recentRow:{minHeight:80,alignItems:'center',gap:spacing.md,paddingVertical:spacing.sm,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border},
  recentCopy:{flex:1,gap:spacing.xs},
  recentMeta:{alignItems:'center',gap:spacing.xs},
  lastRow:{borderBottomWidth:0},
  emptyInline:{minHeight:96,alignItems:'center',justifyContent:'center',padding:spacing.md},
  link:{color:colors.primary,fontWeight:'700'},
  pressed:{opacity:.65},
  rowPressed:{backgroundColor:colors.surfaceMuted},
});
