import { useCallback, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect, router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type { Product, Warehouse } from '@/domain/types';
import { listProducts, listWarehouses } from '@/db/queries';
import { getDocumentById } from '@/db/document-queries';
import { adjustStock } from '@/services/accounting-service';
import { updateStockAdjustment } from '@/services/transaction-lifecycle-service';
import { ProductPicker } from '@/components/pickers';
import { AppText, Badge, Button, Chip, EmptyState, Field, Screen, SectionTitle } from '@/components/ui';
import { QuantityStepper, Sheet, StickyActionBar } from '@/components/mobile-interactions';
import { useI18n } from '@/i18n/provider';
import { useAuth } from '@/auth/provider';
import { colors, radius, spacing } from '@/theme';

type Line={product:Product;current:number;actual:number};

export function AdjustmentScreen(){
  const db=useSQLiteContext(),{t,isRTL,number,locale,errorMessage}=useI18n(),auth=useAuth(),ar=locale==='ar',params=useLocalSearchParams<{documentId?:string}>(),documentId=typeof params.documentId==='string'?params.documentId:'';
  const [products,setProducts]=useState<Product[]>([]),[warehouses,setWarehouses]=useState<Warehouse[]>([]),[warehouseId,setWarehouseId]=useState(''),[reason,setReason]=useState(''),[lines,setLines]=useState<Line[]>([]),[picker,setPicker]=useState(false),[busy,setBusy]=useState(false),[hydrated,setHydrated]=useState(!documentId),[editId,setEditId]=useState<string|null>(null),[actualDraft,setActualDraft]=useState('0');
  const allowed=auth.has(documentId?'warehouses.adjust.edit':'warehouses.adjust');
  const load=useCallback(async()=>{if(!allowed)return;const [w,p,doc]=await Promise.all([listWarehouses(db,Boolean(documentId)),listProducts(db,'',undefined,Boolean(documentId),500),documentId?getDocumentById(db,documentId):Promise.resolve(null)]);if(documentId){if(!doc||doc.kind!=='adjustment'||doc.status!=='posted'){Alert.alert(t('error'),ar?'سند التصحيح غير موجود أو غير قابل للتعديل.':'Ajustement introuvable ou non modifiable.');router.back();return}const warehouse=doc.warehouseId??'',oldIds=new Set(doc.lines.map(line=>line.productId).filter(Boolean));setWarehouses(w.filter(item=>!item.isArchived||item.id===warehouse));setProducts(p.filter(product=>!product.isArchived||oldIds.has(product.id)));setWarehouseId(warehouse);setReason(doc.title??'');setLines(doc.lines.flatMap(line=>{if(!line.productId)return[];const product=p.find(item=>item.id===line.productId);if(!product)return[];const current=Number(line.balanceBefore??(Number(product.stocks?.[warehouse]??0)-line.quantity)),actual=Number(line.balanceAfter??(current+line.quantity));return[{product,current,actual}]}));setHydrated(true);return}setWarehouses(w);setProducts(p);const selected=warehouseId||w.find(item=>item.isSalesDefault)?.id||w[0]?.id||'';if(!warehouseId)setWarehouseId(selected);setHydrated(true)},[allowed,ar,db,documentId,t,warehouseId]);
  useFocusEffect(useCallback(()=>{void load()},[load]));
  const changed=useMemo(()=>lines.filter(line=>line.actual!==line.current),[lines]);
  const missingOrigin=useMemo(()=>changed.filter(line=>line.actual>line.current&&!(Number(line.product.lastPurchaseCost)>0)),[changed]);
  if(!allowed)return <Screen><EmptyState title={ar?'ليس لديك صلاحية تصحيح المخزون':'Vous n’avez pas le droit de corriger le stock.'}/><Button title={t('cancel')} variant="ghost" onPress={()=>router.back()}/></Screen>;
  if(!hydrated)return <Screen><EmptyState title={t('loading')}/></Screen>;
  const chooseProduct=(product:Product)=>{const current=Number(product.stocks?.[warehouseId]??0);setLines(items=>[...items,{product,current,actual:current}])};
  const setActual=(id:string,value:number)=>setLines(current=>current.map(line=>line.product.id===id?{...line,actual:Math.max(0,value)}:line));
  const openEdit=(line:Line)=>{setEditId(line.product.id);setActualDraft(String(line.actual))};
  const saveEdit=()=>{if(editId){const actual=Number(actualDraft);if(Number.isFinite(actual)&&actual>=0)setLines(current=>current.map(line=>line.product.id===editId?{...line,actual}:line))}setEditId(null)};
  const submit=async()=>{if(busy||(!documentId&&missingOrigin.length))return;setBusy(true);try{const payload={warehouseId,reason,lines:(documentId?lines:changed).map(line=>({productId:line.product.id,actualQuantity:line.actual}))};if(documentId)await updateStockAdjustment(db,documentId,{reason:payload.reason,lines:payload.lines});else await adjustStock(db,payload);router.back()}catch(error){Alert.alert(t('error'),errorMessage(error))}finally{setBusy(false)}};
  const warehouseName=warehouses.find(item=>item.id===warehouseId)?.name??'';
  return <Screen padded={false}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
    <SectionTitle title={documentId?(ar?'تعديل تصحيح المخزون':'Modifier l’ajustement'):t('adjustment')} subtitle={ar?'التصحيح يطابق الكمية الفعلية فقط. إدخال مخزون جديد يتم من رصيد البداية أو فاتورة شراء.':'La correction aligne uniquement la quantité réelle. Un nouveau stock entre par stock initial ou facture d’achat.'}/>
    <View style={styles.contextPanel}><View style={styles.contextRule}/><AppText variant="caption" muted>{t('warehouse')}</AppText><View style={[styles.chips,{flexDirection:isRTL?'row-reverse':'row'}]}>{warehouses.map(item=><Chip key={item.id} label={item.name} active={warehouseId===item.id} disabled={Boolean(documentId)||(lines.length>0&&warehouseId!==item.id)} onPress={()=>{setWarehouseId(item.id);setLines([])}}/>)}</View><View style={styles.divider}/><Field label={t('reason')} value={reason} onChangeText={setReason} placeholder={ar?'مثال: جرد نهاية اليوم':'Ex. inventaire de fin de journée'}/></View>
    <SectionTitle title={t('products')} subtitle={lines.length?(ar?'القيمة المعروضة هي الكمية الفعلية الجديدة.':'La valeur affichée est la nouvelle quantité réelle.'):undefined} action={documentId?undefined:<Button compact title={t('addLine')} onPress={()=>setPicker(true)}/>}/>
    {lines.length?<View style={styles.linesPanel}>{lines.map((line,index)=>{const delta=line.actual-line.current,canIncrease=Number(line.product.lastPurchaseCost)>0;return <View key={line.product.id} style={[styles.line,index===lines.length-1&&styles.lastLine]}><View style={[styles.lineHead,{flexDirection:isRTL?'row-reverse':'row'}]}><View style={styles.flex}><AppText variant="subheading" numberOfLines={2}>{line.product.name}</AppText><View style={[styles.meta,{flexDirection:isRTL?'row-reverse':'row'}]}><Badge label={ar?`قبل ${number(line.current)}`:`Avant ${number(line.current)}`} tone="neutral"/><Badge label={delta===0?(ar?'بدون تغيير':'Inchangé'):delta>0?`+${number(delta)}`:number(delta)} tone={delta===0?'neutral':delta>0?'positive':'negative'}/></View></View>{documentId?null:<Button compact title={t('remove')} variant="ghost" onPress={()=>setLines(current=>current.filter(item=>item.product.id!==line.product.id))}/>} </View><View style={[styles.adjustRow,{flexDirection:isRTL?'row-reverse':'row'}]}><View><AppText variant="caption" muted>{t('actualQuantity')}</AppText><AppText variant="heading">{number(line.actual)}</AppText></View><QuantityStepper value={line.actual} onDecrease={()=>setActual(line.product.id,line.actual-1)} onIncrease={()=>setActual(line.product.id,line.actual+1)} onEdit={()=>openEdit(line)}/></View>{delta>0&&!canIncrease?<View style={styles.warningNote}><View style={styles.warningRule}/><AppText variant="caption" style={styles.warningText}>{ar?'لا يمكن إنشاء تكلفة من شاشة التصحيح. أدخل المنتج أولًا برصيد بداية مع سعر شراء، أو عبر فاتورة شراء.':'La correction ne peut pas créer un coût. Entrez d’abord le produit via stock initial avec prix d’achat, ou via facture d’achat.'}</AppText></View>:null}</View>})}</View>:<View style={styles.emptyPanel}><EmptyState title={ar?'لا توجد منتجات في التصحيح':'Aucun produit à corriger'} description={ar?'أضف فقط المنتجات التي قارنت رصيدها بالنظام.':'Ajoutez uniquement les produits réellement comptés.'}/></View>}
  </ScrollView><StickyActionBar label={t('confirm')} summary={changed.length?(ar?`${warehouseName} • ${changed.length} تغييرات`:`${warehouseName} • ${changed.length} changements`):undefined} loading={busy} disabled={!warehouseId||!reason.trim()||(!documentId&&!changed.length)||(!documentId&&missingOrigin.length>0)} onPress={()=>void submit()}/><ProductPicker visible={picker&&!documentId} products={products.filter(product=>!product.isArchived)} exclude={lines.map(line=>line.product.id)} onClose={()=>setPicker(false)} onSelect={chooseProduct}/><Sheet visible={Boolean(editId)} title={ar?'الكمية الفعلية':'Quantité réelle'} onClose={()=>setEditId(null)} footer={<Button title={t('save')} onPress={saveEdit}/>}><Field label={t('actualQuantity')} value={actualDraft} onChangeText={setActualDraft} keyboardType="decimal-pad" autoFocus selectTextOnFocus/></Sheet></Screen>;
}

const styles=StyleSheet.create({
  content:{padding:spacing.md,gap:spacing.md,paddingBottom:spacing.xxl,backgroundColor:colors.background},
  contextPanel:{backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,padding:spacing.md,gap:spacing.sm},
  contextRule:{width:34,height:3,borderRadius:2,backgroundColor:colors.accent},
  divider:{height:StyleSheet.hairlineWidth,backgroundColor:colors.border,marginVertical:spacing.xxs},
  chips:{flexWrap:'wrap',gap:spacing.xs},
  linesPanel:{backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,overflow:'hidden'},
  line:{padding:spacing.md,gap:spacing.md,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border},
  lastLine:{borderBottomWidth:0},
  lineHead:{alignItems:'center',gap:spacing.md},
  flex:{flex:1},
  meta:{alignItems:'center',gap:spacing.xs,flexWrap:'wrap'},
  adjustRow:{alignItems:'center',justifyContent:'space-between',gap:spacing.md},
  warningNote:{gap:spacing.xs,padding:spacing.sm,borderRadius:radius.md,backgroundColor:colors.warningSoft},
  warningRule:{width:28,height:2,borderRadius:2,backgroundColor:colors.warning},
  warningText:{color:colors.warning},
  emptyPanel:{backgroundColor:colors.surfaceMuted,borderRadius:radius.lg,borderWidth:1,borderColor:colors.border},
});
