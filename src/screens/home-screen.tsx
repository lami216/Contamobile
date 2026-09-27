import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type { DashboardSummary, DocumentRecord } from '@/domain/types';
import { dashboardInsights, dashboardSummary, type DashboardInsights, type DashboardTopProduct } from '@/db/queries';
import { listDocumentHeaders } from '@/db/document-queries';
import { AppText, Screen } from '@/components/ui';
import { useI18n } from '@/i18n/provider';
import { useAuth } from '@/auth/provider';
import { colors, elevation, radius, spacing, touch } from '@/theme';

const empty:DashboardSummary={todaySales:0,todayProfit:0,todayExpenses:0,receivable:0,payable:0,inventoryValue:0,lowStockCount:0};
const emptyInsights:DashboardInsights={trend:[],topProducts:[]};

type MetricKind='receivable'|'expense'|'inventory'|'payable';
type ActionKind='sale'|'purchase'|'stock'|'report';
type BadgeTone='neutral'|'primary'|'positive'|'negative'|'warning';

export function HomeScreen(){
  const db=useSQLiteContext(),{t,isRTL,locale,money,number}=useI18n(),auth=useAuth();
  const {width}=useWindowDimensions();
  const [summary,setSummary]=useState(empty),[insights,setInsights]=useState(emptyInsights),[recent,setRecent]=useState<DocumentRecord[]>([]);
  const [selectedDate,setSelectedDate]=useState<string|null>(null);
  const [refreshing,setRefreshing]=useState(false),[loaded,setLoaded]=useState(false),[loadError,setLoadError]=useState(false);

  const canSale=auth.has('pos.create');
  const canRecords=auth.has('records.view');
  const canReports=auth.has('reports.view');
  const canExpenses=auth.has('expenses.view');
  const canCustomers=auth.has('customers.view');
  const canSuppliers=auth.has('suppliers.view');
  const canStock=auth.has('warehouses.inventory.view');
  const canInventoryValue=canStock||canReports;
  const canProducts=auth.has('products.view');
  const canPurchases=auth.has('purchases.view')||auth.has('purchases.create');
  const canTrend=canSale||canReports;

  const load=useCallback(async()=>{
    try{
      const [nextSummary,nextInsights,nextRecent]=await Promise.all([
        dashboardSummary(db),
        canTrend?dashboardInsights(db,7):Promise.resolve(emptyInsights),
        canRecords?listDocumentHeaders(db,{limit:3}):Promise.resolve([]),
      ]);
      setSummary(nextSummary);
      setInsights(nextInsights);
      setSelectedDate(current=>nextInsights.trend.some(point=>point.date===current)?current:(nextInsights.trend[nextInsights.trend.length-1]?.date??null));
      setRecent(nextRecent);
      setLoadError(false);
    }catch{
      setLoadError(true);
    }finally{
      setLoaded(true);
      setRefreshing(false);
    }
  },[canRecords,canTrend,db]);

  useFocusEffect(useCallback(()=>{void load()},[load]));

  const localeTag=locale==='ar'?'ar-MR-u-nu-latn':'fr-MR-u-nu-latn';
  const date=new Intl.DateTimeFormat(localeTag,{weekday:'long',day:'numeric',month:'long'}).format(new Date());
  const maxTrend=useMemo(()=>Math.max(1,...insights.trend.map(point=>point.sales)),[insights.trend]);
  const selectedIndex=useMemo(()=>{const index=insights.trend.findIndex(point=>point.date===selectedDate);return index>=0?index:insights.trend.length-1},[insights.trend,selectedDate]);
  const selectedPoint=selectedIndex>=0?insights.trend[selectedIndex]??null:null;
  const previousPoint=selectedIndex>0?insights.trend[selectedIndex-1]??null:null;
  const stackLists=width<360;
  const lowStockDescription=t('homeLowStockDescription').replace('{count}',number(summary.lowStockCount));
  const trendDate=(value:string)=>new Intl.DateTimeFormat(localeTag,{weekday:'short',day:'numeric',month:'long',timeZone:'UTC'}).format(new Date(value+'T00:00:00Z'));
  const percentNumber=(value:number)=>new Intl.NumberFormat(localeTag,{maximumFractionDigits:1,minimumFractionDigits:0,numberingSystem:'latn'}).format(Math.abs(value));
  let comparisonText='—',comparisonTone:'neutral'|'positive'|'negative'='neutral',comparisonIndicator='';
  if(selectedPoint&&previousPoint){
    if(previousPoint.sales===0){
      if(selectedPoint.sales===0)comparisonText='0%';
      else comparisonText=t('homeComparisonNew');
    }else{
      const change=((selectedPoint.sales-previousPoint.sales)/previousPoint.sales)*100;
      if(Math.abs(change)<.05)comparisonText='0%';
      else if(change>0){comparisonText=`+${percentNumber(change)}%`;comparisonTone='positive';comparisonIndicator='↑'}
      else{comparisonText=`-${percentNumber(change)}%`;comparisonTone='negative';comparisonIndicator='↓'}
    }
  }
  const chartAccessibility=(point:DashboardInsights['trend'][number])=>t('homeChartAccessibility').replace('{date}',trendDate(point.date)).replace('{sales}',money(point.sales)).replace('{count}',number(point.saleCount));

  const documentLabel=(doc:DocumentRecord)=>{
    if(doc.kind==='sale')return t('sales');
    if(doc.kind==='purchase')return t('purchases');
    if(doc.kind==='return')return t('homeReturn');
    if(doc.kind==='expense')return t('expenses');
    if(doc.kind==='payment')return t('homePayment');
    if(doc.kind==='transfer')return t('transfer');
    if(doc.kind==='adjustment')return t('adjustment');
    if(doc.kind==='account-transfer')return t('homeAccountTransfer');
    if(doc.kind==='account-adjustment')return t('homeAccountMovement');
    if(doc.kind==='offset')return t('homeOffset');
    if(doc.kind==='settlement')return t('homeSettlement');
    return doc.title??doc.kind;
  };
  const documentTone=(doc:DocumentRecord):BadgeTone=>{
    if(doc.status==='voided')return 'negative';
    if(doc.kind==='sale')return 'positive';
    if(doc.kind==='purchase')return 'warning';
    if(doc.kind==='payment')return 'primary';
    return 'neutral';
  };
  const time=(value:string)=>new Intl.DateTimeFormat(localeTag,{hour:'2-digit',minute:'2-digit'}).format(new Date(value));

  const metricCards:{kind:MetricKind;label:string;value:number;onPress?:()=>void}[]=[];
  if(canExpenses)metricCards.push({kind:'expense',label:t('todayExpenses'),value:summary.todayExpenses,onPress:()=>router.push('/sales/expenses')});
  if(canCustomers)metricCards.push({kind:'receivable',label:t('receivable'),value:summary.receivable,onPress:()=>router.push('/parties/customers')});
  if(canSuppliers)metricCards.push({kind:'payable',label:t('payable'),value:summary.payable,onPress:()=>router.push('/parties/suppliers')});
  if(canInventoryValue)metricCards.push({kind:'inventory',label:t('inventoryValue'),value:summary.inventoryValue,onPress:canStock?()=>router.push('/inventory/stock'):undefined});

  const actions:{kind:ActionKind;title:string;caption:string;onPress:()=>void}[]=[];
  if(canSale)actions.push({kind:'sale',title:t('newSale'),caption:t('homeNewSaleCaption'),onPress:()=>router.push('/sales/pos')});
  if(canPurchases)actions.push({kind:'purchase',title:t('purchases'),caption:t('homePurchaseCaption'),onPress:()=>router.push('/sales/purchases')});
  if(canStock)actions.push({kind:'stock',title:t('stock'),caption:t('homeInventoryCaption'),onPress:()=>router.push('/inventory/stock')});
  if(canReports)actions.push({kind:'report',title:t('reports'),caption:t('homeReportsCaption'),onPress:()=>router.push('/more/reports')});

  return <Screen padded={false}>
    <ScrollView
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl tintColor={colors.primary} refreshing={refreshing} onRefresh={()=>{setRefreshing(true);void load()}}/>}
      contentContainerStyle={styles.content}
    >
      <View style={[styles.header,{flexDirection:isRTL?'row-reverse':'row'}]}>
        <View style={styles.brandTile}><View style={styles.brandShape}/></View>
        <View style={styles.headerCopy}>
          <AppText variant="title">{t('appName')}</AppText>
          <AppText variant="caption" muted>{date}</AppText>
        </View>
        {!loaded?<ActivityIndicator size="small" color={colors.primary}/>:null}
      </View>

      {loadError?<View style={[styles.errorBanner,{flexDirection:isRTL?'row-reverse':'row'}]}>
        <View style={styles.errorDot}/>
        <View style={styles.errorCopy}><AppText variant="subheading">{t('homeLoadFailed')}</AppText><AppText variant="caption" muted>{t('tryAgain')}</AppText></View>
        <Pressable accessibilityRole="button" onPress={()=>{setRefreshing(true);void load()}} style={({pressed})=>[styles.retryButton,pressed&&styles.pressed]}>
          <AppText variant="caption" style={styles.retryText}>{t('tryAgain')}</AppText>
        </Pressable>
      </View>:null}

      <View style={styles.analyticsCard}>
        <View style={[styles.analyticsMain,{flexDirection:isRTL?'row-reverse':'row'}]}>
          <View style={[styles.salesSummary,!canTrend&&styles.salesSummaryWide]}>
            <View style={[styles.analyticsLabelRow,{flexDirection:isRTL?'row-reverse':'row'}]}>
              <View style={styles.analyticsIcon}><MiniBars/></View>
              <AppText variant="subheading" numberOfLines={1}>{t('todaySales')}</AppText>
            </View>
            <AppText variant="display" numberOfLines={1} style={styles.salesAmount}>{loaded?money(summary.todaySales):'—'}</AppText>
            <View style={styles.profitChip}>
              <AppText variant="caption" muted>{t('todayProfit')}</AppText>
              <AppText variant="caption" style={styles.profitValue}>{loaded?money(summary.todayProfit):'—'}</AppText>
            </View>
          </View>

          {canTrend?<><View style={styles.analyticsDivider}/><View style={styles.chartArea}>
            <View style={styles.chartBars}>
              {insights.trend.map(point=>{
                const selected=point.date===selectedPoint?.date;
                const height=point.sales>0?16+Math.round((point.sales/maxTrend)*54):4;
                return <Pressable
                  key={point.date}
                  accessibilityRole="button"
                  accessibilityState={{selected}}
                  accessibilityLabel={chartAccessibility(point)}
                  hitSlop={2}
                  onPress={()=>setSelectedDate(point.date)}
                  style={({pressed})=>[styles.chartColumn,pressed&&styles.chartColumnPressed]}
                >
                  <View style={styles.barTrack}><View style={[styles.bar,{height},point.sales===0&&styles.barZero,selected&&styles.barSelected]}/></View>
                  <AppText variant="caption" style={[styles.dayLabel,selected&&styles.dayLabelSelected]}>{point.date.slice(8)}</AppText>
                </Pressable>;
              })}
            </View>
          </View></>:null}
        </View>

        {canTrend&&selectedPoint?<View style={styles.selectedDayStrip}>
          <AppText variant="caption" style={styles.selectedDateLabel}>{trendDate(selectedPoint.date)}</AppText>
          <View style={[styles.selectedMetrics,{flexDirection:isRTL?'row-reverse':'row'}]}>
            <DayMetric label={t('homeSelectedSales')} value={money(selectedPoint.sales)}/>
            <View style={styles.selectedMetricDivider}/>
            <DayMetric label={t('homeSelectedInvoices')} value={number(selectedPoint.saleCount)}/>
            <View style={styles.selectedMetricDivider}/>
            <DayMetric label={t('homePreviousDay')} value={comparisonText} tone={comparisonTone} indicator={comparisonIndicator}/>
          </View>
        </View>:null}
      </View>

      {metricCards.length?<View style={[styles.metricGrid,{flexDirection:isRTL?'row-reverse':'row'}]}>
        {metricCards.map(card=><FinancialCard key={card.kind} {...card} loaded={loaded}/>)}
      </View>:null}

      {actions.length?<View style={styles.quickPanel}>
        <View style={styles.quickRow}>
          {actions.map((action,index)=><QuickItem key={action.kind} {...action} divided={index<actions.length-1}/>)}
        </View>
      </View>:null}

      {canStock&&summary.lowStockCount>0?<Pressable
        accessibilityRole="button"
        onPress={()=>router.push('/inventory/stock')}
        style={({pressed})=>[styles.lowStockBanner,{flexDirection:isRTL?'row-reverse':'row'},pressed&&styles.bannerPressed]}
      >
        <View style={styles.warningTile}><AppText variant="heading" style={styles.warningMark}>!</AppText></View>
        <View style={styles.warningCopy}><AppText variant="heading" style={styles.warningTitle}>{t('lowStock')}</AppText><AppText variant="caption" muted numberOfLines={2}>{lowStockDescription}</AppText></View>
        <AppText variant="heading" style={styles.warningChevron}>{isRTL?'‹':'›'}</AppText>
      </Pressable>:null}

      {(canRecords||canReports)?<View style={[styles.listsGrid,{flexDirection:stackLists?'column':isRTL?'row-reverse':'row'}]}>
        {canRecords?<CompactPanel title={t('homeRecentActivity')} action={t('homeViewAll')} onAction={()=>router.push('/sales/records')}>
          {!loaded?<CompactLoading/>:recent.length?recent.map((doc,index)=><Pressable
            accessibilityRole="button"
            key={doc.id}
            onPress={()=>router.push({pathname:'/sales/records',params:{documentId:doc.id}})}
            style={({pressed})=>[styles.recentRow,pressed&&styles.rowPressed,index===recent.length-1&&styles.lastCompactRow]}
          >
            <View style={[styles.recentTop,{flexDirection:isRTL?'row-reverse':'row'}]}>
              <CompactBadge label={documentLabel(doc)} tone={documentTone(doc)}/>
              <AppText variant="caption" muted style={styles.compactTime}>{time(doc.occurredAt)}</AppText>
            </View>
            <AppText variant="caption" numberOfLines={1} style={styles.recentTitle}>{doc.partyName||doc.title||doc.number}</AppText>
            <View style={[styles.recentBottom,{flexDirection:isRTL?'row-reverse':'row'}]}>
              <AppText variant="caption" muted numberOfLines={1} style={styles.documentNumber}>{doc.number}</AppText>
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={.8} style={[styles.compactAmount,{textAlign:isRTL?'right':'left'},doc.status==='voided'&&styles.negativeText]}>{money(doc.total)}</Text>
            </View>
          </Pressable>):<CompactEmpty text={t('homeNoRecent')}/>}
        </CompactPanel>:null}

        {canReports?<CompactPanel title={t('homeTopProducts')} action={t('homeViewAll')} onAction={()=>router.push('/more/reports')}>
          {!loaded?<CompactLoading/>:insights.topProducts.length?insights.topProducts.map((product,index)=><TopProductRow key={(product.productId??product.name)+'-'+index} product={product} rank={index+1} isLast={index===insights.topProducts.length-1} canOpen={canProducts}/>):<CompactEmpty text={t('homeNoWeeklySales')}/>}
        </CompactPanel>:null}
      </View>:null}
    </ScrollView>
  </Screen>;
}

