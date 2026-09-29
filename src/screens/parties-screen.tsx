import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type { Party, PartyType } from '@/domain/types';
import { listParties } from '@/db/queries';
import { createParty } from '@/services/accounting-service';
import { restoreParty } from '@/services/management-service';
import {
  AppText,
  Badge,
  Button,
  EmptyState,
  FormField,
  Money,
  PageHeader,
  Screen,
  SearchField,
  SegmentedControl,
} from '@/components/ui';
import { Sheet } from '@/components/mobile-interactions';
import { useI18n } from '@/i18n/provider';
import { useAuth } from '@/auth/provider';
import { colors, radius, spacing, touch } from '@/theme';

type PartyState='all'|'active'|'archived';
const format=(template:string,values:Record<string,string|number>)=>Object.entries(values).reduce((output,[key,value])=>output.replaceAll('{'+key+'}',String(value)),template);

export function PartiesScreen({type}:{type:PartyType}){
  const db=useSQLiteContext(),{t,isRTL,number,errorMessage}=useI18n(),auth=useAuth();
  const params=useLocalSearchParams<{create?:string}>();
  const [items,setItems]=useState<Party[]>([]),[search,setSearch]=useState(''),[state,setState]=useState<PartyState>('active');
  const [createOpen,setCreateOpen]=useState(false),[name,setName]=useState(''),[phone,setPhone]=useState(''),[busy,setBusy]=useState(false);

  const viewCapability=type==='customer'?'customers.view':'suppliers.view';
  const createCapability=type==='customer'?'customers.create':'suppliers.create';
  const archiveCapability=type==='customer'?'customers.delete':'suppliers.delete';
  const allowed=auth.has(viewCapability),canCreate=auth.has(createCapability),canArchive=auth.has(archiveCapability);
  const includeArchived=canArchive&&state!=='active';
  const showArchived=canArchive&&state==='archived';

  const load=useCallback(async()=>{
    if(!allowed)return;
    const rows=await listParties(db,type,search,200,includeArchived);
    setItems(state==='archived'?rows.filter(item=>item.isArchived):state==='active'?rows.filter(item=>!item.isArchived):rows);
  },[allowed,db,includeArchived,search,state,type]);

  useFocusEffect(useCallback(()=>{void load();if(params.create==='1'&&canCreate)setCreateOpen(true)},[canCreate,load,params.create]));

  const closeCreate=()=>{if(busy)return;setCreateOpen(false);setName('');setPhone('')};
  const saveParty=async()=>{
    if(!canCreate||busy)return;
    setBusy(true);
    try{
      await createParty(db,{name:name.trim(),phone:phone.trim(),partyType:type});
      setCreateOpen(false);setName('');setPhone('');
      await load();
    }catch(error){Alert.alert(t('error'),errorMessage(error))}
    finally{setBusy(false)}
  };

  const restoreArchived=async(partyId:string)=>{
    if(!canArchive||busy)return;
    setBusy(true);
    try{await restoreParty(db,partyId);await load()}
    catch(error){Alert.alert(t('error'),errorMessage(error))}
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
        <PageHeader
          title={title}
          onBack={()=>router.back()}
          trailing={canCreate&&!showArchived?<HeaderAddButton label={t('add')} onPress={()=>setCreateOpen(true)}/>:undefined}
        />

        <SearchField
          value={search}
          onChangeText={setSearch}
          placeholder={type==='customer'?t('partySearchCustomer'):t('partySearchSupplier')}
        />

        {canArchive?<SegmentedControl
          value={state}
          options={[
            {value:'all',label:t('partyAll')},
            {value:'active',label:t('partyActive')},
            {value:'archived',label:t('partyArchived')},
          ]}
          onChange={setState}
        />:null}

        <View style={[styles.countRow,{flexDirection:isRTL?'row-reverse':'row'}]}>
          <Badge label={format(t('partyCount'),{count:number(items.length)})} tone="neutral"/>
        </View>
      </View>}
      ListEmptyComponent={<EmptyState title={search?t('noResults'):showArchived?t('partyNoArchived'):t('noData')}/>}
      renderItem={({item,index})=><PartyRow
        item={item}
        first={index===0}
        last={index===items.length-1}
        canRestore={item.isArchived&&canArchive}
        restoring={busy}
        onRestore={()=>void restoreArchived(item.id)}
      />}
    />

    <Sheet
      visible={createOpen&&canCreate}
      title={type==='customer'?t('partyNewCustomer'):t('partyNewSupplier')}
      onClose={closeCreate}
      footer={<>
        <Button title={t('save')} loading={busy} disabled={!name.trim()} onPress={()=>void saveParty()}/>
        <Button title={t('cancel')} variant="ghost" disabled={busy} onPress={closeCreate}/>
      </>}
    >
      <FormField label={t('name')} value={name} onChangeText={setName} autoFocus/>
      <FormField label={t('phone')} keyboardType="phone-pad" value={phone} onChangeText={setPhone}/>
    </Sheet>
  </Screen>;
}

