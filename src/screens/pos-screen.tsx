import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { DocumentRecord, Party, PaymentAccount, PricingMode, Product, ProductCategory, Warehouse } from '@/domain/types';
import { sellingPrice, validateSaleDraft } from '@/domain/accounting';
import { getDocumentById } from '@/db/document-queries';
import { listParties, listPaymentAccounts, listProductCategories, listProducts, listWarehouses } from '@/db/queries';
import { postSale } from '@/services/accounting-service';
import { PartyPicker } from '@/components/pickers';
import { AppText, Button, EmptyState, Field, Money, Screen } from '@/components/ui';
import { QuantityStepper, Sheet } from '@/components/mobile-interactions';
import { useI18n } from '@/i18n/provider';
import { useAuth } from '@/auth/provider';
import { colors, elevation, radius, spacing, touch } from '@/theme';

type CartLine={product:Product;quantity:number;unitPrice:number;stock:number};
type PosStage='products'|'cart'|'payment'|'success';
type SuccessState={
  documentId:string;
  document:DocumentRecord|null;
  total:number;
  change:number;
  occurredAt:string;
  warnings:Array<{name:string;remaining:number}>;
};

function format(template:string,values:Record<string,string|number>){
  return Object.entries(values).reduce((output,[key,value])=>output.replaceAll('{'+key+'}',String(value)),template);
}

