import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type { DocumentRecord, Party, PaymentAccount, Product, ProductCategory, Warehouse } from '@/domain/types';
import { getDocumentById } from '@/db/document-queries';
import { listParties, listPaymentAccounts, listProductCategories, listProducts, listWarehouses } from '@/db/queries';
import { postPurchase } from '@/services/accounting-service';
import { PartyPicker } from '@/components/pickers';
import {
  AlertCard,
  AppText,
  Badge,
  Button,
  Chip,
  EmptyState,
  FinancialSummary,
  FormField,
  FramedSection,
  GroupedList,
  InvoiceLine as InvoiceLineView,
  Money,
  PageHeader,
  PaymentMethodCard,
  Screen,
  SearchField,
  SegmentedControl,
  SelectRow,
  Surface,
} from '@/components/ui';
import { BottomActionBar, QuantityStepper, Sheet } from '@/components/mobile-interactions';
import { useI18n } from '@/i18n/provider';
import { useAuth } from '@/auth/provider';
import { colors, radius, spacing, touch } from '@/theme';

type PurchaseLine={product:Product;quantity:number;unitPrice:number};
type PurchaseStage='invoice'|'payment'|'success';
type SettlementType='payNow'|'credit';
type PurchaseSuccess={
  documentId:string;
  document:DocumentRecord|null;
  total:number;
  paid:number;
  due:number;
  occurredAt:string;
  supplierName:string|null;
  paymentName:string|null;
  settlement:SettlementType;
};

function format(template:string,values:Record<string,string|number>){
  return Object.entries(values).reduce((output,[key,value])=>output.replaceAll('{'+key+'}',String(value)),template);
}

