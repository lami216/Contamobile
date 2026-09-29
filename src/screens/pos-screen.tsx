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
import { sellingPrice, validateSaleDraft } from '@/domain/accounting';
import { getDocumentById } from '@/db/document-queries';
import { listParties, listPaymentAccounts, listProductCategories, listProducts, listWarehouses } from '@/db/queries';
import { postSale } from '@/services/accounting-service';
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
import { CheckGlyph, PaymentGlyph, ReceiptGlyph, TrashGlyph } from '@/components/accounting-glyphs';
import { useAuth } from '@/auth/provider';
import { colors, radius, spacing, touch } from '@/theme';

type SaleLine={product:Product;quantity:number;unitPrice:number;stock:number;priceOverridden:boolean};
type PosStage='invoice'|'payment'|'success';
type SettlementType='payNow'|'credit';
type SuccessState={
  documentId:string;
  document:DocumentRecord|null;
  total:number;
  paid:number;
  due:number;
  change:number;
  occurredAt:string;
  partyName:string|null;
  paymentName:string|null;
  settlement:SettlementType;
  warnings:Array<{name:string;remaining:number}>;
};

function format(template:string,values:Record<string,string|number>){
  return Object.entries(values).reduce((output,[key,value])=>output.replaceAll('{'+key+'}',String(value)),template);
}