export function PosScreen(){
  const db=useSQLiteContext(),{t,isRTL,number,money,date,errorMessage}=useI18n(),auth=useAuth();
  const allowed=auth.has('pos.create');
  const [warehouses,setWarehouses]=useState<Warehouse[]>([]),[warehouseId,setWarehouseId]=useState('');
  const [accounts,setAccounts]=useState<PaymentAccount[]>([]),[parties,setParties]=useState<Party[]>([]),[categories,setCategories]=useState<ProductCategory[]>([]),[categoryId,setCategoryId]=useState('');
  const [results,setResults]=useState<Product[]>([]),[search,setSearch]=useState(''),[pricingMode,setPricingMode]=useState<PricingMode>('retail');
  const [lines,setLines]=useState<CartLine[]>([]),[loading,setLoading]=useState(true),[searching,setSearching]=useState(false);
  const [stage,setStage]=useState<PosStage>('products');
  const [paymentMethod,setPaymentMethod]=useState(''),[tender,setTender]=useState(''),[partyId,setPartyId]=useState<string|null>(null),[partyPicker,setPartyPicker]=useState(false),[busy,setBusy]=useState(false);
  const [quantityLineId,setQuantityLineId]=useState<string|null>(null),[quantityDraft,setQuantityDraft]=useState('1');
  const [success,setSuccess]=useState<SuccessState|null>(null);

  const loadBase=useCallback(async()=>{
    if(!allowed)return;
    setLoading(true);
    try{
      const [w,a,p,cats]=await Promise.all([listWarehouses(db),listPaymentAccounts(db),listParties(db,'customer','',300),listProductCategories(db)]);
      const active=a.filter(x=>x.isActive&&!x.isArchived);
      const selected=w.find(x=>x.isSalesDefault)?.id??w[0]?.id??'';
      setWarehouses(w);setAccounts(active);setParties(p);setCategories(cats);setWarehouseId(current=>current||selected);
      setCategoryId(current=>current&&cats.some(category=>category.id===current)?current:'');
      setPaymentMethod(current=>current==='note'||active.some(x=>x.id===current||x.code===current)?current:active.find(x=>x.code==='cash')?.id||active[0]?.id||'note');
    }catch(error){Alert.alert(t('error'),errorMessage(error))}finally{setLoading(false)}
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
  const itemCount=useMemo(()=>lines.reduce((sum,line)=>sum+line.quantity,0),[lines]);
  const selectedParty=parties.find(p=>p.id===partyId)??null;
  const selectedWarehouse=warehouses.find(w=>w.id===warehouseId)??null;
  const tenderValue=paymentMethod==='note'?0:Number(tender.trim()===''?total:tender);
  const normalizedTender=Number.isFinite(tenderValue)&&tenderValue>=0?tenderValue:0;
  const underpaid=paymentMethod!=='note'&&normalizedTender<total;
  const paidValue=paymentMethod==='note'?0:total;
  const dueValue=paymentMethod==='note'?total:0;
  const changeValue=paymentMethod==='note'?0:Math.max(normalizedTender-total,0);
  const needsParty=paymentMethod==='note';

  const addProduct=(product:Product)=>{
    const stock=Number(product.stocks?.[warehouseId]??0);
    if(stock<=0)return;
    setLines(current=>{
      const existing=current.find(line=>line.product.id===product.id);
      if(existing)return current.map(line=>line.product.id===product.id?{...line,quantity:Math.min(line.quantity+1,stock)}:line);
      return [{product,quantity:Math.min(1,stock),unitPrice:sellingPrice(product,pricingMode),stock},...current];
    });
    setSearch('');
  };

  const changeQuantity=(productId:string,next:number)=>setLines(current=>{
    const line=current.find(x=>x.product.id===productId);
    if(!line)return current;
    if(next<=0)return current.filter(x=>x.product.id!==productId);
    return current.map(x=>x.product.id===productId?{...x,quantity:Math.min(next,x.stock)}:x);
  });

  const openQuantity=(line:CartLine)=>{setQuantityLineId(line.product.id);setQuantityDraft(String(line.quantity))};
  const saveQuantity=()=>{
    if(!quantityLineId)return;
    const value=Number(quantityDraft);
    if(Number.isFinite(value)&&value>0)changeQuantity(quantityLineId,value);
    setQuantityLineId(null);
  };

  const changeMode=(mode:PricingMode)=>{
    setPricingMode(mode);
    setLines(current=>current.map(line=>({...line,unitPrice:sellingPrice(line.product,mode)})));
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
    const proceed=()=>{setTender(String(total));setStage('payment')};
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
    if(paymentMethod!=='note'&&(!Number.isFinite(tenderValue)||tenderValue<0)){Alert.alert(t('error'),t('posInvalidTender'));return}
    if(underpaid){Alert.alert(t('error'),t('posPartialPaymentError'));return}
    if(needsParty&&!partyId){Alert.alert(t('customer'),t('posCreditCustomerRequired'));return}
    setBusy(true);
    const completedTotal=total,completedChange=changeValue,completedLines=lines,completedAt=new Date().toISOString();
    try{
      const documentId=await postSale(db,{warehouseId,partyId,paymentMethod,cashAmount:paidValue,pricingMode,lines:completedLines.map(line=>({productId:line.product.id,quantity:line.quantity,unitPrice:line.unitPrice}))});
      let document:DocumentRecord|null=null;
      try{document=await getDocumentById(db,documentId)}catch{}
      const lowStock=completedLines.map(line=>({name:line.product.name,remaining:Math.max(0,line.stock-line.quantity)})).filter(item=>item.remaining<=3);
      setLines([]);setPartyId(null);setTender('');setSearch('');
      setSuccess({documentId,document,total:completedTotal,change:completedChange,occurredAt:document?.occurredAt??completedAt,warnings:lowStock});
      setStage('success');
      const fresh=await listProducts(db,'',warehouseId,false,18,0,categoryId);setResults(fresh);
    }catch(error){Alert.alert(t('error'),errorMessage(error))}finally{setBusy(false)}
  };

  const clearCart=()=>Alert.alert(t('posClearCartTitle'),t('posClearCartDescription'),[
    {text:t('cancel'),style:'cancel'},
    {text:t('confirm'),style:'destructive',onPress:()=>setLines([])},
  ]);

  const startNewSale=()=>{setSuccess(null);setPartyId(null);setTender('');setSearch('');setStage('products')};
  const back=()=>{
    if(stage==='products'){router.back();return}
    if(stage==='cart'){setStage('products');return}
    if(stage==='payment'){setStage('cart');return}
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
      {stage==='products'?<ProductsStage
        onBack={back}
        results={results}
        searching={searching}
        search={search}
        setSearch={setSearch}
        categories={categories}
        categoryId={categoryId}
        setCategoryId={setCategoryId}
        pricingMode={pricingMode}
        changeMode={changeMode}
        warehouses={warehouses}
        warehouseId={warehouseId}
        selectedWarehouse={selectedWarehouse}
        lines={lines}
        setWarehouseId={setWarehouseId}
        addProduct={addProduct}
      />:null}

      {stage==='cart'?<CartStage
        lines={lines}
        total={total}
        onBack={back}
        onClear={clearCart}
        onChangeQuantity={changeQuantity}
        onEditQuantity={openQuantity}
        onBrowse={()=>setStage('products')}
      />:null}

      {stage==='payment'?<PaymentStage
        total={total}
        accounts={accounts}
        paymentMethod={paymentMethod}
        setPaymentMethod={method=>{setPaymentMethod(method);setTender(method==='note'?'0':String(total))}}
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

      {stage==='products'&&lines.length?<PosBottomBar kind="cart" label={t('posViewCart')} total={total} count={itemCount} onPress={()=>setStage('cart')}/>:null}
      {stage==='cart'?<PosBottomBar kind="next" label={t('posContinuePayment')} total={total} disabled={!lines.length} onPress={openPayment}/>:null}
      {stage==='payment'?<PosBottomBar kind="next" label={t('completeSale')} total={total} disabled={underpaid||(needsParty&&!selectedParty)||!lines.length} loading={busy} onPress={()=>void completeSale()}/>:null}
    </KeyboardAvoidingView>

    <PartyPicker visible={partyPicker} parties={parties} directLabel={t('posCashCustomer')} onClose={()=>setPartyPicker(false)} onSelect={party=>setPartyId(party?.id??null)}/>

    <Sheet visible={Boolean(quantityLineId)} title={t('posEditQuantity')} onClose={()=>setQuantityLineId(null)} footer={<Button title={t('save')} onPress={saveQuantity}/>}>
      <Field label={t('quantity')} value={quantityDraft} onChangeText={setQuantityDraft} keyboardType="decimal-pad" autoFocus selectTextOnFocus/>
    </Sheet>
  </Screen>;
}

function ProductsStage({
  onBack,results,searching,search,setSearch,categories,categoryId,setCategoryId,pricingMode,changeMode,warehouses,warehouseId,selectedWarehouse,lines,setWarehouseId,addProduct,
}:{
  onBack:()=>void;results:Product[];searching:boolean;search:string;setSearch:(value:string)=>void;categories:ProductCategory[];categoryId:string;setCategoryId:(value:string)=>void;
  pricingMode:PricingMode;changeMode:(mode:PricingMode)=>void;warehouses:Warehouse[];warehouseId:string;selectedWarehouse:Warehouse|null;lines:CartLine[];setWarehouseId:(id:string)=>void;addProduct:(product:Product)=>void;
}){
  const {t,isRTL}=useI18n();
  return <View style={styles.stage}>
    <PosHeader title={t('posNewSaleTitle')} subtitle={warehouses.length===1?selectedWarehouse?.name:undefined} onBack={onBack} trailing={lines.length?<CartIndicator count={lines.reduce((sum,line)=>sum+line.quantity,0)}/>:undefined}/>
    <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={[styles.stageScroll,lines.length&&styles.stageScrollWithBar]}>
      <View style={[styles.compactControls,{flexDirection:isRTL?'row-reverse':'row'}]}>
        <PricingSwitch value={pricingMode} onChange={changeMode}/>
        {warehouses.length>1?<View style={styles.warehouseLabel}><AppText variant="caption" muted numberOfLines={1}>{selectedWarehouse?.name??t('warehouse')}</AppText></View>:null}
      </View>

      {warehouses.length>1?<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.chipStrip,{flexDirection:isRTL?'row-reverse':'row'}]}>
        {warehouses.map(warehouse=><FilterChip key={warehouse.id} label={warehouse.name} active={warehouse.id===warehouseId} disabled={lines.length>0&&warehouse.id!==warehouseId} onPress={()=>setWarehouseId(warehouse.id)}/>)}
      </ScrollView>:null}

      <SearchBar value={search} onChangeText={setSearch} loading={searching} placeholder={t('posSearchPlaceholder')}/>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.chipStrip,{flexDirection:isRTL?'row-reverse':'row'}]}>
        <FilterChip label={t('posAllCategories')} active={!categoryId} onPress={()=>setCategoryId('')}/>
        {categories.map(category=><FilterChip key={category.id} label={category.name} active={categoryId===category.id} onPress={()=>setCategoryId(category.id)}/>)}
      </ScrollView>

      <View style={styles.productPanel}>
        {results.length?results.map((product,index)=><ProductSaleRow key={product.id} product={product} warehouseId={warehouseId} pricingMode={pricingMode} onAdd={()=>addProduct(product)} last={index===results.length-1}/>):<EmptyState title={searching?t('loading'):t('noResults')}/>}
      </View>
    </ScrollView>
  </View>;
}

