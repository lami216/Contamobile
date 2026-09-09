import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type { Party, PaymentAccount, Product, Warehouse } from '@/domain/types';
import { listParties, listPaymentAccounts, listProducts, listWarehouses } from '@/db/queries';
import { postPurchase } from '@/services/accounting-service';
import { PartyPicker } from '@/components/pickers';
import { AppText, Button, Card, Chip, EmptyState, Field, Money, Screen, SearchField, SectionTitle } from '@/components/ui';
import { BottomActionBar, QuantityStepper, Sheet } from '@/components/mobile-interactions';
import { useI18n } from '@/i18n/provider';
import { useAuth } from '@/auth/provider';
import { colors, radius, spacing, touch } from '@/theme';

type Line={product:Product;quantity:number;unitPrice:number};

export function PurchaseScreen(){
  const db=useSQLiteContext(),{t,locale,isRTL,number,errorMessage}=useI18n(),auth=useAuth(),ar=locale==='ar';
  const allowed=auth.has('purchases.create');
  const [warehouses,setWarehouses]=useState<Warehouse[]>([]),[warehouseId,setWarehouseId]=useState(''),[accounts,setAccounts]=useState<PaymentAccount[]>([]),[suppliers,setSuppliers]=useState<Party[]>([]);
  const [results,setResults]=useState<Product[]>([]),[search,setSearch]=useState(''),[lines,setLines]=useState<Line[]>([]),[loading,setLoading]=useState(true),[searching,setSearching]=useState(false);
  const [supplierId,setSupplierId]=useState<string|null>(null),[supplierPicker,setSupplierPicker]=useState(false),[paymentOpen,setPaymentOpen]=useState(false),[paymentMethod,setPaymentMethod]=useState(''),[tender,setTender]=useState(''),[busy,setBusy]=useState(false),[successTotal,setSuccessTotal]=useState<number|null>(null);
  const [quantityLineId,setQuantityLineId]=useState<string|null>(null),[quantityDraft,setQuantityDraft]=useState('1'),[priceLineId,setPriceLineId]=useState<string|null>(null),[priceDraft,setPriceDraft]=useState('0');

  const loadBase=useCallback(async()=>{
    if(!allowed)return;
    setLoading(true);
    try{
      const [w,a,s]=await Promise.all([listWarehouses(db),listPaymentAccounts(db),listParties(db,'supplier','',300)]);
      const active=a.filter(item=>item.isActive&&!item.isArchived);
      setWarehouses(w);setAccounts(active);setSuppliers(s);
      setWarehouseId(current=>current||w.find(item=>item.isSalesDefault)?.id||w[0]?.id||'');
      setPaymentMethod(current=>current||active.find(item=>item.code==='cash')?.id||active[0]?.id||'note');
    }catch(error){Alert.alert(t('error'),errorMessage(error))}finally{setLoading(false)}
  },[allowed,db,errorMessage,t]);
  useFocusEffect(useCallback(()=>{void loadBase()},[loadBase]));

  useEffect(()=>{
    if(!allowed)return;
    let cancelled=false;
    const timer=setTimeout(()=>{
      setSearching(true);
      void listProducts(db,search,undefined,false,search.trim()?40:18).then(rows=>{if(!cancelled)setResults(rows)}).catch(error=>{if(!cancelled)Alert.alert(t('error'),errorMessage(error))}).finally(()=>{if(!cancelled)setSearching(false)});
    },search.trim()?140:0);
    return()=>{cancelled=true;clearTimeout(timer)};
  },[allowed,db,errorMessage,search,t]);

  const total=useMemo(()=>lines.reduce((sum,line)=>sum+Math.round(line.quantity*line.unitPrice),0),[lines]);
  const itemCount=useMemo(()=>lines.reduce((sum,line)=>sum+line.quantity,0),[lines]);
  const supplier=suppliers.find(item=>item.id===supplierId)??null;
  const warehouse=warehouses.find(item=>item.id===warehouseId)??null;
  const tenderValue=paymentMethod==='note'?0:Number(tender.trim()===''?total:tender),normalized=Number.isFinite(tenderValue)&&tenderValue>0?tenderValue:0,paid=Math.min(total,normalized),due=Math.max(total-paid,0),needsSupplier=due>0;

  const addProduct=(product:Product)=>setLines(current=>{
    const existing=current.find(line=>line.product.id===product.id);
    if(existing)return current.map(line=>line.product.id===product.id?{...line,quantity:line.quantity+1}:line);
    const cost=Number(product.lastPurchaseCost??product.pieceCost??0);
    return [{product,quantity:1,unitPrice:cost},...current];
  });
  const changeQuantity=(id:string,value:number)=>setLines(current=>value<=0?current.filter(line=>line.product.id!==id):current.map(line=>line.product.id===id?{...line,quantity:value}:line));
  const openQuantity=(line:Line)=>{setQuantityLineId(line.product.id);setQuantityDraft(String(line.quantity))};
  const saveQuantity=()=>{if(quantityLineId){const value=Number(quantityDraft);if(Number.isFinite(value)&&value>0)changeQuantity(quantityLineId,value)}setQuantityLineId(null)};
  const openPrice=(line:Line)=>{setPriceLineId(line.product.id);setPriceDraft(String(line.unitPrice))};
  const savePrice=()=>{if(priceLineId){const value=Number(priceDraft);if(Number.isFinite(value)&&value>=0)setLines(current=>current.map(line=>line.product.id===priceLineId?{...line,unitPrice:value}:line))}setPriceLineId(null)};
  const startPayment=()=>{if(!lines.length||!warehouseId)return;const invalid=lines.find(line=>!Number.isFinite(line.quantity)||line.quantity<=0||!Number.isFinite(line.unitPrice)||line.unitPrice<0);if(invalid){Alert.alert(t('error'),ar?`${invalid.product.name}: تحقق من الكمية والسعر.`:`${invalid.product.name} : vérifiez quantité et prix.`);return}setTender(String(total));setPaymentOpen(true)};
  const complete=async()=>{
    if(!lines.length||!warehouseId||busy)return;
    if(paymentMethod!=='note'&&(!Number.isFinite(tenderValue)||tenderValue<0)){Alert.alert(t('error'),ar?'أدخل مبلغًا صحيحًا.':'Saisissez un montant valide.');return}
    if(needsSupplier&&!supplierId){Alert.alert(t('supplier'),ar?'اختر المورد لأن هناك مبلغًا متبقيًا.':'Choisissez le fournisseur car un montant reste dû.');return}
    setBusy(true);
    try{
      await postPurchase(db,{warehouseId,partyId:supplierId,paymentMethod,cashAmount:paid,lines:lines.map(line=>({productId:line.product.id,quantity:line.quantity,unitPrice:line.unitPrice}))});
      const done=total;setLines([]);setSupplierId(null);setTender('');setPaymentOpen(false);setSearch('');setSuccessTotal(done);
      setResults(await listProducts(db,'',undefined,false,18));
    }catch(error){Alert.alert(t('error'),errorMessage(error))}finally{setBusy(false)}
  };

  if(!allowed)return <Screen><EmptyState title={ar?'ليس لديك صلاحية تسجيل المشتريات':'Vous n’avez pas le droit d’enregistrer des achats.'}/></Screen>;
  if(loading)return <Screen><EmptyState title={t('loading')}/></Screen>;
  return <Screen padded={false}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <View style={[styles.top,{flexDirection:isRTL?'row-reverse':'row'}]}><View style={styles.flex}><AppText variant="title">{t('purchases')}</AppText><AppText variant="caption" muted>{warehouse?.name??t('warehouse')}</AppText></View><Button compact title={supplier?.name??t('supplier')} variant={supplier?'secondary':'ghost'} onPress={()=>setSupplierPicker(true)}/></View>
      {warehouses.length>1?<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.chips,{flexDirection:isRTL?'row-reverse':'row'}]}>{warehouses.map(item=><Chip key={item.id} label={item.name} active={warehouseId===item.id} disabled={lines.length>0&&warehouseId!==item.id} onPress={()=>setWarehouseId(item.id)}/>)}</ScrollView>:null}
      <SearchField value={search} onChangeText={setSearch} placeholder={ar?'ابحث عن المنتج بالاسم أو الباركود…':'Produit par nom ou code-barres…'}/>

      {search.trim()?<View style={styles.resultSection}><SectionTitle title={ar?'نتائج المنتجات':'Produits'} subtitle={searching?(ar?'جارٍ البحث…':'Recherche…'):undefined}/><View style={styles.panel}>{results.slice(0,12).map((product,index)=><Pressable key={product.id} accessibilityRole="button" onPress={()=>{addProduct(product);setSearch('')}} style={({pressed})=>[styles.productRow,{flexDirection:isRTL?'row-reverse':'row'},pressed&&styles.rowPressed,index===Math.min(results.length,12)-1&&styles.lastRow]}><View style={styles.flex}><AppText variant="subheading" numberOfLines={1}>{product.name}</AppText><AppText variant="caption" muted>{product.sku}{product.barcode?` • ${product.barcode}`:''}</AppText></View><View style={styles.productEnd}><Money value={Number(product.lastPurchaseCost??product.pieceCost??0)}/><View style={styles.addButton}><AppText variant="heading" style={styles.plusText}>+</AppText></View></View></Pressable>)}</View></View>:null}

      <SectionTitle title={ar?`الفاتورة · ${lines.length}`:`Facture · ${lines.length}`} subtitle={lines.length?(ar?'الكمية والسعر قابلان للتعديل مباشرة.':'Quantité et prix se modifient directement.'):undefined}/>
      {lines.length===0?<Card tone="muted"><EmptyState title={ar?'أضف أول منتج':'Ajoutez un premier produit'} description={ar?'ابحث عن المنتج واضغط عليه لإضافته للفاتورة.':'Recherchez puis touchez le produit pour l’ajouter.'}/></Card>:<View style={styles.invoicePanel}>{lines.map((line,index)=><View key={line.product.id} style={[styles.invoiceLine,index===lines.length-1&&styles.lastRow]}><View style={[styles.lineHead,{flexDirection:isRTL?'row-reverse':'row'}]}><AppText variant="subheading" numberOfLines={2} style={styles.flex}>{line.product.name}</AppText><Money value={Math.round(line.quantity*line.unitPrice)}/></View><View style={[styles.controls,{flexDirection:isRTL?'row-reverse':'row'}]}><QuantityStepper value={line.quantity} onDecrease={()=>changeQuantity(line.product.id,line.quantity-1)} onIncrease={()=>changeQuantity(line.product.id,line.quantity+1)} onEdit={()=>openQuantity(line)}/><Pressable accessibilityRole="button" onPress={()=>openPrice(line)} style={({pressed})=>[styles.priceButton,pressed&&styles.pricePressed]}><AppText variant="caption" muted>{t('purchasePrice')}</AppText><Money value={line.unitPrice}/><AppText variant="caption" style={styles.editHint}>{t('edit')}</AppText></Pressable></View></View>)}</View>}

      {!search.trim()?<View style={styles.quick}><SectionTitle title={ar?'إضافة سريعة':'Ajout rapide'} subtitle={ar?'آخر المنتجات المتاحة للإضافة':'Produits disponibles à ajouter rapidement'}/><View style={styles.grid}>{results.slice(0,10).map(product=><Pressable key={product.id} onPress={()=>addProduct(product)} style={({pressed})=>[styles.quickProduct,pressed&&styles.quickPressed]}><View style={styles.quickRule}/><AppText variant="subheading" numberOfLines={2}>{product.name}</AppText><Money value={Number(product.lastPurchaseCost??product.pieceCost??0)}/><AppText variant="caption" muted>{ar?'اضغط للإضافة':'Touchez pour ajouter'}</AppText></Pressable>)}</View></View>:null}
    </ScrollView>
    <BottomActionBar label={ar?'متابعة الدفع':'Continuer'} total={total} count={itemCount} secondary={ar?'قطعة':'articles'} onPress={startPayment} disabled={!lines.length}/>

    <Sheet visible={paymentOpen} title={ar?'دفع فاتورة الشراء':'Paiement de l’achat'} onClose={()=>{if(!busy)setPaymentOpen(false)}} footer={<><Button title={ar?`تأكيد الشراء · ${number(total)}`:`Confirmer · ${number(total)}`} loading={busy} disabled={needsSupplier&&!supplier} onPress={()=>void complete()}/><Button title={t('cancel')} variant="ghost" disabled={busy} onPress={()=>setPaymentOpen(false)}/></>}><Card tone="primary"><View style={[styles.totalRow,{flexDirection:isRTL?'row-reverse':'row'}]}><AppText variant="subheading">{t('total')}</AppText><Money value={total} large/></View></Card><View style={styles.paymentBlock}><AppText variant="caption" muted>{t('paymentMethod')}</AppText><View style={[styles.chips,{flexDirection:isRTL?'row-reverse':'row'}]}>{accounts.map(account=><Chip key={account.id} label={account.name} active={paymentMethod===account.id||paymentMethod===account.code} onPress={()=>{setPaymentMethod(account.id);setTender(String(total))}}/>)}<Chip label={t('onCredit')} active={paymentMethod==='note'} onPress={()=>{setPaymentMethod('note');setTender('0')}}/></View></View>{paymentMethod!=='note'?<Field label={ar?'المبلغ المدفوع':'Montant payé'} value={tender} onChangeText={setTender} keyboardType="number-pad" selectTextOnFocus/>:null}<View style={[styles.summary,{flexDirection:isRTL?'row-reverse':'row'}]}><View><AppText variant="caption" muted>{t('paid')}</AppText><Money value={paid} tone="positive"/></View><View><AppText variant="caption" muted>{t('due')}</AppText><Money value={due} tone={due>0?'negative':'normal'}/></View></View><Button title={supplier?.name??(needsSupplier?(ar?'اختر المورد — مطلوب':'Choisir le fournisseur — requis'):(ar?'شراء مباشر':'Achat direct'))} variant={needsSupplier&&!supplier?'secondary':'ghost'} onPress={()=>setSupplierPicker(true)}/>{needsSupplier&&!supplier?<Card tone="warning"><AppText variant="caption" style={styles.warning}>{ar?'هناك مبلغ متبقٍ؛ اختر المورد قبل التأكيد.':'Un montant reste dû ; choisissez le fournisseur.'}</AppText></Card>:null}</Sheet>
    <PartyPicker visible={supplierPicker} parties={suppliers} directLabel={ar?'شراء مباشر':'Achat direct'} onClose={()=>setSupplierPicker(false)} onSelect={party=>setSupplierId(party?.id??null)}/>
    <Sheet visible={Boolean(quantityLineId)} title={ar?'تعديل الكمية':'Modifier la quantité'} onClose={()=>setQuantityLineId(null)} footer={<Button title={t('save')} onPress={saveQuantity}/>}><Field label={t('quantity')} value={quantityDraft} onChangeText={setQuantityDraft} keyboardType="decimal-pad" autoFocus selectTextOnFocus/></Sheet>
    <Sheet visible={Boolean(priceLineId)} title={ar?'سعر الشراء':'Prix d’achat'} onClose={()=>setPriceLineId(null)} footer={<Button title={t('save')} onPress={savePrice}/>}><Field label={t('purchasePrice')} value={priceDraft} onChangeText={setPriceDraft} keyboardType="number-pad" autoFocus selectTextOnFocus/></Sheet>
    <Sheet visible={successTotal!==null} title={t('success')} onClose={()=>setSuccessTotal(null)} footer={<><Button title={ar?'شراء جديد':'Nouvel achat'} onPress={()=>setSuccessTotal(null)}/>{auth.has('records.view')?<Button title={t('records')} variant="secondary" onPress={()=>{setSuccessTotal(null);router.push('/sales/records')}}/>:null}</>}><View style={styles.success}><View style={styles.successMark}><AppText variant="title" style={styles.successCheck}>✓</AppText></View><AppText variant="subheading">{ar?'تم تحديث المخزون وتسجيل الفاتورة والدفع.':'Stock, facture et paiement sont enregistrés.'}</AppText>{successTotal!==null?<Money value={successTotal} large/>:null}</View></Sheet>
  </Screen>;
}

