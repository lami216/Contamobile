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
import { AlertCard, AppHeader, AppText, Badge, Button, Card, Chip, EmptyState, Field, Money, Screen, SearchField, SectionTitle, SegmentedControl } from '@/components/ui';
import { BottomActionBar, QuantityStepper } from '@/components/mobile-interactions';
import { useI18n } from '@/i18n/provider';
import { useAuth } from '@/auth/provider';
import { colors, spacing } from '@/theme';

type Line={productId:string;name:string;quantity:string;unitPrice:string};

export function InvoiceEditorScreen({kind,documentId}:{kind:'sale'|'purchase';documentId?:string}){
  const db=useSQLiteContext(),{t,isRTL,locale,errorMessage,number}=useI18n(),auth=useAuth(),ar=locale==='ar';
  const [products,setProducts]=useState<Product[]>([]),[warehouses,setWarehouses]=useState<Warehouse[]>([]),[parties,setParties]=useState<Party[]>([]),[accounts,setAccounts]=useState<PaymentAccount[]>([]);
  const [warehouseId,setWarehouseId]=useState(''),[partyId,setPartyId]=useState<string|null>(null),[paymentMethod,setPaymentMethod]=useState(''),[pricingMode,setPricingMode]=useState<PricingMode>('retail'),[lines,setLines]=useState<Line[]>([]),[search,setSearch]=useState('');
  const [original,setOriginal]=useState<DocumentRecord|null>(null),[hydrated,setHydrated]=useState(!documentId),[missing,setMissing]=useState(false),[productPicker,setProductPicker]=useState(false),[partyPicker,setPartyPicker]=useState(false),[busy,setBusy]=useState(false);
  const capability=documentId?(kind==='sale'?'pos.edit':'purchases.edit'):(kind==='sale'?'pos.create':'purchases.create');
  const allowed=auth.has(capability);
  const load=useCallback(async()=>{
    if(!allowed)return;
    const [p,w,pa,a,doc]=await Promise.all([listProducts(db,'',undefined,false,500),listWarehouses(db),listParties(db,kind==='sale'?'customer':'supplier','',300,Boolean(documentId)),listPaymentAccounts(db,Boolean(documentId)),documentId?getDocumentById(db,documentId):Promise.resolve(null)]);
    const activeAccounts=a.filter(account=>account.isActive&&!account.isArchived),visibleAccounts=documentId&&doc?a.filter(account=>(account.isActive&&!account.isArchived)||account.id===doc.paymentMethod||account.code===doc.paymentMethod):activeAccounts;
    const visibleParties=documentId&&doc?pa.filter(party=>!party.isArchived||party.id===doc.partyId):pa.filter(party=>!party.isArchived);
    setProducts(p);setWarehouses(w);setParties(visibleParties);setAccounts(visibleAccounts);
    if(documentId){
      if(!doc||doc.kind!==kind||doc.status!=='posted'){setMissing(true);setHydrated(true);return}
      setOriginal(doc);setWarehouseId(doc.warehouseId??'');setPartyId(doc.partyId);setPaymentMethod(doc.paymentMethod??'note');setPricingMode(doc.pricingMode??'retail');setLines(doc.lines.filter(line=>line.productId).map(line=>({productId:String(line.productId),name:line.description,quantity:String(line.quantity),unitPrice:String(line.unitPrice)})));setHydrated(true);return;
    }
    setWarehouseId(current=>current||w.find(x=>x.isSalesDefault)?.id||w[0]?.id||'');setPaymentMethod(current=>current||activeAccounts.find(x=>x.code==='cash')?.id||activeAccounts[0]?.id||'');setHydrated(true);
  },[allowed,db,documentId,kind]);
  useFocusEffect(useCallback(()=>{void load()},[load]));
  const selectedParty=parties.find(p=>p.id===partyId)??null;
  const total=useMemo(()=>lines.reduce((sum,line)=>sum+Math.round(Number(line.quantity||0)*Number(line.unitPrice||0)),0),[lines]);
  const itemCount=useMemo(()=>lines.reduce((sum,line)=>sum+Number(line.quantity||0),0),[lines]);
  const filteredProducts=useMemo(()=>{
    const q=search.trim().toLocaleLowerCase();
    return products.filter(product=>!lines.some(line=>line.productId===product.id)&&(!q||`${product.name} ${product.sku} ${product.barcode}`.toLocaleLowerCase().includes(q))).slice(0,12);
  },[lines,products,search]);
  const updateLine=(productId:string,key:'quantity'|'unitPrice',value:string)=>setLines(current=>current.map(line=>line.productId===productId?{...line,[key]:value}:line));
  const removeLine=(productId:string)=>setLines(current=>current.filter(line=>line.productId!==productId));
  const addProduct=(product:Product)=>{
    setLines(current=>[...current,{productId:product.id,name:product.name,quantity:'1',unitPrice:String(kind==='sale'?sellingPrice(product,pricingMode):product.lastPurchaseCost??product.pieceCost??0)}]);
    setSearch('');
  };
  const adjustQuantity=(line:Line,delta:1|-1)=>{
    const current=Number(line.quantity||0);
    if(delta<0&&current<=1){removeLine(line.productId);return}
    const next=Math.max(.001,current+delta);
    updateLine(line.productId,'quantity',String(Number(next.toFixed(3))));
  };
  const changeMode=(mode:PricingMode)=>{setPricingMode(mode);if(kind==='sale')setLines(current=>current.map(line=>{const product=products.find(item=>item.id===line.productId);return product?{...line,unitPrice:String(sellingPrice(product,mode))}:line}))};
  const persist=async()=>{
    if(!warehouseId||!lines.length||!allowed)return;
    setBusy(true);
    try{
      const payload={warehouseId,partyId,paymentMethod,cashAmount:paymentMethod==='note'?0:total,pricingMode,lines:lines.map(line=>({productId:line.productId,quantity:Number(line.quantity),unitPrice:Number(line.unitPrice)}))};
      if(documentId)await reviseInvoice(db,kind,documentId,payload);else await (kind==='sale'?postSale:postPurchase)(db,payload);
      Alert.alert(t('success'));if(!documentId){setLines([]);setPartyId(null)}router.back();
    }catch(error){Alert.alert(t('error'),errorMessage(error))}finally{setBusy(false)}
  };
  const submit=()=>{
    if(kind==='sale'&&!documentId){
      const check=validateSaleDraft(lines.map(line=>({productId:line.productId,quantity:line.quantity,piecePrice:line.unitPrice})),products,warehouseId);
      if(check.errors.length){const e=check.errors[0];Alert.alert(t('error'),e?.code==='insufficientQuantity'?(ar?`${e.productName}: المطلوب ${e.requested} والمتوفر ${e.available}`:`${e.productName} : demandé ${e.requested}, disponible ${e.available}`):e&&'productName'in e?e.productName:t('error'));return}
      if(check.warnings.length){Alert.alert(ar?'تنبيه':'Attention',check.warnings.map(w=>ar?`${w.productName}: سعر البيع ${w.salePrice} أقل من التكلفة ${w.purchaseCost}`:`${w.productName} : prix de vente ${w.salePrice} inférieur au coût ${w.purchaseCost}`).join('\n'),[{text:t('cancel'),style:'cancel'},{text:t('confirm'),onPress:()=>void persist()}]);return}
    }
    void persist();
  };
  if(!allowed)return <Screen><EmptyState title={ar?'ليس لديك صلاحية تنفيذ هذه العملية':'Vous n’avez pas le droit d’effectuer cette opération.'}/></Screen>;
  if(!hydrated)return <Screen><EmptyState title={t('loading')}/></Screen>;
  if(missing)return <Screen><EmptyState title={ar?'الفاتورة غير موجودة أو غير قابلة للتعديل':'La facture est introuvable ou ne peut pas être modifiée.'}/><Button title={t('cancel')} variant="ghost" onPress={()=>router.back()}/></Screen>;
  const editableWarehouses=documentId&&kind==='sale'?warehouses.filter(warehouse=>warehouse.id===original?.warehouseId):warehouses;
  const currentPaymentUnavailable=documentId&&paymentMethod!=='note'&&!accounts.some(account=>account.id===paymentMethod||account.code===paymentMethod);
  const creditNeedsParty=paymentMethod==='note'&&!selectedParty;
  const title=documentId?`${t('edit')} • ${original?.number??''}`:kind==='sale'?t('newSale'):t('purchases');
  const subtitle=kind==='sale'?(ar?'أضف المنتجات ثم راجع السلة والدفع قبل الإتمام.':'Ajoutez les produits, puis vérifiez le panier et le paiement.'):(ar?'سجّل التوريد بسرعة مع بقاء التكلفة والمخزون تحت قواعد النظام الحالية.':'Saisissez la réception rapidement, sans modifier les règles de coût et de stock.');
  return <Screen padded={false}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <AppHeader eyebrow={kind==='sale'?(ar?'نقطة البيع':'Point de vente'):(ar?'التوريد':'Approvisionnement')} title={title} subtitle={subtitle} trailing={<Button compact title={t('cancel')} variant="ghost" onPress={()=>router.back()}/>}/>
      <Card style={styles.setupCard}>
        {kind==='sale'?<SegmentedControl value={pricingMode} options={[{value:'retail',label:t('retail')},{value:'wholesale',label:t('wholesale')}]} onChange={changeMode}/>:null}
        <AppText variant="caption" muted>{t('warehouse')}</AppText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.chips,{flexDirection:isRTL?'row-reverse':'row'}]}>{editableWarehouses.map(warehouse=><Chip key={warehouse.id} label={warehouse.name} active={warehouseId===warehouse.id} onPress={()=>setWarehouseId(warehouse.id)}/>)}</ScrollView>
        <View style={[styles.selectorRow,{flexDirection:isRTL?'row-reverse':'row'}]}>
          <View style={styles.selectorCopy}><AppText variant="caption" muted>{kind==='sale'?t('customer'):t('supplier')}</AppText><AppText variant="subheading" numberOfLines={1}>{selectedParty?.name??(kind==='sale'?t('directSale'):t('directPurchase'))}</AppText></View>
          <Button compact title={ar?'اختيار':'Choisir'} variant="secondary" onPress={()=>setPartyPicker(true)}/>
        </View>
      </Card>

      <SectionTitle title={ar?'إضافة المنتجات':'Ajouter des produits'} subtitle={ar?'ابحث بالاسم أو SKU أو الباركود، ثم أضف المنتج مباشرة.':'Recherchez par nom, SKU ou code-barres, puis ajoutez directement.'} action={<Button compact title={ar?'كل المنتجات':'Tous'} variant="ghost" onPress={()=>setProductPicker(true)}/>}/>
      <SearchField value={search} onChangeText={setSearch} placeholder={ar?'اسم المنتج أو SKU أو الباركود…':'Produit, SKU ou code-barres…'}/>
      <Card style={styles.productPanel}>
        {filteredProducts.length?filteredProducts.map((product,index)=>{
          const stock=Number(product.stocks?.[warehouseId]??0),price=kind==='sale'?sellingPrice(product,pricingMode):product.lastPurchaseCost??product.pieceCost??0;
          return <View key={product.id} style={[styles.productRow,{flexDirection:isRTL?'row-reverse':'row'},index===filteredProducts.length-1&&styles.lastRow]}>
            <View style={styles.productBody}>
              <View style={[styles.productNameRow,{flexDirection:isRTL?'row-reverse':'row'}]}><AppText variant="subheading" numberOfLines={1} style={styles.productName}>{product.name}</AppText>{kind==='sale'&&stock<=0?<Badge label={ar?'نفاد':'Épuisé'} tone="negative"/>:kind==='sale'&&stock<=5?<Badge label={t('lowStock')} tone="warning"/>:null}</View>
              <AppText variant="caption" muted numberOfLines={1}>{product.sku}{product.barcode?` • ${product.barcode}`:''}</AppText>
              <View style={[styles.productFacts,{flexDirection:isRTL?'row-reverse':'row'}]}><AppText variant="caption" muted>{ar?'السعر':'Prix'}: {number(Number(price))} MRU</AppText><AppText variant="caption" muted>{t('quantity')}: {number(stock)}</AppText></View>
            </View>
            <Button compact title={t('add')} disabled={kind==='sale'&&stock<=0} onPress={()=>addProduct(product)}/>
          </View>;
        }):<EmptyState title={search?t('noResults'):(ar?'كل المنتجات المحددة موجودة في السلة':'Tous les produits affichés sont déjà dans le panier')}/>}
      </Card>

      <SectionTitle title={ar?'السلة':'Panier'} subtitle={ar?`${lines.length} أصناف • الكمية ${number(itemCount)}`:`${lines.length} articles • quantité ${number(itemCount)}`}/>
      {lines.length===0?<AlertCard tone="primary" title={ar?'السلة فارغة':'Panier vide'} description={ar?'ابحث عن منتج وأضفه لتبدأ الفاتورة.':'Recherchez un produit et ajoutez-le pour commencer.'}/>:lines.map(line=>{
        const product=products.find(item=>item.id===line.productId),stock=Number(product?.stocks?.[warehouseId]??0),lineTotal=Math.round(Number(line.quantity||0)*Number(line.unitPrice||0));
        return <Card key={line.productId} style={styles.cartLine}>
          <View style={[styles.lineHead,{flexDirection:isRTL?'row-reverse':'row'}]}><View style={styles.productBody}><AppText variant="subheading">{line.name}</AppText>{kind==='sale'?<AppText variant="caption" muted>{ar?'المتوفر':'Disponible'}: {number(stock)}</AppText>:null}</View><Button compact title={t('remove')} variant="ghost" onPress={()=>removeLine(line.productId)}/></View>
          <View style={[styles.quantityRow,{flexDirection:isRTL?'row-reverse':'row'}]}><QuantityStepper value={Number(line.quantity||0)} onDecrease={()=>adjustQuantity(line,-1)} onIncrease={()=>adjustQuantity(line,1)}/><Field label={t('quantity')} value={line.quantity} keyboardType="decimal-pad" onChangeText={value=>updateLine(line.productId,'quantity',value)} containerStyle={styles.quantityField}/></View>
          <View style={[styles.priceRow,{flexDirection:isRTL?'row-reverse':'row'}]}><Field label={kind==='sale'?t('salePrice'):t('purchasePrice')} value={line.unitPrice} keyboardType="number-pad" onChangeText={value=>updateLine(line.productId,'unitPrice',value)} containerStyle={styles.priceField}/><View style={styles.lineTotal}><AppText variant="caption" muted>{t('total')}</AppText><Money value={lineTotal}/></View></View>
        </Card>;
      })}

      <SectionTitle title={t('paymentMethod')}/>
      <Card>
        {currentPaymentUnavailable?<AlertCard title={ar?'وسيلة الدفع الأصلية غير متاحة':'Moyen de paiement indisponible'} description={ar?'اختر وسيلة دفع نشطة قبل حفظ التعديل.':'Choisissez un moyen actif avant d’enregistrer.'}/>:null}
        <View style={[styles.chips,{flexDirection:isRTL?'row-reverse':'row'}]}>{accounts.map(account=><Chip key={account.id} label={account.name} active={paymentMethod===account.id||paymentMethod===account.code} onPress={()=>setPaymentMethod(account.id)}/>) }<Chip label={t('onCredit')} active={paymentMethod==='note'} onPress={()=>setPaymentMethod('note')}/></View>
        {creditNeedsParty?<AlertCard title={ar?'البيع الآجل يحتاج طرفاً':'Le crédit nécessite un tiers'} description={kind==='sale'?(ar?'اختر العميل قبل إتمام البيع الآجل.':'Choisissez le client avant de finaliser la vente à crédit.'):(ar?'اختر المورد قبل إتمام الشراء الآجل.':'Choisissez le fournisseur avant de finaliser l’achat à crédit.')}/>:null}
        {paymentMethod!=='note'&&!documentId?<AppText variant="caption" muted>{ar?'الفاتورة النقدية تُسجل مدفوعة بالكامل. للدفع الجزئي احفظها آجلة ثم سجّل الدفعة من حساب الطرف.':'Une facture comptant est enregistrée comme entièrement payée. Pour un paiement partiel, enregistrez-la à crédit puis saisissez le paiement depuis le compte du tiers.'}</AppText>:null}
        {paymentMethod!=='note'&&documentId?<AppText variant="caption" muted>{ar?'عند تعديل الفاتورة المدفوعة يعاد تسجيلها كفاتورة مدفوعة بالكامل، مطابقًا للسلوك الحالي.':'Lors de la modification d’une facture payée, elle est réenregistrée comme entièrement payée, selon le comportement actuel.'}</AppText>:null}
        <View style={[styles.total,{flexDirection:isRTL?'row-reverse':'row'}]}><AppText variant="heading">{t('total')}</AppText><Money value={total} large/></View>
      </Card>
    </ScrollView>
    <BottomActionBar label={documentId?t('save'):kind==='sale'?t('completeSale'):t('completePurchase')} total={total} count={lines.length} secondary={ar?'أصناف':'articles'} loading={busy} disabled={!lines.length||!warehouseId||Boolean(currentPaymentUnavailable)||creditNeedsParty} onPress={submit}/>
    <ProductPicker visible={productPicker} products={products} exclude={lines.map(line=>line.productId)} onClose={()=>setProductPicker(false)} onSelect={addProduct}/>
    <PartyPicker visible={partyPicker} parties={parties.filter(party=>!party.isArchived)} directLabel={kind==='sale'?t('directSale'):t('directPurchase')} onClose={()=>setPartyPicker(false)} onSelect={party=>setPartyId(party?.id??null)}/>
  </Screen>;
}

