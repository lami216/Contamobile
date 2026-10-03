import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useFocusEffect,router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type { Warehouse } from '@/domain/types';
import { listWarehouses, stockOverview, type StockOverviewItem } from '@/db/queries';
import {
  AppText,
  Badge,
  Button,
  EmptyState,
  GroupedList,
  Money,
  PageHeader,
  Screen,
  SearchField,
  SegmentedControl,
  SelectRow,
} from '@/components/ui';
import { StitchPanel, StitchIcon, StitchText, stitch } from '@/components/stitch';
import { Sheet, StickyActionBar } from '@/components/mobile-interactions';
import { useI18n } from '@/i18n/provider';
import { useAuth } from '@/auth/provider';
import { colors, radius, spacing } from '@/theme';

type StockFilter='all'|'available'|'low'|'out';

export function StockScreen(){
  const db=useSQLiteContext(),{t,number,isRTL}=useI18n(),auth=useAuth();
  const [items,setItems]=useState<StockOverviewItem[]>([]);
  const [warehouses,setWarehouses]=useState<Warehouse[]>([]);
  const [warehouseId,setWarehouseId]=useState('');
  const [warehousePicker,setWarehousePicker]=useState(false);
  const [search,setSearch]=useState('');
  const [filter,setFilter]=useState<StockFilter>('all');

  const load=useCallback(async()=>{
    if(!auth.has('warehouses.inventory.view'))return;
    const wh=await listWarehouses(db);
    setWarehouses(wh);
    const selected=warehouseId||wh.find(warehouse=>warehouse.isSalesDefault)?.id||wh[0]?.id||'';
    if(!warehouseId&&selected)setWarehouseId(selected);
    setItems(selected?await stockOverview(db,selected):[]);
  },[auth,db,warehouseId]);

  useFocusEffect(useCallback(()=>{void load()},[load]));

  const selectedWarehouse=warehouses.find(warehouse=>warehouse.id===warehouseId)??null;
  const summary=useMemo(()=>items.reduce((acc,item)=>{
    acc.quantity+=item.quantity;
    acc.value+=item.inventoryValue;
    if(item.quantity>0&&item.quantity<=5)acc.low+=1;
    if(item.quantity===0)acc.out+=1;
    return acc;
  },{quantity:0,value:0,low:0,out:0}),[items]);

  const visible=useMemo(()=>{
    const query=search.trim().toLocaleLowerCase();
    return items.filter(item=>{
      const matchesSearch=!query||`${item.name} ${item.categoryName??''} ${item.sku} ${item.barcode}`.toLocaleLowerCase().includes(query);
      const matchesFilter=
        filter==='all'||
        (filter==='available'&&item.quantity>5)||
        (filter==='low'&&item.quantity>0&&item.quantity<=5)||
        (filter==='out'&&item.quantity===0);
      return matchesSearch&&matchesFilter;
    });
  },[filter,items,search]);

  if(!auth.has('warehouses.inventory.view'))return <Screen><EmptyState title={t('error')}/></Screen>;

  return <Screen padded={false}>
    <FlatList
      data={visible}
      keyExtractor={item=>item.id}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.list}
      ListHeaderComponent={<View style={styles.header}>
        <PageHeader title={t('stock')} subtitle={warehouses.length===1?selectedWarehouse?.name:undefined}/>

        {warehouses.length>=1?<GroupedList>
          <SelectRow
            label={t('warehouse')}
            value={selectedWarehouse?.name??t('warehouse')}
            leading={<WarehouseTile/>}
            onPress={()=>setWarehousePicker(true)}
          />
        </GroupedList>:null}

        <SearchField value={search} onChangeText={setSearch} placeholder={t('stockSearchPlaceholder')}/>

        <SegmentedControl
          value={filter}
          options={[
            {value:'all',label:t('stockFilterAll')},
            {value:'available',label:t('stockAvailable')},
            {value:'low',label:t('stockFilterLow')},
            {value:'out',label:t('stockFilterOut')},
          ]}
          onChange={setFilter}
        />

        <StitchPanel><View style={{flexDirection:isRTL?'row-reverse':'row',justifyContent:'space-between',alignItems:'center'}}><View style={{gap:6}}><AppText variant="caption" muted>{t('stockInventoryValue')}</AppText><StitchText bold size={28} color={stitch.lightGold}>{number(Math.round(summary.value))} MRU</StitchText></View><StitchIcon name="inventory" size={32}/></View><View style={{flexDirection:isRTL?'row-reverse':'row',gap:8,borderTopWidth:1,borderTopColor:colors.border,paddingTop:12}}><SummaryMetric label={t('stockTotalUnits')} value={<AppText variant="subheading">{number(summary.quantity)}</AppText>}/><SummaryDivider/><SummaryMetric label={t('lowStock')} value={<AppText variant="subheading" style={styles.warning}>{number(summary.low)}</AppText>}/><SummaryDivider/><SummaryMetric label={t('stockOut')} value={<AppText variant="subheading" style={styles.negative}>{number(summary.out)}</AppText>}/></View></StitchPanel>
      </View>}
      ListEmptyComponent={<EmptyState title={search?t('noResults'):filter==='out'?t('stockNoOut'):filter==='low'?t('stockNoLow'):t('noData')}/>}
      renderItem={({item,index})=><StockRow item={item} first={index===0} last={index===visible.length-1}/>}
    />

    {auth.has('warehouses.adjust')?<StickyActionBar label={t('adjustment')} summary={selectedWarehouse?.name} onPress={()=>router.push('/inventory/adjustment')}/>:null}
    <Sheet visible={warehousePicker} title={t('warehouse')} onClose={()=>setWarehousePicker(false)}>
      <View style={styles.warehouseOptions}>
        {warehouses.map(warehouse=><Button
          key={warehouse.id}
          title={warehouse.name}
          variant={warehouse.id===warehouseId?'primary':'secondary'}
          onPress={()=>{setWarehouseId(warehouse.id);setWarehousePicker(false)}}
        />)}
      </View>
    </Sheet>
  </Screen>;
}

