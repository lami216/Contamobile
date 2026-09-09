import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type { Party, PaymentAccount, PricingMode, Product, Warehouse } from '@/domain/types';
import { sellingPrice, validateSaleDraft } from '@/domain/accounting';
import { listParties, listPaymentAccounts, listProducts, listWarehouses } from '@/db/queries';
import { postSale } from '@/services/accounting-service';
import { PartyPicker } from '@/components/pickers';
import { AppText, Badge, Button, Card, Chip, EmptyState, Field, Money, Screen, SearchField, SectionTitle } from '@/components/ui';
import { BottomActionBar, QuantityStepper, Sheet } from '@/components/mobile-interactions';
import { useI18n } from '@/i18n/provider';
import { useAuth } from '@/auth/provider';
import { colors, radius, spacing, touch } from '@/theme';

type CartLine={product:Product;quantity:number;unitPrice:number;stock:number};

export function PosScreen(){
  const db=useSQLiteContext(),{t,locale,isRTL,number,errorMessage}=useI18n(),auth=useAuth(),ar=locale==='ar';
  const allowed=auth.has('pos.create');
  const [warehouses,setWarehouses]=useState<Warehouse[]>([]),[warehouseId,setWarehouseId]=useState('');
  const [accounts,setAccounts]=useState<PaymentAccount[]>([]),[parties,setParties]=useState<Party[]>([]);
  const [results,setResults]=useState<Product[]>([]),[search,setSearch]=useState(''),[pricingMode,setPricingMode]=useState<PricingMode>('retail');
  const [lines,setLines]=useState<CartLine[]>([]),[loading,setLoading]=useState(true),[searching,setSearching]=useState(false);
  const [paymentOpen,setPaymentOpen]=useState(false),[paymentMethod,setPaymentMethod]=useState(''),[tender,setTender]=useState(''),[partyId,setPartyId]=useState<string|null>(null),[partyPicker,setPartyPicker]=useState(false),[busy,setBusy]=useState(false);
  const [quantityLineId,setQuantityLineId]=useState<string|null>(null),[quantityDraft,setQuantityDraft]=useState('1');
  const [successTotal,setSuccessTotal]=useState<number|null>(null);

  const loadBase=useCallback(async()=>{
    if(!allowed)return;
    setLoading(true);
    try{
      const [w,a,p]=await Promise.all([listWarehouses(db),listPaymentAccounts(db),listParties(db,'customer','',300)]);
      const active=a.filter(x=>x.isActive&&!x.isArchived);
      const selected=w.find(x=>x.isSalesDefault)?.id??w[0]?.id??'';
      setWarehouses(w);setAccounts(active);setParties(p);setWarehouseId(current=>current||selected);
      setPaymentMethod(current=>current||active.find(x=>x.code==='cash')?.id||active[0]?.id||'note');
    }catch(error){Alert.alert(t('error'),errorMessage(error))}finally{setLoading(false)}
  },[allowed,db,errorMessage,t]);

  useFocusEffect(useCallback(()=>{void loadBase()},[loadBase]));

  useEffect(()=>{
    if(!allowed||!warehouseId)return;
    let cancelled=false;
    const timer=setTimeout(()=>{
      setSearching(true);
      void listProducts(db,search,warehouseId,false,search.trim()?40:18)
        .then(items=>{if(!cancelled)setResults(items)})
        .catch(error=>{if(!cancelled)Alert.alert(t('error'),errorMessage(error))})
        .finally(()=>{if(!cancelled)setSearching(false)});
    },search.trim()?140:0);
    return()=>{cancelled=true;clearTimeout(timer)};
  },[allowed,db,errorMessage,search,t,warehouseId]);

  const total=useMemo(()=>lines.reduce((sum,line)=>sum+Math.round(line.quantity*line.unitPrice),0),[lines]);
  const itemCount=useMemo(()=>lines.reduce((sum,line)=>sum+line.quantity,0),[lines]);
  const selectedParty=parties.find(p=>p.id===partyId)??null;
  const selectedWarehouse=warehouses.find(w=>w.id===warehouseId)??null;
  const tenderValue=paymentMethod==='note'?0:Number(tender.trim()===''?total:tender);
  const normalizedTender=Number.isFinite(tenderValue)&&tenderValue>0?tenderValue:0;
  const paidValue=paymentMethod==='note'?0:Math.min(total,normalizedTender);
  const dueValue=Math.max(total-paidValue,0);
  const changeValue=paymentMethod==='note'?0:Math.max(normalizedTender-total,0);
  const needsParty=dueValue>0;

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

  const validationMessage=(code:string,productName?:string)=>{
    if(code==='expiredProduct')return ar?`${productName??''}: المنتج منتهي الصلاحية ولا يمكن بيعه`:`${productName??''} : produit expiré, vente impossible`;
    if(code==='invalidQuantity')return ar?`${productName??''}: الكمية غير صحيحة`:`${productName??''} : quantité invalide`;
    if(code==='invalidSalePrice')return ar?`${productName??''}: سعر البيع غير صحيح`:`${productName??''} : prix de vente invalide`;
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
      const e=check.errors[0];
      if(e?.code==='insufficientQuantity')Alert.alert(t('error'),ar?`${e.productName}: المطلوب ${e.requested} والمتوفر ${e.available}`:`${e.productName} : demandé ${e.requested}, disponible ${e.available}`);
      else Alert.alert(t('error'),e&&'productName'in e?validationMessage(e.code,e.productName):validationMessage(e?.code??'missingProduct'));
      return;
    }
    const proceed=()=>{setTender(String(total));setPaymentOpen(true)};
    if(check.warnings.length){
      Alert.alert(ar?'تنبيه السعر':'Attention prix',check.warnings.map(w=>ar?`${w.productName}: سعر البيع ${w.salePrice} أقل من التكلفة ${w.purchaseCost}`:`${w.productName} : prix ${w.salePrice} inférieur au coût ${w.purchaseCost}`).join('\n'),[{text:t('cancel'),style:'cancel'},{text:t('confirm'),onPress:proceed}]);return;
    }
    proceed();
  };

  const completeSale=async()=>{
    if(!lines.length||!warehouseId||busy)return;
    if(paymentMethod!=='note'&&(!Number.isFinite(tenderValue)||tenderValue<0)){Alert.alert(t('error'),ar?'أدخل مبلغًا صحيحًا':'Saisissez un montant valide.');return}
    if(needsParty&&!partyId){Alert.alert(t('customer'),ar?'اختر العميل لأن هناك مبلغًا متبقيًا.':'Choisissez un client car un montant reste dû.');return}
    setBusy(true);
    try{
      await postSale(db,{warehouseId,partyId,paymentMethod,cashAmount:paidValue,pricingMode,lines:lines.map(line=>({productId:line.product.id,quantity:line.quantity,unitPrice:line.unitPrice}))});
      const completedTotal=total;
      setLines([]);setPartyId(null);setTender('');setPaymentOpen(false);setSearch('');setSuccessTotal(completedTotal);
      const fresh=await listProducts(db,'',warehouseId,false,18);setResults(fresh);
    }catch(error){Alert.alert(t('error'),errorMessage(error))}finally{setBusy(false)}
  };

  if(!allowed)return <Screen><EmptyState title={ar?'ليس لديك صلاحية إنشاء المبيعات':'Vous n’avez pas le droit de créer des ventes.'}/></Screen>;
  if(loading)return <Screen><EmptyState title={t('loading')}/></Screen>;

  return <Screen padded={false}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <View style={[styles.topRow,{flexDirection:isRTL?'row-reverse':'row'}]}><View style={styles.titleBlock}><AppText variant="title">{t('newSale')}</AppText><AppText variant="caption" muted>{selectedWarehouse?.name??t('warehouse')}</AppText></View><View style={styles.mode}><Chip label={t('retail')} active={pricingMode==='retail'} onPress={()=>changeMode('retail')}/><Chip label={t('wholesale')} active={pricingMode==='wholesale'} onPress={()=>changeMode('wholesale')}/></View></View>

      {warehouses.length>1?<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.warehouseStrip,{flexDirection:isRTL?'row-reverse':'row'}]}>{warehouses.map(w=><Chip key={w.id} label={w.name} active={warehouseId===w.id} disabled={lines.length>0&&warehouseId!==w.id} onPress={()=>setWarehouseId(w.id)}/>)}</ScrollView>:null}

      <SearchField value={search} onChangeText={setSearch} returnKeyType="search" placeholder={ar?'ابحث بالاسم أو الباركود…':'Nom ou code-barres…'}/>

      {search.trim()?<View style={styles.resultSection}><SectionTitle title={ar?'نتائج سريعة':'Résultats rapides'} subtitle={searching?(ar?'جارٍ البحث…':'Recherche…'):undefined}/><View style={styles.panel}>{results.length?results.slice(0,12).map((product,index)=>{const stock=Number(product.stocks?.[warehouseId]??0),price=sellingPrice(product,pricingMode);return <Pressable key={product.id} accessibilityRole="button" disabled={stock<=0} onPress={()=>addProduct(product)} style={({pressed})=>[styles.productRow,{flexDirection:isRTL?'row-reverse':'row'},pressed&&styles.rowPressed,stock<=0&&styles.disabled,index===Math.min(results.length,12)-1&&styles.lastRow]}><View style={styles.productBody}><AppText variant="subheading" numberOfLines={1}>{product.name}</AppText><View style={[styles.metaRow,{flexDirection:isRTL?'row-reverse':'row'}]}><AppText variant="caption" muted>{product.sku}</AppText><Badge label={stock>0?(ar?`متوفر ${number(stock)}`:`Stock ${number(stock)}`):(ar?'غير متوفر':'Rupture')} tone={stock>0?'positive':'negative'}/></View></View><View style={styles.productPrice}><Money value={price}/><View style={styles.addButton}><AppText variant="heading" style={styles.addPlus}>+</AppText></View></View></Pressable>}):<EmptyState title={t('noResults')}/>}</View></View>:null}

      <SectionTitle title={ar?`السلة${lines.length?` · ${number(lines.length)}`:''}`:`Panier${lines.length?` · ${number(lines.length)}`:''}`} subtitle={lines.length?(ar?'غيّر الكمية مباشرة بدون فتح لوحة المفاتيح':'Modifiez la quantité sans ouvrir le clavier'):undefined}/>
      {lines.length===0?<Card tone="muted"><EmptyState title={ar?'ابدأ بإضافة منتج':'Ajoutez un produit pour commencer'} description={ar?'ابحث بالاسم أو الباركود، ثم اضغط على المنتج لإضافته مباشرة.':'Recherchez par nom ou code-barres, puis touchez le produit.'}/></Card>:<View style={styles.cartPanel}>{lines.map((line,index)=><View key={line.product.id} style={[styles.cartLine,index===lines.length-1&&styles.lastRow]}><View style={[styles.cartHead,{flexDirection:isRTL?'row-reverse':'row'}]}><View style={styles.cartName}><AppText variant="subheading" numberOfLines={2}>{line.product.name}</AppText><AppText variant="caption" muted>{ar?`المتوفر ${number(line.stock)}`:`Stock ${number(line.stock)}`}</AppText></View><Money value={Math.round(line.quantity*line.unitPrice)}/></View><View style={[styles.cartControls,{flexDirection:isRTL?'row-reverse':'row'}]}><QuantityStepper value={line.quantity} onDecrease={()=>changeQuantity(line.product.id,line.quantity-1)} onIncrease={()=>changeQuantity(line.product.id,line.quantity+1)} onEdit={()=>openQuantity(line)}/><View style={styles.unitPrice}><AppText variant="caption" muted>{t('salePrice')}</AppText><Money value={line.unitPrice}/></View></View></View>)}</View>}

      {!search.trim()?<View style={styles.quickSection}><SectionTitle title={ar?'إضافة سريعة':'Ajout rapide'} subtitle={ar?'منتجات من المخزن الحالي — استخدم البحث للوصول لأي منتج':'Produits du dépôt actuel — utilisez la recherche pour le reste'}/><View style={styles.quickGrid}>{results.slice(0,10).map(product=>{const stock=Number(product.stocks?.[warehouseId]??0);return <Pressable key={product.id} disabled={stock<=0} onPress={()=>addProduct(product)} style={({pressed})=>[styles.quickProduct,pressed&&styles.quickPressed,stock<=0&&styles.disabled]}><View style={styles.quickRule}/><AppText variant="subheading" numberOfLines={2}>{product.name}</AppText><Money value={sellingPrice(product,pricingMode)}/><AppText variant="caption" muted>{ar?`${number(stock)} متوفر`:`${number(stock)} en stock`}</AppText></Pressable>})}</View></View>:null}
    </ScrollView>

    <BottomActionBar label={t('completeSale')} total={total} count={itemCount} secondary={ar?'قطعة':'articles'} onPress={openPayment} disabled={!lines.length}/>

    <Sheet visible={paymentOpen} title={ar?'إتمام البيع':'Finaliser la vente'} onClose={()=>{if(!busy)setPaymentOpen(false)}} footer={<><Button title={ar?`تأكيد البيع · ${number(total)}`:`Confirmer · ${number(total)}`} loading={busy} disabled={needsParty&&!selectedParty} onPress={()=>void completeSale()}/><Button title={t('cancel')} variant="ghost" disabled={busy} onPress={()=>setPaymentOpen(false)}/></>}>
      <Card tone="primary"><View style={[styles.totalRow,{flexDirection:isRTL?'row-reverse':'row'}]}><AppText variant="subheading">{t('total')}</AppText><Money value={total} large/></View></Card>
      <View style={styles.sheetSection}><AppText variant="caption" muted>{t('paymentMethod')}</AppText><View style={[styles.chips,{flexDirection:isRTL?'row-reverse':'row'}]}>{accounts.map(a=><Chip key={a.id} label={a.name} active={paymentMethod===a.id||paymentMethod===a.code} onPress={()=>{setPaymentMethod(a.id);setTender(String(total))}}/>)}<Chip label={t('onCredit')} active={paymentMethod==='note'} onPress={()=>{setPaymentMethod('note');setTender('0')}}/></View></View>
      {paymentMethod!=='note'?<Field label={ar?'المبلغ المستلم':'Montant reçu'} value={tender} onChangeText={setTender} keyboardType="number-pad" selectTextOnFocus/>:null}
      <View style={[styles.paymentSummary,{flexDirection:isRTL?'row-reverse':'row'}]}><View style={styles.summaryCell}><AppText variant="caption" muted>{t('paid')}</AppText><Money value={paidValue} tone="positive"/></View><View style={styles.summaryCell}><AppText variant="caption" muted>{t('due')}</AppText><Money value={dueValue} tone={dueValue>0?'negative':'normal'}/></View>{changeValue>0?<View style={styles.summaryCell}><AppText variant="caption" muted>{ar?'الباقي للعميل':'Monnaie'}</AppText><Money value={changeValue} tone="positive"/></View>:null}</View>
      <Button title={selectedParty?.name??(needsParty?(ar?'اختر العميل — مطلوب':'Choisir le client — requis'):t('directSale'))} variant={needsParty&&!selectedParty?'secondary':'ghost'} onPress={()=>setPartyPicker(true)}/>
      {needsParty&&!selectedParty?<Card tone="warning"><AppText variant="caption" style={styles.warningText}>{ar?'يوجد مبلغ متبقٍ؛ اختر العميل قبل تأكيد البيع.':'Un montant reste dû ; choisissez le client avant de confirmer.'}</AppText></Card>:null}
    </Sheet>

    <PartyPicker visible={partyPicker} parties={parties} directLabel={t('directSale')} onClose={()=>setPartyPicker(false)} onSelect={p=>setPartyId(p?.id??null)}/>

    <Sheet visible={Boolean(quantityLineId)} title={ar?'تعديل الكمية':'Modifier la quantité'} onClose={()=>setQuantityLineId(null)} footer={<Button title={t('save')} onPress={saveQuantity}/>}><Field label={t('quantity')} value={quantityDraft} onChangeText={setQuantityDraft} keyboardType="decimal-pad" autoFocus selectTextOnFocus/></Sheet>

    <Sheet visible={successTotal!==null} title={t('success')} onClose={()=>setSuccessTotal(null)} footer={<><Button title={ar?'ابدأ بيعًا جديدًا':'Nouvelle vente'} onPress={()=>setSuccessTotal(null)}/>{auth.has('records.view')?<Button title={t('records')} variant="secondary" onPress={()=>{setSuccessTotal(null);router.push('/sales/records')}}/>:null}</>}>
      <View style={styles.success}><View style={styles.successMark}><AppText variant="title" style={styles.successCheck}>✓</AppText></View><AppText variant="subheading">{ar?'تم حفظ البيع والمخزون والحركة المالية.':'La vente, le stock et le mouvement financier sont enregistrés.'}</AppText>{successTotal!==null?<Money value={successTotal} large/>:null}</View>
    </Sheet>
  </Screen>;
}

