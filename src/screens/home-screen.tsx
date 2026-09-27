import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type { DashboardSummary, DocumentRecord } from '@/domain/types';
import { dashboardInsights, dashboardSummary, type DashboardInsights } from '@/db/queries';
import { listDocumentHeaders } from '@/db/document-queries';
import { AppText, Badge, Money, Screen } from '@/components/ui';
import { StickyActionBar } from '@/components/mobile-interactions';
import { useI18n } from '@/i18n/provider';
import { useAuth } from '@/auth/provider';
import { colors, elevation, radius, spacing, touch } from '@/theme';

const empty:DashboardSummary={todaySales:0,todayProfit:0,todayExpenses:0,receivable:0,payable:0,inventoryValue:0,lowStockCount:0};
const emptyInsights:DashboardInsights={trend:[],topProducts:[]};

type TaskGlyph='purchase'|'expense'|'stock'|'report';
type AttentionTone='primary'|'negative'|'warning';

export function HomeScreen(){
  const db=useSQLiteContext(),{t,isRTL,locale,money,number}=useI18n(),auth=useAuth(),ar=locale==='ar';
  const [summary,setSummary]=useState(empty),[insights,setInsights]=useState(emptyInsights),[recent,setRecent]=useState<DocumentRecord[]>([]);
  const [refreshing,setRefreshing]=useState(false),[loaded,setLoaded]=useState(false),[loadError,setLoadError]=useState(false);
  const canSale=auth.has('pos.create'),canRecords=auth.has('records.view'),canReports=auth.has('reports.view'),canExpenses=auth.has('expenses.view'),canCustomers=auth.has('customers.view'),canSuppliers=auth.has('suppliers.view'),canInventory=auth.has('warehouses.inventory.view')||auth.has('reports.view'),canProducts=auth.has('products.view');
  const canPurchases=auth.has('purchases.view')||auth.has('purchases.create');

  const copy=ar?{
    attention:'يحتاج انتباهك',
    attentionHint:'أمور مهمة يمكنك متابعتها الآن',
    quick:'أعمال سريعة',
    quickHint:'اختصارات للعمل اليومي',
    recent:'آخر العمليات',
    all:'عرض الكل',
    pulse:'نبض آخر 7 أيام',
    pulseHint:'حركة المبيعات خلال الأسبوع',
    topProducts:'الأكثر مبيعًا',
    salesTotal:'إجمالي 7 أيام',
    noWeeklySales:'لا توجد مبيعات خلال آخر 7 أيام.',
    noRecent:'لا توجد عمليات حديثة بعد.',
    loading:'جارٍ تحديث لوحة اليوم…',
    failed:'تعذر تحديث لوحة اليوم.',
    retry:'إعادة المحاولة',
    saleHint:'ابدأ البيع مباشرة',
    purchaseHint:'فاتورة شراء جديدة أو سابقة',
    expenseHint:'المصاريف اليومية',
    stockHint:'الكميات وحالة المخزون',
    reportHint:'النتائج والتحليل',
    lowStockHint:'منتجات وصلت إلى حد إعادة التزويد',
    receivableHint:'أرصدة مستحقة عند العملاء',
    payableHint:'أرصدة مستحقة للموردين',
    returnLabel:'مرتجع',
    paymentLabel:'دفعة',
    accountTransferLabel:'تحويل حساب',
    accountMoveLabel:'حركة حساب',
    offsetLabel:'تسوية',
    settlementLabel:'تسوية رصيد',
  }:{
    attention:'À surveiller',
    attentionHint:'Les éléments utiles à traiter maintenant',
    quick:'Actions rapides',
    quickHint:'Raccourcis pour le travail quotidien',
    recent:'Activité récente',
    all:'Tout voir',
    pulse:'Les 7 derniers jours',
    pulseHint:'Le rythme des ventes de la semaine',
    topProducts:'Meilleures ventes',
    salesTotal:'Total sur 7 jours',
    noWeeklySales:'Aucune vente sur les 7 derniers jours.',
    noRecent:'Aucune opération récente.',
    loading:'Mise à jour du tableau du jour…',
    failed:'Impossible de mettre à jour le tableau du jour.',
    retry:'Réessayer',
    saleHint:'Démarrer une vente immédiatement',
    purchaseHint:'Nouvel achat ou historique',
    expenseHint:'Dépenses du quotidien',
    stockHint:'Quantités et état du stock',
    reportHint:'Résultats et analyse',
    lowStockHint:'Produits au seuil de réapprovisionnement',
    receivableHint:'Soldes dus par les clients',
    payableHint:'Soldes dus aux fournisseurs',
    returnLabel:'Retour',
    paymentLabel:'Paiement',
    accountTransferLabel:'Transfert de compte',
    accountMoveLabel:'Mouvement de compte',
    offsetLabel:'Compensation',
    settlementLabel:'Règlement',
  };

  const load=useCallback(async()=>{
    try{
      const [nextSummary,nextInsights,nextRecent]=await Promise.all([
        dashboardSummary(db),
        canSale||canReports?dashboardInsights(db,7):Promise.resolve(emptyInsights),
        canRecords?listDocumentHeaders(db,{limit:5}):Promise.resolve([]),
      ]);
      setSummary(nextSummary);
      setInsights(nextInsights);
      setRecent(nextRecent);
      setLoadError(false);
    }catch{
      setLoadError(true);
    }finally{
      setLoaded(true);
      setRefreshing(false);
    }
  },[canRecords,canReports,canSale,db]);

  useFocusEffect(useCallback(()=>{void load()},[load]));

  const localeTag=isRTL?'ar-MR-u-nu-latn':'fr-MR-u-nu-latn';
  const date=new Intl.DateTimeFormat(localeTag,{weekday:'long',day:'numeric',month:'long'}).format(new Date());
  const maxTrend=useMemo(()=>Math.max(1,...insights.trend.map(point=>point.sales)),[insights.trend]);
  const weeklySales=useMemo(()=>insights.trend.reduce((sum,point)=>sum+point.sales,0),[insights.trend]);
  const dayLabel=(value:string)=>new Intl.DateTimeFormat(localeTag,{weekday:'narrow'}).format(new Date(value+'T00:00:00Z'));
  const time=(value:string)=>new Intl.DateTimeFormat(localeTag,{hour:'2-digit',minute:'2-digit'}).format(new Date(value));
  const documentLabel=(doc:DocumentRecord)=>{
    if(doc.kind==='sale')return t('sales');
    if(doc.kind==='purchase')return t('purchases');
    if(doc.kind==='return')return copy.returnLabel;
    if(doc.kind==='expense')return t('expenses');
    if(doc.kind==='payment')return copy.paymentLabel;
    if(doc.kind==='transfer')return t('transfer');
    if(doc.kind==='adjustment')return t('adjustment');
    if(doc.kind==='account-transfer')return copy.accountTransferLabel;
    if(doc.kind==='account-adjustment')return copy.accountMoveLabel;
    if(doc.kind==='offset')return copy.offsetLabel;
    if(doc.kind==='settlement')return copy.settlementLabel;
    return doc.title??doc.kind;
  };

  const attentionCount=(canInventory&&summary.lowStockCount>0?1:0)+(canCustomers&&summary.receivable>0?1:0)+(canSuppliers&&summary.payable>0?1:0);
  const hasQuickTasks=canPurchases||canExpenses||canInventory||canReports;

  return <Screen padded={false}>
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl tintColor={colors.primary} refreshing={refreshing} onRefresh={()=>{setRefreshing(true);void load()}}/>}
        contentContainerStyle={styles.content}
      >
        <View style={[styles.header,{flexDirection:isRTL?'row-reverse':'row'}]}>
          <View style={styles.brandMark}><View style={styles.brandMarkInner}/></View>
          <View style={styles.headerCopy}>
            <AppText variant="title">{t('appName')}</AppText>
            <AppText variant="caption" muted>{date}</AppText>
          </View>
          {!loaded?<ActivityIndicator size="small" color={colors.primary}/>:null}
        </View>

        {loadError?<View style={[styles.errorBanner,{flexDirection:isRTL?'row-reverse':'row'}]}>
          <View style={styles.errorDot}/>
          <View style={styles.errorCopy}><AppText variant="subheading">{copy.failed}</AppText><AppText variant="caption" muted>{loaded?copy.retry:copy.loading}</AppText></View>
          <Pressable accessibilityRole="button" onPress={()=>{setRefreshing(true);void load()}} style={({pressed})=>[styles.retryButton,pressed&&styles.pressed]}>
            <AppText variant="caption" style={styles.retryText}>{copy.retry}</AppText>
          </Pressable>
        </View>:null}

        <View style={styles.todayCard}>
          <View style={styles.todayGlow}/>
          <View style={[styles.todayTop,{flexDirection:isRTL?'row-reverse':'row'}]}>
            <View style={styles.todayCopy}>
              <AppText variant="caption" style={styles.todayEyebrow}>{t('todaySales')}</AppText>
              <AppText variant="display" numberOfLines={1} style={styles.todayAmount}>{loaded?money(summary.todaySales):'—'}</AppText>
            </View>
            <View style={styles.todayDatePill}><AppText variant="caption" style={styles.todayDateText}>{ar?'اليوم':'Aujourd’hui'}</AppText></View>
          </View>

          <View style={[styles.todayMetrics,{flexDirection:isRTL?'row-reverse':'row'}]}>
            <MiniMetric label={t('todayProfit')} value={loaded?money(summary.todayProfit):'—'} positive/>
            {canExpenses?<><View style={styles.metricDivider}/><MiniMetric label={t('todayExpenses')} value={loaded?money(summary.todayExpenses):'—'}/></>:null}
            {canInventory?<><View style={styles.metricDivider}/><MiniMetric label={t('inventoryValue')} value={loaded?money(summary.inventoryValue):'—'}/></>:null}
          </View>

          {(canSale||canReports)&&insights.trend.length?<View style={styles.heroTrend}>
            <View style={[styles.heroTrendHead,{flexDirection:isRTL?'row-reverse':'row'}]}>
              <AppText variant="caption" style={styles.heroTrendLabel}>{copy.pulse}</AppText>
              <AppText variant="caption" style={styles.heroTrendValue}>{money(weeklySales)}</AppText>
            </View>
            <View style={[styles.heroBars,{flexDirection:isRTL?'row-reverse':'row'}]}>
              {insights.trend.map(point=>{
                const height=6+Math.round((point.sales/maxTrend)*38);
                return <View key={point.date} style={styles.heroBarColumn}>
                  <View style={styles.heroBarTrack}><View style={[styles.heroBarFill,{height}]}/></View>
                  <AppText variant="caption" style={styles.heroBarDay}>{dayLabel(point.date)}</AppText>
                </View>;
              })}
            </View>
          </View>:null}
        </View>

        {attentionCount>0?<View style={styles.section}>
          <SectionHeading title={copy.attention} subtitle={copy.attentionHint}/>
          <View style={styles.panel}>
            {canInventory&&summary.lowStockCount>0?<AttentionRow
              title={t('lowStock')}
              subtitle={copy.lowStockHint}
              value={number(summary.lowStockCount)}
              tone="warning"
              mark="!"
              onPress={()=>router.push('/inventory/stock')}
              isRTL={isRTL}
            />:null}
            {canCustomers&&summary.receivable>0?<AttentionRow
              title={t('receivable')}
              subtitle={copy.receivableHint}
              value={money(summary.receivable)}
              tone="primary"
              mark="+"
              onPress={()=>router.push('/parties/customers')}
              isRTL={isRTL}
            />:null}
            {canSuppliers&&summary.payable>0?<AttentionRow
              title={t('payable')}
              subtitle={copy.payableHint}
              value={money(summary.payable)}
              tone="negative"
              mark="−"
              onPress={()=>router.push('/parties/suppliers')}
              isRTL={isRTL}
            />:null}
          </View>
        </View>:null}

        {hasQuickTasks?<View style={styles.section}>
          <SectionHeading title={copy.quick} subtitle={copy.quickHint}/>
          <View style={styles.panel}>
            {canPurchases?<TaskRow title={t('purchases')} subtitle={copy.purchaseHint} glyph="purchase" onPress={()=>router.push('/sales/purchases')} isRTL={isRTL}/>:null}
            {canExpenses?<TaskRow title={t('expenses')} subtitle={copy.expenseHint} glyph="expense" onPress={()=>router.push('/sales/expenses')} isRTL={isRTL}/>:null}
            {canInventory?<TaskRow title={t('stock')} subtitle={copy.stockHint} glyph="stock" onPress={()=>router.push('/inventory/stock')} isRTL={isRTL}/>:null}
            {canReports?<TaskRow title={t('reports')} subtitle={copy.reportHint} glyph="report" onPress={()=>router.push('/more/reports')} isRTL={isRTL}/>:null}
          </View>
        </View>:null}

        {canRecords?<View style={styles.section}>
          <SectionHeading title={copy.recent} action={<Pressable accessibilityRole="button" onPress={()=>router.push('/sales/records')} style={({pressed})=>pressed&&styles.pressed}><AppText variant="caption" style={styles.sectionLink}>{copy.all}</AppText></Pressable>}/>
          <View style={styles.panel}>
            {!loaded?<LoadingRows/>:recent.length?recent.map((doc,index)=><Pressable
              accessibilityRole="button"
              key={doc.id}
              onPress={()=>router.push({pathname:'/sales/records',params:{documentId:doc.id}})}
              style={({pressed})=>[styles.activityRow,{flexDirection:isRTL?'row-reverse':'row'},pressed&&styles.rowPressed,index===recent.length-1&&styles.lastRow]}
            >
              <View style={styles.activityCopy}>
                <View style={[styles.activityMeta,{flexDirection:isRTL?'row-reverse':'row'}]}>
                  <Badge label={documentLabel(doc)} tone={doc.status==='voided'?'negative':doc.kind==='sale'?'positive':doc.kind==='purchase'?'warning':doc.kind==='expense'?'negative':'neutral'}/>
                  <AppText variant="caption" muted>{time(doc.occurredAt)}</AppText>
                </View>
                <AppText variant="subheading" numberOfLines={1}>{doc.partyName||doc.title||doc.number}</AppText>
                <AppText variant="caption" muted>{doc.number}</AppText>
              </View>
              <Money value={doc.total} tone={doc.status==='voided'?'negative':'normal'}/>
            </Pressable>):<View style={styles.emptyState}><AppText variant="caption" muted>{copy.noRecent}</AppText></View>}
          </View>
        </View>:null}

        {(canSale||canReports)?<View style={styles.section}>
          <SectionHeading title={copy.pulse} subtitle={copy.pulseHint}/>
          <View style={styles.pulsePanel}>
            <View style={[styles.pulseSummary,{flexDirection:isRTL?'row-reverse':'row'}]}>
              <View style={styles.pulseSummaryCopy}><AppText variant="caption" muted>{copy.salesTotal}</AppText><AppText variant="amount">{loaded?money(weeklySales):'—'}</AppText></View>
              <TrendGlyph/>
            </View>
            {!loaded?<View style={styles.pulseLoading}><ActivityIndicator size="small" color={colors.primary}/></View>:weeklySales<=0?<View style={styles.pulseEmpty}><AppText variant="caption" muted>{copy.noWeeklySales}</AppText></View>:<View style={[styles.pulseBars,{flexDirection:isRTL?'row-reverse':'row'}]}>
              {insights.trend.map(point=>{
                const height=10+Math.round((point.sales/maxTrend)*64);
                return <View key={point.date} style={styles.pulseBarColumn}>
                  <View style={styles.pulseBarTrack}><View style={[styles.pulseBarFill,{height}]}/></View>
                  <AppText variant="caption" muted style={styles.pulseDay}>{dayLabel(point.date)}</AppText>
                </View>;
              })}
            </View>}

            {canReports?<View style={styles.topProducts}>
              <View style={styles.innerDivider}/>
              <AppText variant="subheading">{copy.topProducts}</AppText>
              {!loaded?<LoadingRows compact/>:insights.topProducts.length?insights.topProducts.map((product,index)=><Pressable
                key={(product.productId??product.name)+'-'+index}
                accessibilityRole={canProducts&&product.productId?'button':undefined}
                disabled={!canProducts||!product.productId}
                onPress={()=>product.productId&&router.push({pathname:'/inventory/products',params:{productId:product.productId}})}
                style={({pressed})=>[styles.productRow,{flexDirection:isRTL?'row-reverse':'row'},pressed&&styles.rowPressed]}
              >
                <View style={styles.productRank}><AppText variant="caption" style={styles.productRankText}>{number(index+1)}</AppText></View>
                <View style={styles.productCopy}><AppText variant="subheading" numberOfLines={1}>{product.name}</AppText><AppText variant="caption" muted>{ar?'الكمية '+number(product.quantity):'Quantité '+number(product.quantity)}</AppText></View>
                <Money value={product.revenue}/>
              </Pressable>):<View style={styles.productEmpty}><AppText variant="caption" muted>{copy.noWeeklySales}</AppText></View>}
            </View>:null}
          </View>
        </View>:null}
      </ScrollView>

      {canSale?<StickyActionBar label={t('newSale')} summary={copy.saleHint} onPress={()=>router.push('/sales/pos')}/>:null}
    </View>
  </Screen>;
}