export function PosScreen(){
  const db=useSQLiteContext(),{t,number,money,errorMessage,isRTL}=useI18n(),auth=useAuth();
  const allowed=auth.has('pos.create');
  const [warehouses,setWarehouses]=useState<Warehouse[]>([]),[warehouseId,setWarehouseId]=useState('');
  const [accounts,setAccounts]=useState<PaymentAccount[]>([]),[parties,setParties]=useState<Party[]>([]),[categories,setCategories]=useState<ProductCategory[]>([]),[categoryId,setCategoryId]=useState('');
  const [results,setResults]=useState<Product[]>([]),[search,setSearch]=useState('');
  const [lines,setLines]=useState<SaleLine[]>([]),[loading,setLoading]=useState(true),[searching,setSearching]=useState(false);
  const [stage,setStage]=useState<PosStage>('invoice'),[productPicker,setProductPicker]=useState(false);
  const [settlement,setSettlement]=useState<SettlementType>('payNow'),[paymentMethod,setPaymentMethod]=useState(''),[tender,setTender]=useState(''),[partyId,setPartyId]=useState<string|null>(null),[partyPicker,setPartyPicker]=useState(false),[busy,setBusy]=useState(false);
  const [quantityLineId,setQuantityLineId]=useState<string|null>(null),[quantityDraft,setQuantityDraft]=useState('1');
  const [priceLineId,setPriceLineId]=useState<string|null>(null),[priceDraft,setPriceDraft]=useState('');
  const [success,setSuccess]=useState<SuccessState|null>(null);

  const loadBase=useCallback(async()=>{
    if(!allowed)return;
    setLoading(true);
    try{
      const [w,a,p,cats]=await Promise.all([listWarehouses(db),listPaymentAccounts(db),listParties(db,'customer','',300),listProductCategories(db)]);
      const active=a.filter(account=>account.isActive&&!account.isArchived);
      const selected=w.find(warehouse=>warehouse.isSalesDefault)?.id??w[0]?.id??'';
      setWarehouses(w);
      setAccounts(active);
      setParties(p);
      setCategories(cats);
      setWarehouseId(selected);
      setCategoryId(current=>current&&cats.some(category=>category.id===current)?current:'');
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
    if(!allowed||!warehouseId)return;
    let cancelled=false;
    const timer=setTimeout(()=>{
      setSearching(true);
      void listProducts(db,search,warehouseId,false,search.trim()?40:18,0,categoryId)
        .then(items=>{if(!cancelled)setResults(items)})
        .catch(error=>{if(!cancelled)Alert.alert(t('error'),errorMessage(error))})
        .finally(()=>{if(!cancelled)setSearching(false)});
    },search.trim()?140:0);
    return()=>{cancelled=true;clearTimeout(timer)};
  },[allowed,categoryId,db,errorMessage,search,t,warehouseId]);

  const total=useMemo(()=>lines.reduce((sum,line)=>sum+Math.round(line.quantity*line.unitPrice),0),[lines]);
  const totalQuantity=useMemo(()=>lines.reduce((sum,line)=>sum+line.quantity,0),[lines]);
  const selectedParty=parties.find(party=>party.id===partyId)??null;
  const selectedWarehouse=warehouses.find(warehouse=>warehouse.id===warehouseId)??null;
  const selectedAccount=accounts.find(account=>account.id===paymentMethod)??null;
  const priceLine=lines.find(line=>line.product.id===priceLineId)??null;

  const tenderValue=settlement==='credit'?0:Number(tender.trim()===''?total:tender);
  const normalizedTender=Number.isFinite(tenderValue)&&tenderValue>=0?tenderValue:0;
  const underpaid=settlement==='payNow'&&normalizedTender<total;
  const paidValue=settlement==='credit'?0:total;
  const dueValue=settlement==='credit'?total:0;
  const changeValue=settlement==='credit'?0:Math.max(normalizedTender-total,0);
  const needsParty=settlement==='credit';

  const addProduct=(product:Product)=>{
    const stock=Number(product.stocks?.[warehouseId]??0);
    if(stock<=0)return;
    setLines(current=>{
      const existing=current.find(line=>line.product.id===product.id);
      if(existing)return current.map(line=>line.product.id===product.id?{...line,quantity:Math.min(line.quantity+1,stock)}:line);
      return [{product,quantity:Math.min(1,stock),unitPrice:sellingPrice(product,'retail'),stock,priceOverridden:false},...current];
    });
  };

  const changeQuantity=(productId:string,next:number)=>setLines(current=>{
    const line=current.find(item=>item.product.id===productId);
    if(!line)return current;
    if(next<=0)return current.filter(item=>item.product.id!==productId);
    return current.map(item=>item.product.id===productId?{...item,quantity:Math.min(next,item.stock)}:item);
  });

  const openQuantity=(line:SaleLine)=>{setQuantityLineId(line.product.id);setQuantityDraft(String(line.quantity))};
  const saveQuantity=()=>{
    if(!quantityLineId)return;
    const value=Number(quantityDraft);
    if(Number.isFinite(value)&&value>0)changeQuantity(quantityLineId,value);
    setQuantityLineId(null);
  };

  const openPrice=(line:SaleLine)=>{setPriceLineId(line.product.id);setPriceDraft(String(line.unitPrice))};
  const closePrice=()=>{setPriceLineId(null);setPriceDraft('')};
  const savePrice=()=>{
    if(!priceLineId||!priceLine)return;
    const value=Number(priceDraft);
    if(!Number.isSafeInteger(value)||value<=0){
      Alert.alert(t('error'),format(t('posInvalidSalePrice'),{product:priceLine.product.name}));
      return;
    }
    setLines(current=>current.map(line=>line.product.id===priceLineId?{...line,unitPrice:value,priceOverridden:true}:line));
    closePrice();
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

  const validationMessage=(code:string,productName='')=>{
    if(code==='expiredProduct')return format(t('posExpiredProduct'),{product:productName});
    if(code==='invalidQuantity')return format(t('posInvalidQuantity'),{product:productName});
    if(code==='invalidSalePrice')return format(t('posInvalidSalePrice'),{product:productName});
    return t('error');
  };

  const openPayment=()=>{
    if(!lines.length||!warehouseId)return;
    const check=validateSaleDraft(
      lines.map(line=>({productId:line.product.id,quantity:String(line.quantity),piecePrice:String(line.unitPrice)})),
      lines.map(line=>line.product),
      warehouseId,
    );
    if(check.errors.length){
      const error=check.errors[0];
      if(error?.code==='insufficientQuantity')Alert.alert(t('error'),format(t('posInsufficientStock'),{product:error.productName,requested:number(error.requested),available:number(error.available)}));
      else Alert.alert(t('error'),error&&'productName'in error?validationMessage(error.code,error.productName):validationMessage(error?.code??'missingProduct'));
      return;
    }
    const proceed=()=>{
      if(settlement==='payNow')setTender(String(total));
      setStage('payment');
    };
    if(check.warnings.length){
      Alert.alert(
        t('posPriceWarningTitle'),
        check.warnings.map(warning=>format(t('posBelowCostWarning'),{product:warning.productName,salePrice:money(warning.salePrice),cost:money(warning.purchaseCost)})).join('\n'),
        [{text:t('cancel'),style:'cancel'},{text:t('confirm'),onPress:proceed}],
      );
      return;
    }
    proceed();
  };

  const completeSale=async()=>{
    if(!lines.length||!warehouseId||busy)return;
    if(settlement==='payNow'&&!paymentMethod){
      Alert.alert(t('paymentMethod'),t('posPaymentMethodRequired'));
      return;
    }
    if(settlement==='payNow'&&(!Number.isFinite(tenderValue)||tenderValue<0)){
      Alert.alert(t('error'),t('posInvalidTender'));
      return;
    }
    if(underpaid){
      Alert.alert(t('error'),t('posPartialPaymentError'));
      return;
    }
    if(needsParty&&!partyId){
      Alert.alert(t('customer'),t('posCreditCustomerRequired'));
      return;
    }

    setBusy(true);
    const completedTotal=total;
    const completedPaid=paidValue;
    const completedDue=dueValue;
    const completedChange=changeValue;
    const completedLines=lines;
    const completedAt=new Date().toISOString();
    const completedPartyName=selectedParty?.name??null;
    const completedPaymentName=selectedAccount?.name??null;
    const completedSettlement=settlement;
    const method=settlement==='credit'?'note':paymentMethod;

    try{
      const documentId=await postSale(db,{
        warehouseId,
        partyId,
        paymentMethod:method,
        cashAmount:completedPaid,
        pricingMode:'retail',
        lines:completedLines.map(line=>({productId:line.product.id,quantity:line.quantity,unitPrice:line.unitPrice})),
      });
      let document:DocumentRecord|null=null;
      try{document=await getDocumentById(db,documentId)}catch{}
      const lowStock=completedLines
        .map(line=>({name:line.product.name,remaining:Math.max(0,line.stock-line.quantity)}))
        .filter(item=>item.remaining<=3);

      setLines([]);
      setPartyId(null);
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
        change:completedChange,
        occurredAt:document?.occurredAt??completedAt,
        partyName:completedPartyName,
        paymentName:completedSettlement==='payNow'?completedPaymentName:null,
        settlement:completedSettlement,
        warnings:lowStock,
      });
      setStage('success');
      const fresh=await listProducts(db,'',warehouseId,false,18,0,categoryId);
      setResults(fresh);
    }catch(error){Alert.alert(t('error'),errorMessage(error))}
    finally{setBusy(false)}
  };

  const startNewSale=()=>{
    setSuccess(null);
    setPartyId(null);
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
    startNewSale();
  };

  if(!allowed)return <Screen><EmptyState title={t('posNoCreatePermission')}/></Screen>;
  if(loading)return <Screen><EmptyState title={t('loading')}/></Screen>;

  if(stage==='success'&&success){
    return <Screen padded={false}><SaleSuccess
      success={success}
      onNewSale={startNewSale}
      onViewInvoice={auth.has('records.view')?()=>{setSuccess(null);router.push({pathname:'/sales/records',params:{documentId:success.documentId}})}:undefined}
    /></Screen>;
  }

  return <Screen padded={false}>
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS==='ios'?'padding':undefined}>
      {stage==='invoice'?<InvoiceStage
        onBack={back}
        warehouseId={warehouseId}
        selectedWarehouse={selectedWarehouse}
        selectedParty={selectedParty}
        lines={lines}
        total={total}
        totalQuantity={totalQuantity}
        onChooseParty={()=>setPartyPicker(true)}
        onAddProduct={()=>setProductPicker(true)}
        onChangeQuantity={changeQuantity}
        onEditQuantity={openQuantity}
        onEditPrice={openPrice}
      />:null}

      {stage==='payment'?<PaymentStage
        total={total}
        accounts={accounts}
        settlement={settlement}
        setSettlement={changeSettlement}
        paymentMethod={paymentMethod}
        setPaymentMethod={setPaymentMethod}
        tender={tender}
        setTender={setTender}
        normalizedTender={normalizedTender}
        changeValue={changeValue}
        dueValue={dueValue}
        needsParty={needsParty}
        selectedParty={selectedParty}
        underpaid={underpaid}
        onChooseParty={()=>setPartyPicker(true)}
        onBack={back}
      />:null}

      {stage==='invoice'?<BottomActionBar
        label={t('posContinuePayment')}
        total={total}
        secondary={format(t('posProductsCount'),{count:lines.length})}
        disabled={!lines.length}
        onPress={openPayment}
      />:null}
      {stage==='payment'?<BottomActionBar
        label={t('completeSale')}
        total={total}
        secondary={settlement==='credit'?t('posPaymentStatusCredit'):t('posPaymentStatusPaid')}
        disabled={underpaid||(needsParty&&!selectedParty)||(settlement==='payNow'&&!paymentMethod)||!lines.length}
        loading={busy}
        onPress={()=>void completeSale()}
      />:null}
    </KeyboardAvoidingView>

    <Sheet fixedHeight visible={productPicker} title={t('posProductPickerTitle')} onClose={()=>setProductPicker(false)} footer={<Button title={t('posDone')} onPress={()=>setProductPicker(false)}/>}>
      <View style={styles.pickerControls}>
        <View style={styles.pickerSearchRow}>
          <View style={styles.flex}><SearchField value={search} onChangeText={setSearch} returnKeyType="search" autoCapitalize="none" placeholder={t('posSearchPlaceholder')}/></View>
          {searching?<ActivityIndicator size="small" color={colors.primary}/>:null}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.chipStrip,{flexDirection:isRTL?'row-reverse':'row'}]}>
          <Chip label={t('posAllCategories')} active={!categoryId} onPress={()=>setCategoryId('')}/>
          {categories.map(category=><Chip key={category.id} label={category.name} active={categoryId===category.id} onPress={()=>setCategoryId(category.id)}/>)}
        </ScrollView>
      </View>
      <GroupedList>
        {results.length?results.map((product,index)=><ProductSaleRow
          key={product.id}
          product={product}
          warehouseId={warehouseId}
          added={lines.some(line=>line.product.id===product.id)}
          onAdd={()=>addProduct(product)}
          last={index===results.length-1}
        />):<EmptyState title={searching?t('loading'):t('noResults')}/>}
      </GroupedList>
    </Sheet>

    <PartyPicker visible={partyPicker} parties={parties} directLabel={t('posCashCustomer')} createLabel={t('partyNewCustomer')} onCreate={()=>{setPartyPicker(false);router.push({pathname:'/parties/customers',params:{create:'1'}})}} onClose={()=>setPartyPicker(false)} onSelect={party=>setPartyId(party?.id??null)}/>

    <Sheet visible={Boolean(quantityLineId)} title={t('posEditQuantity')} onClose={()=>setQuantityLineId(null)} footer={<Button title={t('save')} onPress={saveQuantity}/>}>
      <FormField label={t('quantity')} value={quantityDraft} onChangeText={setQuantityDraft} keyboardType="decimal-pad" autoFocus selectTextOnFocus/>
    </Sheet>

    <Sheet visible={Boolean(priceLineId)} title={t('posEditSalePrice')} onClose={closePrice} footer={<View style={[styles.sheetActions,{flexDirection:isRTL?'row-reverse':'row'}]}><View style={styles.sheetAction}><Button title={t('cancel')} variant="secondary" onPress={closePrice}/></View><View style={styles.sheetAction}><Button title={t('save')} onPress={savePrice}/></View></View>}>
      {priceLine?<View style={styles.priceEditor}>
        <AppText variant="subheading">{priceLine.product.name}</AppText>
        <Surface tone="muted" style={[styles.currentPrice,{flexDirection:isRTL?'row-reverse':'row'}]}>
          <AppText variant="caption" muted>{t('posCurrentPrice')}</AppText>
          <Money value={priceLine.unitPrice}/>
        </Surface>
        <FormField label={t('salePrice')} value={priceDraft} onChangeText={setPriceDraft} keyboardType="number-pad" autoFocus selectTextOnFocus trailing={<AppText variant="caption" muted>MRU</AppText>}/>
      </View>:null}
    </Sheet>
  </Screen>;
}

