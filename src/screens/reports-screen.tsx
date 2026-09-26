import { useCallback, useMemo, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type { Party, PaymentAccount, Product, ProductCategory } from '@/domain/types';
import { validateRequiredDateRange, type DateRangeIssue } from '@/domain/date-range-validation';
import { listParties, listPaymentAccounts, listProductCategories, listProducts } from '@/db/queries';
import { runReport, salesTrend, type ReportData, type ReportFilters, type ReportType, type SalesTrendPoint } from '@/db/report-queries';
import { PartyPicker, ProductPicker } from '@/components/pickers';
import { AppHeader, AppText, Button, Card, Chip, EmptyState, Field, MetricCard, Money, Row, Screen, SearchField, SectionTitle } from '@/components/ui';
import { useI18n } from '@/i18n/provider';
import { useAuth } from '@/auth/provider';
import { colors, radius, spacing } from '@/theme';

const reportTypes:{id:ReportType;ar:string;fr:string}[]=[{id:'overview',ar:'نظرة عامة',fr:'Vue générale'},{id:'sales',ar:'المبيعات',fr:'Ventes'},{id:'purchases',ar:'المشتريات',fr:'Achats'},{id:'product-sales',ar:'مبيعات المنتجات',fr:'Ventes par produit'},{id:'stock',ar:'حركة المخزون',fr:'Mouvements du stock'},{id:'profit',ar:'الأرباح',fr:'Rentabilité'},{id:'debts',ar:'الديون',fr:'Dettes'},{id:'party-ledger',ar:'كشف طرف',fr:'Compte client/fournisseur'},{id:'financial',ar:'المالية',fr:'Finance'},{id:'expenses',ar:'المصاريف',fr:'Dépenses'}];
const metricLabels:Record<string,{ar:string;fr:string}>={sales:{ar:'المبيعات',fr:'Ventes'},purchases:{ar:'المشتريات',fr:'Achats'},expenses:{ar:'المصاريف',fr:'Dépenses'},profit:{ar:'ربح المبيعات',fr:'Marge brute'},netOperatingResult:{ar:'صافي الربح',fr:'Résultat net'},currentAccountsBalance:{ar:'إجمالي الأرصدة الحالية',fr:'Soldes actuels'},total:{ar:'الإجمالي',fr:'Total'},count:{ar:'العدد',fr:'Nombre'},revenue:{ar:'الإيراد',fr:'Revenu'},cost:{ar:'التكلفة',fr:'Coût'},businessNet:{ar:'صافي التشغيل',fr:'Résultat opérationnel'},inventory:{ar:'قيمة المخزون',fr:'Valeur du stock'},receivable:{ar:'لنا',fr:'À recevoir'},payable:{ar:'علينا',fr:'À payer'},incoming:{ar:'داخل',fr:'Entrées'},outgoing:{ar:'خارج',fr:'Sorties'},balance:{ar:'الرصيد',fr:'Solde'},net:{ar:'الصافي',fr:'Net'},paid:{ar:'المدفوع',fr:'Payé'},due:{ar:'المتبقي',fr:'Reste'},quantity:{ar:'الكمية',fr:'Quantité'},movements:{ar:'الحركات',fr:'Mouvements'},netChange:{ar:'صافي التغيير',fr:'Variation nette'}};
const stockMovementTypes=[['sale','بيع','Vente'],['purchase','شراء','Achat'],['transfer-in','تحويل داخل','Transfert entrant'],['transfer-out','تحويل خارج','Transfert sortant'],['adjustment','تصحيح','Ajustement'],['opening','رصيد بداية','Stock initial']] as const;
const financialMovementLabels:Record<string,{ar:string;fr:string}>={sale:{ar:'بيع',fr:'Vente'},purchase:{ar:'شراء',fr:'Achat'},expense:{ar:'مصروف',fr:'Dépense'},'party-receipt':{ar:'تحصيل من طرف',fr:'Encaissement tiers'},'party-payment':{ar:'دفع لطرف',fr:'Paiement tiers'},'transfer-in':{ar:'تحويل داخل',fr:'Transfert entrant'},'transfer-out':{ar:'تحويل خارج',fr:'Transfert sortant'},'manual-deposit':{ar:'إيداع',fr:'Dépôt'},'manual-withdrawal':{ar:'سحب',fr:'Retrait'},'opening-balance':{ar:'رصيد بداية',fr:'Solde initial'},'opening-balance-correction':{ar:'تصحيح رصيد البداية',fr:'Correction du solde initial'},'balance-correction':{ar:'تصحيح رصيد',fr:'Correction de solde'}};
const documentKindLabels:Record<string,{ar:string;fr:string}>={sale:{ar:'بيع',fr:'Vente'},purchase:{ar:'شراء',fr:'Achat'},return:{ar:'حركة تاريخية',fr:'Mouvement historique'},payment:{ar:'دفع/تحصيل',fr:'Paiement'},offset:{ar:'مقاصة',fr:'Compensation'},settlement:{ar:'تسوية',fr:'Règlement'},expense:{ar:'مصروف',fr:'Dépense'},transfer:{ar:'تحويل',fr:'Transfert'},adjustment:{ar:'تصحيح',fr:'Ajustement'}};
function localDay(){const value=new Date(),y=value.getFullYear(),m=String(value.getMonth()+1).padStart(2,'0'),d=String(value.getDate()).padStart(2,'0');return `${y}-${m}-${d}`}
function rangeMessage(issue:DateRangeIssue,ar:boolean){if(issue==='missing')return ar?'أدخل تاريخ البداية والنهاية.':'Saisissez les dates de début et de fin.';if(issue==='invalid')return ar?'صيغة التاريخ غير صحيحة. استخدم YYYY-MM-DD.':'Date invalide. Utilisez YYYY-MM-DD.';if(issue==='reversed')return ar?'تاريخ البداية يجب ألا يتجاوز تاريخ النهاية.':'La date de début ne doit pas dépasser la date de fin.';return ar?'الفترة طويلة جدًا. الحد الأقصى 10 سنوات تقريبًا.':'La période est trop longue. Maximum environ 10 ans.'}

export function ReportsScreen(){
  const db=useSQLiteContext(),{t,locale,isRTL,number}=useI18n(),auth=useAuth(),allowed=auth.has('reports.view'),ar=locale==='ar',today=localDay();
  const [type,setType]=useState<ReportType>('overview'),[from,setFrom]=useState(today),[to,setTo]=useState(today),[allTime,setAllTime]=useState(false),[data,setData]=useState<ReportData>({metrics:[],rows:[]}),[reportError,setReportError]=useState('');
  const [trend,setTrend]=useState<SalesTrendPoint[]>([]),[topProducts,setTopProducts]=useState<ReportData['rows']>([]);
  const [products,setProducts]=useState<Product[]>([]),[categories,setCategories]=useState<ProductCategory[]>([]),[parties,setParties]=useState<Party[]>([]),[accounts,setAccounts]=useState<PaymentAccount[]>([]),[categoryId,setCategoryId]=useState(''),[productId,setProductId]=useState(''),[partyId,setPartyId]=useState(''),[partyType,setPartyType]=useState<'customer'|'supplier'>('customer'),[accountId,setAccountId]=useState(''),[movementType,setMovementType]=useState(''),[direction,setDirection]=useState<'in'|'out'|''>(''),[debtSide,setDebtSide]=useState<'receivable'|'payable'|'clear'|''>(''),[search,setSearch]=useState(''),[productPicker,setProductPicker]=useState(false),[partyPicker,setPartyPicker]=useState(false);
  const filters:ReportFilters=useMemo(()=>({allTime,categoryId:categoryId||undefined,productId:productId||undefined,partyId:partyId||undefined,paymentAccountId:accountId||undefined,movementType:movementType||undefined,direction,debtSide,search:search||undefined}),[accountId,allTime,categoryId,debtSide,direction,movementType,partyId,productId,search]);
  const load=useCallback(async()=>{
    if(!allowed)return;
    const [p,c,s,a,cats]=await Promise.all([listProducts(db,'',undefined,false,1000),listParties(db,'customer','',10000),listParties(db,'supplier','',10000),listPaymentAccounts(db,true),listProductCategories(db)]);
    setProducts(p);setParties([...c,...s]);setAccounts(a);setCategories(cats);
    const issue=type!=='debts'&&!allTime?validateRequiredDateRange(from,to):null;
    if(issue){setReportError(rangeMessage(issue,ar));setData({metrics:[],rows:[]});setTrend([]);setTopProducts([]);return}
    try{
      const report=await runReport(db,type,from,to,filters);
      setData(report);setReportError('');
      if(type==='overview'||type==='sales'){
        const [trendRows,productsReport]=await Promise.all([salesTrend(db,from,to,allTime,14),runReport(db,'product-sales',from,to,{...filters,partyId:undefined,paymentAccountId:undefined,movementType:undefined,direction:'',debtSide:'',search:undefined})]);
        setTrend(trendRows);setTopProducts(productsReport.rows.slice(0,3));
      }else{setTrend([]);setTopProducts([])}
    }catch(error){
      setTrend([]);setTopProducts([]);
      setReportError(error instanceof Error&&error.message.startsWith('invalid-report-range:')?rangeMessage(error.message.slice('invalid-report-range:'.length) as DateRangeIssue,ar):(ar?'تعذر إنشاء التقرير.':'Impossible de générer le rapport.'));
    }
  },[allowed,allTime,ar,db,filters,from,to,type]);
  useFocusEffect(useCallback(()=>{void load()},[load]));
  if(!allowed)return <Screen><EmptyState title={ar?'ليس لديك صلاحية عرض التقارير':'Vous n’avez pas accès aux rapports.'}/></Screen>;
  const label=(key:string)=>metricLabels[key]?.[locale]??key,filteredProducts=categoryId?products.filter(product=>product.categoryId===categoryId):products,selectedProduct=products.find(product=>product.id===productId),selectedParty=parties.find(party=>party.id===partyId),numericMetrics=new Set(['count','quantity','movements','netChange']);
  const accountName=(value:string)=>accounts.find(account=>account.id===value||account.code===value)?.name??value;
  const localizeRow=(item:ReportData['rows'][number])=>{
    let rowLabel=item.label,secondary=item.secondary;
    if(type==='product-sales'&&secondary.startsWith('qty '))secondary=`${t('quantity')}: ${number(Number(secondary.slice(4)))}`;
    if(type==='profit'&&secondary.startsWith('qty ')){const parts=secondary.split(' • '),quantity=Number(parts[0]?.slice(4)??0),revenue=Number(parts[1]?.slice(8)??0),cost=Number(parts[2]?.slice(5)??0);secondary=`${t('quantity')}: ${number(quantity)} • ${ar?'الإيراد':'Revenu'}: ${number(revenue)} MRU • ${ar?'التكلفة':'Coût'}: ${number(cost)} MRU`}
    if(type==='stock'){const parts=secondary.split(' • '),movement=stockMovementTypes.find(([id])=>id===parts[1]);if(movement&&parts[1])parts[1]=ar?movement[1]:movement[2];secondary=parts.join(' • ')}
    if(type==='debts'){const parts=secondary.split(' • ');if(parts[0]==='customer')parts[0]=ar?'عميل':'Client';else if(parts[0]==='supplier')parts[0]=ar?'مورد':'Fournisseur';secondary=parts.join(' • ')}
    if(type==='party-ledger'){const labelParts=rowLabel.split(' • '),kind=labelParts[1]?documentKindLabels[labelParts[1]]:undefined;if(kind&&labelParts[1])labelParts[1]=kind[locale];rowLabel=labelParts.join(' • ');const parts=secondary.split(' • ');if(parts[1]&&parts[1]!=='—')parts[1]=accountName(parts[1]);secondary=parts.join(' • ')}
    if(type==='financial'){const parts=rowLabel.split(' • '),movement=parts[0]?financialMovementLabels[parts[0]]:undefined;if(movement&&parts[0])parts[0]=movement[locale];if(parts[1])parts[1]=accountName(parts[1]);rowLabel=parts.join(' • ')}
    return{rowLabel,secondary};
  };
  const changeType=(next:ReportType)=>{setType(next);setCategoryId('');setProductId('');setPartyId('');setAccountId('');setMovementType('');setDirection('');setDebtSide('');setSearch('');setReportError('')};
  const openSource=(item:ReportData['rows'][number])=>{if(item.sourceDocumentId){router.push({pathname:'/sales/records',params:{documentId:item.sourceDocumentId}});return}if(type==='product-sales'||type==='profit'){router.push({pathname:'/inventory/products',params:{productId:item.id}});return}if(type==='debts')router.push({pathname:'/parties/[id]',params:{id:item.id}})};
  const canOpenSource=(item:ReportData['rows'][number])=>Boolean(item.sourceDocumentId||type==='product-sales'||type==='profit'||type==='debts');
  const productFilter=['sales','purchases','product-sales','stock','profit'].includes(type),accountFilter=['sales','purchases','financial','expenses'].includes(type);
  const trendMax=Math.max(1,...trend.map(point=>point.value));
  return <Screen padded={false}><FlatList
    data={data.rows}
    keyExtractor={item=>item.id}
    contentContainerStyle={styles.content}
    ListHeaderComponent={<View style={styles.header}>
      <AppHeader eyebrow={ar?'التحليل':'Analyse'} title={t('reports')} subtitle={ar?'كل الأرقام أدناه مشتقة مباشرة من السجلات الفعلية في SQLite.':'Tous les chiffres ci-dessous proviennent directement des écritures SQLite.'}/>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.reportTabs,{flexDirection:isRTL?'row-reverse':'row'}]}>{reportTypes.map(report=><Chip key={report.id} label={report[locale]} active={type===report.id} onPress={()=>changeType(report.id)}/>)}</ScrollView>
      {type!=='debts'?<Card style={styles.dateCard}><View style={[styles.dates,{flexDirection:isRTL?'row-reverse':'row'}]}><Field label={t('from')} value={from} onChangeText={value=>{setFrom(value);setAllTime(false)}} containerStyle={styles.flex}/><Field label={t('to')} value={to} onChangeText={value=>{setTo(value);setAllTime(false)}} containerStyle={styles.flex}/></View>{reportError?<AppText variant="caption" style={styles.error}>{reportError}</AppText>:null}<Button compact title={allTime?(ar?'كل المدة مفعلة':'Toute la période active'):(ar?'كل المدة':'Toute la période')} variant={allTime?'secondary':'ghost'} onPress={()=>{setFrom('');setTo('');setAllTime(true);setReportError('')}}/></Card>:null}
      {productFilter&&categories.length?<Card><AppText variant="caption" muted>{ar?'الفئة':'Catégorie'}</AppText><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.chips,{flexDirection:isRTL?'row-reverse':'row'}]}><Chip label={ar?'كل الفئات':'Toutes'} active={!categoryId} onPress={()=>{setCategoryId('');setProductId('')}}/>{categories.map(category=><Chip key={category.id} label={category.name} active={categoryId===category.id} onPress={()=>{setCategoryId(category.id);setProductId('')}}/>)}</ScrollView></Card>:null}
      {productFilter?<Card><AppText variant="caption" muted>{ar?'المنتج':'Produit'}</AppText><View style={[styles.filterRow,{flexDirection:isRTL?'row-reverse':'row'}]}><Button title={selectedProduct?.name??(ar?'كل المنتجات':'Tous les produits')} variant="secondary" onPress={()=>setProductPicker(true)}/>{productId?<Button compact title={ar?'إزالة الفلتر':'Effacer'} variant="ghost" onPress={()=>setProductId('')}/>:null}</View></Card>:null}
      {accountFilter?<Card><AppText variant="caption" muted>{ar?'وسيلة الدفع':'Moyen de paiement'}</AppText><View style={[styles.wrap,{flexDirection:isRTL?'row-reverse':'row'}]}><Chip label={ar?'الكل':'Tous'} active={!accountId} onPress={()=>setAccountId('')}/>{accounts.map(account=><Chip key={account.id} label={account.name} active={accountId===account.id} onPress={()=>setAccountId(account.id)}/>)}</View></Card>:null}
      {type==='stock'?<Card><AppText variant="caption" muted>{ar?'نوع حركة المخزون':'Type de mouvement'}</AppText><View style={[styles.wrap,{flexDirection:isRTL?'row-reverse':'row'}]}><Chip label={ar?'الكل':'Tous'} active={!movementType} onPress={()=>setMovementType('')}/>{stockMovementTypes.map(([id,arabic,french])=><Chip key={id} label={ar?arabic:french} active={movementType===id} onPress={()=>setMovementType(id)}/>)}</View></Card>:null}
      {type==='financial'?<Card><AppText variant="caption" muted>{ar?'اتجاه الحركة':'Sens du mouvement'}</AppText><View style={[styles.wrap,{flexDirection:isRTL?'row-reverse':'row'}]}><Chip label={ar?'الكل':'Tous'} active={!direction} onPress={()=>setDirection('')}/><Chip label={ar?'داخل':'Entrées'} active={direction==='in'} onPress={()=>setDirection('in')}/><Chip label={ar?'خارج':'Sorties'} active={direction==='out'} onPress={()=>setDirection('out')}/></View><AppText variant="caption" muted>{ar?'نوع الحركة':'Type de mouvement'}</AppText><View style={[styles.wrap,{flexDirection:isRTL?'row-reverse':'row'}]}><Chip label={ar?'الكل':'Tous'} active={!movementType} onPress={()=>setMovementType('')}/>{Object.entries(financialMovementLabels).filter(([id])=>!id.endsWith(':reversal')).map(([id,value])=><Chip key={id} label={value[locale]} active={movementType===id} onPress={()=>setMovementType(id)}/>)}</View></Card>:null}
      {type==='debts'?<Card><SearchField value={search} onChangeText={setSearch}/><View style={[styles.wrap,{flexDirection:isRTL?'row-reverse':'row'}]}><Chip label={ar?'الكل':'Tous'} active={!debtSide} onPress={()=>setDebtSide('')}/><Chip label={ar?'لنا':'À recevoir'} active={debtSide==='receivable'} onPress={()=>setDebtSide('receivable')}/><Chip label={ar?'علينا':'À payer'} active={debtSide==='payable'} onPress={()=>setDebtSide('payable')}/><Chip label={ar?'مسدد':'Soldé'} active={debtSide==='clear'} onPress={()=>setDebtSide('clear')}/></View></Card>:null}
      {type==='party-ledger'?<Card><View style={[styles.wrap,{flexDirection:isRTL?'row-reverse':'row'}]}><Chip label={ar?'عميل':'Client'} active={partyType==='customer'} onPress={()=>{setPartyType('customer');setPartyId('')}}/><Chip label={ar?'مورد':'Fournisseur'} active={partyType==='supplier'} onPress={()=>{setPartyType('supplier');setPartyId('')}}/></View><Button title={selectedParty?.name??(ar?'اختر الطرف':'Choisir le compte')} variant="secondary" onPress={()=>setPartyPicker(true)}/>{!partyId?<AppText muted>{ar?'اختر عميلاً أو مورداً لإنشاء كشف الحساب.':'Choisissez un client ou un fournisseur pour le relevé.'}</AppText>:null}</Card>:null}
      {type==='debts'&&reportError?<AppText variant="caption" style={styles.error}>{reportError}</AppText>:null}
      {data.metrics.length?<><SectionTitle title={ar?'الملخص':'Résumé'}/><View style={[styles.metrics,{flexDirection:isRTL?'row-reverse':'row'}]}>{data.metrics.map(metric=><MetricCard key={metric.label} label={label(metric.label)} value={metric.value} format={numericMetrics.has(metric.label)?'number':'money'} tone={metric.label==='profit'||metric.label==='netOperatingResult'||metric.label==='businessNet'?(metric.value<0?'negative':'positive'):metric.label==='incoming'||metric.label==='receivable'?'positive':metric.label==='expenses'||metric.label==='outgoing'||metric.label==='payable'?'negative':'normal'}/>)}</View></>:null}
      {trend.length?<Card style={styles.chartCard}><SectionTitle title={ar?'اتجاه المبيعات':'Tendance des ventes'} subtitle={ar?'حتى آخر 14 يوماً ذات بيانات ضمن الفترة.':'Jusqu’aux 14 derniers jours avec données dans la période.'}/><View style={[styles.chart,{flexDirection:isRTL?'row-reverse':'row'}]}>{trend.map(point=><View key={point.date} style={styles.barColumn}><View style={styles.barTrack}><View style={[styles.bar,{height:point.value>0?Math.max(4,74*(point.value/trendMax)):0}]}/></View><AppText variant="caption" muted>{point.date.slice(5)}</AppText></View>)}</View></Card>:null}
      {topProducts.length?<Card style={styles.topCard}><SectionTitle title={ar?'أفضل المنتجات':'Meilleurs produits'} subtitle={ar?'مرتبة حسب إيراد المبيعات في الفترة.':'Classés par chiffre d’affaires sur la période.'}/>{topProducts.map((item,index)=><View key={item.id} style={[styles.topRow,{flexDirection:isRTL?'row-reverse':'row'},index===topProducts.length-1&&styles.lastRow]}><View style={styles.rank}><AppText variant="caption" style={styles.rankText}>{number(index+1)}</AppText></View><View style={styles.flex}><AppText variant="subheading" numberOfLines={1}>{item.label}</AppText><AppText variant="caption" muted>{item.secondary.startsWith('qty ')?`${t('quantity')}: ${number(Number(item.secondary.slice(4)))}`:item.secondary}</AppText></View><Money value={item.value}/></View>)}</Card>:null}
      {data.rows.length?<SectionTitle title={ar?'التفاصيل':'Détails'}/>:null}
    </View>}
    renderItem={({item})=>{const localized=localizeRow(item);return <View style={styles.rowCard}><Row title={localized.rowLabel} subtitle={localized.secondary} trailing={item.format==='number'?<AppText variant="heading">{number(item.value)}</AppText>:<Money value={item.value} tone={item.extra!=null&&item.extra<0?'negative':item.extra!=null&&item.extra>0?'positive':'normal'}/>} onPress={canOpenSource(item)?()=>openSource(item):undefined}/></View>}}
    ListEmptyComponent={<Card><AppText muted>{type==='party-ledger'&&!partyId?(ar?'اختر الطرف أولاً':'Choisissez d’abord le compte.'):reportError||t('noData')}</AppText></Card>}
  /><ProductPicker visible={productPicker} products={filteredProducts} onClose={()=>setProductPicker(false)} onSelect={product=>setProductId(product.id)}/><PartyPicker visible={partyPicker} parties={parties.filter(party=>party.partyType===partyType)} directLabel={ar?'إلغاء الاختيار':'Effacer la sélection'} onClose={()=>setPartyPicker(false)} onSelect={party=>setPartyId(party?.id??'')}/></Screen>;
}