export function PurchaseScreen(){
  const db=useSQLiteContext(),{t,errorMessage,isRTL}=useI18n(),auth=useAuth();
  const allowed=auth.has('purchases.create');
  const [warehouses,setWarehouses]=useState<Warehouse[]>([]),[warehouseId,setWarehouseId]=useState('');
  const [accounts,setAccounts]=useState<PaymentAccount[]>([]),[suppliers,setSuppliers]=useState<Party[]>([]),[categories,setCategories]=useState<ProductCategory[]>([]),[categoryId,setCategoryId]=useState('');
  const [results,setResults]=useState<Product[]>([]),[search,setSearch]=useState(''),[lines,setLines]=useState<PurchaseLine[]>([]),[loading,setLoading]=useState(true),[searching,setSearching]=useState(false);
  const [stage,setStage]=useState<PurchaseStage>('invoice'),[settlement,setSettlement]=useState<SettlementType>('payNow');
  const [supplierId,setSupplierId]=useState<string|null>(null),[supplierPicker,setSupplierPicker]=useState(false),[productPicker,setProductPicker]=useState(false),[warehousePicker,setWarehousePicker]=useState(false);
  const [paymentMethod,setPaymentMethod]=useState(''),[tender,setTender]=useState(''),[busy,setBusy]=useState(false);
  const [quantityLineId,setQuantityLineId]=useState<string|null>(null),[quantityDraft,setQuantityDraft]=useState('1'),[priceLineId,setPriceLineId]=useState<string|null>(null),[priceDraft,setPriceDraft]=useState('0');
  const [success,setSuccess]=useState<PurchaseSuccess|null>(null);

  const loadBase=useCallback(async()=>{
    if(!allowed)return;
    setLoading(true);
    try{
      const [w,a,s,cats]=await Promise.all([
        listWarehouses(db),
        listPaymentAccounts(db),
        listParties(db,'supplier','',300),
        listProductCategories(db),
      ]);
      const active=a.filter(account=>account.isActive&&!account.isArchived);
      setWarehouses(w);
      setAccounts(active);
      setSuppliers(s);
      setCategories(cats);
      setCategoryId(current=>current&&cats.some(category=>category.id===current)?current:'');
      setWarehouseId(current=>current||w.find(item=>item.isSalesDefault)?.id||w[0]?.id||'');
      setPaymentMethod(current=>{
        const match=active.find(account=>account.id===current||account.code===current);
        return match?.id??active.find(account=>account.code==='cash')?.id??active[0]?.id??'';
      });
      setSettlement(current=>active.length?current:'credit');
    }catch(error){Alert.alert(t('error'),errorMessage(error))}
    finally{setLoading(false)}
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
  const totalQuantity=useMemo(()=>lines.reduce((sum,line)=>sum+line.quantity,0),[lines]);
  const supplier=suppliers.find(item=>item.id===supplierId)??null;
  const warehouse=warehouses.find(item=>item.id===warehouseId)??null;
  const selectedAccount=accounts.find(account=>account.id===paymentMethod)??null;
  const priceLine=lines.find(line=>line.product.id===priceLineId)??null;

  const tenderValue=settlement==='credit'?0:Number(tender.trim()===''?total:tender);
  const normalizedTender=Number.isFinite(tenderValue)&&tenderValue>=0?tenderValue:0;
  const underpaid=settlement==='payNow'&&normalizedTender<total;
  const paid=settlement==='credit'?0:total;
  const due=settlement==='credit'?total:0;
  const needsSupplier=settlement==='credit';

  const addProduct=(product:Product)=>setLines(current=>{
    const existing=current.find(line=>line.product.id===product.id);
    if(existing)return current.map(line=>line.product.id===product.id?{...line,quantity:line.quantity+1}:line);
    const cost=Number(product.lastPurchaseCost??product.pieceCost??0);
    return [{product,quantity:1,unitPrice:cost},...current];
  });

  const changeQuantity=(id:string,value:number)=>setLines(current=>value<=0
    ?current.filter(line=>line.product.id!==id)
    :current.map(line=>line.product.id===id?{...line,quantity:value}:line));

  const openQuantity=(line:PurchaseLine)=>{setQuantityLineId(line.product.id);setQuantityDraft(String(line.quantity))};
  const saveQuantity=()=>{
    if(quantityLineId){
      const value=Number(quantityDraft);
      if(Number.isFinite(value)&&value>0)changeQuantity(quantityLineId,value);
    }
    setQuantityLineId(null);
  };

  const openPrice=(line:PurchaseLine)=>{setPriceLineId(line.product.id);setPriceDraft(String(line.unitPrice))};
  const closePrice=()=>{setPriceLineId(null);setPriceDraft('0')};
  const savePrice=()=>{
    if(!priceLineId||!priceLine)return;
    const value=Number(priceDraft);
    if(!Number.isSafeInteger(value)||value<=0){
      Alert.alert(t('purchasePrice'),t('purchasePriceRequired'));
      return;
    }
    setLines(current=>current.map(line=>line.product.id===priceLineId?{...line,unitPrice:value}:line));
    closePrice();
  };

  const invalidLine=()=>lines.find(line=>!Number.isFinite(line.quantity)||line.quantity<=0||!Number.isSafeInteger(line.unitPrice)||line.unitPrice<=0);

  const startPayment=()=>{
    if(!lines.length||!warehouseId)return;
    const invalid=invalidLine();
    if(invalid){
      Alert.alert(t('error'),format(t('purchaseInvalidLine'),{product:invalid.product.name}));
      return;
    }
    if(settlement==='payNow')setTender(String(total));
    setStage('payment');
  };

  const changeSettlement=(next:SettlementType)=>{
    setSettlement(next);
    if(next==='credit'){
      setTender('0');
      return;
    }
    setTender(String(total));
    if(!paymentMethod&&accounts[0])setPaymentMethod(accounts[0].id);
  };

  const complete=async()=>{
    if(!lines.length||!warehouseId||busy)return;
    const invalid=invalidLine();
    if(invalid){
      setStage('invoice');
      Alert.alert(t('error'),format(t('purchaseInvalidLine'),{product:invalid.product.name}));
      return;
    }
    if(settlement==='payNow'&&!paymentMethod){
      Alert.alert(t('paymentMethod'),t('purchasePaymentMethodRequired'));
      return;
    }
    if(settlement==='payNow'&&(!Number.isFinite(tenderValue)||tenderValue<0)){
      Alert.alert(t('error'),t('posInvalidTender'));
      return;
    }
    if(underpaid){
      Alert.alert(t('error'),t('purchasePartialPayment'));
      return;
    }
    if(needsSupplier&&!supplierId){
      Alert.alert(t('supplier'),t('purchaseSupplierRequired'));
      return;
    }

    setBusy(true);
    const completedTotal=total;
    const completedPaid=paid;
    const completedDue=due;
    const completedAt=new Date().toISOString();
    const completedSupplierName=supplier?.name??null;
    const completedPaymentName=selectedAccount?.name??null;
    const completedSettlement=settlement;
    const method=settlement==='credit'?'note':paymentMethod;

    try{
      const documentId=await postPurchase(db,{
        warehouseId,
        partyId:supplierId,
        paymentMethod:method,
        cashAmount:completedPaid,
        lines:lines.map(line=>({productId:line.product.id,quantity:line.quantity,unitPrice:line.unitPrice})),
      });
      let document:DocumentRecord|null=null;
      try{document=await getDocumentById(db,documentId)}catch{}

      setLines([]);
      setSupplierId(null);
      setTender('');
      setSearch('');
      setProductPicker(false);
      closePrice();
      setQuantityLineId(null);
      setSuccess({
        documentId,
        document,
        total:document?.total??completedTotal,
        paid:document?.paidTotal??completedPaid,
        due:document?.dueTotal??completedDue,
        occurredAt:document?.occurredAt??completedAt,
        supplierName:completedSupplierName,
        paymentName:completedSettlement==='payNow'?completedPaymentName:null,
        settlement:completedSettlement,
      });
      setStage('success');
      setResults(await listProducts(db,'',undefined,false,24,0,categoryId));
    }catch(error){Alert.alert(t('error'),errorMessage(error))}
    finally{setBusy(false)}
  };

  const startNewPurchase=()=>{
    setSuccess(null);
    setSupplierId(null);
    setTender('');
    setSearch('');
    setProductPicker(false);
    closePrice();
    setQuantityLineId(null);
    setSettlement(accounts.length?'payNow':'credit');
    if(!paymentMethod&&accounts[0])setPaymentMethod(accounts[0].id);
    setStage('invoice');
  };

  const back=()=>{
    if(stage==='invoice'){router.back();return}
    if(stage==='payment'){setStage('invoice');return}
    startNewPurchase();
  };

  if(!allowed)return <Screen><EmptyState title={t('error')}/></Screen>;
  if(loading)return <Screen><EmptyState title={t('loading')}/></Screen>;
  if(stage==='success'&&success)return <Screen padded={false}><PurchaseSuccessView
    success={success}
    onNew={startNewPurchase}
    onView={auth.has('records.view')?()=>{setSuccess(null);router.push({pathname:'/sales/records',params:{documentId:success.documentId}})}:undefined}
  /></Screen>;

  return <Screen padded={false}>
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS==='ios'?'padding':undefined}>
      {stage==='invoice'?<PurchaseInvoiceStage
        warehouse={warehouse}
        warehouses={warehouses}
        warehouseId={warehouseId}
        supplier={supplier}
        lines={lines}
        total={total}
        totalQuantity={totalQuantity}
        onBack={back}
        onChooseSupplier={()=>setSupplierPicker(true)}
        onChooseWarehouse={()=>setWarehousePicker(true)}
        onAddProduct={()=>setProductPicker(true)}
        onChangeQuantity={changeQuantity}
        onEditQuantity={openQuantity}
        onEditPrice={openPrice}
      />:null}

      {stage==='payment'?<PurchasePaymentStage
        total={total}
        accounts={accounts}
        settlement={settlement}
        setSettlement={changeSettlement}
        paymentMethod={paymentMethod}
        setPaymentMethod={setPaymentMethod}
        tender={tender}
        setTender={setTender}
        paid={paid}
        due={due}
        underpaid={underpaid}
        needsSupplier={needsSupplier}
        supplier={supplier}
        onChooseSupplier={()=>setSupplierPicker(true)}
        onBack={back}
      />:null}

      {stage==='invoice'?<BottomActionBar
        label={t('posContinuePayment')}
        total={total}
        secondary={format(t('posProductsCount'),{count:lines.length})}
        onPress={startPayment}
        disabled={!lines.length}
      />:null}

      {stage==='payment'?<BottomActionBar
        label={t('completePurchase')}
        total={total}
        secondary={settlement==='credit'?t('purchasePaymentStatusCredit'):t('purchasePaymentStatusPaid')}
        onPress={()=>void complete()}
        disabled={underpaid||(needsSupplier&&!supplier)||(settlement==='payNow'&&!paymentMethod)||!lines.length}
        loading={busy}
      />:null}
    </KeyboardAvoidingView>

    <Sheet visible={productPicker} title={t('purchaseProductPickerTitle')} onClose={()=>setProductPicker(false)} footer={<Button title={t('posDone')} onPress={()=>setProductPicker(false)}/>}>
      <View style={styles.pickerControls}>
        <View style={[styles.pickerSearchRow,{flexDirection:isRTL?'row-reverse':'row'}]}>
          <View style={styles.flex}><SearchField value={search} onChangeText={setSearch} returnKeyType="search" autoCapitalize="none" placeholder={t('purchaseSearchPlaceholder')}/></View>
          {searching?<ActivityIndicator size="small" color={colors.primary}/>:null}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.chips,{flexDirection:isRTL?'row-reverse':'row'}]}>
          <Chip label={t('purchaseAllCategories')} active={!categoryId} onPress={()=>setCategoryId('')}/>
          {categories.map(category=><Chip key={category.id} label={category.name} active={categoryId===category.id} onPress={()=>setCategoryId(category.id)}/>)}
        </ScrollView>
      </View>
      <GroupedList>
        {results.length?results.map((product,index)=><PurchaseProductRow
          key={product.id}
          product={product}
          warehouseId={warehouseId}
          last={index===results.length-1}
          onAdd={()=>addProduct(product)}
        />):<EmptyState title={searching?t('loading'):t('noResults')}/>}
      </GroupedList>
    </Sheet>

    <Sheet visible={warehousePicker} title={t('warehouse')} onClose={()=>setWarehousePicker(false)}>
      <View style={styles.warehouseOptions}>
        {warehouses.map(item=><Button
          key={item.id}
          title={item.name}
          variant={warehouseId===item.id?'primary':'secondary'}
          disabled={lines.length>0&&warehouseId!==item.id}
          onPress={()=>{setWarehouseId(item.id);setWarehousePicker(false)}}
        />)}
      </View>
    </Sheet>

    <PartyPicker visible={supplierPicker} parties={suppliers} directLabel={t('purchaseDirect')} onClose={()=>setSupplierPicker(false)} onSelect={party=>setSupplierId(party?.id??null)}/>

    <Sheet visible={Boolean(quantityLineId)} title={t('posEditQuantity')} onClose={()=>setQuantityLineId(null)} footer={<Button title={t('save')} onPress={saveQuantity}/>}>
      <FormField label={t('quantity')} value={quantityDraft} onChangeText={setQuantityDraft} keyboardType="decimal-pad" autoFocus selectTextOnFocus/>
    </Sheet>

    <Sheet visible={Boolean(priceLineId)} title={t('purchasePrice')} onClose={closePrice} footer={<Button title={t('save')} onPress={savePrice}/>}>
      {priceLine?<View style={styles.priceEditor}>
        <AppText variant="subheading">{priceLine.product.name}</AppText>
        <Surface tone="muted" style={styles.currentCost}>
          <View style={[styles.costRow,{flexDirection:isRTL?'row-reverse':'row'}]}>
            <AppText variant="caption" muted>{t('purchaseLastCost')}</AppText>
            <Money value={Number(priceLine.product.lastPurchaseCost??priceLine.product.pieceCost??0)}/>
          </View>
        </Surface>
        <FormField label={t('purchasePrice')} value={priceDraft} onChangeText={setPriceDraft} keyboardType="number-pad" autoFocus selectTextOnFocus trailing={<AppText variant="caption" muted>MRU</AppText>}/>
        <AppText variant="caption" muted>{t('purchasePriceRequired')}</AppText>
      </View>:null}
    </Sheet>
  </Screen>;
}

