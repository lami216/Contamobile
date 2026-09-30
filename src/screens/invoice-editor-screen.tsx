import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type { DocumentRecord, Party, PaymentAccount, Product, Warehouse } from '@/domain/types';
import { sellingPrice, validateSaleDraft } from '@/domain/accounting';
import { getDocumentById } from '@/db/document-queries';
import { listParties, listPaymentAccounts, listProducts, listWarehouses } from '@/db/queries';
import { postPurchase, postSale } from '@/services/accounting-service';
import { reviseInvoice } from '@/services/document-revision-service';
import { PartyPicker, ProductPicker } from '@/components/pickers';
import {
  AlertCard,
  AppText,
  Button,
  EmptyState,
  FinancialSummary,
  FormField,
  FramedSection,
  GroupedList,
  InvoiceLine,
  PageHeader,
  PaymentMethodCard,
  Screen,
  SegmentedControl,
  SelectRow,
} from '@/components/ui';
import { BottomActionBar, QuantityStepper, Sheet } from '@/components/mobile-interactions';
import { PaymentGlyph, TrashGlyph } from '@/components/accounting-glyphs';
import { useI18n } from '@/i18n/provider';
import { useAuth } from '@/auth/provider';
import { colors, radius, spacing, touch } from '@/theme';

type Line={productId:string;name:string;quantity:number;unitPrice:number};
type SettlementType='payNow'|'credit';

const format=(template:string,values:Record<string,string|number>)=>Object.entries(values).reduce((output,[key,value])=>output.replaceAll('{'+key+'}',String(value)),template);