const styles=StyleSheet.create({
  content:{padding:spacing.md,gap:spacing.sm,paddingBottom:spacing.xxl,backgroundColor:colors.background},
  header:{gap:spacing.md},
  reportTabs:{gap:spacing.xs},
  chips:{gap:spacing.xs},
  dates:{gap:spacing.sm},
  flex:{flex:1},
  dateCard:{gap:spacing.sm},
  metrics:{flexWrap:'wrap',gap:spacing.sm},
  wrap:{flexWrap:'wrap',gap:spacing.xs},
  filterRow:{flexWrap:'wrap',gap:spacing.xs,alignItems:'center'},
  error:{color:colors.negative},
  chartCard:{gap:spacing.md},
  chart:{alignItems:'flex-end',gap:spacing.xs,minHeight:104},
  barColumn:{flex:1,minWidth:18,alignItems:'center',gap:spacing.xs},
  barTrack:{height:78,width:'100%',maxWidth:24,justifyContent:'flex-end',borderRadius:radius.sm,backgroundColor:colors.primaryFaint,overflow:'hidden'},
  bar:{width:'100%',backgroundColor:colors.primary,borderRadius:radius.sm},
  topCard:{paddingVertical:spacing.sm},
  topRow:{minHeight:68,alignItems:'center',gap:spacing.sm,paddingVertical:spacing.sm,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border},
  lastRow:{borderBottomWidth:0},
  rank:{width:28,height:28,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:colors.primarySoft},
  rankText:{color:colors.primary,fontWeight:'800'},
  rowCard:{backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,paddingHorizontal:spacing.md,marginBottom:spacing.sm,overflow:'hidden'},
});
