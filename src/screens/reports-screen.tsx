import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type { Party, PaymentAccount, Product, ProductCategory } from '@/domain/types';
import { validateRequiredDateRange, type DateRangeIssue } from '@/domain/date-range-validation';
import { listParties, listPaymentAccounts, listProductCategories, listProducts } from '@/db/queries';
import { runReport, salesTrend, type ReportData, type ReportFilters, type ReportType, type SalesTrendPoint } from '@/db/report-queries';
import { PartyPicker, ProductPicker } from '@/components/pickers';
import { AppText, Button, Chip, EmptyState, Field, GroupedList, IconTile, Money, PageHeader, Screen, SearchField, SectionTitle, SegmentedControl, Surface } from '@/components/ui';
import { FilterSheet, Sheet } from '@/components/mobile-interactions';
import { useI18n } from '@/i18n/provider';
import type { MessageKey } from '@/i18n/messages';
import { useAuth } from '@/auth/provider';
import { colors, elevation, radius, spacing } from '@/theme';

const reportTypes:Array<{id:ReportType;label:MessageKey}>=[
  {id:'overview',label:'reportTypeOverview'},
  {id:'sales',label:'reportTypeSales'},
  {id:'purchases',label:'reportTypePurchases'},
  {id:'product-sales',label:'reportTypeProductSales'},
  {id:'stock',label:'reportTypeStock'},
  {id:'profit',label:'reportTypeProfit'},
  {id:'debts',label:'reportTypeDebts'},
  {id:'party-ledger',label:'reportTypePartyLedger'},
  {id:'financial',label:'reportTypeFinancial'},
  {id:'expenses',label:'reportTypeExpenses'},
];

const metricLabels:Record<string,MessageKey>={
  sales:'reportMetricSales',purchases:'reportMetricPurchases',expenses:'reportMetricExpenses',profit:'reportMetricProfit',netOperatingResult:'reportMetricNetOperatingResult',
  currentAccountsBalance:'reportMetricCurrentAccountsBalance',total:'reportMetricTotal',count:'reportMetricCount',revenue:'reportMetricRevenue',cost:'reportMetricCost',
  businessNet:'reportMetricBusinessNet',inventory:'reportMetricInventory',receivable:'reportMetricReceivable',payable:'reportMetricPayable',incoming:'reportMetricIncoming',
  outgoing:'reportMetricOutgoing',balance:'reportMetricBalance',net:'reportMetricNet',paid:'reportMetricPaid',due:'reportMetricDue',quantity:'reportMetricQuantity',
  movements:'reportMetricMovements',netChange:'reportMetricNetChange',
};

const metricPriority:Record<ReportType,string[]>={
  overview:['sales','expenses','profit','netOperatingResult'],
  sales:['total','count','paid','due'],
  purchases:['total','count','paid','due'],
  'product-sales':['revenue','quantity','profit'],
  stock:['movements','incoming','outgoing','netChange'],
  profit:['revenue','cost','profit','quantity'],
  debts:['receivable','payable','net','count'],
  'party-ledger':['receivable','payable','net','count'],
  financial:['incoming','outgoing','net','businessNet'],
  expenses:['total','count'],
};

const stockMovementTypes:Array<{id:string;label:MessageKey}>=[
  {id:'sale',label:'reportStockSale'},
  {id:'purchase',label:'reportStockPurchase'},
  {id:'transfer-in',label:'reportStockTransferIn'},
  {id:'transfer-out',label:'reportStockTransferOut'},
  {id:'adjustment',label:'reportStockAdjustment'},
  {id:'opening',label:'reportStockOpening'},
];

const financialMovementLabels:Record<string,MessageKey>={
  sale:'reportFinancialSale',purchase:'reportFinancialPurchase',expense:'reportFinancialExpense','party-receipt':'reportFinancialPartyReceipt','party-payment':'reportFinancialPartyPayment',
  'transfer-in':'reportFinancialTransferIn','transfer-out':'reportFinancialTransferOut','manual-deposit':'reportFinancialDeposit','manual-withdrawal':'reportFinancialWithdrawal',
  'opening-balance':'reportFinancialOpening','opening-balance-correction':'reportFinancialOpeningCorrection','balance-correction':'reportFinancialBalanceCorrection',
};

