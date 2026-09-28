import { useCallback, useMemo, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type { Warehouse } from '@/domain/types';
import { listWarehouses, stockOverview, type StockOverviewItem } from '@/db/queries';
import { AppText, Badge, Chip, EmptyState, IconTile, Money, PageHeader, Screen, SearchField, SegmentedControl } from '@/components/ui';
import { useI18n } from '@/i18n/provider';
import { useAuth } from '@/auth/provider';
import { colors, elevation, radius, spacing } from '@/theme';

type StockFilter='all'|'low'|'out';

export function StockScreen(){
  const db=useSQLiteContext(),{t,number,isRTL}=useI18n(),auth=useAuth();
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
  const summary=useMemo(()=>items.reduce((acc,item)=>{
    acc.quantity+=item.quantity;
    acc.value+=item.inventoryValue;
    if(item.quantity>0&&item.quantity<=5)acc.low+=1;
    if(item.quantity===0)acc.out+=1;
    return acc;
  },{quantity:0,value:0,low:0,out:0}),[items]);

  const visible=useMemo(()=>{
    const q=search.trim().toLocaleLowerCase();
    return items.filter(item=>{
      const matchesSearch=!q||`${item.name} ${item.sku} ${item.barcode}`.toLocaleLowerCase().includes(q);
      const matchesFilter=filter==='all'||(filter==='low'&&item.quantity>0&&item.quantity<=5)||(filter==='out'&&item.quantity===0);
      return matchesSearch&&matchesFilter;
    });
  },[filter,items,search]);

  if(!auth.has('warehouses.inventory.view'))return <Screen><EmptyState title={t('error')}/></Screen>;

  return <Screen padded={false}><FlatList
    data={visible}
    keyExtractor={item=>item.id}
    keyboardShouldPersistTaps="handled"
    contentContainerStyle={styles.list}
    ListHeaderComponent={<View style={styles.header}>
      <PageHeader title={t('stock')} subtitle={warehouses.length===1?selectedWarehouse?.name:undefined}/>
      <SearchField value={search} onChangeText={setSearch} placeholder={t('stockSearchPlaceholder')}/>
      {warehouses.length>1?<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.chips,{flexDirection:isRTL?'row-reverse':'row'}]}>{warehouses.map(warehouse=><Chip key={warehouse.id} label={warehouse.name} active={warehouseId===warehouse.id} onPress={()=>setWarehouseId(warehouse.id)}/>)}</ScrollView>:null}
      <SegmentedControl value={filter} options={[{value:'all',label:t('stockFilterAll')},{value:'low',label:t('stockFilterLow')},{value:'out',label:t('stockFilterOut')}]} onChange={setFilter}/>
      <View style={styles.summaryCard}>
        <View style={[styles.summaryTop,{flexDirection:isRTL?'row-reverse':'row'}]}>
          <IconTile tone="warning"><InventoryValueGlyph/></IconTile>
          <View style={styles.summaryCopy}><AppText variant="caption" muted>{t('stockInventoryValue')}</AppText><Money value={Math.round(summary.value)} large/></View>
        </View>
        <View style={[styles.summaryMetrics,{flexDirection:isRTL?'row-reverse':'row'}]}>
          <MiniMetric label={t('stockTotalUnits')} value={number(summary.quantity)}/>
          <View style={styles.metricDivider}/>
          <MiniMetric label={t('lowStock')} value={number(summary.low)} tone={summary.low>0?'warning':'normal'}/>
          <View style={styles.metricDivider}/>
          <MiniMetric label={t('stockOut')} value={number(summary.out)} tone={summary.out>0?'negative':'normal'}/>
        </View>
      </View>
      <AppText variant="heading" style={styles.productsTitle}>{t('stockProducts')}</AppText>
    </View>}
    ListEmptyComponent={<EmptyState title={search?t('noResults'):filter==='out'?t('stockNoOut'):filter==='low'?t('stockNoLow'):t('noData')}/>}
    renderItem={({item,index})=><StockRow item={item} first={index===0} last={index===visible.length-1}/>}
  /></Screen>;
}

function MiniMetric({label,value,tone='normal'}:{label:string;value:string;tone?:'normal'|'warning'|'negative'}){
  return <View style={styles.miniMetric}><AppText variant="caption" muted numberOfLines={1}>{label}</AppText><AppText variant="subheading" style={[styles.miniMetricValue,tone==='warning'&&styles.warning,tone==='negative'&&styles.negative]}>{value}</AppText></View>;
}