function PurchaseInvoiceStage({
  warehouse,warehouses,warehouseId,supplier,lines,total,totalQuantity,onBack,onChooseSupplier,onChooseWarehouse,onAddProduct,onChangeQuantity,onEditQuantity,onEditPrice,
}:{
  warehouse:Warehouse|null;
  warehouses:Warehouse[];
  warehouseId:string;
  supplier:Party|null;
  lines:PurchaseLine[];
  total:number;
  totalQuantity:number;
  onBack:()=>void;
  onChooseSupplier:()=>void;
  onChooseWarehouse:()=>void;
  onAddProduct:()=>void;
  onChangeQuantity:(id:string,value:number)=>void;
  onEditQuantity:(line:PurchaseLine)=>void;
  onEditPrice:(line:PurchaseLine)=>void;
}){
  const {t,number,isRTL}=useI18n();
  return <View style={styles.stage}>
    <View style={styles.headerPad}><PageHeader title={t('purchaseNewTitle')} subtitle={warehouse?.name} onBack={onBack}/></View>
    <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content,styles.contentWithBar]}>
      <GroupedList>
        <SelectRow
          label={t('supplier')}
          value={supplier?.name??t('purchaseDirect')}
          hint={supplier?.phone??t('purchaseSupplierOptional')}
          leading={<SupplierTile/>}
          onPress={onChooseSupplier}
        />
        {warehouses.length>1?<SelectRow
          label={t('warehouse')}
          value={warehouse?.name??t('warehouse')}
          disabled={lines.length>0}
          leading={<WarehouseTile/>}
          onPress={onChooseWarehouse}
        />:null}
      </GroupedList>

      <Pressable accessibilityRole="button" accessibilityLabel={t('purchaseAddProduct')} onPress={onAddProduct} style={({pressed})=>[styles.productSearchTrigger,{flexDirection:isRTL?'row-reverse':'row'},pressed&&styles.pressed]}>
        <SearchGlyph/>
        <AppText variant="body" muted style={styles.productSearchText}>{t('purchaseSearchPlaceholder')}</AppText>
        <View style={styles.productSearchAdd}><AppText variant="heading" style={styles.productSearchPlus}>+</AppText></View>
      </Pressable>

      <FramedSection
        title={`${t('purchaseInvoiceLines')} (${number(lines.length)})`}
        padded={false}
      >
        {lines.length?lines.map((line,index)=><PurchaseInvoiceLine
          key={line.product.id}
          line={line}
          warehouseId={warehouseId}
          last={index===lines.length-1}
          onDecrease={()=>onChangeQuantity(line.product.id,line.quantity-1)}
          onIncrease={()=>onChangeQuantity(line.product.id,line.quantity+1)}
          onEditQuantity={()=>onEditQuantity(line)}
          onEditPrice={()=>onEditPrice(line)}
          onRemove={()=>onChangeQuantity(line.product.id,0)}
        />):<EmptyState
          title={t('posNoLinesTitle')}
          description={t('posNoLinesDescription')}
          action={<Button compact title={t('purchaseAddProduct')} variant="secondary" onPress={onAddProduct}/>}
        />}
      </FramedSection>

      {lines.length?<View style={styles.summaryBlock}>
        <AppText variant="subheading">{t('purchaseInvoiceSummary')}</AppText>
        <FinancialSummary items={[
          {label:t('posItemsCount'),value:lines.length,format:'number'},
          {label:t('posTotalQuantity'),value:totalQuantity,format:'number'},
          {label:t('posInvoiceTotal'),value:total,emphasize:true},
        ]}/>
      </View>:null}
    </ScrollView>
  </View>;
}

