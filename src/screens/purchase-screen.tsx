import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type { DocumentRecord, Party, PaymentAccount, Product, ProductCategory, Warehouse } from '@/domain/types';
import { getDocumentById } from '@/db/document-queries';
import { listParties, listPaymentAccounts, listProductCategories, listProducts, listWarehouses } from '@/db/queries';
import { postPurchase } from '@/services/accounting-service';
import { PartyPicker } from '@/components/pickers';
import { AppText, Button, Chip, EmptyState, Field, GroupedList, Money, PageHeader, Screen, SearchField, SelectRow } from '@/components/ui';
import { BottomActionBar, QuantityStepper, Sheet } from '@/components/mobile-interactions';
import { useI18n } from '@/i18n/provider';
import { useAuth } from '@/auth/provider';
import { colors, elevation, radius, spacing, touch } from '@/theme';

type PurchaseLine={product:Product;quantity:number;unitPrice:number};
type PurchaseSuccess={documentId:string;document:DocumentRecord|null;total:number;occurredAt:string};

function format(template:string,values:Record<string,string|number>){
  return Object.entries(values).reduce((output,[key,value])=>output.replaceAll('{'+key+'}',String(value)),template);
}

export function PurchaseScreen(){
  const db=useSQLiteContext(),{t,isRTL,number,errorMessage}=useI18n(),auth=useAuth();
  const allowed=auth.has('purchases.create');
  const [warehouses,setWarehouses]=useState<Warehouse[]>([]),[warehouseId,setWarehouseId]=useState('');
  const [accounts,setAccounts]=useState<PaymentAccount[]>([]),[suppliers,setSuppliers]=useState<Party[]>([]),[categories,setCategories]=useState<ProductCategory[]>([]),[categoryId,setCategoryId]=useState('');
  const [results,setResults]=useState<Product[]>([]),[search,setSearch]=useState(''),[lines,setLines]=useState<PurchaseLine[]>([]),[loading,setLoading]=useState(true),[searching,setSearching]=useState(false);
  const [supplierId,setSupplierId]=useState<string|null>(null),[supplierPicker,setSupplierPicker]=useState(false),[productPicker,setProductPicker]=useState(false),[warehousePicker,setWarehousePicker]=useState(false);
  const [paymentOpen,setPaymentOpen]=useState(false),[paymentMethod,setPaymentMethod]=useState(''),[tender,setTender]=useState(''),[busy,setBusy]=useState(false);
  const [quantityLineId,setQuantityLineId]=useState<string|null>(null),[quantityDraft,setQuantityDraft]=useState('1'),[priceLineId,setPriceLineId]=useState<string|null>(null),[priceDraft,setPriceDraft]=useState('0');
  const [success,setSuccess]=useState<PurchaseSuccess|null>(null);

  const loadBase=useCallback(async()=>{
    if(!allowed)return;
    setLoading(true);
    try{
      const [w,a,s,cats]=await Promise.all([listWarehouses(db),listPaymentAccounts(db),listParties(db,'supplier','',300),listProductCategories(db)]);
      const active=a.filter(item=>item.isActive&&!item.isArchived);
      setWarehouses(w);setAccounts(active);setSuppliers(s);setCategories(cats);
      setCategoryId(current=>current&&cats.some(category=>category.id===current)?current:'');
      setWarehouseId(current=>current||w.find(item=>item.isSalesDefault)?.id||w[0]?.id||'');
      setPaymentMethod(current=>current==='note'||active.some(item=>item.id===current||item.code===current)?current:active.find(item=>item.code==='cash')?.id||active[0]?.id||'note');
    }catch(error){Alert.alert(t('error'),errorMessage(error))}finally{setLoading(false)}
  },[allowed,db,errorMessage,t]);

  useFocusEffect(useCallback(()=>{void loadBase()},[loadBase]));

  useEffect(()=>{
    if(!allowed)return;
    let cancelled=false;
    const timer=setTimeout(()=>{
      setSearching(true);
      void listProducts(db,search,undefined,false,search.trim()?40:24,0,categoryId)
        .then(rows=>{if(!cancelled)setResults(rows)})
        .catch(error=>{if(!cancelled)Alert.alert(t('error'),errorMessage(error))})
        .finally(()=>{if(!cancelled)setSearching(false)});
    },search.trim()?140:0);
    return()=>{cancelled=true;clearTimeout(timer)};
  },[allowed,categoryId,db,errorMessage,search,t]);

  const total=useMemo(()=>lines.reduce((sum,line)=>sum+Math.round(line.quantity*line.unitPrice),0),[lines]);
  const itemCount=useMemo(()=>lines.reduce((sum,line)=>sum+line.quantity,0),[lines]);
  const supplier=suppliers.find(item=>item.id===supplierId)??null;
  const warehouse=warehouses.find(item=>item.id===warehouseId)??null;
  const priceLine=lines.find(line=>line.product.id===priceLineId)??null;
  const tenderValue=paymentMethod==='note'?0:Number(tender.trim()===''?total:tender);
  const normalized=Number.isFinite(tenderValue)&&tenderValue>=0?tenderValue:0;
  const underpaid=paymentMethod!=='note'&&normalized<total;
  const paid=paymentMethod==='note'?0:total;
  const due=paymentMethod==='note'?total:0;
  const needsSupplier=paymentMethod==='note';

  const addProduct=(product:Product)=>setLines(current=>{
    const existing=current.find(line=>line.product.id===product.id);
    if(existing)return current.map(line=>line.product.id===product.id?{...line,quantity:line.quantity+1}:line);
    const cost=Number(product.lastPurchaseCost??product.pieceCost??0);
    return [{product,quantity:1,unitPrice:cost},...current];
  });

  const changeQuantity=(id:string,value:number)=>setLines(current=>value<=0?current.filter(line=>line.product.id!==id):current.map(line=>line.product.id===id?{...line,quantity:value}:line));
  const openQuantity=(line:PurchaseLine)=>{setQuantityLineId(line.product.id);setQuantityDraft(String(line.quantity))};
  const saveQuantity=()=>{if(quantityLineId){const value=Number(quantityDraft);if(Number.isFinite(value)&&value>0)changeQuantity(quantityLineId,value)}setQuantityLineId(null)};

  const openPrice=(line:PurchaseLine)=>{setPriceLineId(line.product.id);setPriceDraft(String(line.unitPrice))};
  const closePrice=()=>{setPriceLineId(null);setPriceDraft('0')};
  const savePrice=()=>{
    if(!priceLineId||!priceLine)return;
    const value=Number(priceDraft);
    if(!Number.isFinite(value)||value<=0){Alert.alert(t('purchasePrice'),t('purchasePriceRequired'));return}
    setLines(current=>current.map(line=>line.product.id===priceLineId?{...line,unitPrice:value}:line));
    closePrice();
  };

  const invalidLine=()=>lines.find(line=>!Number.isFinite(line.quantity)||line.quantity<=0||!Number.isFinite(line.unitPrice)||line.unitPrice<=0);
  const startPayment=()=>{
    if(!lines.length||!warehouseId)return;
    const invalid=invalidLine();
    if(invalid){Alert.alert(t('error'),format(t('purchaseInvalidLine'),{product:invalid.product.name}));return}
    setTender(String(total));setPaymentOpen(true);
  };

  const complete=async()=>{
    if(!lines.length||!warehouseId||busy)return;
    const invalid=invalidLine();
    if(invalid){setPaymentOpen(false);Alert.alert(t('error'),format(t('purchaseInvalidLine'),{product:invalid.product.name}));return}
    if(paymentMethod!=='note'&&(!Number.isFinite(tenderValue)||tenderValue<0)){Alert.alert(t('error'),t('posInvalidTender'));return}
    if(underpaid){Alert.alert(t('error'),t('purchasePartialPayment'));return}
    if(needsSupplier&&!supplierId){Alert.alert(t('supplier'),t('purchaseSupplierRequired'));return}
    setBusy(true);
    const completedTotal=total,completedAt=new Date().toISOString();
    try{
      const documentId=await postPurchase(db,{warehouseId,partyId:supplierId,paymentMethod,cashAmount:paid,lines:lines.map(line=>({productId:line.product.id,quantity:line.quantity,unitPrice:line.unitPrice}))});
      let document:DocumentRecord|null=null;
      try{document=await getDocumentById(db,documentId)}catch{}
      setLines([]);setSupplierId(null);setTender('');setPaymentOpen(false);setSearch('');setProductPicker(false);closePrice();setQuantityLineId(null);
      setSuccess({documentId,document,total:completedTotal,occurredAt:document?.occurredAt??completedAt});
      setResults(await listProducts(db,'',undefined,false,24,0,categoryId));
    }catch(error){Alert.alert(t('error'),errorMessage(error))}finally{setBusy(false)}
  };

  const startNewPurchase=()=>{setSuccess(null);setSupplierId(null);setTender('');setSearch('');setProductPicker(false);closePrice();setQuantityLineId(null)};

  if(!allowed)return <Screen><EmptyState title={t('error')}/></Screen>;
  if(loading)return <Screen><EmptyState title={t('loading')}/></Screen>;
  if(success)return <Screen padded={false}><PurchaseSuccessView success={success} onNew={startNewPurchase} onView={auth.has('records.view')?()=>router.push({pathname:'/sales/records',params:{documentId:success.documentId}}):undefined}/></Screen>;

  return <Screen padded={false}>
    <View style={styles.root}>
      <PageHeader title={t('purchaseNewTitle')} subtitle={warehouses.length===1?warehouse?.name:undefined} onBack={()=>router.back()}/>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <GroupedList>
          <SelectRow label={t('supplier')} value={supplier?.name??t('purchaseDirect')} hint={supplier?.phone||undefined} onPress={()=>setSupplierPicker(true)}/>
          {warehouses.length>1?<SelectRow label={t('warehouse')} value={warehouse?.name??t('warehouse')} disabled={lines.length>0} onPress={()=>setWarehousePicker(true)}/>:null}
        </GroupedList>

        <View style={[styles.sectionHeader,{flexDirection:isRTL?'row-reverse':'row'}]}>
          <AppText variant="heading">{t('purchaseInvoiceLines')}</AppText>
          <Pressable accessibilityRole="button" onPress={()=>setProductPicker(true)} style={({pressed})=>[styles.addProductButton,{flexDirection:isRTL?'row-reverse':'row'},pressed&&styles.pressed]}>
            <AppText variant="heading" style={styles.addProductPlus}>+</AppText><AppText variant="caption" style={styles.addProductText}>{t('purchaseAddProduct')}</AppText>
          </Pressable>
        </View>

        {lines.length?<GroupedList>
          {lines.map((line,index)=><PurchaseLineRow
            key={line.product.id}
            line={line}
            last={index===lines.length-1}
            onDecrease={()=>changeQuantity(line.product.id,line.quantity-1)}
            onIncrease={()=>changeQuantity(line.product.id,line.quantity+1)}
            onEditQuantity={()=>openQuantity(line)}
            onEditPrice={()=>openPrice(line)}
            onRemove={()=>changeQuantity(line.product.id,0)}
          />)}
        </GroupedList>:<View style={styles.emptyInvoice}>
          <AppText variant="subheading">{t('posNoLinesTitle')}</AppText>
          <AppText variant="caption" muted>{t('posNoLinesDescription')}</AppText>
          <Button title={'+ '+t('purchaseAddProduct')} variant="secondary" compact onPress={()=>setProductPicker(true)}/>
        </View>}
      </ScrollView>

      <BottomActionBar label={t('posContinuePayment')} total={total} count={itemCount} secondary={t('quantity')} onPress={startPayment} disabled={!lines.length}/>
    </View>

    <Sheet visible={productPicker} title={t('purchaseAddProduct')} onClose={()=>setProductPicker(false)} footer={<Button title={t('posDone')} onPress={()=>setProductPicker(false)}/>}>
      <View style={styles.pickerControls}>
        <SearchField value={search} onChangeText={setSearch} placeholder={t('purchaseSearchPlaceholder')}/>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.chips,{flexDirection:isRTL?'row-reverse':'row'}]}>
          <Chip label={t('purchaseAllCategories')} active={!categoryId} onPress={()=>setCategoryId('')}/>
          {categories.map(category=><Chip key={category.id} label={category.name} active={categoryId===category.id} onPress={()=>setCategoryId(category.id)}/>)}
        </ScrollView>
      </View>
      {searching?<View style={styles.searching}><AppText variant="caption" muted>{t('loading')}</AppText></View>:null}
      <GroupedList>
        {results.length?results.map((product,index)=><PurchaseProductRow key={product.id} product={product} last={index===results.length-1} onAdd={()=>addProduct(product)}/>):<EmptyState title={t('noResults')}/>}
      </GroupedList>
    </Sheet>

    <Sheet visible={warehousePicker} title={t('warehouse')} onClose={()=>setWarehousePicker(false)}>
      <View style={styles.warehouseOptions}>{warehouses.map(item=><Button key={item.id} title={item.name} variant={warehouseId===item.id?'primary':'secondary'} disabled={lines.length>0&&warehouseId!==item.id} onPress={()=>{setWarehouseId(item.id);setWarehousePicker(false)}}/>)}</View>
    </Sheet>

    <Sheet visible={paymentOpen} title={t('purchasePaymentTitle')} onClose={()=>{if(!busy)setPaymentOpen(false)}} footer={<><Button title={t('completePurchase')} loading={busy} disabled={underpaid||(needsSupplier&&!supplier)} onPress={()=>void complete()}/><Button title={t('cancel')} variant="ghost" disabled={busy} onPress={()=>setPaymentOpen(false)}/></>}>
      <View style={styles.paymentSummary}><View style={[styles.totalRow,{flexDirection:isRTL?'row-reverse':'row'}]}><AppText variant="subheading">{t('total')}</AppText><Money value={total} large/></View></View>
      <View style={styles.paymentBlock}><AppText variant="caption" muted>{t('paymentMethod')}</AppText><View style={[styles.chips,{flexDirection:isRTL?'row-reverse':'row'}]}>{accounts.map(account=><Chip key={account.id} label={account.name} active={paymentMethod===account.id||paymentMethod===account.code} onPress={()=>{setPaymentMethod(account.id);setTender(String(total))}}/>)}<Chip label={t('onCredit')} active={paymentMethod==='note'} onPress={()=>{setPaymentMethod('note');setTender('0')}}/></View></View>
      {paymentMethod!=='note'?<Field label={t('purchasePaidAmount')} value={tender} onChangeText={setTender} keyboardType="number-pad" selectTextOnFocus/>:null}
      <View style={[styles.summary,{flexDirection:isRTL?'row-reverse':'row'}]}><View><AppText variant="caption" muted>{t('paid')}</AppText><Money value={paid} tone="positive"/></View><View><AppText variant="caption" muted>{t('due')}</AppText><Money value={due} tone={due>0?'negative':'normal'}/></View></View>
      <SelectRow label={t('supplier')} value={supplier?.name??(needsSupplier?t('supplier'):t('purchaseDirect'))} hint={needsSupplier&&!supplier?t('purchaseSupplierRequired'):undefined} onPress={()=>setSupplierPicker(true)}/>
      {underpaid?<View style={styles.warningCard}><AppText variant="caption" style={styles.warningText}>{t('purchasePartialPayment')}</AppText></View>:needsSupplier&&!supplier?<View style={styles.warningCard}><AppText variant="caption" style={styles.warningText}>{t('purchaseSupplierRequired')}</AppText></View>:null}
    </Sheet>

    <PartyPicker visible={supplierPicker} parties={suppliers} directLabel={t('purchaseDirect')} onClose={()=>setSupplierPicker(false)} onSelect={party=>setSupplierId(party?.id??null)}/>

    <Sheet visible={Boolean(quantityLineId)} title={t('posEditQuantity')} onClose={()=>setQuantityLineId(null)} footer={<Button title={t('save')} onPress={saveQuantity}/>}>
      <Field label={t('quantity')} value={quantityDraft} onChangeText={setQuantityDraft} keyboardType="decimal-pad" autoFocus selectTextOnFocus/>
    </Sheet>

    <Sheet visible={Boolean(priceLineId)} title={t('purchasePrice')} onClose={closePrice} footer={<Button title={t('save')} onPress={savePrice}/>}>
      {priceLine?<AppText variant="subheading">{priceLine.product.name}</AppText>:null}
      <Field label={t('purchasePrice')} value={priceDraft} onChangeText={setPriceDraft} keyboardType="number-pad" autoFocus selectTextOnFocus/>
      <AppText variant="caption" muted>{t('purchasePriceRequired')}</AppText>
    </Sheet>
  </Screen>;
}