function StockRow({item,first,last}:{item:StockOverviewItem;first:boolean;last:boolean}){
  const {t,isRTL,number}=useI18n();
  const tone=item.quantity===0?'negative':item.quantity<=5?'warning':'positive';
  const status=item.quantity===0?t('stockFilterOut'):item.quantity<=5?t('lowStock'):t('stockAvailable');
  return <View style={[styles.row,first&&styles.firstRow,last&&styles.lastRow,{flexDirection:isRTL?'row-reverse':'row'}]}>
    <View style={styles.body}>
      <View style={[styles.nameRow,{flexDirection:isRTL?'row-reverse':'row'}]}><AppText variant="subheading" numberOfLines={2} style={styles.name}>{item.name}</AppText><Badge label={status} tone={tone}/></View>
      <AppText variant="caption" muted numberOfLines={1}>{item.sku}{item.barcode?' • '+item.barcode:''}</AppText>
      <View style={[styles.stockMeta,{flexDirection:isRTL?'row-reverse':'row'}]}><AppText variant="caption" muted>{t('quantity')}</AppText><AppText variant="caption" style={[styles.stockQuantity,item.quantity<=5&&styles.warning]}>{number(item.quantity)}</AppText></View>
    </View>
    <View style={styles.trailing}>
      <AppText variant="caption" muted>{t('stockUnitCost')}</AppText>
      <Money value={Math.round(item.unitCost)}/>
      <View style={styles.valueLine}/>
      <AppText variant="caption" muted>{t('stockItemValue')}</AppText>
      <Money value={Math.round(item.inventoryValue)}/>
    </View>
  </View>;
}

function InventoryValueGlyph(){
  return <View style={styles.inventoryGlyph}><View style={styles.inventoryBox}/><View style={styles.inventoryLine}/><View style={styles.inventoryCoin}/></View>;
}

const styles=StyleSheet.create({
  list:{paddingHorizontal:spacing.md,paddingBottom:spacing.xxl,backgroundColor:colors.background},
  header:{gap:spacing.sm,marginBottom:spacing.sm},
  chips:{gap:spacing.xs},
  summaryCard:{gap:spacing.md,padding:spacing.md,borderRadius:radius.lg,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,...elevation.subtle},
  summaryTop:{alignItems:'center',gap:spacing.sm},
  summaryCopy:{flex:1,minWidth:0,gap:2},
  summaryMetrics:{alignItems:'stretch',borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:colors.border,paddingTop:spacing.sm},
  miniMetric:{flex:1,minWidth:0,gap:2,paddingHorizontal:spacing.xs},
  miniMetricValue:{fontVariant:['tabular-nums']},
  metricDivider:{width:StyleSheet.hairlineWidth,backgroundColor:colors.border},
  productsTitle:{marginTop:spacing.xs},
  row:{minHeight:84,alignItems:'center',gap:spacing.sm,paddingHorizontal:spacing.md,paddingVertical:spacing.sm,backgroundColor:colors.surface,borderLeftWidth:1,borderRightWidth:1,borderTopWidth:StyleSheet.hairlineWidth,borderColor:colors.border},
  firstRow:{borderTopWidth:1,borderTopLeftRadius:radius.lg,borderTopRightRadius:radius.lg},
  lastRow:{borderBottomWidth:1,borderBottomLeftRadius:radius.lg,borderBottomRightRadius:radius.lg},
  body:{flex:1,minWidth:0,gap:4},
  nameRow:{alignItems:'center',gap:spacing.xs},
  name:{flexShrink:1},
  stockMeta:{alignItems:'center',gap:spacing.xs},
  stockQuantity:{fontWeight:'800',color:colors.positive},
  trailing:{minWidth:92,alignItems:'flex-end',gap:2},
  valueLine:{width:26,height:1,backgroundColor:colors.border,marginVertical:2},
  warning:{color:colors.warning},
  negative:{color:colors.negative},
  inventoryGlyph:{width:26,height:25,position:'relative',alignItems:'center',justifyContent:'center'},
  inventoryBox:{width:20,height:17,borderWidth:2,borderColor:colors.warning,borderRadius:4},
  inventoryLine:{position:'absolute',top:5,width:20,height:2,backgroundColor:colors.warning},
  inventoryCoin:{position:'absolute',right:0,bottom:0,width:8,height:8,borderRadius:4,borderWidth:2,borderColor:colors.warning,backgroundColor:colors.warningSoft},
});