function InvoiceStage({
  onBack,selectedWarehouse,selectedParty,lines,total,totalQuantity,onChooseParty,onAddProduct,onChangeQuantity,onEditQuantity,onEditPrice,
}:{
  onBack:()=>void;
  selectedWarehouse:Warehouse|null;
  selectedParty:Party|null;
  lines:SaleLine[];
  total:number;
  totalQuantity:number;
  onChooseParty:()=>void;
  onAddProduct:()=>void;
  onChangeQuantity:(id:string,value:number)=>void;
  onEditQuantity:(line:SaleLine)=>void;
  onEditPrice:(line:SaleLine)=>void;
}){
  const {t,isRTL}=useI18n();
  return <View style={styles.stage}>
    <View style={styles.headerPad}><PageHeader title={t('posNewSaleTitle')} subtitle={selectedWarehouse?.name} onBack={onBack}/></View>
    <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={[styles.stageScroll,styles.stageScrollWithBar]}>
      <View style={[styles.invoiceContextRow,{flexDirection:isRTL?'row-reverse':'row'}]}>
        <Pressable accessibilityRole="button" onPress={onChooseParty} style={({pressed})=>[styles.contextCard,pressed&&styles.controlPressed]}>
          <AppText variant="caption" muted>{t('customer')}</AppText>
          <AppText variant="subheading" numberOfLines={1}>{selectedParty?.name??t('posCashCustomer')}</AppText>
          <AppText variant="caption" muted numberOfLines={1}>{selectedParty?.phone??t('posCustomerOptional')}</AppText>
        </Pressable>
        <View style={[styles.contextCard,styles.contextCardMuted]}>
          <AppText variant="caption" muted>{t('warehouse')}</AppText>
          <AppText variant="subheading" numberOfLines={1}>{selectedWarehouse?.name??'—'}</AppText>
          <Badge label={t('defaultWarehouse')} tone="primary"/>
        </View>
      </View>


      <FramedSection
        title={t('posInvoiceLines')}
        action={<Button compact title={t('posAddProduct')} onPress={onAddProduct}/>}
        padded={false}
      >
        {lines.length?lines.map((line,index)=><SaleInvoiceLine
          key={line.product.id}
          line={line}
          last={index===lines.length-1}
          onDecrease={()=>onChangeQuantity(line.product.id,line.quantity-1)}
          onIncrease={()=>onChangeQuantity(line.product.id,line.quantity+1)}
          onEditQuantity={()=>onEditQuantity(line)}
          onEditPrice={()=>onEditPrice(line)}
          onRemove={()=>onChangeQuantity(line.product.id,0)}
        />):<EmptyState title={t('posNoLinesTitle')} description={t('posNoLinesDescription')} action={<Button compact title={t('posAddProduct')} variant="secondary" onPress={onAddProduct}/>}/>}
      </FramedSection>

      {lines.length?<View style={styles.summaryBlock}>
        <AppText variant="subheading">{t('posInvoiceSummary')}</AppText>
        <FinancialSummary items={[
          {label:t('posItemsCount'),value:lines.length,format:'number'},
          {label:t('posTotalQuantity'),value:totalQuantity,format:'number'},
          {label:t('posInvoiceTotal'),value:total,emphasize:true},
        ]}/>
      </View>:null}
    </ScrollView>
  </View>;
}