function CartStage({lines,total,onBack,onClear,onChangeQuantity,onEditQuantity,onBrowse}:{lines:CartLine[];total:number;onBack:()=>void;onClear:()=>void;onChangeQuantity:(id:string,value:number)=>void;onEditQuantity:(line:CartLine)=>void;onBrowse:()=>void}){
  const {t}=useI18n();
  return <View style={styles.stage}>
    <PosHeader title={t('posCartTitle')} onBack={onBack} trailing={lines.length?<HeaderIconButton accessibilityLabel={t('delete')} onPress={onClear}><TrashGlyph/></HeaderIconButton>:undefined}/>
    <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={[styles.stageScroll,styles.stageScrollWithBar]}>
      {lines.length?<View style={styles.cartPanel}>
        {lines.map((line,index)=><CartLineRow key={line.product.id} line={line} last={index===lines.length-1} onDecrease={()=>onChangeQuantity(line.product.id,line.quantity-1)} onIncrease={()=>onChangeQuantity(line.product.id,line.quantity+1)} onEdit={()=>onEditQuantity(line)} onRemove={()=>onChangeQuantity(line.product.id,0)}/>)}
      </View>:<View style={styles.emptyCart}><EmptyState title={t('posCartEmptyTitle')} description={t('posCartEmptyDescription')} action={<Button title={t('products')} variant="secondary" onPress={onBrowse}/>}/></View>}
      <View style={styles.cartSummary}><AppText variant="subheading">{t('total')}</AppText><Money value={total} large/></View>
    </ScrollView>
  </View>;
}

function PaymentStage({
  total,accounts,paymentMethod,setPaymentMethod,tender,setTender,normalizedTender,changeValue,dueValue,needsParty,selectedParty,underpaid,onChooseParty,onBack,
}:{
  total:number;accounts:PaymentAccount[];paymentMethod:string;setPaymentMethod:(method:string)=>void;tender:string;setTender:(value:string)=>void;normalizedTender:number;changeValue:number;dueValue:number;
  needsParty:boolean;selectedParty:Party|null;underpaid:boolean;onChooseParty:()=>void;onBack:()=>void;
}){
  const {t,isRTL}=useI18n();
  return <View style={styles.stage}>
    <PosHeader title={t('posCheckoutTitle')} onBack={onBack}/>
    <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={[styles.stageScroll,styles.stageScrollWithBar]}>
      <View style={styles.paymentSection}>
        <AppText variant="heading">{t('customer')}</AppText>
        <Pressable accessibilityRole="button" onPress={onChooseParty} style={({pressed})=>[styles.customerCard,{flexDirection:isRTL?'row-reverse':'row'},pressed&&styles.rowPressed,needsParty&&!selectedParty&&styles.customerCardRequired]}>
          <View style={styles.customerIcon}><CustomerGlyph/></View>
          <View style={styles.flex}>
            <AppText variant="subheading" numberOfLines={1}>{selectedParty?.name??(needsParty?t('posChooseCustomer'):t('posCashCustomer'))}</AppText>
            <AppText variant="caption" muted numberOfLines={1}>{selectedParty?.phone||(needsParty?t('posCustomerRequiredHint'):t('posCashCustomerHint'))}</AppText>
          </View>
          <AppText variant="heading" style={styles.chevron}>{isRTL?'‹':'›'}</AppText>
        </Pressable>
      </View>

      <View style={styles.paymentSection}>
        <AppText variant="heading">{t('paymentMethod')}</AppText>
        <View style={[styles.paymentMethods,{flexDirection:isRTL?'row-reverse':'row'}]}>
          {accounts.map(account=><PaymentMethodCard key={account.id} label={account.name} selected={paymentMethod===account.id||paymentMethod===account.code} onPress={()=>setPaymentMethod(account.id)} icon={<PaymentGlyph/>}/>)}
          <PaymentMethodCard label={t('onCredit')} selected={paymentMethod==='note'} onPress={()=>setPaymentMethod('note')} icon={<CreditGlyph/>}/>
        </View>
      </View>

      {paymentMethod!=='note'?<View style={styles.paymentSection}>
        <AppText variant="heading">{t('posReceivedAmount')}</AppText>
        <View style={[styles.tenderField,{flexDirection:isRTL?'row-reverse':'row'}]}>
          <TextInput accessibilityLabel={t('posReceivedAmount')} value={tender} onChangeText={setTender} keyboardType="number-pad" selectTextOnFocus placeholder="0" placeholderTextColor={colors.textSoft} selectionColor={colors.primary} style={[styles.tenderInput,{textAlign:isRTL?'right':'left'}]}/>
          <AppText variant="subheading" muted>MRU</AppText>
        </View>
      </View>:null}

      <View style={styles.paymentSummary}>
        <SummaryRow label={t('total')} value={total}/>
        {paymentMethod==='note'?<SummaryRow label={t('due')} value={dueValue} tone="negative"/>:<>
          <SummaryRow label={t('posReceivedAmount')} value={normalizedTender}/>
          <SummaryRow label={t('posChange')} value={changeValue} tone={changeValue>0?'positive':'normal'}/>
        </>}
      </View>

      {underpaid?<View style={styles.warningCard}><AppText variant="caption" style={styles.warningText}>{t('posPartialPaymentError')}</AppText></View>:null}
      {needsParty&&!selectedParty?<View style={styles.warningCard}><AppText variant="caption" style={styles.warningText}>{t('posCreditCustomerRequired')}</AppText></View>:null}
    </ScrollView>
  </View>;
}