export function InvoiceEditorScreen({kind,documentId}:{kind:'sale'|'purchase';documentId?:string}){
  const db=useSQLiteContext(),{t,isRTL,errorMessage,number,money}=useI18n(),auth=useAuth();
  const [products,setProducts]=useState<Product[]>([]),[warehouses,setWarehouses]=useState<Warehouse[]>([]),[parties,setParties]=useState<Party[]>([]),[accounts,setAccounts]=useState<PaymentAccount[]>([]);
  const [warehouseId,setWarehouseId]=useState(''),[partyId,setPartyId]=useState<string|null>(null),[paymentMethod,setPaymentMethod]=useState('');
  const [lines,setLines]=useState<Line[]>([]),[original,setOriginal]=useState<DocumentRecord|null>(null);
  const [hydrated,setHydrated]=useState(!documentId),[missing,setMissing]=useState(false),[busy,setBusy]=useState(false);
  const [productPicker,setProductPicker]=useState(false),[partyPicker,setPartyPicker]=useState(false),[warehousePicker,setWarehousePicker]=useState(false);
  const [quantityLineId,setQuantityLineId]=useState<string|null>(null),[quantityDraft,setQuantityDraft]=useState('1');
  const [priceLineId,setPriceLineId]=useState<string|null>(null),[priceDraft,setPriceDraft]=useState('0');

  const capability=documentId?(kind==='sale'?'pos.edit':'purchases.edit'):(kind==='sale'?'pos.create':'purchases.create');
  const allowed=auth.has(capability);

  const load=useCallback(async()=>{
    if(!allowed)return;
    const [p,w,pa,a,doc]=await Promise.all([
      listProducts(db,'',undefined,false,500),
      listWarehouses(db),
      listParties(db,kind==='sale'?'customer':'supplier','',300,Boolean(documentId)),
      listPaymentAccounts(db,Boolean(documentId)),
      documentId?getDocumentById(db,documentId):Promise.resolve(null),
    ]);
    if(documentId&&(!doc||doc.kind!==kind||doc.status!=='posted')){setMissing(true);setHydrated(true);return}
    const visibleAccounts=documentId&&doc
      ?a.filter(account=>(account.isActive&&!account.isArchived)||account.id===doc.paymentMethod||account.code===doc.paymentMethod)
      :a.filter(account=>account.isActive&&!account.isArchived);
    const visibleParties=documentId&&doc
      ?pa.filter(party=>!party.isArchived||party.id===doc.partyId)
      :pa.filter(party=>!party.isArchived);
    setProducts(p);setWarehouses(w);setAccounts(visibleAccounts);setParties(visibleParties);
    if(doc){
      setOriginal(doc);
      setWarehouseId(doc.warehouseId??'');
      setPartyId(doc.partyId);
      setPaymentMethod(doc.paymentMethod??'note');
      setLines(doc.lines.flatMap(line=>line.productId?[{productId:String(line.productId),name:line.description,quantity:Number(line.quantity),unitPrice:Number(line.unitPrice)}]:[]));
    }else{
      const defaultWarehouse=w.find(item=>item.isSalesDefault)?.id??(kind==='purchase'?w[0]?.id??'':'');
      setWarehouseId(defaultWarehouse);
      setPaymentMethod(visibleAccounts.find(account=>account.code==='cash')?.id??visibleAccounts[0]?.id??'note');
    }
    setHydrated(true);
  },[allowed,db,documentId,kind]);

  useFocusEffect(useCallback(()=>{void load()},[load]));

  const selectedParty=parties.find(party=>party.id===partyId)??null;
  const selectedWarehouse=warehouses.find(warehouse=>warehouse.id===warehouseId)??null;
  const selectedAccount=accounts.find(account=>account.id===paymentMethod||account.code===paymentMethod)??null;
  const settlement:SettlementType=paymentMethod==='note'?'credit':'payNow';
  const total=useMemo(()=>lines.reduce((sum,line)=>sum+Math.round(line.quantity*line.unitPrice),0),[lines]);
  const totalQuantity=useMemo(()=>lines.reduce((sum,line)=>sum+line.quantity,0),[lines]);
  const quantityLine=lines.find(line=>line.productId===quantityLineId)??null;
  const priceLine=lines.find(line=>line.productId===priceLineId)??null;
  const historicalPricingMode=kind==='sale'?(original?.pricingMode??'retail'):undefined;

  const setSettlement=(next:SettlementType)=>{
    if(next==='credit'){setPaymentMethod('note');return}
    setPaymentMethod(selectedAccount?.id??accounts.find(account=>account.code==='cash')?.id??accounts[0]?.id??'');
  };

  const addProduct=(product:Product)=>{
    const unitPrice=kind==='sale'?sellingPrice(product,'retail'):Number(product.lastPurchaseCost??product.pieceCost??0);
    setLines(current=>current.some(line=>line.productId===product.id)?current:[...current,{productId:product.id,name:product.name,quantity:1,unitPrice}]);
  };
  const removeLine=(productId:string)=>setLines(current=>current.filter(line=>line.productId!==productId));
  const changeQuantity=(productId:string,value:number)=>setLines(current=>value<=0?current.filter(line=>line.productId!==productId):current.map(line=>line.productId===productId?{...line,quantity:value}:line));
  const openQuantity=(line:Line)=>{setQuantityLineId(line.productId);setQuantityDraft(String(line.quantity))};
  const saveQuantity=()=>{if(quantityLine){const value=Number(quantityDraft);if(Number.isFinite(value)&&value>0)changeQuantity(quantityLine.productId,value)}setQuantityLineId(null)};
  const openPrice=(line:Line)=>{setPriceLineId(line.productId);setPriceDraft(String(line.unitPrice))};
  const closePrice=()=>{setPriceLineId(null);setPriceDraft('0')};
  const savePrice=()=>{
    if(!priceLine)return;
    const value=Number(priceDraft);
    if(!Number.isSafeInteger(value)||value<=0){Alert.alert(t('error'),kind==='sale'?t('posInvalidTender'):t('purchasePriceRequired'));return}
    setLines(current=>current.map(line=>line.productId===priceLine.productId?{...line,unitPrice:value}:line));
    closePrice();
  };

  const persist=async()=>{
    if(!warehouseId||!lines.length||busy)return;
    if(settlement==='credit'&&!partyId){Alert.alert(kind==='sale'?t('customer'):t('supplier'),kind==='sale'?t('posCreditCustomerRequired'):t('purchaseSupplierRequired'));return}
    if(settlement==='payNow'&&!paymentMethod){Alert.alert(t('paymentMethod'),kind==='sale'?t('posPaymentMethodRequired'):t('purchasePaymentMethodRequired'));return}
    const invalid=lines.find(line=>!Number.isFinite(line.quantity)||line.quantity<=0||!Number.isSafeInteger(line.unitPrice)||line.unitPrice<=0);
    if(invalid){Alert.alert(t('error'),invalid.name);return}

    const save=async()=>{
      setBusy(true);
      try{
        const payload={
          warehouseId,
          partyId,
          paymentMethod,
          cashAmount:settlement==='credit'?0:total,
          pricingMode:historicalPricingMode,
          lines:lines.map(line=>({productId:line.productId,quantity:line.quantity,unitPrice:line.unitPrice})),
        };
        if(documentId)await reviseInvoice(db,kind,documentId,payload);
        else if(kind==='sale')await postSale(db,payload);
        else await postPurchase(db,payload);
        Alert.alert(t('success'));
        router.back();
      }catch(error){Alert.alert(t('error'),errorMessage(error))}
      finally{setBusy(false)}
    };

    if(kind==='sale'&&!documentId){
      const check=validateSaleDraft(lines.map(line=>({productId:line.productId,quantity:String(line.quantity),piecePrice:String(line.unitPrice)})),products,warehouseId);
      if(check.errors.length){
        const error=check.errors[0];
        if(error?.code==='insufficientQuantity')Alert.alert(t('error'),format(t('posInsufficientStock'),{product:error.productName,requested:number(error.requested),available:number(error.available)}));
        else Alert.alert(t('error'),error&&'productName'in error?error.productName:t('error'));
        return;
      }
      if(check.warnings.length){
        Alert.alert(t('posPriceWarningTitle'),check.warnings.map(warning=>format(t('posBelowCostWarning'),{product:warning.productName,salePrice:money(warning.salePrice),cost:money(warning.purchaseCost)})).join('\n'),[{text:t('cancel'),style:'cancel'},{text:t('confirm'),onPress:()=>void save()}]);
        return;
      }
    }else if(kind==='sale'){
      const warnings=lines.flatMap(line=>{const product=products.find(item=>item.id===line.productId),cost=Number(product?.lastPurchaseCost??0);return cost>0&&line.unitPrice<cost?[{name:line.name,price:line.unitPrice,cost}]:[]});
      if(warnings.length){
        Alert.alert(t('posPriceWarningTitle'),warnings.map(warning=>format(t('posBelowCostWarning'),{product:warning.name,salePrice:money(warning.price),cost:money(warning.cost)})).join('\n'),[{text:t('cancel'),style:'cancel'},{text:t('confirm'),onPress:()=>void save()}]);
        return;
      }
    }
    await save();
  };

  if(!allowed)return <Screen><EmptyState title={t('error')}/></Screen>;
  if(!hydrated)return <Screen><EmptyState title={t('loading')}/></Screen>;
  if(missing)return <Screen><EmptyState title={t('recordsDocumentMissing')} action={<Button title={t('cancel')} variant="ghost" onPress={()=>router.back()}/>}/></Screen>;

  const title=documentId?`${t('edit')} • ${original?.number??''}`:kind==='sale'?t('newSale'):t('purchases');
  const canChooseWarehouse=kind==='purchase';
  const availableProducts=products.filter(product=>kind==='purchase'||Number(product.stocks?.[warehouseId]??0)>0||lines.some(line=>line.productId===product.id));

  return <Screen padded={false}>
    <View style={styles.root}>
      <View style={styles.headerPad}><PageHeader title={title} subtitle={selectedWarehouse?.name} onBack={()=>router.back()}/></View>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <GroupedList>
          <SelectRow
            label={kind==='sale'?t('customer'):t('supplier')}
            value={selectedParty?.name??(kind==='sale'?t('directSale'):t('directPurchase'))}
            hint={selectedParty?.phone||undefined}
            onPress={()=>setPartyPicker(true)}
          />
          <SelectRow
            label={t('warehouse')}
            value={selectedWarehouse?.name??t('warehouse')}
            hint={kind==='sale'?t('defaultWarehouse'):undefined}
            disabled={!canChooseWarehouse}
            onPress={()=>setWarehousePicker(true)}
          />
        </GroupedList>

        <FramedSection title={kind==='sale'?t('posInvoiceLines'):t('purchaseInvoiceLines')} action={<Button compact title={t('addLine')} onPress={()=>setProductPicker(true)}/>} padded={false}>
          {lines.length?lines.map((line,index)=>{
            const product=products.find(item=>item.id===line.productId);
            const meta=[product?.categoryName,product?.sku?'#'+product.sku:null].filter(Boolean).join(' • ');
            return <InvoiceLine
              key={line.productId}
              productName={line.name}
              context={meta||undefined}
              quantityLabel={t('quantity')}
              quantityControl={<QuantityStepper compact value={line.quantity} onDecrease={()=>changeQuantity(line.productId,line.quantity-1)} onIncrease={()=>changeQuantity(line.productId,line.quantity+1)} onEdit={()=>openQuantity(line)}/>}
              unitPriceLabel={kind==='sale'?t('salePrice'):t('purchasePrice')}
              unitPrice={<Pressable accessibilityRole="button" onPress={()=>openPrice(line)} style={({pressed})=>[styles.priceButton,pressed&&styles.pressed]}><AppText variant="subheading">{money(line.unitPrice)}</AppText></Pressable>}
              lineTotalLabel={t('total')}
              lineTotal={<AppText variant="subheading" style={styles.lineMoney}>{money(Math.round(line.quantity*line.unitPrice))}</AppText>}
              actions={<Pressable accessibilityRole="button" accessibilityLabel={t('delete')} onPress={()=>removeLine(line.productId)} style={({pressed})=>[styles.deleteButton,pressed&&styles.deletePressed]}><TrashGlyph/></Pressable>}
              last={index===lines.length-1}
            />;
          }):<EmptyState title={t('posNoLinesTitle')} description={t('posNoLinesDescription')} action={<Button compact title={t('addLine')} variant="secondary" onPress={()=>setProductPicker(true)}/>}/>}
        </FramedSection>

        {lines.length?<View style={styles.summaryBlock}>
          <AppText variant="subheading">{kind==='sale'?t('posInvoiceSummary'):t('purchaseInvoiceSummary')}</AppText>
          <FinancialSummary items={[
            {label:t('posItemsCount'),value:lines.length,format:'number'},
            {label:t('posTotalQuantity'),value:totalQuantity,format:'number'},
            {label:t('total'),value:total,emphasize:true},
          ]}/>
        </View>:null}

        <FramedSection title={t('posSettlementType')} subtitle={settlement==='credit'?(kind==='sale'?t('posCreditHint'):t('purchaseCreditHint')):(kind==='sale'?t('posPayNowHint'):t('purchasePayNowHint'))}>
          <SegmentedControl value={settlement} options={[{value:'payNow',label:t('posPayNow')},{value:'credit',label:t('onCredit')}]} onChange={setSettlement}/>
        </FramedSection>

        {settlement==='payNow'?<FramedSection title={t('posPaymentAccounts')}>
          {accounts.length?<View style={[styles.paymentMethods,{flexDirection:isRTL?'row-reverse':'row'}]}>
            {accounts.map(account=><PaymentMethodCard
              key={account.id}
              label={account.name}
              selected={paymentMethod===account.id||paymentMethod===account.code}
              onPress={()=>setPaymentMethod(account.id)}
              icon={<PaymentGlyph selected={paymentMethod===account.id||paymentMethod===account.code}/>}
              style={styles.paymentMethod}
            />)}
          </View>:<AlertCard title={t('posNoPaymentAccounts')} tone="warning"/>}
        </FramedSection>:null}

        {settlement==='credit'&&!selectedParty?<AlertCard title={kind==='sale'?t('posCreditCustomerRequired'):t('purchaseSupplierRequired')} tone="warning"/>:null}
      </ScrollView>

      <BottomActionBar
        label={documentId?t('save'):kind==='sale'?t('completeSale'):t('completePurchase')}
        total={total}
        secondary={format(t('posProductsCount'),{count:lines.length})}
        loading={busy}
        disabled={!lines.length||!warehouseId||(settlement==='credit'&&!selectedParty)||(settlement==='payNow'&&!paymentMethod)}
        onPress={()=>void persist()}
      />
    </View>

    <ProductPicker visible={productPicker} products={availableProducts} exclude={lines.map(line=>line.productId)} onClose={()=>setProductPicker(false)} onSelect={addProduct}/>
    <PartyPicker
      visible={partyPicker}
      parties={parties.filter(party=>!party.isArchived||party.id===partyId)}
      directLabel={kind==='sale'?t('directSale'):t('directPurchase')}
      createLabel={kind==='sale'?t('partyNewCustomer'):t('partyNewSupplier')}
      onCreate={()=>{setPartyPicker(false);router.push({pathname:kind==='sale'?'/parties/customers':'/parties/suppliers',params:{create:'1'}})}}
      onClose={()=>setPartyPicker(false)}
      onSelect={party=>setPartyId(party?.id??null)}
    />

    <Sheet visible={warehousePicker&&canChooseWarehouse} title={t('warehouse')} onClose={()=>setWarehousePicker(false)}>
      <View style={styles.sheetButtons}>{warehouses.filter(warehouse=>!warehouse.isArchived||warehouse.id===warehouseId).map(warehouse=><Button key={warehouse.id} title={warehouse.name} variant={warehouse.id===warehouseId?'primary':'secondary'} onPress={()=>{setWarehouseId(warehouse.id);setWarehousePicker(false)}}/>)}</View>
    </Sheet>

    <Sheet visible={Boolean(quantityLineId)} title={t('quantity')} onClose={()=>setQuantityLineId(null)} footer={<Button title={t('save')} onPress={saveQuantity}/>}>
      <FormField label={t('quantity')} value={quantityDraft} onChangeText={setQuantityDraft} keyboardType="decimal-pad" autoFocus selectTextOnFocus/>
    </Sheet>
    <Sheet visible={Boolean(priceLineId)} title={kind==='sale'?t('salePrice'):t('purchasePrice')} onClose={closePrice} footer={<Button title={t('save')} onPress={savePrice}/>}>
      {priceLine?<View style={styles.priceEditor}><AppText variant="subheading">{priceLine.name}</AppText><FormField label={kind==='sale'?t('salePrice'):t('purchasePrice')} value={priceDraft} onChangeText={setPriceDraft} keyboardType="number-pad" autoFocus selectTextOnFocus/></View>:null}
    </Sheet>
  </Screen>;
}

const styles=StyleSheet.create({
  root:{flex:1,backgroundColor:colors.background},
  headerPad:{paddingHorizontal:spacing.md},
  content:{paddingHorizontal:spacing.md,paddingTop:spacing.xs,paddingBottom:112,gap:spacing.sm},
  summaryBlock:{gap:spacing.xs},
  priceButton:{minHeight:34,alignItems:'center',justifyContent:'center',paddingHorizontal:spacing.xs,borderRadius:radius.sm},
  pressed:{opacity:.68},
  lineMoney:{fontWeight:'800',fontVariant:['tabular-nums'],fontSize:16},
  deleteButton:{width:touch.min,height:touch.min,borderRadius:radius.sm,alignItems:'center',justifyContent:'center'},
  deletePressed:{backgroundColor:colors.negativeSoft},
  paymentMethods:{flexWrap:'wrap',gap:spacing.xs},
  paymentMethod:{width:'31.4%',flexGrow:0,flexBasis:'31.4%',minWidth:96},
  sheetButtons:{gap:spacing.xs},
  priceEditor:{gap:spacing.sm},
});