function DayMetric({label,value,tone='neutral',indicator}:{label:string;value:string;tone?:'neutral'|'positive'|'negative';indicator?:string}){
  return <View style={styles.selectedMetric}>
    <AppText variant="caption" muted numberOfLines={2} style={styles.selectedMetricLabel}>{label}</AppText>
    <View style={styles.selectedMetricValueRow}>
      {indicator?<AppText variant="caption" style={[styles.selectedMetricIndicator,tone==='positive'&&styles.detailPositive,tone==='negative'&&styles.detailNegative]}>{indicator}</AppText>:null}
      <AppText variant="caption" numberOfLines={1} style={[styles.selectedMetricValue,tone==='positive'&&styles.detailPositive,tone==='negative'&&styles.detailNegative]}>{value}</AppText>
    </View>
  </View>;
}

function FinancialCard({kind,label,value,onPress,loaded}:{kind:MetricKind;label:string;value:number;onPress?:()=>void;loaded:boolean}){
  const {money,isRTL}=useI18n();
  const body=<>
    <View style={[styles.metricIconTile,kind==='receivable'&&styles.metricIconPositive,(kind==='expense'||kind==='payable')&&styles.metricIconNegative]}><MetricGlyph kind={kind}/></View>
    <View style={[styles.metricCopy,onPress&&(isRTL?styles.metricCopyWithChevronRTL:styles.metricCopyWithChevronLTR)]}>
      <AppText variant="caption" muted numberOfLines={1}>{label}</AppText>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={.8} style={[styles.metricAmount,{textAlign:isRTL?'right':'left'},kind==='receivable'&&styles.positiveText,(kind==='expense'||kind==='payable')&&styles.negativeText]}>{loaded?money(value):'—'}</Text>
    </View>
    {onPress?<AppText variant="heading" style={[styles.metricChevron,isRTL?styles.metricChevronRTL:styles.metricChevronLTR]}>{isRTL?'‹':'›'}</AppText>:null}
  </>;
  return onPress?<Pressable accessibilityRole="button" onPress={onPress} style={({pressed})=>[styles.metricCard,pressed&&styles.metricPressed]}>{body}</Pressable>:<View style={styles.metricCard}>{body}</View>;
}