function PurchasePaymentStage({
  total,accounts,settlement,setSettlement,paymentMethod,setPaymentMethod,tender,setTender,paid,due,underpaid,needsSupplier,supplier,onChooseSupplier,onBack,
}:{
  total:number;
  accounts:PaymentAccount[];
  settlement:SettlementType;
  setSettlement:(value:SettlementType)=>void;
  paymentMethod:string;
  setPaymentMethod:(value:string)=>void;
  tender:string;
  setTender:(value:string)=>void;
  paid:number;
  due:number;
  underpaid:boolean;
  needsSupplier:boolean;
  supplier:Party|null;
  onChooseSupplier:()=>void;
  onBack:()=>void;
}){
  const {t,isRTL}=useI18n();
  return <View style={styles.stage}>
    <View style={styles.headerPad}><PageHeader title={t('purchasePaymentTitle')} onBack={onBack}/></View>
    <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content,styles.contentWithBar]}>
      <FramedSection title={t('supplier')} padded={false}>
        <SelectRow
          label={t('supplier')}
          value={supplier?.name??(needsSupplier?t('supplier'):t('purchaseDirect'))}
          hint={supplier?.phone??(needsSupplier?t('purchaseSupplierRequired'):t('purchaseSupplierOptional'))}
          leading={<SupplierTile warning={needsSupplier&&!supplier}/>}
          onPress={onChooseSupplier}
        />
      </FramedSection>

      <FramedSection title={t('posSettlementType')} subtitle={settlement==='credit'?t('purchaseCreditHint'):t('purchasePayNowHint')}>
        <SegmentedControl
          value={settlement}
          options={[{value:'payNow',label:t('posPayNow')},{value:'credit',label:t('onCredit')}]}
          onChange={setSettlement}
        />
      </FramedSection>

      {settlement==='payNow'?<FramedSection title={t('posPaymentAccounts')}>
        {accounts.length?<View style={[styles.paymentMethods,{flexDirection:isRTL?'row-reverse':'row'}]}>
          {accounts.map(account=><PaymentMethodCard
            key={account.id}
            label={account.name}
            selected={paymentMethod===account.id}
            onPress={()=>setPaymentMethod(account.id)}
            icon={<PaymentGlyph selected={paymentMethod===account.id}/>}
            style={styles.paymentMethodCard}
          />)}
        </View>:<Surface tone="warning"><AppText variant="caption">{t('posNoPaymentAccounts')}</AppText></Surface>}
      </FramedSection>:null}

      {settlement==='payNow'?<FramedSection title={t('purchasePaidAmount')}>
        <FormField
          label={t('purchasePaidAmount')}
          value={tender}
          onChangeText={setTender}
          keyboardType="number-pad"
          selectTextOnFocus
          placeholder="0"
          trailing={<AppText variant="subheading" muted>MRU</AppText>}
        />
      </FramedSection>:null}

      <View style={styles.summaryBlock}>
        <AppText variant="subheading">{t('purchasePaymentSummary')}</AppText>
        <FinancialSummary items={settlement==='credit'?[
          {label:t('total'),value:total},
          {label:t('due'),value:due,tone:'negative',emphasize:true},
        ]:[
          {label:t('total'),value:total},
          {label:t('paid'),value:paid,tone:'positive',emphasize:true},
        ]}/>
      </View>

      {underpaid?<AlertCard title={t('purchasePartialPayment')} tone="warning"/>:null}
      {needsSupplier&&!supplier?<AlertCard title={t('purchaseSupplierRequired')} tone="warning"/>:null}
    </ScrollView>
  </View>;
}