function PaymentStage({
  total,accounts,settlement,setSettlement,paymentMethod,setPaymentMethod,tender,setTender,normalizedTender,changeValue,dueValue,needsParty,selectedParty,underpaid,onChooseParty,onBack,
}:{
  total:number;
  accounts:PaymentAccount[];
  settlement:SettlementType;
  setSettlement:(value:SettlementType)=>void;
  paymentMethod:string;
  setPaymentMethod:(method:string)=>void;
  tender:string;
  setTender:(value:string)=>void;
  normalizedTender:number;
  changeValue:number;
  dueValue:number;
  needsParty:boolean;
  selectedParty:Party|null;
  underpaid:boolean;
  onChooseParty:()=>void;
  onBack:()=>void;
}){
  const {t,isRTL}=useI18n();
  return <View style={styles.stage}>
    <View style={styles.headerPad}><PageHeader title={t('posCheckoutTitle')} onBack={onBack}/></View>
    <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={[styles.stageScroll,styles.stageScrollWithBar]}>
      <FramedSection title={t('customer')} padded={false}>
        <SelectRow
          label={t('customer')}
          value={selectedParty?.name??(needsParty?t('posChooseCustomer'):t('posCashCustomer'))}
          hint={selectedParty?.phone??(needsParty?t('posCustomerRequiredHint'):t('posCashCustomerHint'))}
          leading={<CustomerTile warning={needsParty&&!selectedParty}/>}
          onPress={onChooseParty}
        />
      </FramedSection>

      <FramedSection title={t('posSettlementType')} subtitle={settlement==='credit'?t('posCreditHint'):t('posPayNowHint')}>
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

      {settlement==='payNow'?<FramedSection title={t('posReceivedAmount')}>
        <FormField
          label={t('posReceivedAmount')}
          value={tender}
          onChangeText={setTender}
          keyboardType="number-pad"
          selectTextOnFocus
          placeholder="0"
          trailing={<AppText variant="subheading" muted>MRU</AppText>}
        />
      </FramedSection>:null}

      <View style={styles.summaryBlock}>
        <AppText variant="subheading">{t('posPaymentSummary')}</AppText>
        <FinancialSummary items={settlement==='credit'?[
          {label:t('total'),value:total},
          {label:t('due'),value:dueValue,tone:'negative',emphasize:true},
        ]:[
          {label:t('total'),value:total},
          {label:t('posReceivedAmount'),value:normalizedTender},
          {label:t('posChange'),value:changeValue,tone:changeValue>0?'positive':'normal',emphasize:true},
        ]}/>
      </View>

      {underpaid?<AlertCard title={t('posPartialPaymentError')} tone="warning"/>:null}
      {needsParty&&!selectedParty?<AlertCard title={t('posCreditCustomerRequired')} tone="warning"/>:null}
    </ScrollView>
  </View>;
}