const documentKindLabels:Record<string,MessageKey>={
  sale:'partyMovementSale',purchase:'partyMovementPurchase',return:'reportDocumentHistorical',payment:'partyMovementPayment',offset:'partyMovementOffset',settlement:'partyMovementSettlement',
};

function localDay(){const value=new Date(),y=value.getFullYear(),m=String(value.getMonth()+1).padStart(2,'0'),d=String(value.getDate()).padStart(2,'0');return `${y}-${m}-${d}`}

export function ReportsScreen(){
  const db=useSQLiteContext(),{t,isRTL,number,money}=useI18n(),auth=useAuth(),allowed=auth.has('reports.view'),today=localDay();
  const [type,setType]=useState<ReportType>('overview'),[from,setFrom]=useState(today),[to,setTo]=useState(today),[allTime,setAllTime]=useState(false),[data,setData]=useState<ReportData>({metrics:[],rows:[]}),[reportError,setReportError]=useState(''),[loaded,setLoaded]=useState(false);
  const [trend,setTrend]=useState<SalesTrendPoint[]>([]),[topProducts,setTopProducts]=useState<ReportData['rows']>([]);
  const [products,setProducts]=useState<Product[]>([]),[categories,setCategories]=useState<ProductCategory[]>([]),[parties,setParties]=useState<Party[]>([]),[accounts,setAccounts]=useState<PaymentAccount[]>([]);
  const [categoryId,setCategoryId]=useState(''),[productId,setProductId]=useState(''),[partyId,setPartyId]=useState(''),[partyType,setPartyType]=useState<'customer'|'supplier'>('customer'),[accountId,setAccountId]=useState(''),[movementType,setMovementType]=useState(''),[direction,setDirection]=useState<'in'|'out'|''>(''),[debtSide,setDebtSide]=useState<'receivable'|'payable'|'clear'|''>(''),[search,setSearch]=useState('');
  const [productPicker,setProductPicker]=useState(false),[partyPicker,setPartyPicker]=useState(false),[filtersOpen,setFiltersOpen]=useState(false),[typeOpen,setTypeOpen]=useState(false);

  const filters:ReportFilters=useMemo(()=>({
    allTime,
    categoryId:categoryId||undefined,
    productId:productId||undefined,
    partyId:partyId||undefined,
    paymentAccountId:accountId||undefined,
    movementType:movementType||undefined,
    direction,
    debtSide,
    search:search||undefined,
  }),[accountId,allTime,categoryId,debtSide,direction,movementType,partyId,productId,search]);

  const rangeMessage=useCallback((issue:DateRangeIssue)=>{
    if(issue==='missing')return t('reportsRangeMissing');
    if(issue==='invalid')return t('reportsRangeInvalid');
    if(issue==='reversed')return t('reportsRangeReversed');
    return t('reportsRangeTooLong');
  },[t]);

  const load=useCallback(async()=>{
    if(!allowed)return;
    try{
      const [p,c,s,a,cats]=await Promise.all([
        listProducts(db,'',undefined,false,1000),
        listParties(db,'customer','',10000),
        listParties(db,'supplier','',10000),
        listPaymentAccounts(db,true),
        listProductCategories(db),
      ]);
      setProducts(p);setParties([...c,...s]);setAccounts(a);setCategories(cats);
      const issue=type!=='debts'&&!allTime?validateRequiredDateRange(from,to):null;
      if(issue){
        setReportError(rangeMessage(issue));setData({metrics:[],rows:[]});setTrend([]);setTopProducts([]);return;
      }
      const report=await runReport(db,type,from,to,filters);
      setData(report);setReportError('');
      if(type==='overview'||type==='sales'){
        const [trendRows,productsReport]=await Promise.all([
          salesTrend(db,from,to,allTime,14),
          runReport(db,'product-sales',from,to,{...filters,partyId:undefined,paymentAccountId:undefined,movementType:undefined,direction:'',debtSide:'',search:undefined}),
        ]);
        setTrend(trendRows);setTopProducts(productsReport.rows.slice(0,3));
      }else{
        setTrend([]);setTopProducts([]);
      }
    }catch(error){
      setTrend([]);setTopProducts([]);
      setReportError(error instanceof Error&&error.message.startsWith('invalid-report-range:')?rangeMessage(error.message.slice('invalid-report-range:'.length) as DateRangeIssue):t('reportsGenerateFailed'));
    }finally{
      setLoaded(true);
    }
  },[allowed,allTime,db,filters,from,rangeMessage,t,to,type]);

  useFocusEffect(useCallback(()=>{void load()},[load]));

  if(!allowed)return <Screen><EmptyState title={t('reportsNoPermission')}/></Screen>;

  const filteredProducts=categoryId?products.filter(product=>product.categoryId===categoryId):products;
  const selectedProduct=products.find(product=>product.id===productId);
  const selectedParty=parties.find(party=>party.id===partyId);
  const numericMetrics=new Set(['count','quantity','movements','netChange']);
  const productFilter=['sales','purchases','product-sales','stock','profit'].includes(type);
  const accountFilter=['sales','purchases','financial','expenses'].includes(type);
  const hasAdvancedFilters=productFilter||accountFilter||type==='stock'||type==='financial'||type==='debts'||type==='party-ledger';
  const activeFilterCount=[categoryId,productId,accountId,movementType,direction,debtSide,search,partyId].filter(Boolean).length;
  const visibleMetrics=metricPriority[type].map(key=>data.metrics.find(metric=>metric.label===key)).filter((metric):metric is ReportData['metrics'][number]=>Boolean(metric)).slice(0,4);
  const trendMax=Math.max(1,...trend.map(point=>point.value));

  const accountName=(value:string)=>accounts.find(account=>account.id===value||account.code===value)?.name??value;
  const localizeRow=(item:ReportData['rows'][number])=>{
    let rowLabel=item.label,secondary=item.secondary;
    if(type==='product-sales'&&secondary.startsWith('qty '))secondary=`${t('quantity')}: ${number(Number(secondary.slice(4)))}`;
    if(type==='profit'&&secondary.startsWith('qty ')){
      const parts=secondary.split(' • '),quantity=Number(parts[0]?.slice(4)??0),revenue=Number(parts[1]?.slice(8)??0),cost=Number(parts[2]?.slice(5)??0);
      secondary=`${t('quantity')}: ${number(quantity)} • ${t('reportMetricRevenue')}: ${money(revenue)} • ${t('reportMetricCost')}: ${money(cost)}`;
    }
    if(type==='stock'){
      const parts=secondary.split(' • '),movement=stockMovementTypes.find(option=>option.id===parts[1]);
      if(movement&&parts[1])parts[1]=t(movement.label);
      secondary=parts.join(' • ');
    }
    if(type==='debts'){
      const parts=secondary.split(' • ');
      if(parts[0]==='customer')parts[0]=t('reportsCustomer');
      else if(parts[0]==='supplier')parts[0]=t('reportsSupplier');
      secondary=parts.join(' • ');
    }
    if(type==='party-ledger'){
      const labelParts=rowLabel.split(' • '),kind=labelParts[1]?documentKindLabels[labelParts[1]]:undefined;
      if(kind&&labelParts[1])labelParts[1]=t(kind);
      rowLabel=labelParts.join(' • ');
      const parts=secondary.split(' • ');
      if(parts[1]&&parts[1]!=='—')parts[1]=accountName(parts[1]);
      secondary=parts.join(' • ');
    }
    if(type==='financial'){
      const parts=rowLabel.split(' • '),movement=parts[0]?financialMovementLabels[parts[0]]:undefined;
      if(movement&&parts[0])parts[0]=t(movement);
      if(parts[1])parts[1]=accountName(parts[1]);
      rowLabel=parts.join(' • ');
    }
    return{rowLabel,secondary};
  };

  const changeType=(next:ReportType)=>{
    setType(next);setCategoryId('');setProductId('');setPartyId('');setAccountId('');setMovementType('');setDirection('');setDebtSide('');setSearch('');setReportError('');setTypeOpen(false);
  };

  const resetFilters=()=>{
    setCategoryId('');setProductId('');setPartyId('');setAccountId('');setMovementType('');setDirection('');setDebtSide('');setSearch('');
  };

  const openSource=(item:ReportData['rows'][number])=>{
    if(item.sourceDocumentId){router.push({pathname:'/sales/records',params:{documentId:item.sourceDocumentId}});return}
    if(type==='product-sales'||type==='profit'){router.push({pathname:'/inventory/products',params:{productId:item.id}});return}
    if(type==='debts')router.push({pathname:'/parties/[id]',params:{id:item.id}});
  };

  const canOpenSource=(item:ReportData['rows'][number])=>Boolean(item.sourceDocumentId||type==='product-sales'||type==='profit'||type==='debts');

  return <Screen padded={false}>
    <FlatList
      data={data.rows}
      keyExtractor={item=>item.id}
      contentContainerStyle={styles.content}
      ListHeaderComponent={<View style={styles.header}>
        <PageHeader title={t('reports')}/>

        <View style={{flexDirection:isRTL?'row-reverse':'row',flexWrap:'wrap',gap:8}}>{reportTypes.map((report,index)=><Chip key={report.id} label={`${number(index+1)}. ${t(report.label)}`} active={type===report.id} onPress={()=>changeType(report.id)}/>)}</View>


        {type!=='debts'?<Surface style={styles.periodSurface}>
          <View style={[styles.dates,{flexDirection:isRTL?'row-reverse':'row'}]}>
            <Field label={t('from')} value={from} onChangeText={value=>{setFrom(value);setAllTime(false)}} containerStyle={styles.flex}/>
            <Field label={t('to')} value={to} onChangeText={value=>{setTo(value);setAllTime(false)}} containerStyle={styles.flex}/>
          </View>
          <View style={[styles.periodActions,{flexDirection:isRTL?'row-reverse':'row'}]}>
            <Chip label={t('reportsAllTime')} active={allTime} onPress={()=>{if(allTime){setAllTime(false);setFrom(today);setTo(today)}else{setFrom('');setTo('');setAllTime(true);setReportError('')}}}/>
            {hasAdvancedFilters?<Button compact title={activeFilterCount?`${t('reportsFilters')} · ${number(activeFilterCount)}`:t('reportsFilters')} variant="secondary" onPress={()=>setFiltersOpen(true)}/>:null}
          </View>
          {reportError?<AppText variant="caption" style={styles.error}>{reportError}</AppText>:null}
        </Surface>:hasAdvancedFilters?<View style={[styles.debtTools,{flexDirection:isRTL?'row-reverse':'row'}]}><Button title={activeFilterCount?`${t('reportsFilters')} · ${number(activeFilterCount)}`:t('reportsFilters')} variant="secondary" onPress={()=>setFiltersOpen(true)}/></View>:null}

        {!loaded?<Surface style={styles.loadingSurface}><AppText variant="caption" muted>{t('loading')}</AppText></Surface>:null}

        {visibleMetrics.length?<><SectionTitle title={t('reportsSummary')}/><View style={[styles.metrics,{flexDirection:isRTL?'row-reverse':'row'}]}>
          {visibleMetrics.map(metric=><ReportMetricTile key={metric.label} label={t(metricLabels[metric.label]??'reportMetricTotal')} value={metric.value} format={numericMetrics.has(metric.label)?'number':'money'} tone={metricTone(metric.label,metric.value)}/>)}
        </View></>:null}

        {trend.length?<Surface style={styles.chartSurface}>
          <SectionTitle title={t('reportsSalesTrend')} subtitle={t('reportsTrendSubtitle')}/>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.chart,{flexDirection:isRTL?'row-reverse':'row'}]}>
            {trend.map(point=><View key={point.date} style={styles.barColumn}><View style={styles.barTrack}><View style={[styles.bar,{height:point.value>0?Math.max(4,82*(point.value/trendMax)):3},point.value===0&&styles.barZero]}/></View><AppText variant="caption" muted>{point.date.slice(5)}</AppText></View>)}
          </ScrollView>
        </Surface>:null}

        {topProducts.length?<Surface style={styles.topSurface}>
          <SectionTitle title={t('reportsTopProducts')} subtitle={t('reportsTopProductsSubtitle')}/>
          {topProducts.map((item,index)=><View key={item.id} style={[styles.topRow,{flexDirection:isRTL?'row-reverse':'row'},index===topProducts.length-1&&styles.lastTopRow]}>
            <View style={styles.rank}><AppText variant="caption" style={styles.rankText}>{number(index+1)}</AppText></View>
            <View style={styles.flex}><AppText variant="subheading" numberOfLines={1}>{item.label}</AppText><AppText variant="caption" muted>{item.secondary.startsWith('qty ')?`${t('quantity')}: ${number(Number(item.secondary.slice(4)))}`:item.secondary}</AppText></View>
            <Money value={item.value}/>
          </View>)}
        </Surface>:null}

        {data.rows.length?<SectionTitle title={t('reportsDetails')}/>:null}
        {type==='party-ledger'&&!partyId&&!reportError?<Surface tone="muted"><AppText variant="caption" muted>{t('reportsChoosePartyHint')}</AppText></Surface>:null}
      </View>}
      renderItem={({item,index})=>{
        const localized=localizeRow(item);
        return <Pressable
          accessibilityRole={canOpenSource(item)?'button':undefined}
          onPress={canOpenSource(item)?()=>openSource(item):undefined}
          disabled={!canOpenSource(item)}
          style={({pressed})=>[
            styles.detailRow,
            index===0&&styles.firstDetailRow,
            index===data.rows.length-1&&styles.lastDetailRow,
            {flexDirection:isRTL?'row-reverse':'row'},
            pressed&&canOpenSource(item)&&styles.detailRowPressed,
          ]}
        >
          <View style={styles.detailCopy}><AppText variant="subheading" numberOfLines={1}>{localized.rowLabel}</AppText><AppText variant="caption" muted numberOfLines={2}>{localized.secondary}</AppText></View>
          {item.format==='number'?<AppText variant="heading">{number(item.value)}</AppText>:<Money value={item.value} tone={item.extra!=null&&item.extra<0?'negative':item.extra!=null&&item.extra>0?'positive':'normal'}/>}
        </Pressable>;
      }}
      ListEmptyComponent={type==='overview'||!loaded?null:<EmptyState title={reportError||t('noData')}/>}
    />

    <Sheet visible={typeOpen} title={t('reportsReportType')} onClose={()=>setTypeOpen(false)}>
      <GroupedList>{reportTypes.map((report,index)=><Pressable
        key={report.id}
        accessibilityRole="button"
        accessibilityState={{selected:type===report.id}}
        onPress={()=>changeType(report.id)}
        style={({pressed})=>[styles.typeRow,index===reportTypes.length-1&&styles.typeRowLast,{flexDirection:isRTL?'row-reverse':'row'},pressed&&styles.detailRowPressed]}
      ><AppText variant="subheading" style={styles.flex}>{t(report.label)}</AppText>{type===report.id?<View style={styles.selectedDot}/>:null}</Pressable>)}</GroupedList>
    </Sheet>

    <FilterSheet
      visible={filtersOpen}
      title={t('reportsFiltersTitle')}
      onClose={()=>setFiltersOpen(false)}
      applyLabel={t('confirm')}
      onApply={()=>setFiltersOpen(false)}
      resetLabel={activeFilterCount?t('reportsResetFilters'):undefined}
      onReset={activeFilterCount?resetFilters:undefined}
    >
      {productFilter&&categories.length?<FilterBlock label={t('reportsCategory')}><View style={[styles.wrap,{flexDirection:isRTL?'row-reverse':'row'}]}><Chip label={t('reportsAllCategories')} active={!categoryId} onPress={()=>{setCategoryId('');setProductId('')}}/>{categories.map(category=><Chip key={category.id} label={category.name} active={categoryId===category.id} onPress={()=>{setCategoryId(category.id);setProductId('')}}/>)}</View></FilterBlock>:null}
      {productFilter?<FilterBlock label={t('reportsProduct')}><Button title={selectedProduct?.name??t('reportsAllProducts')} variant="secondary" onPress={()=>{setFiltersOpen(false);setProductPicker(true)}}/>{productId?<Button compact title={t('reportsClearSelection')} variant="ghost" onPress={()=>setProductId('')}/>:null}</FilterBlock>:null}
      {accountFilter?<FilterBlock label={t('reportsPaymentAccount')}><View style={[styles.wrap,{flexDirection:isRTL?'row-reverse':'row'}]}><Chip label={t('reportsAll')} active={!accountId} onPress={()=>setAccountId('')}/>{accounts.map(account=><Chip key={account.id} label={account.name} active={accountId===account.id} onPress={()=>setAccountId(account.id)}/>)}</View></FilterBlock>:null}
      {type==='stock'?<FilterBlock label={t('reportsStockMovement')}><View style={[styles.wrap,{flexDirection:isRTL?'row-reverse':'row'}]}><Chip label={t('reportsAll')} active={!movementType} onPress={()=>setMovementType('')}/>{stockMovementTypes.map(option=><Chip key={option.id} label={t(option.label)} active={movementType===option.id} onPress={()=>setMovementType(option.id)}/>)}</View></FilterBlock>:null}
      {type==='financial'?<>
        <FilterBlock label={t('reportsDirection')}><SegmentedControl value={direction||'all'} options={[{value:'all',label:t('reportsAll')},{value:'in',label:t('reportsIncoming')},{value:'out',label:t('reportsOutgoing')}]} onChange={value=>setDirection(value==='all'?'':value as 'in'|'out')}/></FilterBlock>
        <FilterBlock label={t('reportsMovementType')}><View style={[styles.wrap,{flexDirection:isRTL?'row-reverse':'row'}]}><Chip label={t('reportsAll')} active={!movementType} onPress={()=>setMovementType('')}/>{Object.entries(financialMovementLabels).map(([id,label])=><Chip key={id} label={t(label)} active={movementType===id} onPress={()=>setMovementType(id)}/>)}</View></FilterBlock>
      </>:null}
      {type==='debts'?<>
        <SearchField value={search} onChangeText={setSearch}/>
        <FilterBlock label={t('reportsDebtSide')}><View style={[styles.wrap,{flexDirection:isRTL?'row-reverse':'row'}]}><Chip label={t('reportsAll')} active={!debtSide} onPress={()=>setDebtSide('')}/><Chip label={t('reportMetricReceivable')} active={debtSide==='receivable'} onPress={()=>setDebtSide('receivable')}/><Chip label={t('reportMetricPayable')} active={debtSide==='payable'} onPress={()=>setDebtSide('payable')}/><Chip label={t('reportsSettled')} active={debtSide==='clear'} onPress={()=>setDebtSide('clear')}/></View></FilterBlock>
      </>:null}
      {type==='party-ledger'?<>
        <FilterBlock label={t('reportsPartyType')}><SegmentedControl value={partyType} options={[{value:'customer',label:t('reportsCustomer')},{value:'supplier',label:t('reportsSupplier')}]} onChange={value=>{setPartyType(value);setPartyId('')}}/></FilterBlock>
        <FilterBlock label={t('reportsSelectParty')}><Button title={selectedParty?.name??t('reportsSelectParty')} variant="secondary" onPress={()=>{setFiltersOpen(false);setPartyPicker(true)}}/>{partyId?<Button compact title={t('reportsClearSelection')} variant="ghost" onPress={()=>setPartyId('')}/>:null}</FilterBlock>
      </>:null}
    </FilterSheet>

    <ProductPicker visible={productPicker} products={filteredProducts} onClose={()=>setProductPicker(false)} onSelect={product=>setProductId(product.id)}/>
    <PartyPicker visible={partyPicker} parties={parties.filter(party=>party.partyType===partyType)} directLabel={t('reportsClearSelection')} onClose={()=>setPartyPicker(false)} onSelect={party=>setPartyId(party?.id??'')}/>
  </Screen>;
}

