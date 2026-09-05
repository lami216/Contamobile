import { useCallback, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type { DocumentRecord, Party, PaymentAccount, PricingMode, Product, Warehouse } from '@/domain/types';
import { sellingPrice, validateSaleDraft } from '@/domain/accounting';
import { getDocumentById } from '@/db/document-queries';
import { listParties, listPaymentAccounts, listProducts, listWarehouses } from '@/db/queries';
import { postPurchase, postSale } from '@/services/accounting-service';
import { reviseInvoice } from '@/services/document-revision-service';
import { ProductPicker, PartyPicker } from '@/components/pickers';
import { AppText, Button, Card, Chip, EmptyState, Field, Money, Screen, SectionTitle } from '@/components/ui';
import { useI18n } from '@/i18n/provider';
import { useAuth } from '@/auth/provider';
import { colors, spacing } from '@/theme';

type Line={productId:string;name:string;quantity:string;unitPrice:string};

export function InvoiceEditorScreen({kind,documentId}:{kind:'sale'|'purchase';documentId?:string}){
  const db=useSQLiteContext(),{t,isRTL}=useI18n(),auth=useAuth();
  const [products,setProducts]=useState<Product[]>([]),[warehouses,setWarehouses]=useState<Warehouse[]>([]),[parties,setParties]=useState<Party[]>([]),[accounts,setAccounts]=useState<PaymentAccount[]>([]);
  const [warehouseId,setWarehouseId]=useState(''),[partyId,setPartyId]=useState<string|null>(null),[paymentMethod,setPaymentMethod]=useState(''),[cash,setCash]=useState(''),[pricingMode,setPricingMode]=useState<PricingMode>('retail'),[lines,setLines]=useState<Line[]>([]);
  const [original,setOriginal]=useState<DocumentRecord|null>(null),[hydrated,setHydrated]=useState(!documentId),[missing,setMissing]=useState(false),[productPicker,setProductPicker]=useState(false),[partyPicker,setPartyPicker]=useState(false),[busy,setBusy]=useState(false);
  const capability=documentId?(kind==='sale'?'pos.edit':'purchases.edit'):(kind==='sale'?'pos.create':'purchases.create');
  const allowed=auth.has(capability);
  const load=useCallback(async()=>{
    if(!allowed)return;
    const [p,w,pa,a,doc]=await Promise.all([listProducts(db,'',undefined,false,500),listWarehouses(db),listParties(db,kind==='sale'?'customer':'supplier','',300),listPaymentAccounts(db),documentId?getDocumentById(db,documentId):Promise.resolve(null)]);
    setProducts(p);setWarehouses(w);setParties(pa);setAccounts(a);
    if(documentId){
      if(!doc||doc.kind!==kind||doc.status!=='posted'){setMissing(true);setHydrated(true);return}
      setOriginal(doc);setWarehouseId(doc.warehouseId??'');setPartyId(doc.partyId);setPaymentMethod(doc.paymentMethod??'note');setCash(String(doc.cashAmount));setPricingMode(doc.pricingMode??'retail');setLines(doc.lines.filter(line=>line.productId).map(line=>({productId:String(line.productId),name:line.description,quantity:String(line.quantity),unitPrice:String(line.unitPrice)})));setHydrated(true);return;
    }
    setWarehouseId(current=>current||w.find(x=>x.isSalesDefault)?.id||w[0]?.id||'');setPaymentMethod(current=>current||a.find(x=>x.code==='cash')?.id||a[0]?.id||'');setHydrated(true);
  },[allowed,db,documentId,kind]);
  useFocusEffect(useCallback(()=>{void load()},[load]));
  const selectedParty=parties.find(p=>p.id===partyId)??null;
  const total=useMemo(()=>lines.reduce((sum,line)=>sum+Math.round(Number(line.quantity||0)*Number(line.unitPrice||0)),0),[lines]);
  const updateLine=(productId:string,key:'quantity'|'unitPrice',value:string)=>setLines(current=>current.map(line=>line.productId===productId?{...line,[key]:value}:line));
  const changeMode=(mode:PricingMode)=>{setPricingMode(mode);if(kind==='sale')setLines(current=>current.map(line=>{const p=products.find(product=>product.id===line.productId);return p?{...line,unitPrice:String(sellingPrice(p,mode))}:line}))};
  const persist=async()=>{
    if(!warehouseId||!lines.length||!allowed)return;
    setBusy(true);
    try{
      const payload={warehouseId,partyId,paymentMethod,cashAmount:paymentMethod==='note'?0:Number(cash.trim()===''?total:cash),pricingMode,lines:lines.map(line=>({productId:line.productId,quantity:Number(line.quantity),unitPrice:Number(line.unitPrice)}))};
      if(documentId)await reviseInvoice(db,kind,documentId,payload);else await (kind==='sale'?postSale:postPurchase)(db,payload);
      Alert.alert(t('success'));if(!documentId){setLines([]);setPartyId(null);setCash('')}router.back();
    }catch(error){Alert.alert(t('error'),error instanceof Error?error.message:t('error'))}finally{setBusy(false)}
  };
  const submit=()=>{
    if(kind==='sale'&&!documentId){const check=validateSaleDraft(lines.map(line=>({productId:line.productId,quantity:line.quantity,piecePrice:line.unitPrice})),products,warehouseId);if(check.errors.length){const e=check.errors[0];Alert.alert(t('error'),e?.code==='insufficientQuantity'?`${e.productName}: ${e.requested} > ${e.available}`:e&&'productName'in e?e.productName:t('error'));return}if(check.warnings.length){Alert.alert('تنبيه',check.warnings.map(w=>`${w.productName}: ${w.salePrice} < ${w.purchaseCost}`).join('\n'),[{text:t('cancel'),style:'cancel'},{text:t('confirm'),onPress:()=>void persist()}]);return}}
    void persist();
  };
  if(!allowed)return <Screen><EmptyState title="ليس لديك صلاحية تنفيذ هذه العملية"/></Screen>;
  if(!hydrated)return <Screen><EmptyState title={t('loading')}/></Screen>;
  if(missing)return <Screen><EmptyState title="الفاتورة غير موجودة أو غير قابلة للتعديل"/><Button title={t('cancel')} variant="ghost" onPress={()=>router.back()}/></Screen>;
  const editableWarehouses=documentId&&kind==='sale'?warehouses.filter(w=>w.id===original?.warehouseId):warehouses;
  return <Screen padded={false}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
    <SectionTitle title={documentId?`${t('edit')} • ${original?.number??''}`:kind==='sale'?t('newSale'):t('purchases')}/>
    <Card><AppText variant="caption" muted>{t('warehouse')}</AppText><View style={styles.chips}>{editableWarehouses.map(w=><Chip key={w.id} label={w.name} active={warehouseId===w.id} onPress={()=>setWarehouseId(w.id)}/>)}</View>{kind==='sale'?<><AppText variant="caption" muted>{t('price')}</AppText><View style={styles.chips}><Chip label={t('retail')} active={pricingMode==='retail'} onPress={()=>changeMode('retail')}/><Chip label={t('wholesale')} active={pricingMode==='wholesale'} onPress={()=>changeMode('wholesale')}/></View></>:null}<Button title={selectedParty?.name??(kind==='sale'?t('directSale'):t('directPurchase'))} variant="secondary" onPress={()=>setPartyPicker(true)}/></Card>
    <SectionTitle title={t('products')} action={<Button title={t('addLine')} onPress={()=>setProductPicker(true)}/>}/>
    {lines.length===0?<Card><AppText muted>{t('noData')}</AppText></Card>:lines.map(line=><Card key={line.productId}><View style={[styles.lineHead,{flexDirection:isRTL?'row-reverse':'row'}]}><AppText variant="subheading">{line.name}</AppText><Button title={t('remove')} variant="ghost" onPress={()=>setLines(current=>current.filter(x=>x.productId!==line.productId))}/></View><View style={[styles.pair,{flexDirection:isRTL?'row-reverse':'row'}]}><View style={styles.flex}><Field label={t('quantity')} value={line.quantity} keyboardType="decimal-pad" onChangeText={value=>updateLine(line.productId,'quantity',value)}/></View><View style={styles.flex}><Field label={kind==='sale'?t('salePrice'):t('purchasePrice')} value={line.unitPrice} keyboardType="number-pad" onChangeText={value=>updateLine(line.productId,'unitPrice',value)}/></View></View><Money value={Math.round(Number(line.quantity||0)*Number(line.unitPrice||0))}/></Card>)}
    <Card><SectionTitle title={t('paymentMethod')}/><View style={styles.chips}>{accounts.map(a=><Chip key={a.id} label={a.name} active={paymentMethod===a.id||paymentMethod===a.code} onPress={()=>setPaymentMethod(a.id)}/>) }<Chip label={t('onCredit')} active={paymentMethod==='note'} onPress={()=>{setPaymentMethod('note');setCash('0')}}/></View>{paymentMethod!=='note'&&!documentId?<Field label={t('paid')} value={cash} onChangeText={setCash} keyboardType="number-pad" placeholder={String(total)}/>:null}{paymentMethod!=='note'&&documentId?<AppText variant="caption" muted>عند تعديل الفاتورة المدفوعة يعاد تسجيلها كفاتورة مدفوعة بالكامل، مطابقًا لسلوك نسخة الكمبيوتر.</AppText>:null}<View style={[styles.total,{flexDirection:isRTL?'row-reverse':'row'}]}><AppText variant="heading">{t('total')}</AppText><Money value={total}/></View></Card>
    <Button loading={busy} disabled={!lines.length||!warehouseId} title={documentId?t('save'):kind==='sale'?t('completeSale'):t('completePurchase')} onPress={submit}/><Button title={t('cancel')} variant="ghost" onPress={()=>router.back()}/>
  </ScrollView><ProductPicker visible={productPicker} products={products} exclude={lines.map(l=>l.productId)} onClose={()=>setProductPicker(false)} onSelect={p=>setLines(current=>[...current,{productId:p.id,name:p.name,quantity:'1',unitPrice:String(kind==='sale'?sellingPrice(p,pricingMode):p.lastPurchaseCost??p.pieceCost??0)}])}/><PartyPicker visible={partyPicker} parties={parties} directLabel={kind==='sale'?t('directSale'):t('directPurchase')} onClose={()=>setPartyPicker(false)} onSelect={p=>setPartyId(p?.id??null)}/></Screen>;
}
const styles=StyleSheet.create({content:{padding:spacing.md,gap:spacing.md,paddingBottom:spacing.xxl,backgroundColor:colors.background},chips:{flexDirection:'row',flexWrap:'wrap',gap:spacing.xs},lineHead:{alignItems:'center',justifyContent:'space-between'},pair:{gap:spacing.sm},flex:{flex:1},total:{alignItems:'center',justifyContent:'space-between'}});