const styles=StyleSheet.create({
  content:{padding:spacing.md,gap:spacing.md,paddingBottom:spacing.xxl,backgroundColor:colors.background},
  setupCard:{gap:spacing.md},
  chips:{gap:spacing.xs,flexWrap:'wrap'},
  selectorRow:{minHeight:64,alignItems:'center',gap:spacing.md,paddingTop:spacing.xs,borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:colors.border},
  selectorCopy:{flex:1,gap:spacing.xxs},
  productPanel:{paddingVertical:0,overflow:'hidden'},
  productRow:{minHeight:78,alignItems:'center',gap:spacing.md,paddingVertical:spacing.sm,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border},
  lastRow:{borderBottomWidth:0},
  productBody:{flex:1,gap:spacing.xs},
  productNameRow:{alignItems:'center',gap:spacing.xs},
  productName:{flexShrink:1},
  productFacts:{gap:spacing.md,flexWrap:'wrap'},
  cartLine:{gap:spacing.md,borderColor:colors.primarySoft},
  lineHead:{alignItems:'flex-start',justifyContent:'space-between',gap:spacing.md},
  quantityRow:{alignItems:'flex-end',gap:spacing.sm},
  quantityField:{flex:1},
  priceRow:{alignItems:'flex-end',gap:spacing.sm},
  priceField:{flex:1},
  lineTotal:{minWidth:110,alignItems:'flex-end',gap:spacing.xs,paddingBottom:spacing.xs},
  total:{alignItems:'center',justifyContent:'space-between',paddingTop:spacing.sm,borderTopWidth:1,borderTopColor:colors.border},
});