function SaleSuccess({success,onNewSale,onViewInvoice}:{success:SuccessState;onNewSale:()=>void;onViewInvoice?:()=>void}){
  const {t,date,isRTL}=useI18n();
  const number=success.document?.number;
  const summaryItems=[
    {label:t('total'),value:success.total},
    {label:t('paid'),value:success.paid,tone:success.paid>0?'positive' as const:'normal' as const,emphasize:success.due===0&&success.change===0},
    ...(success.due>0?[{label:t('due'),value:success.due,tone:'negative' as const,emphasize:true}]:[]),
    ...(success.change>0?[{label:t('posChange'),value:success.change,tone:'positive' as const,emphasize:true}]:[]),
  ];
  return <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.successScreen}>
    <View style={styles.successHero}>
      <View style={styles.successMark}><CheckGlyph/></View>
      <AppText variant="title" style={styles.successTitle}>{t('posSaleSuccessTitle')}</AppText>
      <AppText variant="body" muted style={styles.successDescription}>{t('posSaleSuccessDescription')}</AppText>
      <Badge label={success.settlement==='credit'?t('posPaymentStatusCredit'):t('posPaymentStatusPaid')} tone={success.settlement==='credit'?'warning':'positive'}/>
    </View>

    <FramedSection title={number?t('posInvoiceNumber'):undefined}>
      {number?<View style={[styles.documentNumberRow,{flexDirection:isRTL?'row-reverse':'row'}]}><AppText variant="heading">{number}</AppText><View style={styles.documentGlyph}><ReceiptGlyph/></View></View>:null}
      <View style={styles.successDetails}>
        <SuccessDetailRow label={t('posSaleDate')} value={date(success.occurredAt)}/>
        {success.partyName?<SuccessDetailRow label={t('customer')} value={success.partyName}/>:null}
        {success.paymentName?<SuccessDetailRow label={t('paymentMethod')} value={success.paymentName}/>:null}
      </View>
    </FramedSection>

    <FinancialSummary items={summaryItems}/>

    {success.warnings.length?<AlertCard
      title={t('posLowStockAfterSale')}
      description={success.warnings.map(item=>format(t('posRemaining'),{product:item.name,count:item.remaining})).join('\n')}
      tone="warning"
    />:null}

    <View style={[styles.successActions,{flexDirection:isRTL?'row-reverse':'row'}]}>
      {onViewInvoice?<View style={styles.actionFlex}><Button title={t('posViewInvoice')} variant="secondary" onPress={onViewInvoice}/></View>:null}
      <View style={styles.actionFlex}><Button title={t('posNewSaleAction')} onPress={onNewSale}/></View>
    </View>
  </ScrollView>;
}