function PurchaseProductRow({product,last,onAdd}:{product:Product;last:boolean;onAdd:()=>void}){
  const {money,isRTL}=useI18n();
  const meta=[product.categoryName,product.sku?'#'+product.sku:null,product.barcode].filter(Boolean).join(' • ');
  return <View style={[styles.productRow,{flexDirection:isRTL?'row-reverse':'row'},last&&styles.lastRow]}>
    <View style={styles.productCopy}><AppText variant="subheading" numberOfLines={2}>{product.name}</AppText>{meta?<AppText variant="caption" muted numberOfLines={1}>{meta}</AppText>:null}</View>
    <View style={styles.productEnd}><AppText variant="subheading">{money(Number(product.lastPurchaseCost??product.pieceCost??0))}</AppText><Pressable accessibilityRole="button" onPress={onAdd} style={({pressed})=>[styles.addButton,pressed&&styles.pressed]}><AppText variant="heading" style={styles.plusText}>+</AppText></Pressable></View>
  </View>;
}

function PurchaseLineRow({line,last,onDecrease,onIncrease,onEditQuantity,onEditPrice,onRemove}:{line:PurchaseLine;last:boolean;onDecrease:()=>void;onIncrease:()=>void;onEditQuantity:()=>void;onEditPrice:()=>void;onRemove:()=>void}){
  const {t,isRTL,money}=useI18n();
  const meta=[line.product.categoryName,line.product.sku?'#'+line.product.sku:null].filter(Boolean).join(' • ');
  return <View style={[styles.invoiceLine,last&&styles.lastRow]}>
    <View style={[styles.lineHead,{flexDirection:isRTL?'row-reverse':'row'}]}><View style={styles.productCopy}><AppText variant="subheading" numberOfLines={2}>{line.product.name}</AppText>{meta?<AppText variant="caption" muted numberOfLines={1}>{meta}</AppText>:null}</View><Pressable accessibilityRole="button" accessibilityLabel={t('delete')} onPress={onRemove} style={({pressed})=>[styles.deleteButton,pressed&&styles.deletePressed]}><TrashGlyph/></Pressable></View>
    <View style={[styles.controls,{flexDirection:isRTL?'row-reverse':'row'}]}><QuantityStepper value={line.quantity} onDecrease={onDecrease} onIncrease={onIncrease} onEdit={onEditQuantity}/><Pressable accessibilityRole="button" onPress={onEditPrice} style={({pressed})=>[styles.priceButton,line.unitPrice<=0&&styles.priceMissing,pressed&&styles.pressed]}><AppText variant="caption" muted>{t('purchasePrice')}</AppText><AppText variant="subheading">{money(line.unitPrice)}</AppText></Pressable><View style={styles.lineTotal}><AppText variant="caption" muted>{t('total')}</AppText><AppText variant="subheading">{money(Math.round(line.quantity*line.unitPrice))}</AppText></View></View>
  </View>;
}

