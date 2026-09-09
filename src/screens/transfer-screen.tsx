import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type { Product, Warehouse } from '@/domain/types';
import { listProducts, listWarehouses } from '@/db/queries';
import { transferStock } from '@/services/accounting-service';
import { ProductPicker } from '@/components/pickers';
import { AppText, Badge, Button, Card, Chip, EmptyState, Field, Screen, SectionTitle } from '@/components/ui';
import { QuantityStepper, Sheet, StickyActionBar } from '@/components/mobile-interactions';
import { useI18n } from '@/i18n/provider';
import { useAuth } from '@/auth/provider';
import { colors, spacing } from '@/theme';

type Line={product:Product;quantity:number;available:number};

export function TransferScreen(){
  const db=useSQLiteContext(),{t,isRTL,number,locale,errorMessage}=useI18n(),auth=useAuth(),ar=locale==='ar';
  const [products,setProducts]=useState<Product[]>([]),[warehouses,setWarehouses]=useState<Warehouse[]>([]),[from,setFrom]=useState(''),[to,setTo]=useState(''),[lines,setLines]=useState<Line[]>([]),[picker,setPicker]=useState(false),[busy,setBusy]=useState(false),[editId,setEditId]=useState<string|null>(null),[draft,setDraft]=useState('1');
  const allowed=auth.has('warehouses.transfer');
  const load=useCallback(async()=>{if(!allowed)return;const [p,w]=await Promise.all([listProducts(db,'',undefined,false,300),listWarehouses(db)]);setProducts(p);setWarehouses(w);setFrom(current=>current||w.find(item=>item.isSalesDefault)?.id||w[0]?.id||'');setTo(current=>current||w.find(item=>item.id!==(w.find(x=>x.isSalesDefault)?.id||w[0]?.id))?.id||'')},[allowed,db]);
  useFocusEffect(useCallback(()=>{void load()},[load]));
  if(!allowed)return <Screen><EmptyState title={ar?'ليس لديك صلاحية التحويل بين المخازن':'Vous n’avez pas le droit de transférer du stock entre les dépôts.'}/><Button title={t('cancel')} variant="ghost" onPress={()=>router.back()}/></Screen>;
  const chooseProduct=(product:Product)=>{const available=Number(product.stocks?.[from]??0);if(available<=0){Alert.alert(t('stock'),ar?'لا توجد كمية متاحة من هذا المنتج في مخزن المصدر.':'Aucune quantité disponible dans le dépôt source.');return}setLines(current=>[...current,{product,quantity:Math.min(1,available),available}])};
  const change=(id:string,value:number)=>setLines(current=>value<=0?current.filter(line=>line.product.id!==id):current.map(line=>line.product.id===id?{...line,quantity:Math.min(value,line.available)}:line));
  const openEdit=(line:Line)=>{setEditId(line.product.id);setDraft(String(line.quantity))};
  const saveEdit=()=>{if(editId){const value=Number(draft);if(Number.isFinite(value)&&value>0)change(editId,value)}setEditId(null)};
  const submit=async()=>{if(busy)return;setBusy(true);try{await transferStock(db,{fromWarehouseId:from,toWarehouseId:to,lines:lines.map(line=>({productId:line.product.id,quantity:line.quantity}))});router.back()}catch(error){Alert.alert(t('error'),errorMessage(error))}finally{setBusy(false)}};
  const fromName=warehouses.find(item=>item.id===from)?.name??'',toName=warehouses.find(item=>item.id===to)?.name??'';
  return <Screen padded={false}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
    <SectionTitle title={t('transfer')} subtitle={ar?'اختر المصدر والوجهة، ثم أضف المنتجات والكميات.':'Choisissez source et destination, puis produits et quantités.'}/>
    <Card tone="primary"><AppText variant="caption" muted>{t('from')}</AppText><View style={[styles.chips,{flexDirection:isRTL?'row-reverse':'row'}]}>{warehouses.map(item=><Chip key={item.id} label={item.name} active={from===item.id} onPress={()=>{setFrom(item.id);if(to===item.id)setTo('');setLines([])}}/>)}</View><AppText variant="caption" muted>{t('to')}</AppText><View style={[styles.chips,{flexDirection:isRTL?'row-reverse':'row'}]}>{warehouses.filter(item=>item.id!==from).map(item=><Chip key={item.id} label={item.name} active={to===item.id} onPress={()=>setTo(item.id)}/>)}</View></Card>
    <SectionTitle title={t('products')} subtitle={lines.length?(ar?'استخدم + و− للكميات المعتادة، واضغط الرقم للكميات الكسرية.':'Utilisez +/− ; touchez le nombre pour une quantité décimale.'):undefined} action={<Button compact title={t('addLine')} onPress={()=>setPicker(true)}/>}/>
    {lines.length?lines.map(line=><Card key={line.product.id}><View style={[styles.lineHead,{flexDirection:isRTL?'row-reverse':'row'}]}><View style={styles.flex}><AppText variant="subheading" numberOfLines={2}>{line.product.name}</AppText><View style={[styles.meta,{flexDirection:isRTL?'row-reverse':'row'}]}><Badge label={ar?`متوفر ${number(line.available)}`:`Stock ${number(line.available)}`} tone="positive"/><AppText variant="caption" muted>{line.product.sku}</AppText></View></View><Button compact title={t('remove')} variant="ghost" onPress={()=>setLines(current=>current.filter(item=>item.product.id!==line.product.id))}/></View><QuantityStepper value={line.quantity} onDecrease={()=>change(line.product.id,line.quantity-1)} onIncrease={()=>change(line.product.id,line.quantity+1)} onEdit={()=>openEdit(line)}/></Card>):<Card tone="muted"><EmptyState title={ar?'لم تضف منتجات بعد':'Aucun produit ajouté'} description={ar?'أضف المنتجات التي تريد نقلها فقط.':'Ajoutez uniquement les produits à transférer.'}/></Card>}
  </ScrollView><StickyActionBar label={t('confirm')} summary={from&&to?(ar?`${fromName} ← ${toName} • ${lines.length} منتجات`:`${fromName} → ${toName} • ${lines.length} produits`):undefined} loading={busy} disabled={!from||!to||!lines.length} onPress={()=>void submit()}/><ProductPicker visible={picker} products={products} exclude={lines.map(line=>line.product.id)} onClose={()=>setPicker(false)} onSelect={chooseProduct}/><Sheet visible={Boolean(editId)} title={ar?'الكمية المنقولة':'Quantité à transférer'} onClose={()=>setEditId(null)} footer={<Button title={t('save')} onPress={saveEdit}/>}><Field label={t('quantity')} value={draft} onChangeText={setDraft} keyboardType="decimal-pad" autoFocus selectTextOnFocus/></Sheet></Screen>;
}

const styles=StyleSheet.create({content:{padding:spacing.md,gap:spacing.md,paddingBottom:spacing.xxl,backgroundColor:colors.background},chips:{flexWrap:'wrap',gap:spacing.xs},lineHead:{alignItems:'center',gap:spacing.md},flex:{flex:1},meta:{alignItems:'center',gap:spacing.xs,flexWrap:'wrap'}});