function ProductSaleRow({product,warehouseId,onAdd,last,added}:{product:Product;warehouseId:string;onAdd:()=>void;last:boolean;added:boolean}){
  const {t,isRTL,money,number}=useI18n();
  const stock=Number(product.stocks?.[warehouseId]??0);
  const price=sellingPrice(product,'retail');
  const disabled=stock<=0;
  const meta=[product.categoryName,product.sku?'#'+product.sku:null].filter(Boolean).join(' • ');
  return <View style={[styles.productRow,last&&styles.lastRow,disabled&&styles.disabledRow,{flexDirection:isRTL?'row-reverse':'row'}]}>
    <View style={styles.productBody}>
      <AppText variant="subheading" numberOfLines={2}>{product.name}</AppText>
      {meta?<AppText variant="caption" muted numberOfLines={1}>{meta}</AppText>:null}
      <AppText variant="caption" muted numberOfLines={1}>{disabled?t('posOutOfStock'):format(t('posAvailable'),{count:number(stock)})}</AppText>
    </View>
    <View style={styles.productSide}>
      <AppText variant="subheading" style={styles.productMoney}>{money(price)}</AppText>
      <Pressable accessibilityRole="button" accessibilityLabel={t('add')} hitSlop={4} disabled={disabled} onPress={onAdd} style={({pressed})=>[styles.addButton,pressed&&styles.addPressed,disabled&&styles.disabled]}>
        <AppText variant="heading" style={[styles.addPlus,added&&styles.addCheck]}>{added?'✓':'+'}</AppText>
      </Pressable>
    </View>
  </View>;
}