function PurchaseSuccessView({success,onNew,onView}:{success:PurchaseSuccess;onNew:()=>void;onView?:()=>void}){
  const {t,date,isRTL}=useI18n();
  return <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.successScreen}>
    <View style={styles.successHero}><View style={styles.successMark}><CheckGlyph/></View><AppText variant="title" style={styles.successTitle}>{t('purchaseSuccessTitle')}</AppText><AppText variant="body" muted style={styles.successDescription}>{t('purchaseSuccessDescription')}</AppText></View>
    <View style={styles.successCard}>{success.document?.number?<View style={[styles.successInvoice,{flexDirection:isRTL?'row-reverse':'row'}]}><View><AppText variant="caption" muted>{t('posInvoiceNumber')}</AppText><AppText variant="heading">{success.document.number}</AppText></View></View>:null}<View style={styles.successDivider}/><View style={[styles.totalRow,{flexDirection:isRTL?'row-reverse':'row'}]}><AppText variant="subheading">{t('total')}</AppText><Money value={success.total} large/></View><View style={[styles.successDate,{flexDirection:isRTL?'row-reverse':'row'}]}><AppText variant="caption" muted>{t('posSaleDate')}</AppText><AppText variant="caption" muted>{date(success.occurredAt)}</AppText></View></View>
    <View style={[styles.successActions,{flexDirection:isRTL?'row-reverse':'row'}]}>{onView?<View style={styles.successAction}><Button title={t('posViewInvoice')} variant="secondary" onPress={onView}/></View>:null}<View style={styles.successAction}><Button title={t('purchaseNewAction')} onPress={onNew}/></View></View>
  </ScrollView>;
}