function SaleSuccess({success,onNewSale,onViewInvoice}:{success:SuccessState;onNewSale:()=>void;onViewInvoice?:()=>void}){
  const {t,date,isRTL}=useI18n();
  return <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.successScreen}>
    <View style={styles.successHero}>
      <View style={styles.successMark}><CheckGlyph/></View>
      <AppText variant="title" style={styles.successTitle}>{t('posSaleSuccessTitle')}</AppText>
      <AppText variant="body" muted style={styles.successDescription}>{t('posSaleSuccessDescription')}</AppText>
    </View>

    <View style={styles.successCard}>
      {success.document?.number?<View style={[styles.successInvoice,{flexDirection:isRTL?'row-reverse':'row'}]}><View><AppText variant="caption" muted>{t('posInvoiceNumber')}</AppText><AppText variant="heading">{success.document.number}</AppText></View><View style={styles.documentGlyph}><ReceiptGlyph/></View></View>:null}
      <View style={styles.successDivider}/>
      <SummaryRow label={t('total')} value={success.total} large/>
      {success.change>0?<SummaryRow label={t('posChange')} value={success.change} tone="positive"/>:null}
      <View style={[styles.successDate,{flexDirection:isRTL?'row-reverse':'row'}]}><AppText variant="caption" muted>{t('posSaleDate')}</AppText><AppText variant="caption" muted>{date(success.occurredAt)}</AppText></View>
    </View>

    {success.warnings.length?<View style={styles.lowStockCard}>
      <View style={[styles.lowStockHead,{flexDirection:isRTL?'row-reverse':'row'}]}><View style={styles.warningDot}/><AppText variant="subheading" style={styles.lowStockTitle}>{t('posLowStockAfterSale')}</AppText></View>
      {success.warnings.map(item=><AppText key={item.name} variant="caption" muted>{format(t('posRemaining'),{product:item.name,count:item.remaining})}</AppText>)}
    </View>:null}

    <View style={[styles.successActions,{flexDirection:isRTL?'row-reverse':'row'}]}>
      {onViewInvoice?<SuccessAction label={t('posViewInvoice')} primary={false} onPress={onViewInvoice}/>:null}
      <SuccessAction label={t('posNewSaleAction')} primary onPress={onNewSale}/>
    </View>
  </ScrollView>;
}

function PosHeader({title,subtitle,onBack,trailing}:{title:string;subtitle?:string;onBack:()=>void;trailing?:ReactNode}){
  const {isRTL}=useI18n();
  return <View style={[styles.header,{flexDirection:isRTL?'row-reverse':'row'}]}>
    <HeaderIconButton accessibilityLabel="back" onPress={onBack}><AppText variant="heading" style={styles.backArrow}>{isRTL?'›':'‹'}</AppText></HeaderIconButton>
    <View style={styles.headerTitle}><AppText variant="heading" numberOfLines={1}>{title}</AppText>{subtitle?<AppText variant="caption" muted numberOfLines={1}>{subtitle}</AppText>:null}</View>
    <View style={styles.headerTrailing}>{trailing??<View style={styles.headerSpacer}/>}</View>
  </View>;
}

function HeaderIconButton({accessibilityLabel,onPress,children}:{accessibilityLabel:string;onPress:()=>void;children:ReactNode}){
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={({pressed})=>[styles.headerButton,pressed&&styles.iconPressed]}>{children}</Pressable>;
}

function CartIndicator({count}:{count:number}){
  const {number}=useI18n();
  return <View style={styles.cartIndicator}><CartGlyph/><View style={styles.cartBadge}><AppText variant="caption" style={styles.cartBadgeText}>{number(count)}</AppText></View></View>;
}

function PricingSwitch({value,onChange}:{value:PricingMode;onChange:(value:PricingMode)=>void}){
  const {t}=useI18n();
  return <View style={styles.pricingSwitch}>
    {(['retail','wholesale'] as PricingMode[]).map(mode=><Pressable key={mode} accessibilityRole="button" accessibilityState={{selected:value===mode}} onPress={()=>onChange(mode)} style={({pressed})=>[styles.pricingOption,value===mode&&styles.pricingOptionActive,pressed&&styles.controlPressed]}><AppText variant="caption" style={[styles.pricingText,value===mode&&styles.pricingTextActive]}>{t(mode)}</AppText></Pressable>)}
  </View>;
}