function SaleInvoiceLine({line,last,onDecrease,onIncrease,onEditQuantity,onEditPrice,onRemove}:{line:SaleLine;last:boolean;onDecrease:()=>void;onIncrease:()=>void;onEditQuantity:()=>void;onEditPrice:()=>void;onRemove:()=>void}){
  const {t,money,number}=useI18n();
  const meta=[format(t('posAvailable'),{count:number(line.stock)}),line.product.categoryName,line.product.sku?'#'+line.product.sku:null].filter(Boolean).join(' • ');
  return <InvoiceLineView
    productName={line.product.name}
    context={meta}
    status={line.priceOverridden?<Badge label={t('posCustomPrice')} tone="primary"/>:undefined}
    quantityLabel={t('quantity')}
    quantityControl={<QuantityStepper compact value={line.quantity} onDecrease={onDecrease} onIncrease={onIncrease} onEdit={onEditQuantity}/>}
    unitPriceLabel={t('salePrice')}
    unitPrice={<Pressable accessibilityRole="button" onPress={onEditPrice} style={({pressed})=>[styles.invoicePrice,pressed&&styles.controlPressed]}><AppText variant="subheading">{money(line.unitPrice)}</AppText></Pressable>}
    lineTotalLabel={t('total')}
    lineTotal={<Money value={Math.round(line.quantity*line.unitPrice)}/>}
    actions={<Pressable accessibilityRole="button" accessibilityLabel={t('delete')} hitSlop={4} onPress={onRemove} style={({pressed})=>[styles.deleteButton,pressed&&styles.deletePressed]}><TrashGlyph/></Pressable>}
    last={last}
  />;
}

function SuccessDetailRow({label,value}:{label:string;value:string}){
  const {isRTL}=useI18n();
  return <View style={[styles.successDetailRow,{flexDirection:isRTL?'row-reverse':'row'}]}><AppText variant="caption" muted>{label}</AppText><AppText variant="subheading" numberOfLines={1} style={styles.successDetailValue}>{value}</AppText></View>;
}

