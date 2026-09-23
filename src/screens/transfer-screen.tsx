import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect, router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type { Product, Warehouse } from '@/domain/types';
import { listProducts, listWarehouses } from '@/db/queries';
import { getDocumentById } from '@/db/document-queries';
import { transferStock } from '@/services/accounting-service';
import { updateStockTransfer } from '@/services/transaction-lifecycle-service';
import { ProductPicker } from '@/components/pickers';
import { AppText, Badge, Button, Chip, EmptyState, Field, Screen, SectionTitle } from '@/components/ui';
import { QuantityStepper, Sheet, StickyActionBar } from '@/components/mobile-interactions';
import { useI18n } from '@/i18n/provider';
import { useAuth } from '@/auth/provider';
import { colors, radius, spacing } from '@/theme';

type Line={product:Product;quantity:number;available:number};

export function TransferScreen(){
  const db=useSQLiteContext(),{t,isRTL,number,locale,errorMessage}=useI18n(),auth=useAuth(),ar=locale==='ar',params=useLocalSearchParams<{documentId?:string}>(),documentId=typeof params.documentId==='string'?params.documentId:'';
  const [products,setProducts]=useState<Product[]>([]),[warehouses,setWarehouses]=useState<Warehouse[]>([]),[from,setFrom]=useState(''),[to,setTo]=useState(''),[lines,setLines]=useState<Line[]>([]),[picker,setPicker]=useState(false),[busy,setBusy]=useState(false),[hydrated,setHydrated]=useState(!documentId),[editId,setEditId]=useState<string|null>(null),[draft,setDraft]=useState('1');
  const allowed=auth.has(documentId?'warehouses.transfer.edit':'warehouses.transfer');
  const load=useCallback(async()=>{if(!allowed)return;const [p,w,doc]=await Promise.all([listProducts(db,'',undefined,Boolean(documentId),500),listWarehouses(db,Boolean(documentId)),documentId?getDocumentById(db,documentId):Promise.resolve(null)]);if(documentId){if(!doc||doc.kind!=='transfer'||doc.status!=='posted'){Alert.alert(t('error'),ar?'تحويل المخزون غير موجود أو غير قابل للتعديل.':'Transfert introuvable ou non modifiable.');router.back();return}const fromId=doc.warehouseId??'',toId=doc.destinationWarehouseId??'',oldIds=new Set(doc.lines.map(line=>line.productId).filter(Boolean));setProducts(p.filter(product=>!product.isArchived||oldIds.has(product.id)));setWarehouses(w.filter(item=>!item.isArchived||item.id===fromId||item.id===toId));setFrom(fromId);setTo(toId);setLines(doc.lines.flatMap(line=>{if(!line.productId)return[];const product=p.find(item=>item.id===line.productId);if(!product)return[];return[{product,quantity:line.quantity,available:Number(product.stocks?.[fromId]??0)+line.quantity}]}));setHydrated(true);return}setProducts(p);setWarehouses(w);setFrom(current=>current||w.find(item=>item.isSalesDefault)?.id||w[0]?.id||'');setTo(current=>current||w.find(item=>item.id!==(w.find(x=>x.isSalesDefault)?.id||w[0]?.id))?.id||'');setHydrated(true)},[allowed,ar,db,documentId,t]);
  useFocusEffect(useCallback(()=>{void load()},[load]));
  if(!allowed)return <Screen><EmptyState title={ar?'ليس لديك صلاحية التحويل بين المخازن':'Vous n’avez pas le droit de transférer du stock entre les dépôts.'}/><Button title={t('cancel')} variant="ghost" onPress={()=>router.back()}/></Screen>;
  if(!hydrated)return <Screen><EmptyState title={t('loading')}/></Screen>;
  const chooseProduct=(product:Product)=>{const available=Number(product.stocks?.[from]??0);if(available<=0){Alert.alert(t('stock'),ar?'لا توجد كمية متاحة من هذا المنتج في مخزن المصدر.':'Aucune quantité disponible dans le dépôt source.');return}setLines(current=>[...current,{product,quantity:Math.min(1,available),available}])};
  const change=(id:string,value:number)=>setLines(current=>value<=0?current.filter(line=>line.product.id!==id):current.map(line=>line.product.id===id?{...line,quantity:Math.min(value,line.available)}:line));
  const openEdit=(line:Line)=>{setEditId(line.product.id);setDraft(String(line.quantity))};
  const saveEdit=()=>{if(editId){const value=Number(draft);if(Number.isFinite(value)&&value>0)change(editId,value)}setEditId(null)};
  const submit=async()=>{if(busy)return;setBusy(true);try{const payload={fromWarehouseId:from,toWarehouseId:to,lines:lines.map(line=>({productId:line.product.id,quantity:line.quantity}))};if(documentId)await updateStockTransfer(db,documentId,payload);else await transferStock(db,payload);router.back()}catch(error){Alert.alert(t('error'),errorMessage(error))}finally{setBusy(false)}};
  const fromName=warehouses.find(item=>item.id===from)?.name??'',toName=warehouses.find(item=>item.id===to)?.name??'';
  return <Screen padded={false}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
    <SectionTitle title={documentId?(ar?'تعديل تحويل المخزون':'Modifier le transfert'):t('transfer')} subtitle={ar?'اختر المصدر والوجهة، ثم أضف المنتجات والكميات.':'Choisissez source et destination, puis produits et quantités.'}/>
    <View style={styles.routePanel}><View style={styles.routeRule}/><AppText variant="caption" muted>{t('from')}</AppText><View style={[styles.chips,{flexDirection:isRTL?'row-reverse':'row'}]}>{warehouses.map(item=><Chip key={item.id} label={item.name} active={from===item.id} disabled={item.isArchived&&from!==item.id} onPress={()=>{setFrom(item.id);if(to===item.id)setTo('');setLines([])}}/>)}</View><View style={styles.divider}/><AppText variant="caption" muted>{t('to')}</AppText><View style={[styles.chips,{flexDirection:isRTL?'row-reverse':'row'}]}>{warehouses.filter(item=>item.id!==from).map(item=><Chip key={item.id} label={item.name} active={to===item.id} disabled={item.isArchived&&to!==item.id} onPress={()=>setTo(item.id)}/>)}</View></View>
    <SectionTitle title={t('products')} subtitle={lines.length?(ar?'استخدم + و− للكميات المعتادة، واضغط الرقم للكميات الكسرية.':'Utilisez +/− ; touchez le nombre pour une quantité décimale.'):undefined} action={<Button compact title={t('addLine')} onPress={()=>setPicker(true)}/>}/>
    {lines.length?<View style={styles.linesPanel}>{lines.map((line,index)=><View key={line.product.id} style={[styles.line,index===lines.length-1&&styles.lastLine]}><View style={[styles.lineHead,{flexDirection:isRTL?'row-reverse':'row'}]}><View style={styles.flex}><AppText variant="subheading" numberOfLines={2}>{line.product.name}</AppText><View style={[styles.meta,{flexDirection:isRTL?'row-reverse':'row'}]}><Badge label={ar?`متوفر ${number(line.available)}`:`Stock ${number(line.available)}`} tone="positive"/><AppText variant="caption" muted>{line.product.sku}</AppText></View></View><Button compact title={t('remove')} variant="ghost" onPress={()=>setLines(current=>current.filter(item=>item.product.id!==line.product.id))}/></View><QuantityStepper value={line.quantity} onDecrease={()=>change(line.product.id,line.quantity-1)} onIncrease={()=>change(line.product.id,line.quantity+1)} onEdit={()=>openEdit(line)}/></View>)}</View>:<View style={styles.emptyPanel}><EmptyState title={ar?'لم تضف منتجات بعد':'Aucun produit ajouté'} description={ar?'أضف المنتجات التي تريد نقلها فقط.':'Ajoutez uniquement les produits à transférer.'}/></View>}
  </ScrollView><StickyActionBar label={t('confirm')} summary={from&&to?(ar?`${fromName} ← ${toName} • ${lines.length} منتجات`:`${fromName} → ${toName} • ${lines.length} produits`):undefined} loading={busy} disabled={!from||!to||!lines.length} onPress={()=>void submit()}/><ProductPicker visible={picker} products={products.filter(product=>!product.isArchived||lines.some(line=>line.product.id===product.id))} exclude={lines.map(line=>line.product.id)} onClose={()=>setPicker(false)} onSelect={chooseProduct}/><Sheet visible={Boolean(editId)} title={ar?'الكمية المنقولة':'Quantité à transférer'} onClose={()=>setEditId(null)} footer={<Button title={t('save')} onPress={saveEdit}/>}><Field label={t('quantity')} value={draft} onChangeText={setDraft} keyboardType="decimal-pad" autoFocus selectTextOnFocus/></Sheet></Screen>;
}

const styles=StyleSheet.create({
  content:{padding:spacing.md,gap:spacing.md,paddingBottom:spacing.xxl,backgroundColor:colors.background},
  routePanel:{backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,padding:spacing.md,gap:spacing.sm},
  routeRule:{width:34,height:3,borderRadius:2,backgroundColor:colors.accent},
  divider:{height:StyleSheet.hairlineWidth,backgroundColor:colors.border,marginVertical:spacing.xxs},
  chips:{flexWrap:'wrap',gap:spacing.xs},
  linesPanel:{backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,overflow:'hidden'},
  line:{padding:spacing.md,gap:spacing.md,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border},
  lastLine:{borderBottomWidth:0},
  lineHead:{alignItems:'center',gap:spacing.md},
  flex:{flex:1},
  meta:{alignItems:'center',gap:spacing.xs,flexWrap:'wrap'},
  emptyPanel:{backgroundColor:colors.surfaceMuted,borderRadius:radius.lg,borderWidth:1,borderColor:colors.border},
});
