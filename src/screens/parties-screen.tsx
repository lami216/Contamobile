import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type { Party, PartyType } from '@/domain/types';
import { listParties, listPartyFinancialSummaries } from '@/db/queries';
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
import { StitchPanel, StitchIcon, StitchText, stitch } from '@/components/stitch';
import { Sheet } from '@/components/mobile-interactions';
import { useI18n } from '@/i18n/provider';
import { useAuth } from '@/auth/provider';
import { colors, radius, spacing, touch } from '@/theme';

type PartyState='all'|'active'|'archived';
const format=(template:string,values:Record<string,string|number>)=>Object.entries(values).reduce((output,[key,value])=>output.replaceAll('{'+key+'}',String(value)),template);

export function PartiesScreen({type}:{type:PartyType}){
  const db=useSQLiteContext(),{t,isRTL,number,errorMessage,locale}=useI18n(),auth=useAuth();
  const params=useLocalSearchParams<{create?:string}>();
  const [summaries,setSummaries]=useState<Awaited<ReturnType<typeof listPartyFinancialSummaries>>>([]);
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
    const visible=state==='archived'?rows.filter(item=>item.isArchived):state==='active'?rows.filter(item=>!item.isArchived):rows;
    setItems(visible);
    setSummaries(await listPartyFinancialSummaries(db,type,visible.map(item=>item.id)));
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
        />

        <View style={{gap:12}}><StitchText bold size={17}>{type==='customer'?(locale==='ar'?'سجل العملاء والحسابات':'Clients et comptes'):(locale==='ar'?'سجل الموردين والحسابات':'Fournisseurs et comptes')}</StitchText>{canCreate&&!showArchived?<Button title={type==='customer'?t('partyNewCustomer'):t('partyNewSupplier')} variant={type==='customer'?'success':'warning'} onPress={()=>setCreateOpen(true)}/>:null}</View>
        <StitchPanel style={{backgroundColor:'#232833'}}><View style={{flexDirection:isRTL?'row-reverse':'row',alignItems:'center',justifyContent:'space-between'}}><StitchText size={12} color={stitch.muted}>{type==='customer'?t('receivable'):t('payable')}</StitchText><Badge label={t('partyCount').replace('{count}',number(items.length))} tone="warning"/></View><View style={{flexDirection:isRTL?'row-reverse':'row',flexWrap:'wrap',gap:8}}>{[
          {label:type==='customer'?t('sales'):t('purchases'),value:summaries.reduce((total,s)=>total+(type==='customer'?s.customerTradeTotal:s.supplierTradeTotal),0),color:colors.text},
          {label:type==='customer'?t('partyGrossProfit'):t('partyPurchaseInvoices'),value:summaries.reduce((total,s)=>total+(type==='customer'?s.customerGrossProfit:s.supplierInvoiceCount),0),color:stitch.green,count:type==='supplier'},
          {label:type==='customer'?t('partyCashCustomer'):t('partyCashSupplier'),value:summaries.reduce((total,s)=>total+(type==='customer'?s.cashIn:s.cashOut),0),color:colors.text},
          {label:t('partyBalance'),value:items.reduce((total,p)=>total+p.net,0),color:stitch.green}
        ].map(metric=><View key={metric.label} style={{width:'48%',flexGrow:1,backgroundColor:'#080C14',padding:12,borderRadius:6,gap:8}}><AppText variant="caption" muted>{metric.label}</AppText><StitchText bold size={17} color={metric.color}>{number(metric.value)}{metric.count?'':' MRU'}</StitchText></View>)}</View></StitchPanel>
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
        summary={summaries.find(s=>s.partyId===item.id)}
        canCash={!item.isArchived&&auth.has(type==='customer'?'customers.collect':'suppliers.pay')}
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

function PartyRow({item,summary,canCash,canRestore,restoring,onRestore}:{item:Party;summary?:Awaited<ReturnType<typeof listPartyFinancialSummaries>>[number];first:boolean;last:boolean;canCash:boolean;canRestore:boolean;restoring:boolean;onRestore:()=>void}){
 const {t,isRTL,locale,number}=useI18n(),ar=locale==='ar',customer=item.partyType==='customer',row={flexDirection:isRTL?'row-reverse' as const:'row' as const};
 const total=customer?summary?.customerTradeTotal:summary?.supplierTradeTotal,paid=customer?summary?.cashIn:summary?.cashOut;
 return <View style={styles.stitchParty}><Pressable accessibilityRole="button" onPress={()=>router.push({pathname:'/parties/[id]',params:{id:item.id}})} style={[styles.nameRow,row]}><View style={styles.stitchAvatar}><StitchIcon name={customer?'people':'purchase'} size={27} color={customer?stitch.green:stitch.amber}/></View><View style={styles.body}><AppText variant="subheading" numberOfLines={2}>{item.name}</AppText>{item.phone?<AppText variant="caption" muted>{item.phone}</AppText>:null}</View><Badge label={item.isArchived?t('partyAccountArchived'):item.net>0?t('partyReceivable'):item.net<0?t('partyPayable'):t('partySettled')} tone={item.net>0?'positive':item.net<0?'negative':'neutral'}/></Pressable>
 <View style={[styles.stitchFigures,{flexDirection:'column'}]}>{[{label:customer?t('partyTradeCustomer'):t('partyTradeSupplier'),value:total??0,color:colors.text},...(customer?[{label:t('partyGrossProfit'),value:summary?.customerGrossProfit??0,color:stitch.green}]:[]),{label:customer?t('partyCashCustomer'):t('partyCashSupplier'),value:paid??0,color:stitch.muted}].map(metric=><View key={metric.label} style={{flexDirection:isRTL?'row-reverse':'row',justifyContent:'space-between',gap:8}}><AppText variant="caption" muted>{metric.label}</AppText><StitchText bold size={13} color={metric.color}>{number(metric.value)} MRU</StitchText></View>)}<View style={{flexDirection:isRTL?'row-reverse':'row',justifyContent:'space-between',borderTopWidth:1,borderTopColor:colors.border,paddingTop:10,marginTop:4}}><AppText variant="subheading">{t('partyBalance')}</AppText><Money value={Math.abs(item.net)} tone={item.net>0?'positive':item.net<0?'negative':'normal'}/></View></View>
 <View style={[styles.stitchActions,row]}><Pressable accessibilityRole="button" onPress={()=>router.push({pathname:'/parties/[id]',params:{id:item.id}})} style={styles.stitchAction}><StitchIcon name="receipt" size={17}/><AppText variant="caption">{ar?'كشف حساب':'Relevé'}</AppText></Pressable>{canRestore?<Button compact title={t('restore')} loading={restoring} onPress={onRestore}/>:canCash?<Pressable accessibilityRole="button" onPress={()=>router.push({pathname:'/parties/[id]',params:{id:item.id,action:customer?'receive':'pay'}})} style={[styles.stitchAction,{backgroundColor:customer?stitch.green:stitch.red}]}><StitchIcon name={customer?'receive':'spend'} color="#FFFFFF" size={17}/><AppText variant="caption" style={{color:'#FFFFFF'}}>{customer?(ar?'سند قبض':'Encaisser'):(ar?'سند دفع':'Payer')}</AppText></Pressable>:null}</View></View>;
}


const styles=StyleSheet.create({
  stitchParty:{padding:16,gap:12,borderRadius:12,borderWidth:1,borderColor:stitch.border,backgroundColor:'#232833',marginBottom:12},stitchAvatar:{width:44,height:44,borderRadius:10,backgroundColor:'#19243A',alignItems:'center',justifyContent:'center'},stitchFigures:{backgroundColor:'#080C14',borderRadius:8,padding:10,gap:8},stitchFigure:{flex:1,minWidth:0,gap:4},stitchActions:{gap:8},stitchAction:{flex:1,minHeight:44,borderRadius:8,backgroundColor:'#1C2638',flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6},
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