function PurchaseProductRow({product,warehouseId,last,onAdd}:{product:Product;warehouseId:string;last:boolean;onAdd:()=>void}){
  const {t,money,number,isRTL}=useI18n();
  const currentStock=Number(product.stocks?.[warehouseId]??0);
  const lastCost=Number(product.lastPurchaseCost??product.pieceCost??0);
  const meta=[product.categoryName,product.sku?'#'+product.sku:null,product.barcode].filter(Boolean).join(' • ');
  return <View style={[styles.productRow,{flexDirection:isRTL?'row-reverse':'row'},last&&styles.lastRow]}>
    <View style={styles.productCopy}>
      <AppText variant="subheading" numberOfLines={2}>{product.name}</AppText>
      {meta?<AppText variant="caption" muted numberOfLines={1}>{meta}</AppText>:null}
      <AppText variant="caption" muted>{format(t('purchaseCurrentStock'),{count:number(currentStock)})}</AppText>
    </View>
    <View style={styles.productEnd}>
      <AppText variant="caption" muted>{t('purchaseLastCost')}</AppText>
      <AppText variant="subheading">{money(lastCost)}</AppText>
      <Pressable accessibilityRole="button" accessibilityLabel={t('add')} hitSlop={4} onPress={onAdd} style={({pressed})=>[styles.addButton,pressed&&styles.pressed]}>
        <AppText variant="heading" style={styles.plusText}>+</AppText>
      </Pressable>
    </View>
  </View>;
}