function QuickItem({kind,title,caption,onPress,divided}:{kind:ActionKind;title:string;caption:string;onPress:()=>void;divided:boolean}){
  return <Pressable accessibilityRole="button" onPress={onPress} style={({pressed})=>[styles.quickItem,divided&&styles.quickDivider,pressed&&styles.quickPressed]}>
    <View style={[styles.quickIcon,kind==='purchase'&&styles.quickIconGreen,kind==='stock'&&styles.quickIconAmber,kind==='report'&&styles.quickIconPurple]}><ActionGlyph kind={kind}/></View>
    <AppText variant="subheading" numberOfLines={1} style={styles.quickTitle}>{title}</AppText>
    <AppText variant="caption" muted numberOfLines={1} style={styles.quickCaption}>{caption}</AppText>
  </Pressable>;
}

function CompactPanel({title,action,onAction,children}:{title:string;action:string;onAction:()=>void;children:ReactNode}){
  const {isRTL}=useI18n();
  return <View style={styles.compactPanel}>
    <View style={[styles.compactPanelHeader,{flexDirection:isRTL?'row-reverse':'row'}]}>
      <AppText variant="heading" numberOfLines={1} style={styles.compactPanelTitle}>{title}</AppText>
      <Pressable accessibilityRole="button" onPress={onAction} hitSlop={6} style={({pressed})=>pressed&&styles.pressed}><AppText variant="caption" style={styles.viewAll}>{action}</AppText></Pressable>
    </View>
    <View>{children}</View>
  </View>;
}