function SectionHeading({title,subtitle,action}:{title:string;subtitle?:string;action?:React.ReactNode}){
  const {isRTL}=useI18n();
  return <View style={styles.sectionHeading}>
    <View style={[styles.sectionHeadingRow,{flexDirection:isRTL?'row-reverse':'row'}]}>
      <AppText variant="heading">{title}</AppText>
      {action}
    </View>
    {subtitle?<AppText variant="caption" muted>{subtitle}</AppText>:null}
  </View>;
}

function MiniMetric({label,value,positive=false}:{label:string;value:string;positive?:boolean}){
  return <View style={styles.miniMetric}><AppText variant="caption" style={styles.miniMetricLabel}>{label}</AppText><AppText variant="subheading" numberOfLines={1} style={[styles.miniMetricValue,positive&&styles.miniMetricPositive]}>{value}</AppText></View>;
}

function AttentionRow({title,subtitle,value,tone,mark,onPress,isRTL}:{title:string;subtitle:string;value:string;tone:AttentionTone;mark:string;onPress:()=>void;isRTL:boolean}){
  return <Pressable accessibilityRole="button" onPress={onPress} style={({pressed})=>[styles.attentionRow,{flexDirection:isRTL?'row-reverse':'row'},pressed&&styles.rowPressed]}>
    <View style={[styles.attentionMark,tone==='primary'&&styles.attentionMarkPrimary,tone==='negative'&&styles.attentionMarkNegative]}><AppText variant="subheading" style={[styles.attentionMarkText,tone==='primary'&&styles.attentionMarkTextPrimary,tone==='negative'&&styles.attentionMarkTextNegative]}>{mark}</AppText></View>
    <View style={styles.attentionCopy}><AppText variant="subheading">{title}</AppText><AppText variant="caption" muted numberOfLines={2}>{subtitle}</AppText></View>
    <View style={styles.attentionValue}><AppText variant="caption" numberOfLines={1} style={[styles.attentionValueText,tone==='primary'&&styles.attentionValuePrimary,tone==='negative'&&styles.attentionValueNegative]}>{value}</AppText><AppText variant="heading" style={styles.chevron}>{isRTL?'‹':'›'}</AppText></View>
  </Pressable>;
}

