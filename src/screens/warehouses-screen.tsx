import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type { Warehouse } from '@/domain/types';
import { listWarehouses } from '@/db/queries';
import { createWarehouse, setDefaultWarehouse } from '@/services/accounting-service';
import { archiveWarehouse, renameWarehouse } from '@/services/management-service';
import { AppText, Badge, Button, EmptyState, Field, Screen, SectionTitle } from '@/components/ui';
import { Sheet } from '@/components/mobile-interactions';
import { useI18n } from '@/i18n/provider';
import { useAuth } from '@/auth/provider';
import { colors, radius, spacing } from '@/theme';

export function WarehousesScreen(){
  const db=useSQLiteContext(),{t,locale,isRTL,errorMessage}=useI18n(),auth=useAuth(),ar=locale==='ar';
  const [items,setItems]=useState<Warehouse[]>([]),[editing,setEditing]=useState<Warehouse|null|undefined>(undefined),[busy,setBusy]=useState(false);
  const load=useCallback(async()=>{if(auth.has('warehouses.view'))setItems(await listWarehouses(db))},[auth,db]);
  useFocusEffect(useCallback(()=>{void load()},[load]));
  if(!auth.has('warehouses.view'))return <Screen><EmptyState title={ar?'ليس لديك صلاحية عرض المخازن':'Vous n’avez pas accès aux dépôts.'}/></Screen>;
  const canCreate=auth.has('warehouses.create'),canEdit=auth.has('warehouses.edit'),canDelete=auth.has('warehouses.delete');
  const run=async(work:()=>Promise<unknown>,close=true)=>{if(busy)return;setBusy(true);try{await work();if(close)setEditing(undefined);await load()}catch(error){Alert.alert(t('error'),errorMessage(error))}finally{setBusy(false)}};
  return <Screen padded={false}><FlatList data={items} keyExtractor={item=>item.id} contentContainerStyle={styles.list} ListHeaderComponent={<View style={styles.header}><SectionTitle title={t('warehouses')} subtitle={ar?'مخزن البيع الافتراضي هو الذي تبدأ منه العمليات اليومية تلقائيًا.':'Le dépôt de vente par défaut est présélectionné pour les opérations quotidiennes.'} action={canCreate?<Button compact title={t('add')} onPress={()=>setEditing(null)}/>:undefined}/><View style={styles.defaultPanel}><View style={styles.defaultRule}/><AppText variant="caption" muted>{ar?'المخزن الافتراضي الحالي':'Dépôt par défaut'}</AppText><AppText variant="heading">{items.find(item=>item.isSalesDefault)?.name??'—'}</AppText></View></View>} ListEmptyComponent={<EmptyState title={t('noData')}/>} renderItem={({item})=><Pressable accessibilityRole={canEdit?'button':undefined} disabled={!canEdit} onPress={()=>setEditing(item)} style={({pressed})=>[styles.row,{flexDirection:isRTL?'row-reverse':'row'},pressed&&styles.pressed]}><View style={styles.body}><View style={[styles.nameRow,{flexDirection:isRTL?'row-reverse':'row'}]}><AppText variant="subheading">{item.name}</AppText>{item.isSalesDefault?<Badge label={ar?'افتراضي':'Par défaut'} tone="primary"/>:null}</View><AppText variant="caption" muted>{ar?'يُستخدم للمبيعات والتحويلات والجرد.':'Utilisé pour ventes, transferts et inventaire.'}</AppText></View>{!item.isSalesDefault&&canEdit?<Button compact title={ar?'اجعله افتراضيًا':'Par défaut'} variant="secondary" onPress={()=>void run(()=>setDefaultWarehouse(db,item.id),false)}/>:<AppText variant="heading" style={styles.arrow}>{isRTL?'‹':'›'}</AppText>}</Pressable>}/>{editing!==undefined?<WarehouseSheet item={editing} busy={busy} canArchive={Boolean(editing&&!editing.isSalesDefault&&canDelete)} onClose={()=>{if(!busy)setEditing(undefined)}} onSave={name=>void run(()=>editing?renameWarehouse(db,editing.id,name):createWarehouse(db,name))} onArchive={editing&&!editing.isSalesDefault&&canDelete?()=>Alert.alert(ar?'أرشفة المخزن':'Archiver le dépôt',editing.name,[{text:t('cancel'),style:'cancel'},{text:t('confirm'),style:'destructive',onPress:()=>void run(()=>archiveWarehouse(db,editing.id))}]):undefined}/>:null}</Screen>;
}

function WarehouseSheet({item,busy,canArchive,onClose,onSave,onArchive}:{item:Warehouse|null;busy:boolean;canArchive:boolean;onClose:()=>void;onSave:(name:string)=>void;onArchive?:()=>void}){const {t,locale}=useI18n(),ar=locale==='ar';const [name,setName]=useState(item?.name??'');return <Sheet visible title={item?(ar?'تعديل المخزن':'Modifier le dépôt'):(ar?'مخزن جديد':'Nouveau dépôt')} onClose={onClose} footer={<><Button title={t('save')} loading={busy} disabled={!name.trim()} onPress={()=>onSave(name.trim())}/>{canArchive&&onArchive?<Button title={ar?'أرشفة المخزن':'Archiver le dépôt'} variant="danger" disabled={busy} onPress={onArchive}/>:null}<Button title={t('cancel')} variant="ghost" disabled={busy} onPress={onClose}/></>}><Field label={t('name')} value={name} onChangeText={setName} autoFocus/><View style={styles.note}><View style={styles.noteRule}/><AppText variant="caption" muted>{ar?'لا يمكن أرشفة المخزن الافتراضي أو مخزن يحتوي رصيدًا وفق قواعد النظام.':'Les règles empêchent l’archivage du dépôt par défaut ou d’un dépôt contenant du stock.'}</AppText></View></Sheet>}

const styles=StyleSheet.create({
  list:{padding:spacing.md,paddingBottom:spacing.xxl,backgroundColor:colors.background},
  header:{gap:spacing.md,marginBottom:spacing.sm},
  defaultPanel:{gap:spacing.xs,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,padding:spacing.md},
  defaultRule:{width:34,height:3,borderRadius:2,backgroundColor:colors.accent},
  row:{minHeight:84,alignItems:'center',gap:spacing.md,paddingVertical:spacing.md,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border},
  body:{flex:1,gap:spacing.xs},
  nameRow:{alignItems:'center',gap:spacing.xs},
  arrow:{color:colors.textSoft,lineHeight:20},
  pressed:{backgroundColor:colors.surfaceMuted},
  note:{gap:spacing.xs,paddingVertical:spacing.xs},
  noteRule:{width:28,height:2,borderRadius:2,backgroundColor:colors.accent},
});