function FilterChip({label,active,onPress,disabled=false}:{label:string;active:boolean;onPress:()=>void;disabled?:boolean}){
  return <Pressable accessibilityRole="button" accessibilityState={{selected:active,disabled}} disabled={disabled} onPress={onPress} style={({pressed})=>[styles.filterChip,active&&styles.filterChipActive,pressed&&styles.controlPressed,disabled&&styles.disabled]}><AppText variant="caption" numberOfLines={1} style={[styles.filterChipText,active&&styles.filterChipTextActive]}>{label}</AppText></Pressable>;
}

function SearchBar({value,onChangeText,placeholder,loading}:{value:string;onChangeText:(value:string)=>void;placeholder:string;loading:boolean}){
  const {isRTL,t}=useI18n();
  return <View style={[styles.searchBar,{flexDirection:isRTL?'row-reverse':'row'}]}>
    <SearchGlyph/>
    <TextInput accessibilityLabel={t('search')} value={value} onChangeText={onChangeText} returnKeyType="search" autoCapitalize="none" placeholder={placeholder} placeholderTextColor={colors.textSoft} selectionColor={colors.primary} style={[styles.searchInput,{textAlign:isRTL?'right':'left'}]}/>
    {loading?<ActivityIndicator size="small" color={colors.primary}/>:null}
  </View>;
}

function ProductSaleRow({product,warehouseId,pricingMode,onAdd,last}:{product:Product;warehouseId:string;pricingMode:PricingMode;onAdd:()=>void;last:boolean}){
  const {t,isRTL,money,number}=useI18n();
  const stock=Number(product.stocks?.[warehouseId]??0),price=sellingPrice(product,pricingMode),disabled=stock<=0;
  const icon=<View style={styles.productIcon}><ProductGlyph/></View>;
  const body=<View style={styles.productBody}><AppText variant="subheading" numberOfLines={2}>{product.name}</AppText><AppText variant="caption" style={styles.productMoney}>{money(price)}</AppText><AppText variant="caption" muted numberOfLines={1}>{disabled?t('posOutOfStock'):format(t('posAvailable'),{count:number(stock)})}{product.categoryName?' • '+product.categoryName:''}</AppText></View>;
  const action=<Pressable accessibilityRole="button" accessibilityLabel={t('add')} disabled={disabled} onPress={onAdd} style={({pressed})=>[styles.addButton,pressed&&styles.addPressed,disabled&&styles.disabled]}><AppText variant="heading" style={styles.addPlus}>+</AppText></Pressable>;
  return <View style={[styles.productRow,last&&styles.lastRow,disabled&&styles.disabledRow,{flexDirection:isRTL?'row-reverse':'row'}]}>{isRTL?<>{action}{body}{icon}</>:<>{icon}{body}{action}</>}</View>;
}

function CartLineRow({line,last,onDecrease,onIncrease,onEdit,onRemove}:{line:CartLine;last:boolean;onDecrease:()=>void;onIncrease:()=>void;onEdit:()=>void;onRemove:()=>void}){
  const {t,isRTL,money,number}=useI18n();
  const icon=<View style={styles.cartProductIcon}><ProductGlyph/></View>;
  const body=<View style={styles.cartLineBody}><AppText variant="subheading" numberOfLines={2}>{line.product.name}</AppText><AppText variant="caption" muted>{money(line.unitPrice)} • {format(t('posAvailable'),{count:number(line.stock)})}</AppText></View>;
  const remove=<Pressable accessibilityRole="button" accessibilityLabel={t('delete')} onPress={onRemove} style={({pressed})=>[styles.deleteButton,pressed&&styles.deletePressed]}><TrashGlyph/></Pressable>;
  return <View style={[styles.cartLine,last&&styles.lastRow]}>
    <View style={[styles.cartLineTop,{flexDirection:isRTL?'row-reverse':'row'}]}>{isRTL?<>{remove}{body}{icon}</>:<>{icon}{body}{remove}</>}</View>
    <View style={[styles.cartLineBottom,{flexDirection:isRTL?'row-reverse':'row'}]}><QuantityStepper value={line.quantity} onDecrease={onDecrease} onIncrease={onIncrease} onEdit={onEdit}/><View style={styles.lineTotal}><AppText variant="caption" muted>{t('total')}</AppText><AppText variant="subheading">{money(Math.round(line.quantity*line.unitPrice))}</AppText></View></View>
  </View>;
}

function PaymentMethodCard({label,selected,onPress,icon}:{label:string;selected:boolean;onPress:()=>void;icon:ReactNode}){
  return <Pressable accessibilityRole="button" accessibilityState={{selected}} onPress={onPress} style={({pressed})=>[styles.paymentMethodCard,selected&&styles.paymentMethodSelected,pressed&&styles.controlPressed]}><View style={[styles.paymentMethodIcon,selected&&styles.paymentMethodIconSelected]}>{icon}</View><AppText variant="caption" numberOfLines={2} style={[styles.paymentMethodLabel,selected&&styles.paymentMethodLabelSelected]}>{label}</AppText></Pressable>;
}

function SummaryRow({label,value,tone='normal',large=false}:{label:string;value:number;tone?:'normal'|'positive'|'negative';large?:boolean}){
  const {isRTL}=useI18n();
  return <View style={[styles.summaryRow,{flexDirection:isRTL?'row-reverse':'row'}]}><AppText variant={large?'subheading':'caption'} muted={!large}>{label}</AppText><Money value={value} tone={tone} large={large}/></View>;
}