function TopProductRow({product,rank,isLast,canOpen}:{product:DashboardTopProduct;rank:number;isLast:boolean;canOpen:boolean}){
  const {money,number,t,isRTL}=useI18n();
  const canPress=canOpen&&Boolean(product.productId);
  return <Pressable
    accessibilityRole={canPress?'button':undefined}
    disabled={!canPress}
    onPress={()=>product.productId&&router.push({pathname:'/inventory/products',params:{productId:product.productId}})}
    style={({pressed})=>[styles.productRow,{flexDirection:isRTL?'row-reverse':'row'},pressed&&styles.rowPressed,isLast&&styles.lastCompactRow]}
  >
    <View style={styles.rankBadge}><AppText variant="caption" style={styles.rankText}>{number(rank)}</AppText></View>
    <View style={styles.productCopy}><AppText variant="caption" numberOfLines={1} style={styles.productName}>{product.name}</AppText><AppText variant="caption" muted numberOfLines={1}>{t('homeQuantity')} {number(product.quantity)}</AppText></View>
    <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={.8} style={[styles.productRevenue,{textAlign:isRTL?'right':'left'}]}>{money(product.revenue)}</Text>
  </Pressable>;
}

function CompactBadge({label,tone}:{label:string;tone:BadgeTone}){
  return <View style={[styles.compactBadge,tone==='primary'&&styles.badgePrimary,tone==='positive'&&styles.badgePositive,tone==='negative'&&styles.badgeNegative,tone==='warning'&&styles.badgeWarning]}><AppText variant="caption" numberOfLines={1} style={[styles.badgeText,tone==='primary'&&styles.badgeTextPrimary,tone==='positive'&&styles.badgeTextPositive,tone==='negative'&&styles.badgeTextNegative,tone==='warning'&&styles.badgeTextWarning]}>{label}</AppText></View>;
}