function TaskRow({title,subtitle,glyph,onPress,isRTL}:{title:string;subtitle:string;glyph:TaskGlyph;onPress:()=>void;isRTL:boolean}){
  return <Pressable accessibilityRole="button" onPress={onPress} style={({pressed})=>[styles.taskRow,{flexDirection:isRTL?'row-reverse':'row'},pressed&&styles.rowPressed]}>
    <View style={styles.taskIcon}><TaskIcon glyph={glyph}/></View>
    <View style={styles.taskCopy}><AppText variant="subheading">{title}</AppText><AppText variant="caption" muted numberOfLines={1}>{subtitle}</AppText></View>
    <AppText variant="heading" style={styles.chevron}>{isRTL?'‹':'›'}</AppText>
  </Pressable>;
}

function TaskIcon({glyph}:{glyph:TaskGlyph}){
  if(glyph==='purchase')return <View style={styles.purchaseGlyph}><View style={styles.purchaseArrowStem}/><View style={styles.purchaseArrowHead}/><View style={styles.purchaseTray}/></View>;
  if(glyph==='expense')return <View style={styles.expenseGlyph}><View style={styles.expenseCoin}/><View style={styles.expenseLine}/></View>;
  if(glyph==='stock')return <View style={styles.stockGlyph}>{[0,1,2,3].map(index=><View key={index} style={styles.stockCell}/>)}</View>;
  return <View style={styles.reportGlyph}><View style={[styles.reportBar,{height:9}]}/><View style={[styles.reportBar,{height:14}]}/><View style={[styles.reportBar,{height:20}]}/></View>;
}