function TrashGlyph(){return <View style={styles.trashGlyph}><View style={styles.trashLid}/><View style={styles.trashCan}/><View style={styles.trashLineOne}/><View style={styles.trashLineTwo}/></View>}
function CheckGlyph(){return <View style={styles.checkGlyph}><View style={styles.checkShort}/><View style={styles.checkLong}/></View>}

const styles=StyleSheet.create({
  root:{flex:1,backgroundColor:colors.background},
  content:{padding:spacing.md,gap:spacing.md,paddingBottom:116},
  sectionHeader:{minHeight:touch.min,alignItems:'center',justifyContent:'space-between',gap:spacing.sm},
  addProductButton:{minHeight:40,alignItems:'center',gap:6,paddingHorizontal:spacing.sm,borderRadius:radius.md,backgroundColor:colors.primarySoft,borderWidth:1,borderColor:colors.primarySoft},
  addProductPlus:{color:colors.primary,fontSize:22,lineHeight:24},
  addProductText:{color:colors.primary,fontWeight:'800'},
  emptyInvoice:{alignItems:'center',gap:spacing.xs,paddingVertical:spacing.lg,paddingHorizontal:spacing.md,borderRadius:radius.lg,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border},
  pickerControls:{gap:spacing.sm},
  chips:{gap:spacing.xs,flexWrap:'wrap'},
  searching:{minHeight:26,justifyContent:'center'},
  warehouseOptions:{gap:spacing.sm},
  productRow:{minHeight:68,flexDirection:'row',alignItems:'center',gap:spacing.sm,paddingHorizontal:spacing.sm,paddingVertical:8,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border},
  productCopy:{flex:1,minWidth:0,gap:3},
  productEnd:{minWidth:96,alignItems:'flex-end',gap:4},
  addButton:{width:38,height:34,borderRadius:10,backgroundColor:colors.primarySoft,alignItems:'center',justifyContent:'center'},
  plusText:{color:colors.primary,lineHeight:24},
  invoiceLine:{padding:spacing.sm,gap:spacing.sm,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border},
  lineHead:{alignItems:'center',gap:spacing.sm},
  controls:{alignItems:'center',justifyContent:'space-between',gap:spacing.xs},
  priceButton:{minWidth:92,paddingHorizontal:spacing.xs,paddingVertical:5,borderRadius:radius.sm,backgroundColor:colors.primaryFaint,borderWidth:1,borderColor:colors.primarySoft,alignItems:'center',gap:2},
  priceMissing:{borderColor:colors.warning,backgroundColor:colors.warningSoft},
  lineTotal:{minWidth:76,alignItems:'flex-end',gap:2},
  deleteButton:{width:touch.min,height:touch.min,borderRadius:radius.sm,alignItems:'center',justifyContent:'center'},
  deletePressed:{backgroundColor:colors.negativeSoft},
  lastRow:{borderBottomWidth:0},
  pressed:{opacity:.7,transform:[{scale:.99}]},
  paymentSummary:{padding:spacing.md,borderRadius:radius.lg,backgroundColor:colors.primaryFaint,borderWidth:1,borderColor:colors.primarySoft},
  totalRow:{alignItems:'center',justifyContent:'space-between',gap:spacing.md},
  paymentBlock:{gap:spacing.sm},
  summary:{gap:spacing.xl},
  warningCard:{padding:spacing.sm,borderRadius:radius.md,backgroundColor:colors.warningSoft,borderWidth:1,borderColor:'#F0D39B'},
  warningText:{color:'#9A620F',fontWeight:'700',lineHeight:18},
  successScreen:{flexGrow:1,padding:spacing.md,paddingTop:spacing.xl,paddingBottom:spacing.xl,gap:spacing.lg,backgroundColor:colors.background},
  successHero:{alignItems:'center',gap:spacing.sm,paddingTop:spacing.md},
  successMark:{width:72,height:72,borderRadius:36,alignItems:'center',justifyContent:'center',backgroundColor:colors.positive},
  successTitle:{textAlign:'center'},
  successDescription:{textAlign:'center',maxWidth:320,lineHeight:20},
  successCard:{padding:spacing.md,gap:spacing.sm,borderRadius:radius.lg,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,...elevation.subtle},
  successInvoice:{alignItems:'center',justifyContent:'space-between',gap:spacing.md},
  successDivider:{height:StyleSheet.hairlineWidth,backgroundColor:colors.border},
  successDate:{alignItems:'center',justifyContent:'space-between',gap:spacing.sm},
  successActions:{marginTop:'auto',gap:spacing.sm},
  successAction:{flex:1},
  trashGlyph:{width:22,height:24,position:'relative'},
  trashLid:{position:'absolute',top:3,left:3,width:16,height:2,borderRadius:2,backgroundColor:colors.negative},
  trashCan:{position:'absolute',top:7,left:5,width:12,height:14,borderWidth:2,borderColor:colors.negative,borderRadius:3},
  trashLineOne:{position:'absolute',top:10,left:9,width:2,height:8,backgroundColor:colors.negative},
  trashLineTwo:{position:'absolute',top:10,right:7,width:2,height:8,backgroundColor:colors.negative},
  checkGlyph:{width:34,height:30,position:'relative',transform:[{rotate:'-8deg'}]},
  checkShort:{position:'absolute',left:3,top:15,width:13,height:5,borderRadius:3,backgroundColor:colors.onPrimary,transform:[{rotate:'45deg'}]},
  checkLong:{position:'absolute',left:11,top:11,width:22,height:5,borderRadius:3,backgroundColor:colors.onPrimary,transform:[{rotate:'-45deg'}]},
});
