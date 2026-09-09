import { useCallback, useMemo, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type { Product, Warehouse } from '@/domain/types';
import { listProducts, listWarehouses } from '@/db/queries';
import { AppText, Badge, Chip, EmptyState, Money, Screen, SearchField, SectionTitle } from '@/components/ui';
import { useI18n } from '@/i18n/provider';
import { useAuth } from '@/auth/provider';
import { colors, radius, spacing } from '@/theme';

export function StockScreen(){
  const db=useSQLiteContext(),{t,number,locale,isRTL}=useI18n(),auth=useAuth(),ar=locale==='ar';
  const [products,setProducts]=useState<Product[]>([]),[warehouses,setWarehouses]=useState<Warehouse[]>([]),[warehouseId,setWarehouseId]=useState(''),[search,setSearch]=useState('');
  const load=useCallback(async()=>{if(!auth.has('warehouses.inventory.view'))return;const wh=await listWarehouses(db);setWarehouses(wh);const selected=warehouseId||wh.find(w=>w.isSalesDefault)?.id||wh[0]?.id||'';if(!warehouseId&&selected)setWarehouseId(selected);setProducts(await listProducts(db,search,selected,false,150))},[auth,db,search,warehouseId]);
  useFocusEffect(useCallback(()=>{void load()},[load]));
  const summary=useMemo(()=>products.reduce((acc,item)=>{const qty=Number(item.stocks?.[warehouseId]??0),cost=Number(item.lastPurchaseCost??item.pieceCost??0);acc.quantity+=qty;acc.value+=qty*cost;if(qty<=5)acc.low+=1;return acc},{quantity:0,value:0,low:0}),[products,warehouseId]);
  if(!auth.has('warehouses.inventory.view'))return <Screen><EmptyState title={ar?'ليس لديك صلاحية عرض جرد المخزون':'Vous n’avez pas accès à l’inventaire du stock.'}/></Screen>;
  return <Screen padded={false}><FlatList data={products} keyExtractor={item=>item.id} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.list} ListHeaderComponent={<View style={styles.header}><SectionTitle title={t('stock')} subtitle={ar?'اعرف الكمية والقيمة والمنتجات التي تحتاج إعادة تزويد بسرعة.':'Quantités, valeur et produits à réapprovisionner en un coup d’œil.'}/>{warehouses.length>1?<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.chips,{flexDirection:isRTL?'row-reverse':'row'}]}>{warehouses.map(w=><Chip key={w.id} label={w.name} active={warehouseId===w.id} onPress={()=>setWarehouseId(w.id)}/>)}</ScrollView>:null}<View style={[styles.summaryPanel,{flexDirection:isRTL?'row-reverse':'row'}]}><Metric label={ar?'إجمالي الكمية':'Quantité totale'} value={<AppText variant="heading">{number(summary.quantity)}</AppText>}/><Metric label={t('inventoryValue')} value={<Money value={Math.round(summary.value)}/>}/><Metric label={t('lowStock')} value={<AppText variant="heading" style={summary.low>0?styles.warning:undefined}>{number(summary.low)}</AppText>} warning={summary.low>0} last/></View><SearchField value={search} onChangeText={setSearch} placeholder={ar?'ابحث بالاسم أو الباركود…':'Nom ou code-barres…'}/></View>} ListEmptyComponent={<EmptyState title={search?t('noResults'):t('noData')}/>} renderItem={({item})=>{const qty=Number(item.stocks?.[warehouseId]??0),cost=Number(item.lastPurchaseCost??item.pieceCost??0);return <View style={[styles.row,{flexDirection:isRTL?'row-reverse':'row'}]}><View style={styles.body}><View style={[styles.nameRow,{flexDirection:isRTL?'row-reverse':'row'}]}><AppText variant="subheading" numberOfLines={1} style={styles.name}>{item.name}</AppText>{qty<=5?<Badge label={t('lowStock')} tone="warning"/>:null}</View><AppText variant="caption" muted>{item.sku}{item.barcode?` • ${item.barcode}`:''}</AppText><View style={[styles.costRow,{flexDirection:isRTL?'row-reverse':'row'}]}><AppText variant="caption" muted>{t('purchasePrice')}</AppText><Money value={cost}/></View></View><View style={styles.trailing}><AppText variant="caption" muted>{t('quantity')}</AppText><AppText variant="title" style={qty<=5?styles.warning:styles.quantity}>{number(qty)}</AppText>{cost>0?<AppText variant="caption" muted>{ar?'القيمة':'Valeur'}</AppText>:null}{cost>0?<Money value={Math.round(qty*cost)}/>:null}</View></View>}}/></Screen>;
}

function Metric({label,value,warning=false,last=false}:{label:string;value:React.ReactNode;warning?:boolean;last?:boolean}){return <View style={[styles.metric,last&&styles.lastMetric]}><View style={[styles.metricRule,warning&&styles.warningRule]}/><AppText variant="caption" muted>{label}</AppText>{value}</View>}

const styles=StyleSheet.create({
  list:{padding:spacing.md,paddingBottom:spacing.xxl,backgroundColor:colors.background},
  header:{gap:spacing.md,marginBottom:spacing.sm},
  chips:{gap:spacing.xs},
  summaryPanel:{borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,backgroundColor:colors.surface,overflow:'hidden'},
  metric:{flex:1,minWidth:104,padding:spacing.md,gap:spacing.xs,borderRightWidth:StyleSheet.hairlineWidth,borderRightColor:colors.border},
  lastMetric:{borderRightWidth:0},
  metricRule:{width:24,height:2,borderRadius:2,backgroundColor:colors.accent},
  warningRule:{backgroundColor:colors.warning},
  row:{minHeight:104,alignItems:'center',gap:spacing.md,paddingVertical:spacing.md,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border},
  body:{flex:1,gap:spacing.xs},
  nameRow:{alignItems:'center',gap:spacing.xs},
  name:{flexShrink:1},
  costRow:{alignItems:'center',gap:spacing.xs},
  trailing:{alignItems:'flex-end',gap:spacing.xxs,minWidth:86},
  quantity:{color:colors.text},
  warning:{color:colors.warning},
});