function TrendGlyph(){
  return <View style={styles.trendGlyph}><View style={[styles.trendGlyphBar,{height:9}]}/><View style={[styles.trendGlyphBar,{height:16}]}/><View style={[styles.trendGlyphBar,{height:23}]}/></View>;
}

function LoadingRows({compact=false}:{compact?:boolean}){
  return <View style={[styles.loadingRows,compact&&styles.loadingRowsCompact]}>{[0,1,2].map(index=><View key={index} style={styles.loadingRow}><View style={styles.loadingDot}/><View style={styles.loadingCopy}><View style={styles.loadingLine}/><View style={styles.loadingLineShort}/></View></View>)}</View>;
}

const styles=StyleSheet.create({
  root:{flex:1,backgroundColor:colors.background},
  scroll:{flex:1},
  content:{paddingHorizontal:spacing.md,paddingTop:spacing.sm,paddingBottom:spacing.lg,gap:spacing.lg},
  header:{minHeight:54,alignItems:'center',gap:spacing.sm},
  brandMark:{width:42,height:42,borderRadius:radius.md,backgroundColor:colors.primarySoft,alignItems:'center',justifyContent:'center'},
  brandMarkInner:{width:18,height:18,borderRadius:6,backgroundColor:colors.primary,transform:[{rotate:'12deg'}]},
  headerCopy:{flex:1,gap:spacing.xxs},
  errorBanner:{alignItems:'center',gap:spacing.sm,borderRadius:radius.lg,borderWidth:1,borderColor:'#F3C9CD',backgroundColor:colors.negativeSoft,padding:spacing.sm},
  errorDot:{width:8,height:8,borderRadius:4,backgroundColor:colors.negative},
  errorCopy:{flex:1,gap:spacing.xxs},
  retryButton:{minHeight:touch.min,justifyContent:'center',paddingHorizontal:spacing.sm},
  retryText:{color:colors.negative,fontWeight:'800'},
  todayCard:{position:'relative',overflow:'hidden',backgroundColor:colors.primary,borderRadius:radius.xl,padding:spacing.lg,gap:spacing.lg,...elevation.floating},
  todayGlow:{position:'absolute',width:180,height:180,borderRadius:90,right:-72,top:-82,backgroundColor:'rgba(255,255,255,.09)'},
  todayTop:{alignItems:'flex-start',justifyContent:'space-between',gap:spacing.md},
  todayCopy:{flex:1,gap:spacing.xs},
  todayEyebrow:{color:'#DCE9FF',fontWeight:'800',letterSpacing:.25},
  todayAmount:{color:colors.onPrimary,fontVariant:['tabular-nums'],fontSize:32},
  todayDatePill:{borderRadius:radius.full,backgroundColor:'rgba(255,255,255,.14)',paddingHorizontal:spacing.sm,paddingVertical:spacing.xs},
  todayDateText:{color:'#E7F0FF',fontWeight:'800'},
  todayMetrics:{alignItems:'stretch',borderRadius:radius.md,backgroundColor:'rgba(255,255,255,.10)',paddingVertical:spacing.sm,paddingHorizontal:spacing.sm},
  miniMetric:{flex:1,minWidth:0,gap:spacing.xxs,paddingHorizontal:spacing.xs},
  miniMetricLabel:{color:'#DCE9FF',fontSize:11},
  miniMetricValue:{color:colors.onPrimary,fontSize:14,fontVariant:['tabular-nums']},
  miniMetricPositive:{color:'#C9F4DF'},
  metricDivider:{width:StyleSheet.hairlineWidth,backgroundColor:'rgba(255,255,255,.24)'},
  heroTrend:{gap:spacing.sm,borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:'rgba(255,255,255,.22)',paddingTop:spacing.md},
  heroTrendHead:{alignItems:'center',justifyContent:'space-between',gap:spacing.sm},
  heroTrendLabel:{color:'#DCE9FF',fontWeight:'700'},
  heroTrendValue:{color:colors.onPrimary,fontWeight:'800',fontVariant:['tabular-nums']},
  heroBars:{height:60,alignItems:'flex-end',gap:spacing.xs},
  heroBarColumn:{flex:1,height:60,alignItems:'center',justifyContent:'flex-end',gap:5},
  heroBarTrack:{width:'68%',maxWidth:26,minWidth:12,height:44,borderRadius:7,overflow:'hidden',justifyContent:'flex-end',backgroundColor:'rgba(255,255,255,.13)'},
  heroBarFill:{width:'100%',borderRadius:7,backgroundColor:'rgba(255,255,255,.92)'},
  heroBarDay:{color:'#DCE9FF',fontSize:10,fontWeight:'700'},
  section:{gap:spacing.sm},
  sectionHeading:{gap:spacing.xxs},
  sectionHeadingRow:{minHeight:32,alignItems:'center',justifyContent:'space-between',gap:spacing.sm},
  sectionLink:{color:colors.primary,fontWeight:'800'},
  panel:{overflow:'hidden',backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,...elevation.subtle},
  attentionRow:{minHeight:76,alignItems:'center',gap:spacing.sm,padding:spacing.md,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border},
  attentionMark:{width:42,height:42,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:colors.warningSoft},
  attentionMarkPrimary:{backgroundColor:colors.primarySoft},
  attentionMarkNegative:{backgroundColor:colors.negativeSoft},
  attentionMarkText:{color:colors.warning,lineHeight:21},
  attentionMarkTextPrimary:{color:colors.primary},
  attentionMarkTextNegative:{color:colors.negative},
  attentionCopy:{flex:1,gap:spacing.xxs},
  attentionValue:{alignItems:'center',gap:spacing.xs,flexDirection:'row'},
  attentionValueText:{maxWidth:112,color:colors.warning,fontWeight:'800',fontVariant:['tabular-nums'],textAlign:'right'},
  attentionValuePrimary:{color:colors.primary},
  attentionValueNegative:{color:colors.negative},
  taskRow:{minHeight:70,alignItems:'center',gap:spacing.sm,paddingHorizontal:spacing.md,paddingVertical:spacing.sm,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border},
  taskIcon:{width:42,height:42,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:colors.primaryFaint,borderWidth:1,borderColor:colors.primarySoft},
  taskCopy:{flex:1,gap:spacing.xxs},
  chevron:{color:colors.textSoft,lineHeight:24},
  purchaseGlyph:{width:22,height:22,alignItems:'center',justifyContent:'flex-end'},
  purchaseArrowStem:{position:'absolute',top:1,width:2,height:10,borderRadius:2,backgroundColor:colors.primary},
  purchaseArrowHead:{position:'absolute',top:6,width:8,height:8,borderRightWidth:2,borderBottomWidth:2,borderColor:colors.primary,transform:[{rotate:'45deg'}]},
  purchaseTray:{width:20,height:8,borderWidth:2,borderTopWidth:0,borderColor:colors.primary,borderBottomLeftRadius:4,borderBottomRightRadius:4},
  expenseGlyph:{width:22,height:22,alignItems:'center',justifyContent:'center'},
  expenseCoin:{width:17,height:17,borderRadius:9,borderWidth:2,borderColor:colors.primary},
  expenseLine:{position:'absolute',width:7,height:2,borderRadius:2,backgroundColor:colors.primary},
  stockGlyph:{width:20,height:20,flexDirection:'row',flexWrap:'wrap',gap:3},
  stockCell:{width:8,height:8,borderWidth:2,borderColor:colors.primary,borderRadius:2},
  reportGlyph:{width:22,height:22,flexDirection:'row',alignItems:'flex-end',justifyContent:'center',gap:3},
  reportBar:{width:4,borderRadius:2,backgroundColor:colors.primary},
  activityRow:{minHeight:84,alignItems:'center',gap:spacing.md,paddingHorizontal:spacing.md,paddingVertical:spacing.sm,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border},
  activityCopy:{flex:1,gap:spacing.xs},
  activityMeta:{alignItems:'center',gap:spacing.xs},
  lastRow:{borderBottomWidth:0},
  rowPressed:{backgroundColor:colors.surfaceMuted},
  emptyState:{minHeight:96,alignItems:'center',justifyContent:'center',padding:spacing.md},
  pulsePanel:{backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:radius.xl,padding:spacing.md,gap:spacing.md,...elevation.subtle},
  pulseSummary:{alignItems:'center',justifyContent:'space-between',gap:spacing.md},
  pulseSummaryCopy:{flex:1,gap:spacing.xxs},
  trendGlyph:{width:48,height:38,borderRadius:radius.md,backgroundColor:colors.primaryFaint,borderWidth:1,borderColor:colors.primarySoft,flexDirection:'row',alignItems:'flex-end',justifyContent:'center',gap:4,paddingBottom:7},
  trendGlyphBar:{width:5,borderRadius:3,backgroundColor:colors.primary},
  pulseBars:{height:104,alignItems:'flex-end',gap:spacing.xs},
  pulseBarColumn:{flex:1,height:104,alignItems:'center',justifyContent:'flex-end',gap:6},
  pulseBarTrack:{width:'72%',maxWidth:30,minWidth:12,height:78,borderRadius:8,overflow:'hidden',justifyContent:'flex-end',backgroundColor:colors.surfaceStrong},
  pulseBarFill:{width:'100%',borderRadius:8,backgroundColor:colors.primary},
  pulseDay:{fontSize:10},
  pulseEmpty:{minHeight:72,alignItems:'center',justifyContent:'center',padding:spacing.sm},
  pulseLoading:{minHeight:72,alignItems:'center',justifyContent:'center'},
  topProducts:{gap:spacing.sm},
  innerDivider:{height:StyleSheet.hairlineWidth,backgroundColor:colors.border,marginVertical:spacing.xs},
  productRow:{minHeight:62,alignItems:'center',gap:spacing.sm,paddingVertical:spacing.xs},
  productRank:{width:34,height:34,borderRadius:12,alignItems:'center',justifyContent:'center',backgroundColor:colors.primarySoft},
  productRankText:{color:colors.primary,fontWeight:'800'},
  productCopy:{flex:1,gap:spacing.xxs},
  productEmpty:{minHeight:64,alignItems:'center',justifyContent:'center'},
  loadingRows:{paddingHorizontal:spacing.md,paddingVertical:spacing.sm,gap:spacing.sm},
  loadingRowsCompact:{paddingHorizontal:0,paddingVertical:0},
  loadingRow:{minHeight:52,flexDirection:'row',alignItems:'center',gap:spacing.sm},
  loadingDot:{width:34,height:34,borderRadius:12,backgroundColor:colors.surfaceStrong},
  loadingCopy:{flex:1,gap:spacing.xs},
  loadingLine:{width:'58%',height:8,borderRadius:4,backgroundColor:colors.surfaceStrong},
  loadingLineShort:{width:'34%',height:7,borderRadius:4,backgroundColor:colors.surfaceMuted},
  pressed:{opacity:.62},
});