function FilterBlock({label,children}:{label:string;children:ReactNode}){
  return <View style={styles.filterBlock}><AppText variant="caption" muted>{label}</AppText>{children}</View>;
}

function ReportMetricTile({label,value,format,tone}:{label:string;value:number;format:'money'|'number';tone:'normal'|'positive'|'negative'}){
  const {number}=useI18n();
  return <Surface style={styles.metricCard}>
    <View style={styles.metricHead}><IconTile tone={tone==='positive'?'positive':tone==='negative'?'negative':'primary'} size="sm"><MetricGlyph tone={tone}/></IconTile><AppText variant="caption" muted numberOfLines={2} style={styles.metricLabel}>{label}</AppText></View>
    {format==='number'?<AppText variant="amountLarge" style={[styles.metricValue,tone==='positive'&&styles.positive,tone==='negative'&&styles.negative]}>{number(value)}</AppText>:<Money value={value} tone={tone} large/>}
  </Surface>;
}

function metricTone(label:string,value:number):'normal'|'positive'|'negative'{
  if(label==='profit'||label==='netOperatingResult'||label==='businessNet'||label==='net')return value<0?'negative':'positive';
  if(label==='incoming'||label==='receivable')return 'positive';
  if(label==='expenses'||label==='outgoing'||label==='payable'||label==='due')return value>0?'negative':'normal';
  return 'normal';
}


