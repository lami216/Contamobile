import { useCallback, useMemo, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type { Warehouse } from '@/domain/types';
import { listWarehouses, stockOverview, type StockOverviewItem } from '@/db/queries';
import { AppHeader, AppText, Badge, Chip, EmptyState, HeroMetricCard, MetricCard, Money, Screen, SearchField, SectionTitle, SegmentedControl } from '@/components/ui';
import { useI18n } from '@/i18n/provider';
import { useAuth } from '@/auth/provider';
import { colors, radius, spacing } from '@/theme';

type StockFilter='all'|'low'|'out';

export function StockScreen(){
  const db=useSQLiteContext(),{t,number,locale,isRTL}=useI18n(),auth=useAuth(),ar=locale==='ar';
  const [items,setItems]=useState<StockOverviewItem[]>([]),[warehouses,setWarehouses]=useState<Warehouse[]>([]),[warehouseId,setWarehouseId]=useState(''),[search,setSearch]=useState(''),[filter,setFilter]=useState<StockFilter>('all');
  const load=useCallback(async()=>{
    if(!auth.has('warehouses.inventory.view'))return;
    const wh=await listWarehouses(db);
    setWarehouses(wh);
    const selected=warehouseId||wh.find(warehouse=>warehouse.isSalesDefault)?.id||wh[0]?.id||'';
    if(!warehouseId&&selected)setWarehouseId(selected);
    if(selected)setItems(await stockOverview(db,selected));else setItems([]);
  },[auth,db,warehouseId]);
  useFocusEffect(useCallback(()=>{void load()},[load]));
  const selectedWarehouse=warehouses.find(warehouse=>warehouse.id===warehouseId);
  const summary=useMemo(()=>items.reduce((acc,item)=>{acc.quantity+=item.quantity;acc.value+=item.inventoryValue;if(item.quantity>0&&item.quantity<=5)acc.low+=1;if(item.quantity===0)acc.out+=1;return acc},{quantity:0,value:0,low:0,out:0}),[items]);
  const visible=useMemo(()=>{
    const q=search.trim().toLocaleLowerCase();
    return items.filter(item=>{
      const matchesSearch=!q||`${item.name} ${item.sku} ${item.barcode}`.toLocaleLowerCase().includes(q);
      const matchesFilter=filter==='all'||(filter==='low'&&item.quantity>0&&item.quantity<=5)||(filter==='out'&&item.quantity===0);
      return matchesSearch&&matchesFilter;
    });
  },[filter,items,search]);
  if(!auth.has('warehouses.inventory.view'))return <Screen><EmptyState title={ar?'ليس لديك صلاحية عرض جرد المخزون':'Vous n’avez pas accès à l’inventaire du stock.'}/></Screen>;
  return <Screen padded={false}><FlatList
    data={visible}
    keyExtractor={item=>item.id}
    keyboardShouldPersistTaps="handled"
    contentContainerStyle={styles.list}
    ListHeaderComponent={<View style={styles.header}>
      <AppHeader eyebrow={ar?'المخزون':'Stock'} title={t('stock')} subtitle={selectedWarehouse?(ar?`المخزن: ${selectedWarehouse.name}`:`Dépôt : ${selectedWarehouse.name}`):undefined}/>
      {warehouses.length>1?<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.chips,{flexDirection:isRTL?'row-reverse':'row'}]}>{warehouses.map(warehouse=><Chip key={warehouse.id} label={warehouse.name} active={warehouseId===warehouse.id} onPress={()=>setWarehouseId(warehouse.id)}/>)}</ScrollView>:null}
      <HeroMetricCard label={ar?'قيمة المخزون في المخزن المختار':'Valeur du stock du dépôt'} value={Math.round(summary.value)} secondary={ar?'محسوبة من الكمية × آخر تكلفة شراء معتمدة.':'Quantité × dernier coût d’achat autoritatif.'}/>
      <View style={[styles.metrics,{flexDirection:isRTL?'row-reverse':'row'}]}><MetricCard label={ar?'إجمالي الوحدات':'Unités totales'} value={summary.quantity} format="number"/><MetricCard label={t('lowStock')} value={summary.low} format="number" tone={summary.low>0?'negative':'normal'}/><MetricCard label={ar?'نفاد المخزون':'Ruptures'} value={summary.out} format="number" tone={summary.out>0?'negative':'normal'}/></View>
      <SectionTitle title={ar?'المنتجات':'Produits'} subtitle={ar?'فلترة فورية حسب حالة المخزون.':'Filtrage instantané selon l’état du stock.'}/>
      <SearchField value={search} onChangeText={setSearch} placeholder={ar?'ابحث بالاسم أو SKU أو الباركود…':'Nom, SKU ou code-barres…'}/>
      <SegmentedControl value={filter} options={[{value:'all',label:ar?'الكل':'Tous'},{value:'low',label:ar?'منخفض':'Faible'},{value:'out',label:ar?'نفاد':'Épuisé'}]} onChange={setFilter}/>
    </View>}
    ListEmptyComponent={<EmptyState title={search?t('noResults'):filter==='out'?(ar?'لا توجد منتجات نافدة':'Aucune rupture de stock'):filter==='low'?(ar?'لا توجد منتجات منخفضة':'Aucun stock faible'):t('noData')}/>}
    renderItem={({item})=>{
      const tone=item.quantity===0?'negative':item.quantity<=5?'warning':'positive';
      const status=item.quantity===0?(ar?'نفاد':'Épuisé'):item.quantity<=5?t('lowStock'):(ar?'متوفر':'Disponible');
      return <View style={[styles.row,{flexDirection:isRTL?'row-reverse':'row'}]}>
        <View style={styles.body}>
          <View style={[styles.nameRow,{flexDirection:isRTL?'row-reverse':'row'}]}><AppText variant="subheading" numberOfLines={1} style={styles.name}>{item.name}</AppText><Badge label={status} tone={tone}/></View>
          <AppText variant="caption" muted numberOfLines={1}>{item.sku}{item.barcode?` • ${item.barcode}`:''}</AppText>
          <View style={[styles.detailRow,{flexDirection:isRTL?'row-reverse':'row'}]}><AppText variant="caption" muted>{ar?'تكلفة الوحدة':'Coût unitaire'}</AppText><Money value={Math.round(item.unitCost)}/></View>
        </View>
        <View style={styles.trailing}><AppText variant="caption" muted>{t('quantity')}</AppText><AppText variant="title" style={item.quantity<=5?styles.warning:styles.quantity}>{number(item.quantity)}</AppText><AppText variant="caption" muted>{ar?'القيمة':'Valeur'}</AppText><Money value={Math.round(item.inventoryValue)}/></View>
      </View>;
    }}
  /></Screen>;
}

const styles=StyleSheet.create({
  list:{padding:spacing.md,paddingBottom:spacing.xxl,backgroundColor:colors.background},
  header:{gap:spacing.md,marginBottom:spacing.sm},
  chips:{gap:spacing.xs},
  metrics:{gap:spacing.sm,flexWrap:'wrap'},
  row:{minHeight:112,alignItems:'center',gap:spacing.md,padding:spacing.md,marginBottom:spacing.sm,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:radius.lg},
  body:{flex:1,gap:spacing.xs},
  nameRow:{alignItems:'center',gap:spacing.xs},
  name:{flexShrink:1},
  detailRow:{alignItems:'center',gap:spacing.xs},
  trailing:{alignItems:'flex-end',gap:spacing.xxs,minWidth:92},
  quantity:{color:colors.text},
  warning:{color:colors.warning},
});
