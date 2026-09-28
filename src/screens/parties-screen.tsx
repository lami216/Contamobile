import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type { Party, PartyType } from '@/domain/types';
import { listParties } from '@/db/queries';
import { createParty } from '@/services/accounting-service';
import { restoreParty } from '@/services/management-service';
import { AppText, Button, EmptyState, Field, IconTile, Money, PageHeader, Screen, SearchField } from '@/components/ui';
import { Sheet } from '@/components/mobile-interactions';
import { useI18n } from '@/i18n/provider';
import { useAuth } from '@/auth/provider';
import { colors, radius, spacing } from '@/theme';

export function PartiesScreen({type}:{type:PartyType}){
  const db=useSQLiteContext(),{t,isRTL,errorMessage}=useI18n(),auth=useAuth();
  const [items,setItems]=useState<Party[]>([]),[search,setSearch]=useState('');
  const [createOpen,setCreateOpen]=useState(false),[archivedOpen,setArchivedOpen]=useState(false),[archivedItems,setArchivedItems]=useState<Party[]>([]),[name,setName]=useState(''),[phone,setPhone]=useState(''),[busy,setBusy]=useState(false);
  const viewCapability=type==='customer'?'customers.view':'suppliers.view';
  const createCapability=type==='customer'?'customers.create':'suppliers.create';
  const archiveCapability=type==='customer'?'customers.delete':'suppliers.delete';
  const allowed=auth.has(viewCapability),canCreate=auth.has(createCapability),canArchive=auth.has(archiveCapability);

  const load=useCallback(async()=>{
    if(!allowed)return;
    setItems(await listParties(db,type,search,150));
  },[allowed,db,type,search]);

  useFocusEffect(useCallback(()=>{void load()},[load]));

  const closeCreate=()=>{if(busy)return;setCreateOpen(false);setName('');setPhone('')};
  const saveParty=async()=>{
    if(!canCreate||busy)return;
    setBusy(true);
    try{await createParty(db,{name,phone,partyType:type});setCreateOpen(false);setName('');setPhone('');await load()}
    catch(error){Alert.alert(t('error'),errorMessage(error))}
    finally{setBusy(false)}
  };

  const openArchived=async()=>{
    if(!canArchive||busy)return;
    setBusy(true);
    try{
      const all=await listParties(db,type,'',500,true);
      setArchivedItems(all.filter(item=>item.isArchived));
      setArchivedOpen(true);
    }catch(error){Alert.alert(t('error'),errorMessage(error))}
    finally{setBusy(false)}
  };

  const restoreArchived=async(partyId:string)=>{
    if(!canArchive||busy)return;
    setBusy(true);
    try{
      await restoreParty(db,partyId);
      const all=await listParties(db,type,'',500,true);
      setArchivedItems(all.filter(item=>item.isArchived));
      await load();
    }catch(error){Alert.alert(t('error'),errorMessage(error))}
    finally{setBusy(false)}
  };

  if(!allowed)return <Screen><EmptyState title={type==='customer'?t('partyNoCustomersPermission'):t('partyNoSuppliersPermission')}/></Screen>;

  const title=type==='customer'?t('customers'):t('suppliers');
  return <Screen padded={false}>
    <FlatList
      data={items}
      keyExtractor={item=>item.id}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.list}
      ListHeaderComponent={<View style={styles.header}>
        <PageHeader title={title} onBack={()=>router.back()}/>
        <View style={[styles.searchRow,{flexDirection:isRTL?'row-reverse':'row'}]}>
          <View style={styles.searchFlex}><SearchField value={search} onChangeText={setSearch} placeholder={type==='customer'?t('partySearchCustomer'):t('partySearchSupplier')}/></View>
          {canCreate?<Button compact title={t('add')} onPress={()=>setCreateOpen(true)}/>:null}
        </View>
        {canArchive?<Pressable accessibilityRole="button" onPress={()=>void openArchived()} style={({pressed})=>[styles.archiveAction,{alignSelf:isRTL?'flex-end':'flex-start'},pressed&&styles.pressed]}><AppText variant="caption" style={styles.archiveText}>{t('partyArchived')}</AppText></Pressable>:null}
      </View>}
      ListEmptyComponent={<EmptyState title={search?t('noResults'):t('noData')}/>}
      renderItem={({item,index})=><PartyRow item={item} first={index===0} last={index===items.length-1}/>}
    />

    <Sheet visible={archivedOpen&&canArchive} title={t('partyArchived')} onClose={()=>{if(!busy)setArchivedOpen(false)}}>
      {archivedItems.length?archivedItems.map((item,index)=><View key={item.id} style={[styles.archivedRow,{flexDirection:isRTL?'row-reverse':'row'},index===archivedItems.length-1&&styles.archivedLast]}><IconTile tone="neutral" size="sm"><PersonGlyph muted/></IconTile><View style={styles.body}><AppText variant="subheading">{item.name}</AppText>{item.phone?<AppText variant="caption" muted>{item.phone}</AppText>:null}</View><Button compact title={t('partyRestore')} loading={busy} onPress={()=>void restoreArchived(item.id)}/></View>):<EmptyState title={t('partyNoArchived')}/>}
    </Sheet>

    <Sheet visible={createOpen&&canCreate} title={type==='customer'?t('partyNewCustomer'):t('partyNewSupplier')} onClose={closeCreate} footer={<><Button title={t('save')} loading={busy} disabled={!name.trim()} onPress={()=>void saveParty()}/><Button title={t('cancel')} variant="ghost" disabled={busy} onPress={closeCreate}/></>}>
      <Field label={t('name')} value={name} onChangeText={setName} autoFocus/>
      <Field label={t('phone')} keyboardType="phone-pad" value={phone} onChangeText={setPhone}/>
    </Sheet>
  </Screen>;
}

