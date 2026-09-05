import { useCallback, useState } from 'react';
import { Alert, FlatList, Modal, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type { Warehouse } from '@/domain/types';
import { listWarehouses } from '@/db/queries';
import { createWarehouse, setDefaultWarehouse } from '@/services/accounting-service';
import { archiveWarehouse, renameWarehouse } from '@/services/management-service';
import { AppText, Button, Card, EmptyState, Field, Row, Screen, SectionTitle } from '@/components/ui';
import { useI18n } from '@/i18n/provider';
import { useAuth } from '@/auth/provider';
import { colors, spacing } from '@/theme';

export function WarehousesScreen(){
  const db=useSQLiteContext(),{t,locale,errorMessage}=useI18n(),auth=useAuth(),ar=locale==='ar';
  const [items,setItems]=useState<Warehouse[]>([]),[editing,setEditing]=useState<Warehouse|null|undefined>(undefined);
  const load=useCallback(async()=>{if(auth.has('warehouses.view'))setItems(await listWarehouses(db))},[auth,db]);
  useFocusEffect(useCallback(()=>{void load()},[load]));
  if(!auth.has('warehouses.view'))return <Screen><EmptyState title={ar?'ليس لديك صلاحية عرض المخازن':'Vous n’avez pas accès aux dépôts.'}/></Screen>;
  const canCreate=auth.has('warehouses.create'),canEdit=auth.has('warehouses.edit'),canDelete=auth.has('warehouses.delete');
  const run=async(work:()=>Promise<unknown>)=>{try{await work();setEditing(undefined);await load()}catch(error){Alert.alert(t('error'),errorMessage(error))}};
  return <Screen><SectionTitle title={t('warehouses')} action={canCreate?<Button title={t('add')} onPress={()=>setEditing(null)}/>:undefined}/><FlatList data={items} keyExtractor={x=>x.id} ListEmptyComponent={<EmptyState title={t('noData')}/>} renderItem={({item})=><Row title={item.name} subtitle={item.isSalesDefault?(ar?'مخزن البيع الافتراضي':'Dépôt de vente par défaut'):undefined} trailing={!item.isSalesDefault&&canEdit?<Button title={t('confirm')} variant="secondary" onPress={()=>void run(()=>setDefaultWarehouse(db,item.id))}/>:item.isSalesDefault?<AppText>✓</AppText>:undefined} onPress={canEdit?()=>setEditing(item):undefined}/>}/>{editing!==undefined?<WarehouseEditor item={editing} onClose={()=>setEditing(undefined)} onSave={name=>run(async()=>{if(editing){if(!canEdit)throw new Error(ar?'ليس لديك صلاحية تعديل المخازن':'Vous n’avez pas le droit de modifier les dépôts.');return renameWarehouse(db,editing.id,name)}if(!canCreate)throw new Error(ar?'ليس لديك صلاحية إنشاء المخازن':'Vous n’avez pas le droit de créer des dépôts.');return createWarehouse(db,name)})} onArchive={editing&&!editing.isSalesDefault&&canDelete?()=>Alert.alert(t('delete'),editing.name,[{text:t('cancel'),style:'cancel'},{text:t('confirm'),style:'destructive',onPress:()=>void run(()=>archiveWarehouse(db,editing.id))}]):undefined}/>:null}</Screen>;
}
function WarehouseEditor({item,onClose,onSave,onArchive}:{item:Warehouse|null;onClose:()=>void;onSave:(name:string)=>Promise<unknown>;onArchive?:()=>void}){const {t}=useI18n();const [name,setName]=useState(item?.name??'');return <Modal animationType="slide" onRequestClose={onClose}><Screen scroll><View style={styles.modal}><SectionTitle title={item?item.name:t('warehouses')}/><Card><Field label={t('name')} value={name} onChangeText={setName}/></Card><Button title={t('save')} onPress={()=>void onSave(name)}/>{onArchive?<Button title={t('delete')} variant="danger" onPress={onArchive}/>:null}<Button title={t('cancel')} variant="ghost" onPress={onClose}/></View></Screen></Modal>}
const styles=StyleSheet.create({modal:{gap:spacing.md,backgroundColor:colors.background}});
