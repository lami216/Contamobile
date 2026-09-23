import { useMemo, useState } from 'react';
import { FlatList, Modal, ScrollView, StyleSheet, View } from 'react-native';
import type { Party, Product, ProductCategory } from '@/domain/types';
import { EmptyState, Row, Screen, SearchField, SectionTitle, Button, Chip } from './ui';
import { useI18n } from '@/i18n/provider';
import { spacing } from '@/theme';

export function ProductPicker({visible,products,categories=[],onClose,onSelect,exclude=[]}:{visible:boolean;products:Product[];categories?:ProductCategory[];onClose:()=>void;onSelect:(product:Product)=>void;exclude?:string[]}){
  const {t,locale}=useI18n(),ar=locale==='ar';
  const [search,setSearch]=useState(''),[categoryId,setCategoryId]=useState('');
  const filtered=useMemo(()=>{
    const q=search.trim().toLocaleLowerCase();
    return products.filter(p=>!exclude.includes(p.id)&&(!categoryId||p.categoryId===categoryId)&&(!q||`${p.name} ${p.sku} ${p.barcode}`.toLocaleLowerCase().includes(q)));
  },[categoryId,exclude,products,search]);
  const close=()=>{setSearch('');setCategoryId('');onClose()};
  return <Modal visible={visible} animationType="slide" onRequestClose={close}><Screen>
    <SectionTitle title={t('products')} action={<Button title={t('cancel')} variant="ghost" onPress={close}/>}/>
    <SearchField value={search} onChangeText={setSearch}/>
    {categories.length?<View style={styles.categoryBlock}><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}><Chip label={ar?'كل الفئات':'Toutes les catégories'} active={!categoryId} onPress={()=>setCategoryId('')}/>{categories.map(category=><Chip key={category.id} label={category.name} active={categoryId===category.id} onPress={()=>setCategoryId(category.id)}/>)}</ScrollView></View>:null}
    <FlatList contentContainerStyle={styles.list} data={filtered} keyExtractor={p=>p.id} keyboardShouldPersistTaps="handled" ListEmptyComponent={<EmptyState title={t('noResults')}/>} renderItem={({item})=><Row title={item.name} subtitle={`${item.sku}${item.barcode?` • ${item.barcode}`:''}`} onPress={()=>{onSelect(item);close()}}/>}/>
  </Screen></Modal>;
}

export function PartyPicker({visible,parties,onClose,onSelect,directLabel}:{visible:boolean;parties:Party[];onClose:()=>void;onSelect:(party:Party|null)=>void;directLabel:string}){
  const {t}=useI18n();const [search,setSearch]=useState('');
  const filtered=useMemo(()=>{const q=search.trim().toLocaleLowerCase();return parties.filter(p=>!p.isArchived&&(!q||`${p.name} ${p.phone}`.toLocaleLowerCase().includes(q)))},[parties,search]);
  return <Modal visible={visible} animationType="slide" onRequestClose={onClose}><Screen>
    <SectionTitle title={t('parties')} action={<Button title={t('cancel')} variant="ghost" onPress={onClose}/>}/>
    <Button title={directLabel} variant="secondary" onPress={()=>{onSelect(null);onClose()}}/>
    <SearchField value={search} onChangeText={setSearch}/>
    <FlatList contentContainerStyle={styles.list} data={filtered} keyExtractor={p=>p.id} ListEmptyComponent={<EmptyState title={t('noResults')}/>} renderItem={({item})=><Row title={item.name} subtitle={item.phone||undefined} onPress={()=>{onSelect(item);setSearch('');onClose()}}/>}/>
  </Screen></Modal>;
}
const styles=StyleSheet.create({list:{paddingBottom:spacing.xl},categoryBlock:{marginHorizontal:-spacing.xs},chips:{gap:spacing.xs,paddingHorizontal:spacing.xs}});