function CompactLoading(){
  return <View>{[0,1,2].map(index=><View key={index} style={[styles.loadingRow,index===2&&styles.lastCompactRow]}><View style={styles.loadingSquare}/><View style={styles.loadingCopy}><View style={styles.loadingLine}/><View style={styles.loadingLineShort}/></View></View>)}</View>;
}

function CompactEmpty({text}:{text:string}){
  return <View style={styles.compactEmpty}><AppText variant="caption" muted>{text}</AppText></View>;
}

function MiniBars(){
  return <View style={styles.miniBars}><View style={[styles.miniBar,{height:8}]}/><View style={[styles.miniBar,{height:13}]}/><View style={[styles.miniBar,{height:19}]}/></View>;
}

function MetricGlyph({kind}:{kind:MetricKind}){
  if(kind==='receivable')return <View style={styles.customersGlyph}>
    <View style={styles.customerHeadPrimary}/><View style={styles.customerHeadSecondary}/>
    <View style={styles.customerShouldersPrimary}/><View style={styles.customerShouldersSecondary}/>
  </View>;
  if(kind==='expense')return <View style={styles.receiptGlyph}>
    <View style={styles.receiptPaper}><View style={styles.receiptLine}/><View style={styles.receiptLineShort}/><View style={styles.receiptMinus}/></View>
  </View>;
  if(kind==='payable')return <View style={styles.supplierGlyph}>
    <View style={styles.supplierBox}/><View style={styles.supplierCab}/><View style={[styles.supplierWheel,{left:3}]}/><View style={[styles.supplierWheel,{right:2}]}/>
  </View>;
  return <View style={styles.packageGlyph}>
    <View style={styles.packageBody}/><View style={styles.packageFlap}/><View style={styles.packageSeam}/>
  </View>;
}

function ActionGlyph({kind}:{kind:ActionKind}){
  if(kind==='sale')return <View style={styles.saleGlyph}>
    <View style={styles.salePaper}/><View style={styles.salePlusHorizontal}/><View style={styles.salePlusVertical}/>
  </View>;
  if(kind==='purchase')return <View style={styles.purchaseGlyphRefined}>
    <View style={styles.purchaseStem}/><View style={styles.purchaseHead}/><View style={styles.purchaseTray}/>
  </View>;
  if(kind==='stock')return <View style={styles.stockGlyphRefined}>
    <View style={styles.stockBox}/><View style={styles.stockFlap}/><View style={styles.stockSeam}/>
  </View>;
  return <View style={styles.reportGlyphRefined}>
    <View style={[styles.reportOutlineBar,{height:10}]}/><View style={[styles.reportOutlineBar,{height:16}]}/><View style={[styles.reportOutlineBar,{height:22}]}/>
  </View>;
}