function PurchaseInvoiceLine({line,warehouseId,last,onDecrease,onIncrease,onEditQuantity,onEditPrice,onRemove}:{line:PurchaseLine;warehouseId:string;last:boolean;onDecrease:()=>void;onIncrease:()=>void;onEditQuantity:()=>void;onEditPrice:()=>void;onRemove:()=>void}){
  const {t,money,number}=useI18n();
  const currentStock=Number(line.product.stocks?.[warehouseId]??0);
  const meta=[format(t('purchaseCurrentStock'),{count:number(currentStock)}),line.product.categoryName,line.product.sku?'#'+line.product.sku:null].filter(Boolean).join(' • ');
  return <InvoiceLineView
    productName={line.product.name}
    context={meta}
    status={line.unitPrice<=0?<Badge label={t('purchasePrice')} tone="warning"/>:undefined}
    quantityLabel={t('quantity')}
    quantityControl={<QuantityStepper compact value={line.quantity} onDecrease={onDecrease} onIncrease={onIncrease} onEdit={onEditQuantity}/>}
    unitPriceLabel={t('purchasePrice')}
    unitPrice={<Pressable accessibilityRole="button" onPress={onEditPrice} style={({pressed})=>[styles.invoicePrice,line.unitPrice<=0&&styles.priceMissing,pressed&&styles.pressed]}><AppText variant="subheading">{money(line.unitPrice)}</AppText></Pressable>}
    lineTotalLabel={t('total')}
    lineTotal={<Money value={Math.round(line.quantity*line.unitPrice)}/>}
    actions={<Pressable accessibilityRole="button" accessibilityLabel={t('delete')} hitSlop={4} onPress={onRemove} style={({pressed})=>[styles.deleteButton,pressed&&styles.deletePressed]}><TrashGlyph/></Pressable>}
    last={last}
  />;
}

function PurchaseSuccessView({success,onNew,onView}:{success:PurchaseSuccess;onNew:()=>void;onView?:()=>void}){
  const {t,date,isRTL}=useI18n();
  const documentNumber=success.document?.number;
  const summaryItems=[
    {label:t('total'),value:success.total},
    {label:t('paid'),value:success.paid,tone:success.paid>0?'positive' as const:'normal' as const,emphasize:success.due===0},
    ...(success.due>0?[{label:t('due'),value:success.due,tone:'negative' as const,emphasize:true}]:[]),
  ];

  return <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.successScreen}>
    <View style={styles.successHero}>
      <View style={styles.successMark}><CheckGlyph/></View>
      <AppText variant="title" style={styles.successTitle}>{t('purchaseSuccessTitle')}</AppText>
      <AppText variant="body" muted style={styles.successDescription}>{t('purchaseSuccessDescription')}</AppText>
      <Badge label={success.settlement==='credit'?t('purchasePaymentStatusCredit'):t('purchasePaymentStatusPaid')} tone={success.settlement==='credit'?'warning':'positive'}/>
    </View>

    <FramedSection title={documentNumber?t('posInvoiceNumber'):undefined}>
      {documentNumber?<View style={[styles.documentNumberRow,{flexDirection:isRTL?'row-reverse':'row'}]}><AppText variant="heading">{documentNumber}</AppText><View style={styles.documentGlyph}><ReceiptGlyph/></View></View>:null}
      <View style={styles.successDetails}>
        <SuccessDetailRow label={t('posSaleDate')} value={date(success.occurredAt)}/>
        {success.supplierName?<SuccessDetailRow label={t('supplier')} value={success.supplierName}/>:null}
        {success.paymentName?<SuccessDetailRow label={t('paymentMethod')} value={success.paymentName}/>:null}
      </View>
    </FramedSection>

    <FinancialSummary items={summaryItems}/>

    <View style={[styles.successActions,{flexDirection:isRTL?'row-reverse':'row'}]}>
      {onView?<View style={styles.actionFlex}><Button title={t('posViewInvoice')} variant="secondary" onPress={onView}/></View>:null}
      <View style={styles.actionFlex}><Button title={t('purchaseNewAction')} onPress={onNew}/></View>
    </View>
  </ScrollView>;
}

function SuccessDetailRow({label,value}:{label:string;value:string}){
  const {isRTL}=useI18n();
  return <View style={[styles.successDetailRow,{flexDirection:isRTL?'row-reverse':'row'}]}>
    <AppText variant="caption" muted>{label}</AppText>
    <AppText variant="subheading" numberOfLines={1} style={styles.successDetailValue}>{value}</AppText>
  </View>;
}

