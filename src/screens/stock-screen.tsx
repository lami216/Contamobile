import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type { Product, Warehouse } from '@/domain/types';
import { listProducts, listWarehouses } from '@/db/queries';
import { AppText, Chip, EmptyState, Money, Row, Screen, SearchField, SectionTitle } from '@/components/ui';
import { useI18n } from '@/i18n/provider';
import { useAuth } from '@/auth/provider';
import { spacing } from '@/theme';
export function StockScreen(){const db=useSQLiteContext(),{t,number,locale}=useI18n(),auth=useAuth();const [products,setProducts]=useState<Product[]>([]),[warehouses,setWarehouses]=useState<Warehouse[]>([]),[warehouseId,setWarehouseId]=useState(''),[search,setSearch]=useState('');const load=useCallback(async()=>{if(!auth.has('warehouses.inventory.view'))return;const wh=await listWarehouses(db);setWarehouses(wh);const selected=warehouseId||wh.find(w=>w.isSalesDefault)?.id||wh[0]?.id||'';if(!warehouseId&&selected)setWarehouseId(selected);setProducts(await listProducts(db,search,selected,false,150))},[auth,db,search,warehouseId]);useFocusEffect(useCallback(()=>{void load()},[load]));if(!auth.has('warehouses.inventory.view'))return <Screen><EmptyState title={locale==='ar'?'ليس لديك صلاحية عرض جرد المخزون':'Vous n’avez pas accès à l’inventaire du stock.'}/></Screen>;return <Screen><SectionTitle title={t('stock')}/><View style={styles.chips}>{warehouses.map(w=><Chip key={w.id} label={w.name} active={warehouseId===w.id} onPress={()=>setWarehouseId(w.id)}/>)}</View><SearchField value={search} onChangeText={setSearch}/><FlatList data={products} keyExtractor={item=>item.id} ListEmptyComponent={<EmptyState title={t('noData')}/>} renderItem={({item})=><Row title={item.name} subtitle={`${item.sku} • ${t('purchasePrice')}: ${item.lastPurchaseCost??item.pieceCost??0} MRU`} trailing={<View style={styles.trailing}><AppText variant="heading">{number(item.stocks?.[warehouseId]??0)}</AppText>{item.lastPurchaseCost!=null?<Money value={(item.stocks?.[warehouseId]??0)*item.lastPurchaseCost}/>:null}</View>}/>}/></Screen>}
const styles=StyleSheet.create({chips:{flexDirection:'row',flexWrap:'wrap',gap:spacing.xs},trailing:{alignItems:'flex-end',gap:spacing.xxs}});
