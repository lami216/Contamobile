import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect, router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type { Product, ProductCategory, Warehouse } from '@/domain/types';
import { getDocumentById } from '@/db/document-queries';
import { listProductCategories, listProducts, listWarehouses } from '@/db/queries';
import { adjustStock } from '@/services/accounting-service';
import { updateStockAdjustment } from '@/services/transaction-lifecycle-service';
import { ProductPicker } from '@/components/pickers';
import { AppText, Button, Card, Chip, EmptyState, Field, Screen, SectionTitle } from '@/components/ui';
import { useI18n } from '@/i18n/provider';
import { useAuth } from '@/auth/provider';
import { colors, spacing } from '@/theme';

type Line={productId:string;name:string;current:number;actual:string};

export function AdjustmentScreen(){
  const {id:documentId}=useLocalSearchParams<{id?:string}>(),db=useSQLiteContext(),{t,isRTL,number,locale,errorMessage}=useI18n(),auth=useAuth(),ar=locale==='ar';
  const [products,setProducts]=useState<Product[]>([]),[categories,setCategories]=useState<ProductCategory[]>([]),[warehouses,setWarehouses]=useState<Warehouse[]>([]),[warehouseId,setWarehouseId]=useState(''),[reason,setReason]=useState(''),[lines,setLines]=useState<Line[]>([]),[picker,setPicker]=useState(false),[busy,setBusy]=useState(false),[hydrated,setHydrated]=useState(!documentId),[missing,setMissing]=useState(false);
  const allowed=documentId?auth.has('warehouses.adjust.edit'):auth.has('warehouses.adjust');
  const load=useCallback(async()=>{
    if(!allowed)return;
    const [w,c,p,doc]=await Promise.all([listWarehouses(db),listProductCategories(db),listProducts(db,'',undefined,false,500),documentId?getDocumentById(db,documentId):Promise.resolve(null)]);
    setWarehouses(w);setCategories(c);setProducts(p);
    if(documentId&&!hydrated){
      if(!doc||doc.kind!=='adjustment'||doc.status!=='posted'||doc.number.startsWith('OPEN')){setMissing(true);setHydrated(true);return}
      setWarehouseId(doc.warehouseId??'');setReason(doc.title??'');setLines(doc.lines.filter(line=>line.productId).map(line=>({productId:String(line.productId),name:line.description.split(' — ')[0]??line.description,current:Number(line.balanceBefore??0),actual:String(line.balanceAfter??Number(line.balanceBefore??0)+line.quantity)})));setHydrated(true);return;
    }
    if(!documentId){const selected=warehouseId||w.find(x=>x.isSalesDefault)?.id||w[0]?.id||'';if(!warehouseId)setWarehouseId(selected)}
  },[allowed,db,documentId,hydrated,warehouseId]);
  useFocusEffect(useCallback(()=>{void load()},[load]));
  if(!allowed)return <Screen><EmptyState title={ar?'ليس لديك صلاحية تصحيح المخزون':'Vous n’avez pas le droit de corriger le stock.'}/><Button title={t('cancel')} variant="ghost" onPress={()=>router.back()}/></Screen>;
  if(!hydrated)return <Screen><EmptyState title={t('loading')}/></Screen>;
  if(missing)return <Screen><EmptyState title={ar?'سند التصحيح غير موجود أو غير قابل للتعديل':'L’ajustement est introuvable ou non modifiable.'}/><Button title={t('cancel')} variant="ghost" onPress={()=>router.back()}/></Screen>;
  const chooseProduct=(p:Product)=>{const current=Number(p.stocks?.[warehouseId]??0);setLines(items=>[...items,{productId:p.id,name:p.name,current,actual:String(current)}])};
  const submit=async()=>{setBusy(true);try{const payload={warehouseId,reason,lines:lines.map(line=>({productId:line.productId,actualQuantity:Number(line.actual)}))};if(documentId)await updateStockAdjustment(db,documentId,{reason:payload.reason,lines:payload.lines});else await adjustStock(db,payload);Alert.alert(t('success'));router.back()}catch(error){Alert.alert(t('error'),errorMessage(error))}finally{setBusy(false)}};
  return <Screen padded={false}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
    <SectionTitle title={documentId?(ar?'تعديل سند التصحيح':'Modifier l’ajustement'):t('adjustment')}/>
    <Card elevated><AppText variant="caption" muted>{t('warehouse')}</AppText><View style={styles.chips}>{warehouses.filter(w=>!documentId||w.id===warehouseId).map(w=><Chip key={w.id} label={w.name} active={warehouseId===w.id} onPress={()=>{if(!documentId){setWarehouseId(w.id);setLines([])}}}/>)}</View><Field label={t('reason')} value={reason} onChangeText={setReason}/></Card>
    <SectionTitle title={t('products')} action={!documentId?<Button title={t('addLine')} onPress={()=>setPicker(true)}/>:undefined}/>
    {lines.length?lines.map(line=><Card elevated key={line.productId}><View style={[styles.line,{flexDirection:isRTL?'row-reverse':'row'}]}><View><AppText variant="subheading">{line.name}</AppText><AppText muted>{`${t('balance')}: ${number(line.current)}`}</AppText></View>{!documentId?<Button title={t('remove')} variant="ghost" onPress={()=>setLines(x=>x.filter(y=>y.productId!==line.productId))}/>:null}</View><Field label={t('actualQuantity')} keyboardType="decimal-pad" value={line.actual} onChangeText={value=>setLines(current=>current.map(x=>x.productId===line.productId?{...x,actual:value}:x))}/>{Number(line.actual)>line.current?<AppText variant="caption" muted>{ar?'تستخدم الزيادة تكلفة رصيد البداية أو آخر فاتورة شراء المسجلة، ولا تنشئ تكلفة جديدة من شاشة التصحيح.':'L’augmentation utilise le coût du stock initial ou du dernier achat enregistré; la correction ne crée pas un nouveau coût.'}</AppText>:null}</Card>):<EmptyState title={t('noData')}/>}
    {documentId?<Card><AppText variant="caption" muted>{ar?'بعد اعتماد سند التصحيح لا يمكن تغيير منتجاته أو مخزنه؛ يمكن تعديل الكميات والسبب فقط.':'Après validation, les produits et le dépôt ne peuvent plus être changés; seules les quantités et le motif peuvent être modifiés.'}</AppText></Card>:null}
    <Button loading={busy} disabled={!warehouseId||!reason.trim()||!lines.length} title={documentId?t('save'):t('confirm')} onPress={()=>void submit()}/><Button title={t('cancel')} variant="ghost" onPress={()=>router.back()}/>
  </ScrollView>{!documentId?<ProductPicker visible={picker} products={products} categories={categories} exclude={lines.map(l=>l.productId)} onClose={()=>setPicker(false)} onSelect={chooseProduct}/>:null}</Screen>;
}
const styles=StyleSheet.create({content:{padding:spacing.md,gap:spacing.md,paddingBottom:spacing.xxl,backgroundColor:colors.background},chips:{flexDirection:'row',flexWrap:'wrap',gap:spacing.xs},line:{justifyContent:'space-between',alignItems:'center'}});