function MetricGlyph({tone}:{tone:'normal'|'positive'|'negative'}){
  return <View style={styles.metricGlyph}><View style={[styles.metricGlyphBar,styles.metricGlyphBarOne,tone==='positive'&&styles.metricGlyphPositive,tone==='negative'&&styles.metricGlyphNegative]}/><View style={[styles.metricGlyphBar,styles.metricGlyphBarTwo,tone==='positive'&&styles.metricGlyphPositive,tone==='negative'&&styles.metricGlyphNegative]}/><View style={[styles.metricGlyphBar,styles.metricGlyphBarThree,tone==='positive'&&styles.metricGlyphPositive,tone==='negative'&&styles.metricGlyphNegative]}/></View>;
}

const styles=StyleSheet.create({
  content:{paddingHorizontal:spacing.md,paddingBottom:spacing.xxl,backgroundColor:colors.background},
  header:{gap:spacing.md,marginBottom:spacing.sm},
  periodSurface:{gap:spacing.sm,...elevation.subtle},
  dates:{gap:spacing.sm},
  flex:{flex:1,minWidth:0},
  periodActions:{alignItems:'center',justifyContent:'space-between',gap:spacing.sm,flexWrap:'wrap'},
  debtTools:{justifyContent:'flex-end'},
  error:{color:colors.negative,fontWeight:'700'},
  loadingSurface:{minHeight:54,alignItems:'center',justifyContent:'center'},
  metrics:{flexWrap:'wrap',gap:spacing.sm},
  metricCard:{width:'48.4%',minHeight:108,gap:spacing.sm,padding:spacing.sm},
  metricHead:{flexDirection:'row',alignItems:'center',gap:spacing.xs},
  metricLabel:{flex:1,minWidth:0},
  metricValue:{fontVariant:['tabular-nums']},
  positive:{color:colors.positive},
  negative:{color:colors.negative},
  chartSurface:{gap:spacing.md},
  chart:{alignItems:'flex-end',gap:spacing.sm,paddingTop:spacing.xs},
  barColumn:{width:34,alignItems:'center',gap:spacing.xs},
  barTrack:{height:86,width:22,justifyContent:'flex-end',borderRadius:radius.sm,backgroundColor:colors.primaryFaint,overflow:'hidden'},
  bar:{width:'100%',backgroundColor:colors.primary,borderRadius:radius.sm},
  barZero:{backgroundColor:colors.borderStrong},
  topSurface:{gap:0},
  topRow:{minHeight:64,alignItems:'center',gap:spacing.sm,paddingVertical:spacing.sm,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border},
  lastTopRow:{borderBottomWidth:0},
  rank:{width:28,height:28,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:colors.primarySoft},
  rankText:{color:colors.primary,fontWeight:'800'},
  detailRow:{minHeight:72,alignItems:'center',gap:spacing.sm,paddingHorizontal:spacing.md,paddingVertical:spacing.sm,backgroundColor:colors.surface,borderLeftWidth:1,borderRightWidth:1,borderTopWidth:StyleSheet.hairlineWidth,borderColor:colors.border},
  firstDetailRow:{borderTopWidth:1,borderTopLeftRadius:radius.lg,borderTopRightRadius:radius.lg},
  lastDetailRow:{borderBottomWidth:1,borderBottomLeftRadius:radius.lg,borderBottomRightRadius:radius.lg},
  detailRowPressed:{backgroundColor:colors.surfaceMuted},
  detailCopy:{flex:1,minWidth:0,gap:3},
  typeRow:{minHeight:56,alignItems:'center',gap:spacing.sm,paddingHorizontal:spacing.md,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border},
  typeRowLast:{borderBottomWidth:0},
  selectedDot:{width:9,height:9,borderRadius:5,backgroundColor:colors.primary},
  filterBlock:{gap:spacing.sm},
  wrap:{flexWrap:'wrap',gap:spacing.xs},
  reportGlyph:{width:24,height:22,flexDirection:'row',alignItems:'flex-end',justifyContent:'center',gap:3},
  reportBar:{width:4,borderRadius:2,backgroundColor:colors.primary},
  metricGlyph:{width:22,height:20,flexDirection:'row',alignItems:'flex-end',justifyContent:'center',gap:2},
  metricGlyphBar:{width:4,borderRadius:2,backgroundColor:colors.primary},
  metricGlyphBarOne:{height:7},
  metricGlyphBarTwo:{height:12},
  metricGlyphBarThree:{height:18},
  metricGlyphPositive:{backgroundColor:colors.positive},
  metricGlyphNegative:{backgroundColor:colors.negative},
});
