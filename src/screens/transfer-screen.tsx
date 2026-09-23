import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect, router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type { Product, ProductCategory, Warehouse } from '@/domain/types';
import { getDocumentById } from '@/db/document-queries';
import { listProductCategories, listProducts, listWarehouses } from '@/db/queries';
import { transferStock } from '@/services/accounting-service';
import { updateStockTransfer } from '@/services/transaction-lifecycle-service';
import { ProductPicker } from '@/components/pickers';
import { AppText, Button, Card, Chip, EmptyState, Field, Screen, SectionTitle } from '@/components/ui';
import { useI18n } from '@/i18n/provider';
import { useAuth } from '@/auth/provider';
import { colors, spacing } from '@/theme';

type Line={productId:string;name:string;quantity:string};

export function TransferScreen(){
  const {id:documentId}=useLocalSearchParams<{id?:string}>(),db=useSQLiteContext(),{t,isRTL,locale,errorMessage}=useI18n(),auth=useAuth(),ar=locale==='ar';
  const [products,setProducts]=useState<Product[]>([]),[categories,setCategories]=useState<ProductCategory[]>([]),[warehouses,setWarehouses]=useState<Warehouse[]>([]),[from,setFrom]=useState(''),[to,setTo]=useState(''),[lines,setLines]=useState<Line[]>([]),[picker,setPicker]=useState(false),[busy,setBusy]=useState(false),[hydrated,setHydrated]=useState(!documentId),[missing,setMissing]=useState(false);
  const allowed=documentId?auth.has('warehouses.transfer.edit'):auth.has('warehouses.transfer');
  const load=useCallback(async()=>{
    if(!allowed)return;
    const [p,c,w,doc]=await Promise.all([listProducts(db,'',undefined,false,500),listProductCategories(db),listWarehouses(db),documentId?getDocumentById(db,documentId):Promise.resolve(null)]);
    setProducts(p);setCategories(c);setWarehouses(w);
    if(documentId&&!hydrated){
      if(!doc||doc.kind!=='transfer'||doc.status!=='posted'){setMissing(true);setHydrated(true);return}
      setFrom(doc.warehouseId??'');setTo(doc.destinationWarehouseId??'');setLines(doc.lines.filter(line=>line.productId).map(line=>({productId:String(line.productId),name:line.description,quantity:String(line.quantity)})));setHydrated(true);return;
    }
    if(!documentId){setFrom(current=>current||w.find(x=>x.isSalesDefault)?.id||w[0]?.id||'');setTo(current=>current||w.find(x=>x.id!==(w.find(y=>y.isSalesDefault)?.id||w[0]?.id))?.id||'')}
  },[allowed,db,documentId,hydrated]);
  useFocusEffect(useCallback(()=>{void load()},[load]));
  if(!allowed)return <Screen><EmptyState title={ar?'ليس لديك صلاحية تنفيذ هذه العملية':'Vous n’avez pas le droit d’effectuer cette opération.'}/><Button title={t('cancel')} variant="ghost" onPress={()=>router.back()}/></Screen>;
  if(!hydrated)return <Screen><EmptyState title={t('loading')}/></Screen>;
  if(missing)return <Screen><EmptyState title={ar?'تحويل المخزون غير موجود أو ملغى':'Le transfert de stock est introuvable ou annulé.'}/><Button title={t('cancel')} variant="ghost" onPress={()=>router.back()}/></Screen>;
  const submit=async()=>{setBusy(true);try{const payload={fromWarehouseId:from,toWarehouseId:to,lines:lines.map(line=>({productId:line.productId,quantity:Number(line.quantity)}))};if(documentId)await updateStockTransfer(db,documentId,payload);else await transferStock(db,payload);Alert.alert(t('success'));router.back()}catch(error){Alert.alert(t('error'),errorMessage(error))}finally{setBusy(false)}};
  return <Screen padded={false}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
    <SectionTitle title={documentId?(ar?'تعديل تحويل المخزون':'Modifier le transfert'):t('transfer')}/>
    <Card elevated><AppText variant="caption" muted>{t('from')}</AppText><View style={styles.chips}>{warehouses.map(w=><Chip key={w.id} label={w.name} active={from===w.id} onPress={()=>{setFrom(w.id);if(to===w.id)setTo('')}}/>)}</View><AppText variant="caption" muted>{t('to')}</AppText><View style={styles.chips}>{warehouses.filter(w=>w.id!==from).map(w=><Chip key={w.id} label={w.name} active={to===w.id} onPress={()=>setTo(w.id)}/>)}</View></Card>
    <SectionTitle title={t('products')} action={<Button title={t('addLine')} onPress={()=>setPicker(true)}/>}/>
    {lines.length?lines.map(line=><Card elevated key={line.productId}><View style={[styles.line,{flexDirection:isRTL?'row-reverse':'row'}]}><AppText variant="subheading">{line.name}</AppText><Button title={t('remove')} variant="ghost" onPress={()=>setLines(x=>x.filter(y=>y.productId!==line.productId))}/></View><Field label={t('quantity')} keyboardType="decimal-pad" value={line.quantity} onChangeText={value=>setLines(current=>current.map(x=>x.productId===line.productId?{...x,quantity:value}:x))}/></Card>):<EmptyState title={t('noData')}/>}
    {documentId?<Card><AppText variant="caption" muted>{ar?'عند تعديل تحويل قديم، يعكس التطبيق أثره أولاً. إذا تم استهلاك جزء من المخزون المحول فسيمنع التعديل لحماية الرصيد.':'Lors de la modification, l’ancien effet est d’abord inversé. Si une partie du stock transféré a été consommée, la modification est bloquée.'}</AppText></Card>:null}
    <Button loading={busy} disabled={!from||!to||from===to||!lines.length} title={documentId?t('save'):t('confirm')} onPress={()=>void submit()}/><Button title={t('cancel')} variant="ghost" onPress={()=>router.back()}/>
  </ScrollView><ProductPicker visible={picker} products={products} categories={categories} exclude={lines.map(l=>l.productId)} onClose={()=>setPicker(false)} onSelect={p=>setLines(current=>[...current,{productId:p.id,name:p.name,quantity:'1'}])}/></Screen>;
}
const styles=StyleSheet.create({content:{padding:spacing.md,gap:spacing.md,paddingBottom:spacing.xxl,backgroundColor:colors.background},chips:{flexDirection:'row',flexWrap:'wrap',gap:spacing.xs},line:{justifyContent:'space-between',alignItems:'center'}});