function PosBottomBar({kind,label,total,count,onPress,disabled=false,loading=false}:{kind:'cart'|'next';label:string;total:number;count?:number;onPress:()=>void;disabled?:boolean;loading?:boolean}){
  const insets=useSafeAreaInsets(),{isRTL,money,number}=useI18n();
  return <View style={[styles.bottomBar,{paddingBottom:Math.max(insets.bottom,spacing.sm)}]}>
    <Pressable accessibilityRole="button" disabled={disabled||loading} onPress={onPress} style={({pressed})=>[styles.bottomPrimary,pressed&&styles.bottomPrimaryPressed,(disabled||loading)&&styles.disabled]}>
      {loading?<ActivityIndicator color={colors.onPrimary}/>:kind==='cart'?<View style={[styles.bottomCartContent,{flexDirection:isRTL?'row-reverse':'row'}]}>
        <View style={[styles.bottomCartLabel,{flexDirection:isRTL?'row-reverse':'row'}]}><CartGlyph light/><AppText variant="subheading" style={styles.bottomText}>{label}{typeof count==='number'?' ('+number(count)+')':''}</AppText></View>
        <AppText variant="subheading" style={styles.bottomText}>{money(total)}</AppText>
      </View>:<View style={[styles.bottomNextContent,{flexDirection:isRTL?'row-reverse':'row'}]}><AppText variant="subheading" style={styles.bottomText}>{label}</AppText><AppText variant="heading" style={styles.bottomArrow}>{isRTL?'←':'→'}</AppText></View>}
    </Pressable>
  </View>;
}

function SuccessAction({label,primary,onPress}:{label:string;primary:boolean;onPress:()=>void}){
  return <Pressable accessibilityRole="button" onPress={onPress} style={({pressed})=>[styles.successAction,primary?styles.successActionPrimary:styles.successActionSecondary,pressed&&styles.controlPressed]}><AppText variant="subheading" style={primary?styles.successActionPrimaryText:styles.successActionSecondaryText}>{label}</AppText></Pressable>;
}

function SearchGlyph(){return <View style={styles.searchGlyph}><View style={styles.searchCircle}/><View style={styles.searchHandle}/></View>}
function ProductGlyph(){return <View style={styles.packageGlyph}><View style={styles.packageBox}/><View style={styles.packageTop}/><View style={styles.packageSeam}/></View>}
function CustomerGlyph(){return <View style={styles.customerGlyph}><View style={styles.customerHead}/><View style={styles.customerBody}/></View>}
function PaymentGlyph(){return <View style={styles.paymentGlyph}><View style={styles.paymentCard}/><View style={styles.paymentLine}/><View style={styles.paymentDot}/></View>}
function CreditGlyph(){return <View style={styles.creditGlyph}><View style={styles.creditPage}/><View style={styles.creditLine}/><View style={styles.creditLineShort}/></View>}
function ReceiptGlyph(){return <View style={styles.receiptGlyph}><View style={styles.receiptPage}/><View style={styles.receiptLine}/><View style={styles.receiptLineShort}/></View>}
function TrashGlyph(){return <View style={styles.trashGlyph}><View style={styles.trashLid}/><View style={styles.trashCan}/><View style={styles.trashLineOne}/><View style={styles.trashLineTwo}/></View>}
function CheckGlyph(){return <View style={styles.checkGlyph}><View style={styles.checkShort}/><View style={styles.checkLong}/></View>}
function CartGlyph({light=false}:{light?:boolean}){return <View style={styles.cartGlyph}><View style={[styles.cartBasket,light&&styles.cartStrokeLight]}/><View style={[styles.cartHandle,light&&styles.cartHandleLight]}/><View style={[styles.cartWheel,styles.cartWheelLeft,light&&styles.cartFillLight]}/><View style={[styles.cartWheel,styles.cartWheelRight,light&&styles.cartFillLight]}/></View>}