function PartyRow({item,first,last}:{item:Party;first:boolean;last:boolean}){
  const {t,isRTL}=useI18n();
  const label=item.net>0?t('partyReceivable'):item.net<0?t('partyPayable'):t('partySettled');
  const tone=item.net>0?'positive':item.net<0?'negative':'normal';
  return <Pressable
    accessibilityRole="button"
    onPress={()=>router.push({pathname:'/parties/[id]',params:{id:item.id}})}
    style={({pressed})=>[styles.row,first&&styles.firstRow,last&&styles.lastRow,{flexDirection:isRTL?'row-reverse':'row'},pressed&&styles.pressed]}
  >
    <IconTile tone="neutral"><PersonGlyph/></IconTile>
    <View style={styles.body}>
      <AppText variant="subheading" numberOfLines={1}>{item.name}</AppText>
      {item.phone?<AppText variant="caption" muted numberOfLines={1}>{item.phone}</AppText>:null}
      <AppText variant="caption" style={tone==='positive'?styles.positive:tone==='negative'?styles.negative:styles.neutral}>{label}</AppText>
    </View>
    <View style={styles.trailing}><AppText variant="caption" muted>{t('partyBalance')}</AppText><Money value={Math.abs(item.net)} tone={tone}/><AppText variant="heading" style={styles.arrow}>{isRTL?'‹':'›'}</AppText></View>
  </Pressable>;
}

function PersonGlyph({muted=false}:{muted?:boolean}){
  return <View style={styles.personGlyph}><View style={[styles.personHead,muted&&styles.personMuted]}/><View style={[styles.personBody,muted&&styles.personMuted]}/></View>;
}

const styles=StyleSheet.create({
  list:{paddingHorizontal:spacing.md,paddingBottom:spacing.xxl,backgroundColor:colors.background},
  header:{gap:spacing.sm,marginBottom:spacing.sm},
  searchRow:{alignItems:'center',gap:spacing.sm},
  searchFlex:{flex:1},
  archiveAction:{minHeight:36,justifyContent:'center',paddingHorizontal:spacing.xs},
  archiveText:{color:colors.primary,fontWeight:'700'},
  row:{minHeight:76,alignItems:'center',gap:spacing.sm,paddingHorizontal:spacing.md,paddingVertical:spacing.sm,backgroundColor:colors.surface,borderLeftWidth:1,borderRightWidth:1,borderTopWidth:StyleSheet.hairlineWidth,borderColor:colors.border},
  firstRow:{borderTopWidth:1,borderTopLeftRadius:radius.lg,borderTopRightRadius:radius.lg},
  lastRow:{borderBottomWidth:1,borderBottomLeftRadius:radius.lg,borderBottomRightRadius:radius.lg},
  body:{flex:1,minWidth:0,gap:3},
  trailing:{minWidth:102,alignItems:'flex-end',gap:2},
  arrow:{color:colors.textSoft,lineHeight:20},
  pressed:{backgroundColor:colors.surfaceMuted},
  positive:{color:colors.positive,fontWeight:'700'},
  negative:{color:colors.negative,fontWeight:'700'},
  neutral:{color:colors.textMuted,fontWeight:'700'},
  archivedRow:{minHeight:66,alignItems:'center',gap:spacing.sm,paddingVertical:spacing.sm,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border},
  archivedLast:{borderBottomWidth:0},
  personGlyph:{width:24,height:24,alignItems:'center',justifyContent:'flex-end'},
  personHead:{position:'absolute',top:1,width:8,height:8,borderRadius:4,borderWidth:2,borderColor:colors.textMuted},
  personBody:{width:18,height:10,borderWidth:2,borderBottomWidth:0,borderColor:colors.textMuted,borderTopLeftRadius:9,borderTopRightRadius:9},
  personMuted:{borderColor:colors.textSoft},
});