function SearchGlyph(){
  return <View style={styles.searchGlyph}><View style={styles.searchCircle}/><View style={styles.searchHandle}/></View>;
}

function SupplierTile({warning=false}:{warning?:boolean}){
  return <View style={[styles.partyTile,warning&&styles.partyTileWarning]}><SupplierGlyph warning={warning}/></View>;
}

function WarehouseTile(){
  return <View style={styles.warehouseTile}><WarehouseGlyph/></View>;
}

function SupplierGlyph({warning=false}:{warning?:boolean}){
  const color=warning?colors.warning:colors.primary;
  return <View style={styles.supplierGlyph}><View style={[styles.supplierBox,{borderColor:color}]}/><View style={[styles.supplierLine,{backgroundColor:color}]}/><View style={[styles.supplierWheelOne,{borderColor:color}]}/><View style={[styles.supplierWheelTwo,{borderColor:color}]}/></View>;
}

function WarehouseGlyph(){
  return <View style={styles.warehouseGlyph}><View style={styles.warehouseRoof}/><View style={styles.warehouseBody}/><View style={styles.warehouseDoor}/></View>;
}

function PaymentGlyph({selected}:{selected:boolean}){
  const color=selected?colors.primary:colors.textMuted;
  return <View style={styles.paymentGlyph}><View style={[styles.paymentCard,{borderColor:color}]}/><View style={[styles.paymentLine,{backgroundColor:color}]}/><View style={[styles.paymentDot,{backgroundColor:color}]}/></View>;
}

function ReceiptGlyph(){
  return <View style={styles.receiptGlyph}><View style={styles.receiptPage}/><View style={styles.receiptLine}/><View style={styles.receiptLineShort}/></View>;
}

function TrashGlyph(){
  return <View style={styles.trashGlyph}><View style={styles.trashLid}/><View style={styles.trashCan}/><View style={styles.trashLineOne}/><View style={styles.trashLineTwo}/></View>;
}

function CheckGlyph(){
  return <View style={styles.checkGlyph}><View style={styles.checkShort}/><View style={styles.checkLong}/></View>;
}