const styles=StyleSheet.create({
  root:{flex:1,backgroundColor:colors.background},
  stage:{flex:1},
  stageScroll:{padding:spacing.md,gap:spacing.sm,paddingBottom:spacing.lg},
  stageScrollWithBar:{paddingBottom:104},
  header:{minHeight:62,alignItems:'center',borderBottomWidth:1,borderBottomColor:colors.border,backgroundColor:colors.surface,paddingHorizontal:spacing.sm,gap:spacing.sm},
  headerButton:{width:touch.min,height:touch.min,borderRadius:radius.md,alignItems:'center',justifyContent:'center'},
  iconPressed:{backgroundColor:colors.surfaceMuted},
  headerTitle:{flex:1,alignItems:'center',gap:2},
  headerTrailing:{width:touch.min,alignItems:'center'},
  headerSpacer:{width:touch.min,height:touch.min},
  backArrow:{color:colors.text,lineHeight:24,fontSize:27},
  cartIndicator:{width:44,height:44,alignItems:'center',justifyContent:'center'},
  cartBadge:{position:'absolute',top:2,right:0,minWidth:18,height:18,borderRadius:9,paddingHorizontal:4,backgroundColor:colors.negative,alignItems:'center',justifyContent:'center'},
  cartBadgeText:{fontSize:10,color:colors.onPrimary,fontWeight:'800'},
  compactControls:{alignItems:'center',justifyContent:'space-between',gap:spacing.sm},
  pricingSwitch:{flexDirection:'row',padding:3,borderRadius:radius.md,backgroundColor:colors.surfaceStrong,borderWidth:1,borderColor:colors.border},
  pricingOption:{minHeight:38,minWidth:68,paddingHorizontal:spacing.sm,borderRadius:radius.sm,alignItems:'center',justifyContent:'center'},
  pricingOptionActive:{backgroundColor:colors.surface,borderWidth:1,borderColor:colors.primarySoft},
  pricingText:{color:colors.textMuted,fontWeight:'700'},
  pricingTextActive:{color:colors.primary,fontWeight:'800'},
  warehouseLabel:{flex:1,alignItems:'flex-end'},
  chipStrip:{gap:spacing.xs,paddingVertical:2},
  filterChip:{minHeight:40,paddingHorizontal:spacing.md,borderRadius:radius.full,alignItems:'center',justifyContent:'center',backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border},
  filterChipActive:{backgroundColor:colors.primary,borderColor:colors.primary},
  filterChipText:{color:colors.textMuted,fontWeight:'700'},
  filterChipTextActive:{color:colors.onPrimary},
  controlPressed:{opacity:.7,transform:[{scale:.99}]},
  disabled:{opacity:.42},
  searchBar:{minHeight:52,alignItems:'center',gap:spacing.sm,paddingHorizontal:spacing.md,borderRadius:radius.md,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.borderStrong},
  searchInput:{flex:1,minWidth:0,fontSize:15,color:colors.text,fontWeight:'500',paddingVertical:0},
  searchGlyph:{width:21,height:21,position:'relative'},
  searchCircle:{position:'absolute',left:2,top:2,width:13,height:13,borderRadius:7,borderWidth:2,borderColor:colors.textSoft},
  searchHandle:{position:'absolute',right:2,bottom:3,width:8,height:2,borderRadius:2,backgroundColor:colors.textSoft,transform:[{rotate:'45deg'}]},
  productPanel:{overflow:'hidden',backgroundColor:colors.surface,borderRadius:radius.lg,borderWidth:1,borderColor:colors.border,...elevation.subtle},
  productRow:{minHeight:86,alignItems:'center',gap:spacing.sm,paddingHorizontal:spacing.sm,paddingVertical:10,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border},
  productIcon:{width:46,height:58,borderRadius:radius.md,alignItems:'center',justifyContent:'center',backgroundColor:colors.primaryFaint,borderWidth:1,borderColor:colors.primarySoft,flexShrink:0},
  productBody:{flex:1,minWidth:0,gap:4},
  productMoney:{fontWeight:'800',color:colors.text},
  addButton:{width:touch.min,height:touch.min,borderRadius:14,backgroundColor:colors.primarySoft,alignItems:'center',justifyContent:'center',flexShrink:0},
  addPressed:{backgroundColor:'#D9E9FF',transform:[{scale:.97}]},
  addPlus:{color:colors.primary,fontSize:25,lineHeight:27},
  disabledRow:{backgroundColor:colors.surfaceMuted},
  lastRow:{borderBottomWidth:0},
  rowPressed:{backgroundColor:colors.surfaceMuted},
  flex:{flex:1,minWidth:0},
  cartPanel:{overflow:'hidden',backgroundColor:colors.surface,borderRadius:radius.lg,borderWidth:1,borderColor:colors.border,...elevation.subtle},
  cartLine:{padding:spacing.sm,gap:spacing.sm,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border},
  cartLineTop:{alignItems:'center',gap:spacing.sm},
  cartProductIcon:{width:48,height:54,borderRadius:radius.md,alignItems:'center',justifyContent:'center',backgroundColor:colors.primaryFaint,borderWidth:1,borderColor:colors.primarySoft,flexShrink:0},
  cartLineBody:{flex:1,minWidth:0,gap:4},
  deleteButton:{width:touch.min,height:touch.min,borderRadius:radius.sm,alignItems:'center',justifyContent:'center'},
  deletePressed:{backgroundColor:colors.negativeSoft},
  cartLineBottom:{alignItems:'center',justifyContent:'space-between',gap:spacing.sm},
  lineTotal:{alignItems:'flex-end',gap:2},
  emptyCart:{backgroundColor:colors.surface,borderRadius:radius.lg,borderWidth:1,borderColor:colors.border},
  cartSummary:{minHeight:74,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:spacing.md,padding:spacing.md,borderRadius:radius.lg,backgroundColor:colors.primaryFaint,borderWidth:1,borderColor:colors.primarySoft},
  paymentSection:{gap:spacing.sm},
  customerCard:{minHeight:74,alignItems:'center',gap:spacing.sm,padding:spacing.sm,borderRadius:radius.lg,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.borderStrong},
  customerCardRequired:{borderColor:colors.warning,backgroundColor:colors.warningSoft},
  customerIcon:{width:42,height:42,borderRadius:13,alignItems:'center',justifyContent:'center',backgroundColor:colors.primarySoft},
  chevron:{color:colors.primary,fontSize:24,lineHeight:25},
  paymentMethods:{flexWrap:'wrap',gap:spacing.xs},
  paymentMethodCard:{width:'31.5%',minHeight:78,alignItems:'center',justifyContent:'center',gap:6,padding:spacing.xs,borderRadius:radius.md,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border},
  paymentMethodSelected:{borderColor:colors.primary,backgroundColor:colors.primaryFaint},
  paymentMethodIcon:{width:34,height:30,alignItems:'center',justifyContent:'center'},
  paymentMethodIconSelected:{},
  paymentMethodLabel:{textAlign:'center',color:colors.textMuted,fontWeight:'700'},
  paymentMethodLabelSelected:{color:colors.primary},
  tenderField:{minHeight:54,alignItems:'center',gap:spacing.sm,paddingHorizontal:spacing.md,borderRadius:radius.md,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.borderStrong},
  tenderInput:{flex:1,minWidth:0,fontSize:17,color:colors.text,fontWeight:'800',fontVariant:['tabular-nums'],paddingVertical:0},
  paymentSummary:{padding:spacing.md,borderRadius:radius.lg,backgroundColor:colors.primaryFaint,borderWidth:1,borderColor:colors.primarySoft,gap:spacing.sm},
  summaryRow:{alignItems:'center',justifyContent:'space-between',gap:spacing.md},
  warningCard:{padding:spacing.sm,borderRadius:radius.md,backgroundColor:colors.warningSoft,borderWidth:1,borderColor:'#F0D39B'},
  warningText:{color:'#9A620F',fontWeight:'700',lineHeight:18},
  bottomBar:{position:'absolute',left:0,right:0,bottom:0,paddingTop:spacing.sm,paddingHorizontal:spacing.md,backgroundColor:colors.surface,borderTopWidth:1,borderTopColor:colors.border,...elevation.floating},
  bottomPrimary:{minHeight:56,borderRadius:radius.md,alignItems:'center',justifyContent:'center',backgroundColor:colors.primary,paddingHorizontal:spacing.md},
  bottomPrimaryPressed:{backgroundColor:colors.primaryPressed,transform:[{scale:.995}]},
  bottomCartContent:{width:'100%',alignItems:'center',justifyContent:'space-between',gap:spacing.md},
  bottomCartLabel:{alignItems:'center',gap:spacing.sm},
  bottomNextContent:{alignItems:'center',justifyContent:'center',gap:spacing.md},
  bottomText:{color:colors.onPrimary},
  bottomArrow:{color:colors.onPrimary,fontSize:23,lineHeight:24},
  successScreen:{flexGrow:1,padding:spacing.md,paddingTop:spacing.xl,paddingBottom:spacing.xl,gap:spacing.lg,backgroundColor:colors.background},
  successHero:{alignItems:'center',gap:spacing.sm,paddingTop:spacing.md},
  successMark:{width:72,height:72,borderRadius:36,alignItems:'center',justifyContent:'center',backgroundColor:colors.positive},
  successTitle:{textAlign:'center'},
  successDescription:{textAlign:'center',maxWidth:320,lineHeight:20},
  successCard:{padding:spacing.md,gap:spacing.sm,borderRadius:radius.lg,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,...elevation.subtle},
  successInvoice:{alignItems:'center',justifyContent:'space-between',gap:spacing.md},
  documentGlyph:{width:42,height:42,borderRadius:13,alignItems:'center',justifyContent:'center',backgroundColor:colors.primarySoft},
  successDivider:{height:StyleSheet.hairlineWidth,backgroundColor:colors.border},
  successDate:{alignItems:'center',justifyContent:'space-between',gap:spacing.sm,paddingTop:spacing.xs},
  lowStockCard:{padding:spacing.md,gap:spacing.xs,borderRadius:radius.lg,backgroundColor:colors.warningSoft,borderWidth:1,borderColor:'#F0D39B'},
  lowStockHead:{alignItems:'center',gap:spacing.xs},
  warningDot:{width:8,height:8,borderRadius:4,backgroundColor:colors.warning},
  lowStockTitle:{color:'#9A620F'},
  successActions:{marginTop:'auto',gap:spacing.sm},
  successAction:{flex:1,minHeight:54,borderRadius:radius.md,alignItems:'center',justifyContent:'center',paddingHorizontal:spacing.sm,borderWidth:1},
  successActionPrimary:{backgroundColor:colors.primary,borderColor:colors.primary},
  successActionSecondary:{backgroundColor:colors.surface,borderColor:colors.primary},
  successActionPrimaryText:{color:colors.onPrimary},
  successActionSecondaryText:{color:colors.primary},
  packageGlyph:{width:27,height:25,alignItems:'center',justifyContent:'center'},
  packageBox:{width:22,height:18,borderWidth:2,borderColor:colors.primary,borderRadius:4},
  packageTop:{position:'absolute',top:4,width:22,height:2,backgroundColor:colors.primary},
  packageSeam:{position:'absolute',top:4,width:2,height:8,backgroundColor:colors.primary},
  customerGlyph:{width:25,height:24,alignItems:'center',justifyContent:'flex-end'},
  customerHead:{position:'absolute',top:1,width:9,height:9,borderRadius:5,borderWidth:2,borderColor:colors.primary},
  customerBody:{width:20,height:11,borderWidth:2,borderBottomWidth:0,borderColor:colors.primary,borderTopLeftRadius:10,borderTopRightRadius:10},
  paymentGlyph:{width:27,height:22,position:'relative'},
  paymentCard:{position:'absolute',left:1,top:2,width:25,height:18,borderWidth:2,borderColor:colors.primary,borderRadius:4},
  paymentLine:{position:'absolute',left:3,right:3,top:7,height:2,backgroundColor:colors.primary},
  paymentDot:{position:'absolute',right:5,bottom:5,width:4,height:4,borderRadius:2,backgroundColor:colors.primary},
  creditGlyph:{width:24,height:26,alignItems:'center',justifyContent:'center'},
  creditPage:{width:19,height:23,borderWidth:2,borderColor:colors.textMuted,borderRadius:3},
  creditLine:{position:'absolute',top:8,width:11,height:2,backgroundColor:colors.textMuted},
  creditLineShort:{position:'absolute',top:13,width:7,height:2,backgroundColor:colors.textMuted},
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
  cartGlyph:{width:25,height:24,position:'relative'},
  cartBasket:{position:'absolute',left:4,top:6,width:18,height:11,borderWidth:2,borderColor:colors.primary,borderTopWidth:2,borderRadius:3},
  cartHandle:{position:'absolute',left:1,top:3,width:7,height:2,backgroundColor:colors.primary,transform:[{rotate:'20deg'}]},
  cartWheel:{position:'absolute',bottom:1,width:5,height:5,borderRadius:3,backgroundColor:colors.primary},
  cartWheelLeft:{left:7},
  cartWheelRight:{right:2},
  cartStrokeLight:{borderColor:colors.onPrimary},
  cartHandleLight:{backgroundColor:colors.onPrimary},
  cartFillLight:{backgroundColor:colors.onPrimary},
});
