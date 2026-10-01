import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import type { Party, Product } from '@/domain/types';
import { Button, EmptyState, Row, SearchField } from './ui';
import { Sheet } from './mobile-interactions';
import { useI18n } from '@/i18n/provider';
import { spacing } from '@/theme';

export function ProductPicker({
  visible,products,onClose,onSelect,exclude=[],
}:{visible:boolean;products:Product[];onClose:()=>void;onSelect:(product:Product)=>void;exclude?:string[]}){
  const {t}=useI18n();
  const [search,setSearch]=useState('');
  const filtered=useMemo(()=>{
    const q=search.trim().toLocaleLowerCase();
    return products.filter(product=>!exclude.includes(product.id)&&(!q||`${product.name} ${product.sku} ${product.barcode}`.toLocaleLowerCase().includes(q)));
  },[exclude,products,search]);
  const close=()=>{setSearch('');onClose()};
  return <Sheet fixedHeight scrollable={false} visible={visible} title={t('products')} onClose={close}>
    <SearchField value={search} onChangeText={setSearch} returnKeyType="search"/>
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.listContent}
      keyboardShouldPersistTaps="handled"
      data={filtered}
      keyExtractor={product=>product.id}
      ListEmptyComponent={<EmptyState title={t('noResults')}/>}
      renderItem={({item})=><Row
        title={item.name}
        subtitle={[item.sku,item.barcode].filter(Boolean).join(' • ')||undefined}
        onPress={()=>{onSelect(item);setSearch('')}}
      />}
    />
  </Sheet>;
}

export function PartyPicker({
  visible,parties,onClose,onSelect,directLabel,createLabel,onCreate,
}:{visible:boolean;parties:Party[];onClose:()=>void;onSelect:(party:Party|null)=>void;directLabel:string;createLabel?:string;onCreate?:()=>void}){
  const {t}=useI18n();
  const [search,setSearch]=useState('');
  const filtered=useMemo(()=>{
    const q=search.trim().toLocaleLowerCase();
    return parties.filter(party=>!q||`${party.name} ${party.phone}`.toLocaleLowerCase().includes(q));
  },[parties,search]);
  const close=()=>{setSearch('');onClose()};
  return <Sheet fixedHeight scrollable={false} visible={visible} title={t('parties')} onClose={close}>
    <View style={styles.actions}>
      {createLabel&&onCreate?<Button title={createLabel} onPress={onCreate}/>:null}
      <Button title={directLabel} variant="secondary" onPress={()=>{onSelect(null);close()}}/>
    </View>
    <SearchField value={search} onChangeText={setSearch} returnKeyType="search"/>
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.listContent}
      keyboardShouldPersistTaps="handled"
      data={filtered}
      keyExtractor={party=>party.id}
      ListEmptyComponent={<EmptyState title={t('noResults')}/>}
      renderItem={({item})=><Row
        title={item.name}
        subtitle={item.phone||undefined}
        onPress={()=>{onSelect(item);close()}}
      />}
    />
  </Sheet>;
}

const styles=StyleSheet.create({
  actions:{gap:spacing.xs},
  list:{flex:1,minHeight:0},
  listContent:{paddingBottom:spacing.lg},
});