const styles=StyleSheet.create({
  root:{flex:1,backgroundColor:colors.background},
  stage:{flex:1},
  headerPad:{paddingHorizontal:spacing.md},
  content:{paddingHorizontal:spacing.md,paddingTop:spacing.xs,gap:spacing.sm,paddingBottom:spacing.lg},
  contentWithBar:{paddingBottom:112},
  flex:{flex:1,minWidth:0},
  summaryBlock:{gap:spacing.xs},
  productSearchTrigger:{minHeight:48,alignItems:'center',gap:spacing.sm,paddingHorizontal:spacing.sm,borderRadius:radius.md,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.borderStrong},
  productSearchText:{flex:1,minWidth:0},
  productSearchAdd:{width:34,height:34,borderRadius:radius.sm,alignItems:'center',justifyContent:'center',backgroundColor:colors.primarySoft},
  productSearchPlus:{color:colors.primary,lineHeight:24},
  searchGlyph:{width:20,height:20,position:'relative',flexShrink:0},
  searchCircle:{position:'absolute',left:2,top:2,width:12,height:12,borderRadius:6,borderWidth:2,borderColor:colors.textMuted},
  searchHandle:{position:'absolute',right:1,bottom:3,width:7,height:2,borderRadius:1,backgroundColor:colors.textMuted,transform:[{rotate:'45deg'}]},
  pickerControls:{gap:spacing.sm},
  pickerSearchRow:{alignItems:'center',gap:spacing.sm},
  chips:{gap:spacing.xs,paddingVertical:2},
  warehouseOptions:{gap:spacing.sm},
  productRow:{minHeight:64,alignItems:'center',gap:spacing.sm,paddingHorizontal:spacing.sm,paddingVertical:spacing.xs,borderBottomWidth:1,borderBottomColor:colors.border},
  productCopy:{flex:1,minWidth:0,gap:2},
  productEnd:{minWidth:96,alignItems:'flex-end',gap:2},
  addButton:{width:38,height:38,borderRadius:radius.md,backgroundColor:colors.primarySoft,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:colors.primarySoft},
  plusText:{color:colors.primary,lineHeight:24},
  lastRow:{borderBottomWidth:0},
  pressed:{opacity:.72,transform:[{scale:.99}]},
  invoicePrice:{minHeight:34,alignItems:'center',justifyContent:'center',paddingHorizontal:2,borderRadius:radius.sm},
  priceMissing:{backgroundColor:colors.warningSoft,borderWidth:1,borderColor:colors.warning,paddingHorizontal:spacing.xs},
  deleteButton:{width:touch.min,height:touch.min,borderRadius:radius.sm,alignItems:'center',justifyContent:'center'},
  deletePressed:{backgroundColor:colors.negativeSoft},
  paymentMethods:{flexWrap:'wrap',gap:spacing.xs},
  paymentMethodCard:{width:'31.4%',flexGrow:0,flexBasis:'31.4%',minWidth:96},
  priceEditor:{gap:spacing.sm},
  currentCost:{gap:spacing.xs},
  costRow:{alignItems:'center',justifyContent:'space-between',gap:spacing.md},
  partyTile:{width:38,height:38,borderRadius:radius.md,alignItems:'center',justifyContent:'center',backgroundColor:colors.primarySoft},
  partyTileWarning:{backgroundColor:colors.warningSoft},
  warehouseTile:{width:38,height:38,borderRadius:radius.md,alignItems:'center',justifyContent:'center',backgroundColor:colors.surfaceStrong},
  successScreen:{flexGrow:1,padding:spacing.md,paddingTop:spacing.lg,paddingBottom:spacing.xl,gap:spacing.md,backgroundColor:colors.background},
  successHero:{alignItems:'center',gap:spacing.sm,paddingVertical:spacing.md},
  successMark:{width:72,height:72,borderRadius:36,alignItems:'center',justifyContent:'center',backgroundColor:colors.positive},
  successTitle:{textAlign:'center'},
  successDescription:{textAlign:'center',maxWidth:330,lineHeight:20},
  documentNumberRow:{alignItems:'center',justifyContent:'space-between',gap:spacing.sm},
  documentGlyph:{width:40,height:40,borderRadius:radius.md,alignItems:'center',justifyContent:'center',backgroundColor:colors.primarySoft},
  successDetails:{gap:0,borderTopWidth:1,borderTopColor:colors.border,marginTop:spacing.xs},
  successDetailRow:{minHeight:42,alignItems:'center',justifyContent:'space-between',gap:spacing.sm,borderBottomWidth:1,borderBottomColor:colors.border},
  successDetailValue:{flex:1,minWidth:0},
  successActions:{marginTop:'auto',gap:spacing.sm},
  actionFlex:{flex:1,minWidth:0},
  supplierGlyph:{width:27,height:22,position:'relative'},
  supplierBox:{position:'absolute',left:1,top:3,width:17,height:13,borderWidth:2,borderRadius:3},
  supplierLine:{position:'absolute',right:1,top:8,width:8,height:2},
  supplierWheelOne:{position:'absolute',left:5,bottom:0,width:6,height:6,borderRadius:3,borderWidth:2},
  supplierWheelTwo:{position:'absolute',right:2,bottom:0,width:6,height:6,borderRadius:3,borderWidth:2},
  warehouseGlyph:{width:25,height:24,position:'relative'},
  warehouseRoof:{position:'absolute',left:2,right:2,top:2,height:8,borderLeftWidth:2,borderRightWidth:2,borderTopWidth:2,borderColor:colors.textMuted,borderTopLeftRadius:3,borderTopRightRadius:3},
  warehouseBody:{position:'absolute',left:4,right:4,top:9,bottom:2,borderWidth:2,borderColor:colors.textMuted,borderRadius:2},
  warehouseDoor:{position:'absolute',left:9,bottom:3,width:7,height:8,borderWidth:1.5,borderColor:colors.textMuted,borderBottomWidth:0},
  paymentGlyph:{width:27,height:22,position:'relative'},
  paymentCard:{position:'absolute',left:1,top:2,width:25,height:18,borderWidth:2,borderRadius:4},
  paymentLine:{position:'absolute',left:3,right:3,top:7,height:2},
  paymentDot:{position:'absolute',right:5,bottom:5,width:4,height:4,borderRadius:2},
  receiptGlyph:{width:24,height:26,alignItems:'center',justifyContent:'center'},
  receiptPage:{width:19,height:23,borderWidth:2,borderColor:colors.primary,borderRadius:3},
  receiptLine:{position:'absolute',top:8,width:11,height:2,backgroundColor:colors.primary},
  receiptLineShort:{position:'absolute',top:13,width:7,height:2,backgroundColor:colors.primary},
  trashGlyph:{width:22,height:24,position:'relative'},
  trashLid:{position:'absolute',top:3,left:3,width:16,height:2,borderRadius:2,backgroundColor:colors.negative},
  trashCan:{position:'absolute',top:7,left:5,width:12,height:14,borderWidth:2,borderColor:colors.negative,borderRadius:3},
  trashLineOne:{position:'absolute',top:10,left:9,width:2,height:8,backgroundColor:colors.negative},
  trashLineTwo:{position:'absolute',top:10,right:7,width:2,height:8,backgroundColor:colors.negative},
  checkGlyph:{width:34,height:30,position:'relative',transform:[{rotate:'-8deg'}]},
  checkShort:{position:'absolute',left:3,top:15,width:13,height:5,borderRadius:3,backgroundColor:colors.onPrimary,transform:[{rotate:'45deg'}]},
  checkLong:{position:'absolute',left:11,top:11,width:22,height:5,borderRadius:3,backgroundColor:colors.onPrimary,transform:[{rotate:'-45deg'}]},
});