function SummaryMetric({label,value}:{label:string;value:ReactNode}){
  return <View style={styles.summaryMetric}><AppText variant="caption" muted numberOfLines={1}>{label}</AppText>{value}</View>;
}

function SummaryDivider(){
  return <View style={styles.summaryDivider}/>;
}

function StockRow({item,first,last}:{item:StockOverviewItem;first:boolean;last:boolean}){
  const {t,isRTL,number}=useI18n();
  const tone=item.quantity===0?'negative':item.quantity<=5?'warning':'positive';
  const status=item.quantity===0?t('stockFilterOut'):item.quantity<=5?t('lowStock'):t('stockAvailable');
  const context=[item.categoryName,item.sku?'#'+item.sku:null,item.barcode].filter(Boolean).join(' • ');

  return <View style={[styles.row,first&&styles.firstRow,last&&styles.lastRow,{flexDirection:isRTL?'row-reverse':'row'}]}>
    <View style={styles.body}>
      <View style={[styles.nameRow,{flexDirection:isRTL?'row-reverse':'row'}]}>
        <AppText variant="subheading" numberOfLines={2} style={styles.name}>{item.name}</AppText>
        <Badge label={status} tone={tone}/>
      </View>
      {context?<AppText variant="caption" muted numberOfLines={1}>{context}</AppText>:null}
      <View style={[styles.quantityLine,{flexDirection:isRTL?'row-reverse':'row'}]}>
        <AppText variant="caption" muted>{t('quantity')}</AppText>
        <AppText variant="heading" style={[styles.quantity,item.quantity===0&&styles.negative,item.quantity>0&&item.quantity<=5&&styles.warning]}>{number(item.quantity)}</AppText>
      </View>
    </View>

    <View style={styles.values}>
      <View style={styles.valueBlock}>
        <AppText variant="caption" muted>{t('stockUnitCost')}</AppText>
        <Money value={Math.round(item.unitCost)}/>
      </View>
      <View style={styles.valueBlock}>
        <AppText variant="caption" muted>{t('stockItemValue')}</AppText>
        <Money value={Math.round(item.inventoryValue)}/>
      </View>
    </View>
  </View>;
}

function WarehouseTile(){
  return <View style={styles.warehouseTile}><View style={styles.warehouseRoof}/><View style={styles.warehouseBody}/><View style={styles.warehouseDoor}/></View>;
}

const styles=StyleSheet.create({
  list:{paddingHorizontal:spacing.md,paddingBottom:spacing.xxl,backgroundColor:colors.background},
  header:{gap:spacing.sm,marginBottom:spacing.sm},
  summaryStrip:{overflow:'hidden'},
  summaryRow:{minHeight:64,alignItems:'stretch'},
  summaryMetric:{flex:1,minWidth:0,justifyContent:'center',gap:2,paddingHorizontal:spacing.xs,paddingVertical:spacing.xs},
  summaryDivider:{width:1,backgroundColor:colors.border},
  tabular:{fontVariant:['tabular-nums']},
  warning:{color:colors.warning},
  negative:{color:colors.negative},
  row:{minHeight:110,alignItems:'center',gap:spacing.sm,padding:16,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:12,marginBottom:12},
  firstRow:{borderTopColor:colors.borderStrong,borderLeftColor:colors.borderStrong,borderRightColor:colors.borderStrong,borderTopLeftRadius:radius.lg,borderTopRightRadius:radius.lg},
  lastRow:{borderBottomWidth:1,borderBottomColor:colors.borderStrong,borderBottomLeftRadius:radius.lg,borderBottomRightRadius:radius.lg},
  body:{flex:1,minWidth:0,gap:3},
  nameRow:{alignItems:'center',gap:spacing.xs},
  name:{flex:1,minWidth:0},
  quantityLine:{alignItems:'center',gap:spacing.xs},
  quantity:{fontVariant:['tabular-nums'],color:colors.positive},
  values:{minWidth:104,alignItems:'flex-end',gap:4},
  valueBlock:{alignItems:'flex-end',gap:1},
  warehouseOptions:{gap:spacing.xs},
  warehouseTile:{width:38,height:38,borderRadius:radius.md,alignItems:'center',justifyContent:'center',backgroundColor:colors.surfaceStrong,position:'relative'},
  warehouseRoof:{position:'absolute',left:9,right:9,top:8,height:7,borderLeftWidth:2,borderRightWidth:2,borderTopWidth:2,borderColor:colors.textMuted,borderTopLeftRadius:3,borderTopRightRadius:3},
  warehouseBody:{position:'absolute',left:10,right:10,top:14,bottom:8,borderWidth:2,borderColor:colors.textMuted,borderRadius:2},
  warehouseDoor:{position:'absolute',left:16,bottom:9,width:6,height:7,borderWidth:1.5,borderColor:colors.textMuted,borderBottomWidth:0},
});