function PartyRow({item,first,last,canRestore,restoring,onRestore}:{item:Party;first:boolean;last:boolean;canRestore:boolean;restoring:boolean;onRestore:()=>void}){
  const {t,isRTL}=useI18n();
  const label=item.net>0?t('partyReceivable'):item.net<0?t('partyPayable'):t('partySettled');
  const tone=item.net>0?'positive':item.net<0?'negative':'neutral';

  return <Pressable
    accessibilityRole="button"
    onPress={()=>router.push({pathname:'/parties/[id]',params:{id:item.id}})}
    style={({pressed})=>[
      styles.row,
      first&&styles.firstRow,
      last&&styles.lastRow,
      {flexDirection:isRTL?'row-reverse':'row'},
      pressed&&styles.pressed,
    ]}
  >
    <View style={styles.body}>
      <View style={[styles.nameRow,{flexDirection:isRTL?'row-reverse':'row'}]}>
        <AppText variant="subheading" numberOfLines={1} style={styles.name}>{item.name}</AppText>
        {item.isArchived?<Badge label={t('partyAccountArchived')} tone="warning"/>:null}
      </View>
      {item.phone?<AppText variant="caption" muted numberOfLines={1}>{item.phone}</AppText>:null}
      <Badge label={label} tone={tone}/>
    </View>

    <View style={styles.trailing}>
      <AppText variant="caption" muted>{t('partyBalance')}</AppText>
      <Money value={Math.abs(item.net)} tone={item.net>0?'positive':item.net<0?'negative':'normal'}/>
      {canRestore?<Pressable accessibilityRole="button" disabled={restoring} onPress={event=>{event.stopPropagation();onRestore()}} style={({pressed})=>[styles.restoreButton,pressed&&styles.restorePressed]}>
        <AppText variant="caption" style={styles.restoreText}>{t('partyRestore')}</AppText>
      </Pressable>:<AppText variant="heading" style={styles.arrow}>{isRTL?'‹':'›'}</AppText>}
    </View>
  </Pressable>;
}

function HeaderAddButton({label,onPress}:{label:string;onPress:()=>void}){
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({pressed})=>[styles.headerAdd,pressed&&styles.headerAddPressed]}>
    <AppText variant="heading" style={styles.headerPlus}>+</AppText>
  </Pressable>;
}

const styles=StyleSheet.create({
  list:{paddingHorizontal:spacing.md,paddingBottom:spacing.xxl,backgroundColor:colors.background},
  header:{gap:spacing.sm,marginBottom:spacing.sm},
  countRow:{minHeight:30,alignItems:'center'},
  row:{minHeight:72,alignItems:'center',gap:spacing.sm,paddingHorizontal:spacing.sm,paddingVertical:spacing.xs,backgroundColor:colors.surface,borderLeftWidth:1,borderRightWidth:1,borderTopWidth:1,borderColor:colors.border},
  firstRow:{borderTopColor:colors.borderStrong,borderLeftColor:colors.borderStrong,borderRightColor:colors.borderStrong,borderTopLeftRadius:radius.lg,borderTopRightRadius:radius.lg},
  lastRow:{borderBottomWidth:1,borderBottomColor:colors.borderStrong,borderBottomLeftRadius:radius.lg,borderBottomRightRadius:radius.lg},
  body:{flex:1,minWidth:0,gap:4},
  nameRow:{alignItems:'center',gap:spacing.xs},
  name:{flex:1,minWidth:0},
  trailing:{minWidth:108,alignItems:'flex-end',gap:3},
  arrow:{color:colors.textSoft,lineHeight:18},
  pressed:{backgroundColor:colors.surfaceMuted},
  restoreButton:{minHeight:34,paddingHorizontal:spacing.sm,borderRadius:radius.sm,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:colors.primary,backgroundColor:colors.surface},
  restorePressed:{backgroundColor:colors.primaryFaint},
  restoreText:{color:colors.primary,fontWeight:'700'},
  headerAdd:{width:touch.min,height:touch.min,borderRadius:radius.md,alignItems:'center',justifyContent:'center',backgroundColor:colors.primary},
  headerAddPressed:{backgroundColor:colors.primaryPressed,transform:[{scale:.98}]},
  headerPlus:{color:colors.onPrimary,fontSize:24,lineHeight:25},
});