const styles=StyleSheet.create({
  content:{padding:spacing.md,gap:spacing.md,paddingBottom:spacing.xxl,backgroundColor:colors.background},
  topRow:{alignItems:'center',justifyContent:'space-between',gap:spacing.md},
  titleBlock:{flex:1,gap:spacing.xxs},
  mode:{flexDirection:'row',gap:spacing.xs},
  warehouseStrip:{gap:spacing.xs},
  resultSection:{gap:spacing.sm},
  panel:{backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,overflow:'hidden'},
  productRow:{minHeight:72,alignItems:'center',gap:spacing.md,paddingHorizontal:spacing.md,paddingVertical:spacing.sm,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border},
  productBody:{flex:1,gap:spacing.xs},
  metaRow:{alignItems:'center',gap:spacing.xs,flexWrap:'wrap'},
  productPrice:{alignItems:'flex-end',gap:spacing.xs},
  addButton:{width:touch.min,height:touch.min,borderRadius:radius.sm,backgroundColor:colors.primarySoft,borderWidth:1,borderColor:colors.primarySoft,alignItems:'center',justifyContent:'center'},
  addPlus:{color:colors.primary,lineHeight:24},
  rowPressed:{backgroundColor:colors.surfaceMuted},
  disabled:{opacity:.38},
  lastRow:{borderBottomWidth:0},
  cartPanel:{backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,overflow:'hidden'},
  cartLine:{gap:spacing.md,padding:spacing.md,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border},
  cartHead:{alignItems:'flex-start',gap:spacing.md},
  cartName:{flex:1,gap:spacing.xxs},
  cartControls:{alignItems:'center',justifyContent:'space-between',gap:spacing.md},
  unitPrice:{alignItems:'flex-end',gap:spacing.xxs},
  quickSection:{gap:spacing.sm},
  quickGrid:{flexDirection:'row',flexWrap:'wrap',gap:spacing.sm},
  quickProduct:{width:'48%',minHeight:116,borderRadius:radius.md,backgroundColor:colors.surface,padding:spacing.md,gap:spacing.xs,borderWidth:1,borderColor:colors.border},
  quickRule:{width:24,height:2,borderRadius:2,backgroundColor:colors.accent,marginBottom:spacing.xxs},
  quickPressed:{backgroundColor:colors.primaryFaint,borderColor:colors.primarySoft},
  sheetSection:{gap:spacing.sm},
  chips:{flexWrap:'wrap',gap:spacing.xs},
  totalRow:{alignItems:'center',justifyContent:'space-between',gap:spacing.md},
  paymentSummary:{gap:spacing.sm,flexWrap:'wrap'},
  summaryCell:{minWidth:92,gap:spacing.xxs},
  warningText:{color:colors.warning,fontWeight:'700'},
  success:{alignItems:'center',gap:spacing.md,paddingVertical:spacing.md},
  successMark:{width:64,height:64,borderRadius:radius.lg,backgroundColor:colors.positiveSoft,borderWidth:1,borderColor:'#D3E7DA',alignItems:'center',justifyContent:'center'},
  successCheck:{color:colors.positive},
});
