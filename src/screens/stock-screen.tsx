import { useCallback, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type { Product, ProductCategory, Warehouse } from '@/domain/types';
import { listProductCategories, listProducts, listWarehouses } from '@/db/queries';
import { AppText, Card, Chip, EmptyState, Money, Row, Screen, SearchField, SectionTitle } from '@/components/ui';
import { useI18n } from '@/i18n/provider';
import { useAuth } from '@/auth/provider';
import { colors, spacing } from '@/theme';

export function StockScreen(){
  const db=useSQLiteContext(),{t,number,locale}=useI18n(),auth=useAuth(),ar=locale==='ar';
  const [products,setProducts]=useState<Product[]>([]),[categories,setCategories]=useState<ProductCategory[]>([]),[warehouses,setWarehouses]=useState<Warehouse[]>([]),[warehouseId,setWarehouseId]=useState(''),[categoryId,setCategoryId]=useState(''),[search,setSearch]=useState('');
  const load=useCallback(async()=>{
    if(!auth.has('warehouses.inventory.view'))return;
    const [wh,c]=await Promise.all([listWarehouses(db),listProductCategories(db)]);
    setWarehouses(wh);setCategories(c);
    const selected=warehouseId||wh.find(w=>w.isSalesDefault)?.id||wh[0]?.id||'';
    if(!warehouseId&&selected)setWarehouseId(selected);
    setProducts(await listProducts(db,search,selected,false,250,0,categoryId||undefined));
  },[auth,categoryId,db,search,warehouseId]);
  useFocusEffect(useCallback(()=>{void load()},[load]));
  if(!auth.has('warehouses.inventory.view'))return <Screen><EmptyState title={ar?'ليس لديك صلاحية عرض جرد المخزون':'Vous n’avez pas accès à l’inventaire du stock.'}/></Screen>;
  return <Screen padded={false}>
    <FlatList
      data={products}
      keyExtractor={item=>item.id}
      contentContainerStyle={styles.content}
      ListHeaderComponent={<View style={styles.header}>
        <SectionTitle title={t('stock')}/>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{warehouses.map(w=><Chip key={w.id} label={w.name} active={warehouseId===w.id} onPress={()=>setWarehouseId(w.id)}/>)}</ScrollView>
        {categories.length?<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}><Chip label={ar?'كل الفئات':'Toutes les catégories'} active={!categoryId} onPress={()=>setCategoryId('')}/>{categories.map(category=><Chip key={category.id} label={category.name} active={categoryId===category.id} onPress={()=>setCategoryId(category.id)}/>)}</ScrollView>:null}
        <SearchField value={search} onChangeText={setSearch}/>
      </View>}
      ListEmptyComponent={<EmptyState title={search?t('noResults'):t('noData')}/>}
      renderItem={({item})=>{
        const qty=item.stocks?.[warehouseId]??0,cost=item.lastPurchaseCost??item.pieceCost??0;
        return <Card elevated style={styles.item}><Row title={item.name} subtitle={`${item.sku} • ${t('purchasePrice')}: ${cost} MRU`} trailing={<View style={styles.trailing}><AppText variant="heading">{number(qty)}</AppText>{cost>0?<Money value={qty*cost}/>:null}</View>}/></Card>;
      }}
    />
  </Screen>;
}
const styles=StyleSheet.create({
  content:{padding:spacing.md,gap:spacing.sm,paddingBottom:spacing.xxl,backgroundColor:colors.background},
  header:{gap:spacing.md,marginBottom:spacing.xs},
  chips:{gap:spacing.xs},
  item:{paddingVertical:spacing.xs},
  trailing:{alignItems:'flex-end',gap:spacing.xxs},
});