function CustomerTile({warning=false}:{warning?:boolean}){
  return <View style={[styles.customerTile,warning&&styles.customerTileWarning]}><CustomerGlyph warning={warning}/></View>;
}

function CustomerGlyph({warning=false}:{warning?:boolean}){
  const color=warning?colors.warning:colors.primary;
  return <View style={styles.customerGlyph}><View style={[styles.customerHead,{borderColor:color}]}/><View style={[styles.customerBody,{borderColor:color}]}/></View>;
}

const styles=StyleSheet.create({
  root:{flex:1,backgroundColor:colors.background},
  stage:{flex:1},
  headerPad:{paddingHorizontal:spacing.md},
  stageScroll:{paddingHorizontal:spacing.md,paddingTop:spacing.xs,gap:spacing.sm,paddingBottom:spacing.lg},
  stageScrollWithBar:{paddingBottom:112},
  flex:{flex:1,minWidth:0},
  chipStrip:{gap:spacing.xs,paddingVertical:2},
  invoiceContextRow:{gap:spacing.sm},
  contextCard:{flex:1,minWidth:0,minHeight:78,paddingHorizontal:spacing.sm,paddingVertical:spacing.xs,borderRadius:radius.md,borderWidth:1,borderColor:colors.borderStrong,backgroundColor:colors.surface,justifyContent:'center',gap:2},
  contextCardMuted:{backgroundColor:colors.surfaceMuted},
  controlPressed:{opacity:.7,transform:[{scale:.99}]},
  disabled:{opacity:.42},
  summaryBlock:{gap:spacing.xs},
  pickerControls:{gap:spacing.sm},
  pickerSearchRow:{flexDirection:'row',alignItems:'center',gap:spacing.sm},
  productRow:{minHeight:64,alignItems:'center',justifyContent:'space-between',gap:spacing.sm,paddingHorizontal:spacing.sm,paddingVertical:spacing.xs,borderBottomWidth:1,borderBottomColor:colors.border},
  productBody:{flex:1,minWidth:0,gap:2},
  productSide:{minWidth:92,alignItems:'flex-end',justifyContent:'center',gap:3},
  productMoney:{fontWeight:'800',color:colors.text},
  addButton:{width:38,height:38,borderRadius:radius.md,backgroundColor:colors.primarySoft,alignItems:'center',justifyContent:'center',flexShrink:0,borderWidth:1,borderColor:colors.primarySoft},
  addPressed:{backgroundColor:'#D9E9FF',transform:[{scale:.97}]},
  addPlus:{color:colors.primary,fontSize:22,lineHeight:24},
  addCheck:{color:colors.positive,fontSize:20},
  disabledRow:{backgroundColor:colors.surfaceMuted},
  lastRow:{borderBottomWidth:0},
  invoicePrice:{minHeight:34,alignItems:'center',justifyContent:'center',paddingHorizontal:2,borderRadius:radius.sm},
  deleteButton:{width:touch.min,height:touch.min,borderRadius:radius.sm,alignItems:'center',justifyContent:'center'},
  deletePressed:{backgroundColor:colors.negativeSoft},
  paymentMethods:{flexWrap:'wrap',gap:spacing.xs},
  paymentMethodCard:{width:'31.4%',flexGrow:0,flexBasis:'31.4%',minWidth:96},
  sheetActions:{gap:spacing.sm},
  sheetAction:{flex:1},
  priceEditor:{gap:spacing.sm},
  currentPrice:{alignItems:'center',justifyContent:'space-between',gap:spacing.md},
  customerTile:{width:38,height:38,borderRadius:radius.md,alignItems:'center',justifyContent:'center',backgroundColor:colors.primarySoft},
  customerTileWarning:{backgroundColor:colors.warningSoft},
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
  customerGlyph:{width:25,height:24,alignItems:'center',justifyContent:'flex-end'},
  customerHead:{position:'absolute',top:1,width:9,height:9,borderRadius:5,borderWidth:2},
  customerBody:{width:20,height:11,borderWidth:2,borderBottomWidth:0,borderTopLeftRadius:10,borderTopRightRadius:10},
});