const styles=StyleSheet.create({
  content:{padding:spacing.md,gap:spacing.md,paddingBottom:spacing.xxl,backgroundColor:colors.background},
  top:{alignItems:'center',gap:spacing.md},
  flex:{flex:1},
  chips:{gap:spacing.xs,flexWrap:'wrap'},
  resultSection:{gap:spacing.sm},
  panel:{backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,overflow:'hidden'},
  productRow:{minHeight:68,alignItems:'center',gap:spacing.md,paddingHorizontal:spacing.md,paddingVertical:spacing.sm,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border},
  productEnd:{alignItems:'flex-end',gap:spacing.xs},
  addButton:{width:touch.min,height:touch.min,borderRadius:radius.sm,backgroundColor:colors.primarySoft,alignItems:'center',justifyContent:'center'},
  plusText:{color:colors.primary,lineHeight:24},
  rowPressed:{backgroundColor:colors.surfaceMuted},
  lastRow:{borderBottomWidth:0},
  invoicePanel:{backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,overflow:'hidden'},
  invoiceLine:{padding:spacing.md,gap:spacing.md,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border},
  lineHead:{alignItems:'flex-start',gap:spacing.md},
  controls:{alignItems:'center',justifyContent:'space-between',gap:spacing.md},
  priceButton:{minWidth:112,padding:spacing.sm,borderRadius:radius.md,backgroundColor:colors.surfaceMuted,borderWidth:1,borderColor:colors.border,alignItems:'flex-end',gap:spacing.xxs},
  pricePressed:{backgroundColor:colors.surfaceStrong},
  editHint:{color:colors.primary,fontWeight:'700'},
  quick:{gap:spacing.sm},
  grid:{flexDirection:'row',flexWrap:'wrap',gap:spacing.sm},
  quickProduct:{width:'48%',minHeight:116,borderRadius:radius.md,backgroundColor:colors.surface,padding:spacing.md,gap:spacing.xs,borderWidth:1,borderColor:colors.border},
  quickRule:{width:24,height:2,borderRadius:2,backgroundColor:colors.accent,marginBottom:spacing.xxs},
  quickPressed:{backgroundColor:colors.primaryFaint,borderColor:colors.primarySoft},
  totalRow:{alignItems:'center',justifyContent:'space-between',gap:spacing.md},
  paymentBlock:{gap:spacing.sm},
  summary:{gap:spacing.xl},
  warning:{color:colors.warning,fontWeight:'700'},
  success:{alignItems:'center',gap:spacing.md,paddingVertical:spacing.md},
  successMark:{width:64,height:64,borderRadius:radius.lg,backgroundColor:colors.positiveSoft,borderWidth:1,borderColor:'#D3E7DA',alignItems:'center',justifyContent:'center'},
  successCheck:{color:colors.positive},
});
