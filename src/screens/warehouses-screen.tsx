import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type { Warehouse } from '@/domain/types';
import { listWarehouses } from '@/db/queries';
import { createWarehouse, setDefaultWarehouse } from '@/services/accounting-service';
import { archiveWarehouse, renameWarehouse } from '@/services/management-service';
import { AppText, Badge, Button, EmptyState, Field, PageHeader, Screen } from '@/components/ui';
import { StitchPanel, StitchText, StitchIcon, stitch } from '@/components/stitch';
import { Sheet } from '@/components/mobile-interactions';
import { useI18n } from '@/i18n/provider';
import { useAuth } from '@/auth/provider';
import { colors, radius, spacing } from '@/theme';

export function WarehousesScreen(){
  const db=useSQLiteContext(),{t,errorMessage,isRTL,number}=useI18n(),auth=useAuth();
  const [stats,setStats]=useState<Record<string,{products:number;quantity:number;value:number}>>({});
  const [items,setItems]=useState<Warehouse[]>([]),[editing,setEditing]=useState<Warehouse|null|undefined>(undefined),[busy,setBusy]=useState(false);
  const load=useCallback(async()=>{if(!auth.has('warehouses.view'))return;const warehouses=await listWarehouses(db);setItems(warehouses);const rows=await db.getAllAsync<{id:string;products:number;quantity:number;value:number}>('SELECT s.warehouse_id id,COUNT(CASE WHEN s.quantity>0 THEN 1 END) products,COALESCE(SUM(s.quantity),0) quantity,COALESCE(SUM(s.quantity*COALESCE(p.last_purchase_cost,p.piece_cost,0)),0) value FROM product_stocks s JOIN products p ON p.id=s.product_id GROUP BY s.warehouse_id');setStats(Object.fromEntries(rows.map(r=>[r.id,r])))},[auth,db]);

  useFocusEffect(useCallback(()=>{void load()},[load]));
  if(!auth.has('warehouses.view'))return <Screen><EmptyState title={t('warehousesNoPermission')}/></Screen>;
  const canCreate=auth.has('warehouses.create'),canEdit=auth.has('warehouses.edit'),canDelete=auth.has('warehouses.delete');
  const run=async(work:()=>Promise<unknown>,close=true)=>{if(busy)return;setBusy(true);try{await work();if(close)setEditing(undefined);await load()}catch(error){Alert.alert(t('error'),errorMessage(error))}finally{setBusy(false)}};
  return <Screen padded={false}>
    <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <PageHeader title={t('warehouses')} subtitle={t('warehousesHint')} onBack={()=>router.back()} trailing={canCreate?<Button compact title={t('add')} onPress={()=>setEditing(null)}/>:undefined}/>
        <View style={styles.defaultPanel}>
          <View style={styles.defaultRule}/>
          <AppText variant="caption" muted>{t('warehousesDefaultCurrent')}</AppText>
          <AppText variant="heading">{items.find(item=>item.isSalesDefault)?.name??'—'}</AppText>
        </View>
      </View>
      {items.length?items.map(item=><StitchPanel key={item.id}><View style={{flexDirection:isRTL?'row-reverse':'row',alignItems:'center',gap:10}}><StitchIcon name="warehouse" size={28}/><View style={{flex:1}}><AppText variant="heading">{item.name}</AppText><AppText variant="caption" muted>{t('warehousesUsageHint')}</AppText></View>{item.isSalesDefault?<Badge label={t('warehousesDefaultBadge')} tone="primary"/>:null}</View><View style={{flexDirection:isRTL?'row-reverse':'row',gap:8,backgroundColor:'#080C14',borderRadius:8,padding:12}}><View style={{flex:1}}><StitchText size={11} color={stitch.muted}>{t('products')}</StitchText><StitchText bold>{number(stats[item.id]?.products??0)}</StitchText></View><View style={{flex:1}}><StitchText size={11} color={stitch.muted}>{t('quantity')}</StitchText><StitchText bold>{number(stats[item.id]?.quantity??0)}</StitchText></View><View style={{flex:1}}><StitchText size={11} color={stitch.muted}>{t('inventoryValue')}</StitchText><StitchText bold color={stitch.lightGold}>{number(stats[item.id]?.value??0)} MRU</StitchText></View></View>{canEdit?<Button compact title={t('edit')} variant="secondary" onPress={()=>setEditing(item)}/>:null}{!item.isSalesDefault&&canEdit?<Button compact title={t('warehousesMakeDefault')} onPress={()=>void run(()=>setDefaultWarehouse(db,item.id),false)}/>:null}</StitchPanel>):<EmptyState title={t('noData')}/>}

    </ScrollView>
    {editing!==undefined?<WarehouseSheet item={editing} busy={busy} canArchive={Boolean(editing&&!editing.isSalesDefault&&canDelete)} onClose={()=>{if(!busy)setEditing(undefined)}} onSave={name=>void run(()=>editing?renameWarehouse(db,editing.id,name):createWarehouse(db,name))} onArchive={editing&&!editing.isSalesDefault&&canDelete?()=>Alert.alert(t('warehousesArchiveTitle'),t('warehousesArchiveHint'),[{text:t('cancel'),style:'cancel'},{text:t('warehousesArchiveAction'),style:'destructive',onPress:()=>void run(()=>archiveWarehouse(db,editing.id))}]):undefined}/>:null}
  </Screen>;
}

function WarehouseSheet({item,busy,canArchive,onClose,onSave,onArchive}:{item:Warehouse|null;busy:boolean;canArchive:boolean;onClose:()=>void;onSave:(name:string)=>void;onArchive?:()=>void}){const {t}=useI18n();const [name,setName]=useState(item?.name??'');return <Sheet visible title={item?t('warehousesEditTitle'):t('warehousesNewTitle')} onClose={onClose} footer={<><Button title={t('save')} loading={busy} disabled={!name.trim()} onPress={()=>onSave(name.trim())}/>{canArchive&&onArchive?<Button title={t('warehousesArchiveTitle')} variant="danger" disabled={busy} onPress={onArchive}/>:null}<Button title={t('cancel')} variant="ghost" disabled={busy} onPress={onClose}/></>}><Field label={t('name')} value={name} onChangeText={setName} autoFocus/><View style={styles.note}><View style={styles.noteRule}/><AppText variant="caption" muted>{t('warehousesArchiveHint')}</AppText></View></Sheet>}

const styles=StyleSheet.create({
  list:{padding:spacing.md,paddingBottom:spacing.xxl,backgroundColor:colors.background,gap:12},
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