const styles=StyleSheet.create({
  content:{paddingHorizontal:spacing.md,paddingTop:spacing.xs,paddingBottom:spacing.lg,gap:spacing.sm,backgroundColor:colors.background},
  header:{minHeight:58,alignItems:'center',gap:spacing.sm,paddingVertical:spacing.xxs},
  brandTile:{width:44,height:44,borderRadius:15,backgroundColor:colors.primarySoft,alignItems:'center',justifyContent:'center'},
  brandShape:{width:21,height:21,borderRadius:6,backgroundColor:colors.primary,transform:[{rotate:'8deg'}]},
  headerCopy:{flex:1,gap:spacing.xxs},
  errorBanner:{minHeight:58,alignItems:'center',gap:spacing.sm,padding:spacing.sm,borderRadius:radius.lg,backgroundColor:colors.negativeSoft,borderWidth:1,borderColor:'#F4CDD0'},
  errorDot:{width:8,height:8,borderRadius:4,backgroundColor:colors.negative},
  errorCopy:{flex:1,gap:spacing.xxs},
  retryButton:{minHeight:touch.min,justifyContent:'center',paddingHorizontal:spacing.sm},
  retryText:{color:colors.negative,fontWeight:'800'},
  analyticsCard:{overflow:'hidden',backgroundColor:'#EAF3FF',borderRadius:22,borderWidth:1,borderColor:'#D5E5F8',...elevation.subtle},
  analyticsMain:{minHeight:178},
  salesSummary:{width:'37%',minWidth:112,paddingVertical:spacing.sm,paddingHorizontal:spacing.sm,gap:spacing.xs,justifyContent:'center',backgroundColor:'rgba(255,255,255,.56)'},
  salesSummaryWide:{width:'100%'},
  analyticsLabelRow:{alignItems:'center',gap:spacing.xs},
  analyticsIcon:{width:32,height:32,borderRadius:11,backgroundColor:'#DCEAFF',alignItems:'center',justifyContent:'center'},
  salesAmount:{fontSize:24,lineHeight:30,color:colors.text,fontVariant:['tabular-nums']},
  profitChip:{gap:3,paddingTop:spacing.xs,borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:'#D7E4F3'},
  profitValue:{color:colors.positive,fontWeight:'800',fontVariant:['tabular-nums']},
  analyticsDivider:{width:StyleSheet.hairlineWidth,backgroundColor:'#D5E4F4',marginVertical:spacing.md},
  chartArea:{flex:1,paddingHorizontal:spacing.sm,paddingVertical:spacing.xs},
  chartBars:{flex:1,minHeight:116,flexDirection:'row',alignItems:'flex-end',gap:2},
  chartColumn:{flex:1,minWidth:0,height:112,alignItems:'center',justifyContent:'flex-end',gap:6,borderRadius:radius.sm},
  chartColumnPressed:{backgroundColor:'rgba(23,105,224,.06)'},
  barTrack:{height:84,width:'100%',justifyContent:'flex-end',alignItems:'center'},
  bar:{width:18,minHeight:4,borderRadius:7,backgroundColor:'#8ABCF8'},
  barZero:{backgroundColor:'#C8D7E8'},
  barSelected:{backgroundColor:colors.primary},
  dayLabel:{fontSize:10,color:colors.textMuted,fontWeight:'600',minWidth:22,textAlign:'center'},
  dayLabelSelected:{color:colors.primary,fontWeight:'800'},
  selectedDayStrip:{borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:'#D4E2F2',backgroundColor:'rgba(255,255,255,.46)',paddingHorizontal:spacing.sm,paddingVertical:8,gap:6},
  selectedDateLabel:{color:colors.primaryStrong,fontWeight:'800'},
  selectedMetrics:{alignItems:'stretch'},
  selectedMetric:{flex:1,minWidth:0,gap:2,paddingHorizontal:7},
  selectedMetricLabel:{fontSize:9,lineHeight:12,minHeight:24},
  selectedMetricValueRow:{minHeight:18,flexDirection:'row',alignItems:'center',gap:3},
  selectedMetricValue:{fontSize:11.5,lineHeight:16,fontWeight:'800',color:colors.text,fontVariant:['tabular-nums']},
  selectedMetricIndicator:{fontSize:11,lineHeight:16,fontWeight:'900'},
  selectedMetricDivider:{width:StyleSheet.hairlineWidth,backgroundColor:'#D4E2F2'},
  detailPositive:{color:colors.positive},
  detailNegative:{color:colors.negative},
  metricGrid:{flexWrap:'wrap',gap:10},
  metricCard:{position:'relative',width:'48.4%',minHeight:74,flexDirection:'row',alignItems:'center',gap:7,paddingHorizontal:9,paddingVertical:spacing.sm,borderRadius:radius.lg,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,...elevation.subtle},
  metricPressed:{backgroundColor:colors.surfaceMuted,transform:[{scale:.99}]},
  metricIconTile:{width:38,height:38,borderRadius:13,alignItems:'center',justifyContent:'center',backgroundColor:colors.primarySoft,flexShrink:0},
  metricIconPositive:{backgroundColor:'#E4F8EF'},
  metricIconNegative:{backgroundColor:'#FDE9EB'},
  metricCopy:{flex:1,minWidth:0,gap:4},
  metricCopyWithChevronRTL:{paddingLeft:12},
  metricCopyWithChevronLTR:{paddingRight:12},
  metricAmount:{fontSize:14,lineHeight:19,fontWeight:'800',letterSpacing:-.15,color:colors.text,fontVariant:['tabular-nums']},
  metricChevron:{position:'absolute',top:24,color:colors.primary,fontSize:21,lineHeight:22},
  metricChevronRTL:{left:6},
  metricChevronLTR:{right:6},
  positiveText:{color:colors.positive},
  negativeText:{color:colors.negative},
  quickPanel:{backgroundColor:colors.surface,borderRadius:radius.lg,borderWidth:1,borderColor:colors.border,overflow:'hidden',...elevation.subtle},
  quickRow:{flexDirection:'row'},
  quickItem:{flex:1,minWidth:0,minHeight:96,alignItems:'center',justifyContent:'center',gap:6,paddingHorizontal:6,paddingVertical:spacing.sm},
  quickDivider:{borderRightWidth:StyleSheet.hairlineWidth,borderRightColor:colors.border},
  quickPressed:{backgroundColor:colors.primaryFaint},
  quickIcon:{width:44,height:44,borderRadius:15,alignItems:'center',justifyContent:'center',backgroundColor:colors.primarySoft},
  quickIconGreen:{backgroundColor:'#E4F8EF'},
  quickIconAmber:{backgroundColor:'#FFF2DA'},
  quickIconPurple:{backgroundColor:'#F0E9FF'},
  quickTitle:{fontSize:13,textAlign:'center'},
  quickCaption:{fontSize:10.5,textAlign:'center'},
  lowStockBanner:{minHeight:64,alignItems:'center',gap:spacing.sm,padding:spacing.sm,borderRadius:radius.lg,backgroundColor:'#FFF5DF',borderWidth:1,borderColor:'#F3D59B'},
  bannerPressed:{backgroundColor:'#FFEDC6'},
  warningTile:{width:42,height:42,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:'#FFE4AD'},
  warningMark:{color:colors.warning,fontSize:23,lineHeight:25},
  warningCopy:{flex:1,gap:3},
  warningTitle:{color:'#A96308',fontSize:16},
  warningChevron:{color:colors.warning,fontSize:28,lineHeight:28},
  listsGrid:{alignItems:'stretch',gap:10},
  compactPanel:{flex:1,minWidth:0,overflow:'hidden',borderRadius:radius.lg,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,...elevation.subtle},
  compactPanelHeader:{minHeight:44,alignItems:'center',justifyContent:'space-between',gap:4,paddingHorizontal:spacing.sm,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border},
  compactPanelTitle:{fontSize:16,flexShrink:1},
  viewAll:{color:colors.primary,fontWeight:'700',fontSize:11},
  recentRow:{minHeight:60,paddingHorizontal:spacing.sm,paddingVertical:8,gap:4,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border},
  recentTop:{alignItems:'center',justifyContent:'space-between',gap:4},
  compactTime:{fontSize:9.5,flexShrink:1},
  recentTitle:{fontSize:11.5,fontWeight:'700'},
  recentBottom:{alignItems:'center',justifyContent:'space-between',gap:5},
  documentNumber:{fontSize:9.5,flexShrink:1},
  compactAmount:{fontSize:11.5,fontWeight:'800',color:colors.text,fontVariant:['tabular-nums']},
  rowPressed:{backgroundColor:colors.surfaceMuted},
  lastCompactRow:{borderBottomWidth:0},
  productRow:{minHeight:60,alignItems:'center',gap:5,paddingHorizontal:8,paddingVertical:8,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border},
  rankBadge:{width:26,height:26,borderRadius:9,alignItems:'center',justifyContent:'center',backgroundColor:colors.primarySoft,flexShrink:0},
  rankText:{color:colors.primary,fontSize:11,fontWeight:'800'},
  productCopy:{flex:1,minWidth:0,gap:3},
  productName:{fontSize:11.5,fontWeight:'700'},
  productRevenue:{fontSize:10.5,lineHeight:14,fontWeight:'800',color:colors.text,fontVariant:['tabular-nums'],width:64,flexShrink:1},
  compactBadge:{maxWidth:86,borderRadius:8,paddingHorizontal:6,paddingVertical:3,backgroundColor:colors.surfaceMuted},
  badgePrimary:{backgroundColor:colors.primarySoft},
  badgePositive:{backgroundColor:colors.positiveSoft},
  badgeNegative:{backgroundColor:colors.negativeSoft},
  badgeWarning:{backgroundColor:colors.warningSoft},
  badgeText:{fontSize:9.5,color:colors.textMuted,fontWeight:'700'},
  badgeTextPrimary:{color:colors.primary},
  badgeTextPositive:{color:colors.positive},
  badgeTextNegative:{color:colors.negative},
  badgeTextWarning:{color:colors.warning},
  compactEmpty:{minHeight:180,alignItems:'center',justifyContent:'center',padding:spacing.sm},
  loadingRow:{minHeight:60,flexDirection:'row',alignItems:'center',gap:spacing.xs,paddingHorizontal:spacing.sm,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border},
  loadingSquare:{width:28,height:28,borderRadius:10,backgroundColor:colors.surfaceStrong},
  loadingCopy:{flex:1,gap:6},
  loadingLine:{width:'68%',height:7,borderRadius:4,backgroundColor:colors.surfaceStrong},
  loadingLineShort:{width:'44%',height:6,borderRadius:4,backgroundColor:colors.surfaceMuted},
  pressed:{opacity:.62},
  miniBars:{width:20,height:20,flexDirection:'row',alignItems:'flex-end',justifyContent:'center',gap:2},
  miniBar:{width:4,borderRadius:2,backgroundColor:colors.primary},
  peopleGlyph:{width:27,height:24,position:'relative'},
  peopleHead:{position:'absolute',top:0,left:4,width:8,height:8,borderRadius:4,borderWidth:2,borderColor:colors.positive},
  peopleHeadSecond:{position:'absolute',top:3,right:3,width:7,height:7,borderRadius:4,borderWidth:2,borderColor:colors.positive},
  peopleBody:{position:'absolute',bottom:0,left:1,width:24,height:12,borderWidth:2,borderBottomWidth:0,borderColor:colors.positive,borderTopLeftRadius:12,borderTopRightRadius:12},
  walletGlyph:{width:25,height:21,position:'relative'},
  walletBody:{position:'absolute',left:1,bottom:1,width:22,height:17,borderRadius:5,backgroundColor:colors.negative},
  walletClip:{position:'absolute',right:0,top:7,width:9,height:7,borderRadius:4,backgroundColor:'#B92E43'},
  truckGlyph:{width:28,height:22,position:'relative'},
  truckBody:{position:'absolute',left:0,top:5,width:17,height:12,borderRadius:3,backgroundColor:colors.negative},
  truckCab:{position:'absolute',right:1,top:9,width:10,height:8,borderRadius:3,backgroundColor:'#B92E43'},
  truckWheel:{position:'absolute',bottom:0,width:6,height:6,borderRadius:3,backgroundColor:colors.negative},
  boxGlyph:{width:25,height:25,alignItems:'center',justifyContent:'center'},
  boxFace:{width:20,height:20,borderWidth:2,borderColor:colors.primary,transform:[{rotate:'45deg'}],borderRadius:2},
  boxLine:{position:'absolute',width:2,height:17,backgroundColor:colors.primary},
  plusGlyph:{width:25,height:25,alignItems:'center',justifyContent:'center'},
  plusHorizontal:{position:'absolute',width:24,height:4,borderRadius:2,backgroundColor:colors.primary},
  plusVertical:{position:'absolute',width:4,height:24,borderRadius:2,backgroundColor:colors.primary},
  arrowGlyph:{width:25,height:27,alignItems:'center',justifyContent:'center'},
  arrowStem:{width:4,height:22,borderRadius:2,backgroundColor:colors.positive},
  arrowHead:{position:'absolute',bottom:2,width:12,height:12,borderRightWidth:4,borderBottomWidth:4,borderColor:colors.positive,transform:[{rotate:'45deg'}]},
  cubeGlyph:{width:25,height:25,alignItems:'center',justifyContent:'center'},
  cubeSquare:{width:18,height:18,borderWidth:2,borderColor:'#EA920E',transform:[{rotate:'45deg'}],borderRadius:2},
  cubeLine:{position:'absolute',width:2,height:16,backgroundColor:'#EA920E'},
  reportGlyph:{width:26,height:25,flexDirection:'row',alignItems:'flex-end',justifyContent:'center',gap:3},
  reportBar:{width:5,borderRadius:3,backgroundColor:'#6C3DE1'},

  customersGlyph:{width:28,height:25,position:'relative'},
  customerHeadPrimary:{position:'absolute',top:1,left:4,width:8,height:8,borderRadius:4,borderWidth:2,borderColor:colors.positive},
  customerHeadSecondary:{position:'absolute',top:3,right:3,width:7,height:7,borderRadius:4,borderWidth:2,borderColor:colors.positive},
  customerShouldersPrimary:{position:'absolute',left:0,bottom:1,width:16,height:10,borderWidth:2,borderBottomWidth:0,borderColor:colors.positive,borderTopLeftRadius:9,borderTopRightRadius:9},
  customerShouldersSecondary:{position:'absolute',right:0,bottom:1,width:14,height:9,borderWidth:2,borderBottomWidth:0,borderColor:colors.positive,borderTopLeftRadius:8,borderTopRightRadius:8},

  receiptGlyph:{width:25,height:26,alignItems:'center',justifyContent:'center'},
  receiptPaper:{width:20,height:23,borderWidth:2,borderColor:colors.negative,borderRadius:4,paddingHorizontal:4,paddingTop:5,gap:3},
  receiptLine:{height:2,borderRadius:2,backgroundColor:colors.negative,width:'100%'},
  receiptLineShort:{height:2,borderRadius:2,backgroundColor:colors.negative,width:'65%'},
  receiptMinus:{position:'absolute',left:5,right:5,bottom:4,height:2,borderRadius:2,backgroundColor:colors.negative},

  supplierGlyph:{width:29,height:24,position:'relative'},
  supplierBox:{position:'absolute',left:0,top:5,width:17,height:12,borderWidth:2,borderColor:colors.negative,borderRadius:3},
  supplierCab:{position:'absolute',right:1,top:8,width:10,height:9,borderWidth:2,borderColor:colors.negative,borderRadius:3},
  supplierWheel:{position:'absolute',bottom:1,width:6,height:6,borderRadius:3,borderWidth:2,borderColor:colors.negative,backgroundColor:'transparent'},

  packageGlyph:{width:26,height:24,alignItems:'center',justifyContent:'center'},
  packageBody:{width:22,height:19,borderWidth:2,borderColor:colors.primary,borderRadius:4},
  packageFlap:{position:'absolute',top:3,width:22,height:2,backgroundColor:colors.primary},
  packageSeam:{position:'absolute',top:3,width:2,height:8,backgroundColor:colors.primary},

  saleGlyph:{width:26,height:27,alignItems:'center',justifyContent:'center'},
  salePaper:{width:20,height:23,borderWidth:2,borderColor:colors.primary,borderRadius:4},
  salePlusHorizontal:{position:'absolute',width:10,height:2,borderRadius:2,backgroundColor:colors.primary},
  salePlusVertical:{position:'absolute',width:2,height:10,borderRadius:2,backgroundColor:colors.primary},

  purchaseGlyphRefined:{width:27,height:27,alignItems:'center',justifyContent:'center'},
  purchaseStem:{position:'absolute',top:2,width:2,height:14,borderRadius:2,backgroundColor:colors.positive},
  purchaseHead:{position:'absolute',top:9,width:9,height:9,borderRightWidth:2,borderBottomWidth:2,borderColor:colors.positive,transform:[{rotate:'45deg'}]},
  purchaseTray:{position:'absolute',bottom:2,width:22,height:7,borderWidth:2,borderTopWidth:0,borderColor:colors.positive,borderBottomLeftRadius:4,borderBottomRightRadius:4},

  stockGlyphRefined:{width:26,height:24,alignItems:'center',justifyContent:'center'},
  stockBox:{width:22,height:19,borderWidth:2,borderColor:'#EA920E',borderRadius:4},
  stockFlap:{position:'absolute',top:3,width:22,height:2,backgroundColor:'#EA920E'},
  stockSeam:{position:'absolute',top:3,width:2,height:8,backgroundColor:'#EA920E'},

  reportGlyphRefined:{width:27,height:24,flexDirection:'row',alignItems:'flex-end',justifyContent:'center',gap:3},
  reportOutlineBar:{width:5,borderWidth:2,borderColor:'#6C3DE1',borderRadius:3},
});