import { useCallback, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type { Product, Warehouse } from '@/domain/types';
import { listProducts, listWarehouses } from '@/db/queries';
import { adjustStock } from '@/services/accounting-service';
import { ProductPicker } from '@/components/pickers';
import { AppText, Badge, Button, Card, Chip, EmptyState, Field, Screen, SectionTitle } from '@/components/ui';
import { QuantityStepper, Sheet, StickyActionBar } from '@/components/mobile-interactions';
import { useI18n } from '@/i18n/provider';
import { useAuth } from '@/auth/provider';
import { colors, spacing } from '@/theme';

type Line={product:Product;current:number;actual:number;purchaseCost:string};

export function AdjustmentScreen(){
  const db=useSQLiteContext(),{t,isRTL,number,locale,errorMessage}=useI18n(),auth=useAuth(),ar=locale==='ar';
  const [products,setProducts]=useState<Product[]>([]),[warehouses,setWarehouses]=useState<Warehouse[]>([]),[warehouseId,setWarehouseId]=useState(''),[reason,setReason]=useState(''),[lines,setLines]=useState<Line[]>([]),[picker,setPicker]=useState(false),[busy,setBusy]=useState(false),[editId,setEditId]=useState<string|null>(null),[actualDraft,setActualDraft]=useState('0'),[costDraft,setCostDraft]=useState('');
  const allowed=auth.has('warehouses.adjust');
  const load=useCallback(async()=>{if(!allowed)return;const [w,p]=await Promise.all([listWarehouses(db),listProducts(db,'',undefined,false,300)]);setWarehouses(w);setProducts(p);const selected=warehouseId||w.find(item=>item.isSalesDefault)?.id||w[0]?.id||'';if(!warehouseId)setWarehouseId(selected)},[allowed,db,warehouseId]);
  useFocusEffect(useCallback(()=>{void load()},[load]));
  const changed=useMemo(()=>lines.filter(line=>line.actual!==line.current),[lines]);
  if(!allowed)return <Screen><EmptyState title={ar?'ليس لديك صلاحية تصحيح المخزون':'Vous n’avez pas le droit de corriger le stock.'}/><Button title={t('cancel')} variant="ghost" onPress={()=>router.back()}/></Screen>;
  const chooseProduct=(product:Product)=>{const current=Number(product.stocks?.[warehouseId]??0);setLines(items=>[...items,{product,current,actual:current,purchaseCost:String(product.lastPurchaseCost??product.pieceCost??'')}])};
  const setActual=(id:string,value:number)=>setLines(current=>current.map(line=>line.product.id===id?{...line,actual:Math.max(0,value)}:line));
  const openEdit=(line:Line)=>{setEditId(line.product.id);setActualDraft(String(line.actual));setCostDraft(line.purchaseCost)};
  const saveEdit=()=>{if(editId){const actual=Number(actualDraft);if(Number.isFinite(actual)&&actual>=0)setLines(current=>current.map(line=>line.product.id===editId?{...line,actual,purchaseCost:costDraft}:line))}setEditId(null)};
  const submit=async()=>{if(busy)return;setBusy(true);try{await adjustStock(db,{warehouseId,reason,lines:changed.map(line=>({productId:line.product.id,actualQuantity:line.actual,purchaseCost:line.purchaseCost.trim()?Number(line.purchaseCost):null}))});router.back()}catch(error){Alert.alert(t('error'),errorMessage(error))}finally{setBusy(false)}};
  const warehouseName=warehouses.find(item=>item.id===warehouseId)?.name??'';
  return <Screen padded={false}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
    <SectionTitle title={t('adjustment')} subtitle={ar?'اكتب سببًا واضحًا، ثم عدّل فقط المنتجات التي عدّدت كميتها فعليًا.':'Indiquez la raison puis corrigez seulement les produits réellement comptés.'}/>
    <Card tone="primary"><AppText variant="caption" muted>{t('warehouse')}</AppText><View style={[styles.chips,{flexDirection:isRTL?'row-reverse':'row'}]}>{warehouses.map(item=><Chip key={item.id} label={item.name} active={warehouseId===item.id} disabled={lines.length>0&&warehouseId!==item.id} onPress={()=>{setWarehouseId(item.id);setLines([])}}/>)}</View><Field label={t('reason')} value={reason} onChangeText={setReason} placeholder={ar?'مثال: جرد نهاية اليوم':'Ex. inventaire de fin de journée'}/></Card>
    <SectionTitle title={t('products')} subtitle={lines.length?(ar?'القيمة المعروضة هي الكمية الفعلية الجديدة.':'La valeur affichée est la nouvelle quantité réelle.'):undefined} action={<Button compact title={t('addLine')} onPress={()=>setPicker(true)}/>}/>
    {lines.length?lines.map(line=>{const delta=line.actual-line.current;return <Card key={line.product.id}><View style={[styles.lineHead,{flexDirection:isRTL?'row-reverse':'row'}]}><View style={styles.flex}><AppText variant="subheading" numberOfLines={2}>{line.product.name}</AppText><View style={[styles.meta,{flexDirection:isRTL?'row-reverse':'row'}]}><Badge label={ar?`قبل ${number(line.current)}`:`Avant ${number(line.current)}`} tone="neutral"/><Badge label={delta===0?(ar?'بدون تغيير':'Inchangé'):delta>0?(ar?`+${number(delta)}`:`+${number(delta)}`):number(delta)} tone={delta===0?'neutral':delta>0?'positive':'negative'}/></View></View><Button compact title={t('remove')} variant="ghost" onPress={()=>setLines(current=>current.filter(item=>item.product.id!==line.product.id))}/></View><View style={[styles.adjustRow,{flexDirection:isRTL?'row-reverse':'row'}]}><View><AppText variant="caption" muted>{t('actualQuantity')}</AppText><AppText variant="heading">{number(line.actual)}</AppText></View><QuantityStepper value={line.actual} onDecrease={()=>setActual(line.product.id,line.actual-1)} onIncrease={()=>setActual(line.product.id,line.actual+1)} onEdit={()=>openEdit(line)}/></View>{line.actual>line.current&&!line.purchaseCost.trim()?<Card tone="warning"><AppText variant="caption" style={styles.warning}>{ar?'عند زيادة المخزون يلزم سعر شراء مرجعي. اضغط على الكمية لإدخاله.':'Une hausse de stock exige un coût d’achat. Touchez la quantité pour le saisir.'}</AppText></Card>:null}</Card>}):<Card tone="muted"><EmptyState title={ar?'لا توجد منتجات في التصحيح':'Aucun produit à corriger'} description={ar?'أضف فقط المنتجات التي قارنت رصيدها بالنظام.':'Ajoutez uniquement les produits réellement comptés.'}/></Card>}
  </ScrollView><StickyActionBar label={t('confirm')} summary={changed.length?(ar?`${warehouseName} • ${changed.length} تغييرات`:`${warehouseName} • ${changed.length} changements`):undefined} loading={busy} disabled={!warehouseId||!reason.trim()||!changed.length||changed.some(line=>line.actual>line.current&&!line.purchaseCost.trim())} onPress={()=>void submit()}/><ProductPicker visible={picker} products={products} exclude={lines.map(line=>line.product.id)} onClose={()=>setPicker(false)} onSelect={chooseProduct}/><Sheet visible={Boolean(editId)} title={ar?'الكمية الفعلية':'Quantité réelle'} onClose={()=>setEditId(null)} footer={<Button title={t('save')} onPress={saveEdit}/>}><Field label={t('actualQuantity')} value={actualDraft} onChangeText={setActualDraft} keyboardType="decimal-pad" autoFocus selectTextOnFocus/>{Number(actualDraft)>(lines.find(line=>line.product.id===editId)?.current??Infinity)?<Field label={t('purchasePrice')} value={costDraft} onChangeText={setCostDraft} keyboardType="number-pad"/>:null}</Sheet></Screen>;
}

const styles=StyleSheet.create({content:{padding:spacing.md,gap:spacing.md,paddingBottom:spacing.xxl,backgroundColor:colors.background},chips:{flexWrap:'wrap',gap:spacing.xs},lineHead:{alignItems:'center',gap:spacing.md},flex:{flex:1},meta:{alignItems:'center',gap:spacing.xs,flexWrap:'wrap'},adjustRow:{alignItems:'center',justifyContent:'space-between',gap:spacing.md},warning:{color:colors.warning,fontWeight:'700'}});
