import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Modal, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type { Party, PartyType } from '@/domain/types';
import { listParties, listPartyFinancialSummaries, type PartyFinancialSummary } from '@/db/queries';
import { createParty } from '@/services/accounting-service';
import { restoreParty } from '@/services/management-service';
import { AppText, Button, Card, Chip, EmptyState, Field, Money, Row, Screen, SearchField, SectionTitle } from '@/components/ui';
import { useI18n } from '@/i18n/provider';
import { useAuth } from '@/auth/provider';
import { colors, spacing } from '@/theme';

export function PartiesScreen({type}:{type:PartyType}){
  const db=useSQLiteContext(),{t,locale,number,errorMessage}=useI18n(),auth=useAuth(),ar=locale==='ar';
  const [items,setItems]=useState<Party[]>([]),[summaries,setSummaries]=useState<PartyFinancialSummary[]>([]),[search,setSearch]=useState(''),[showArchived,setShowArchived]=useState(false),[open,setOpen]=useState(false);
  const viewCapability=type==='customer'?'customers.view':'suppliers.view';
  const createCapability=type==='customer'?'customers.create':'suppliers.create';
  const editCapability=type==='customer'?'customers.edit':'suppliers.edit';
  const allowed=auth.has(viewCapability),canCreate=auth.has(createCapability),canEdit=auth.has(editCapability);

  const load=useCallback(async()=>{
    if(!allowed)return;
    const [parties,metrics]=await Promise.all([
      listParties(db,type,search,250,true),
      listPartyFinancialSummaries(db,type,false),
    ]);
    setItems(parties.filter(party=>Boolean(party.isArchived)===showArchived));
    setSummaries(metrics);
  },[allowed,db,search,showArchived,type]);
  useFocusEffect(useCallback(()=>{void load()},[load]));

  const summaryMap=useMemo(()=>new Map(summaries.map(item=>[item.partyId,item])),[summaries]);
  const activeItems=useMemo(()=>showArchived?[]:items,[items,showArchived]);
  const visibleSummaries=useMemo(()=>{
    if(showArchived)return[];
    if(!search.trim())return summaries;
    const visibleIds=new Set(activeItems.map(item=>item.id));
    return summaries.filter(item=>visibleIds.has(item.partyId));
  },[activeItems,search,showArchived,summaries]);
  const aggregate=useMemo(()=>visibleSummaries.reduce((total,item)=>{
    total.cashIn+=item.cashIn;total.cashOut+=item.cashOut;
    total.trade+=type==='customer'?item.customerTradeTotal:item.supplierTradeTotal;
    total.profit+=type==='customer'?item.customerGrossProfit:0;
    total.count+=type==='supplier'?item.supplierInvoiceCount:0;
    return total;
  },{cashIn:0,cashOut:0,trade:0,profit:0,count:0}),[visibleSummaries,type]);
  const net=useMemo(()=>activeItems.reduce((sum,item)=>sum+item.net,0),[activeItems]);

  if(!allowed)return <Screen><EmptyState title={type==='customer'?(ar?'ليس لديك صلاحية عرض العملاء':'Vous n’avez pas accès aux clients.'):(ar?'ليس لديك صلاحية عرض الموردين':'Vous n’avez pas accès aux fournisseurs.')}/></Screen>;
  const tradeLabel=type==='customer'?(ar?'إجمالي ما اشتراه العملاء منا':'Achats totaux des clients'):(ar?'إجمالي مشترياتنا من الموردين':'Achats totaux fournisseurs');

  const restore=async(party:Party)=>{
    try{
      if(!canEdit)throw new Error(ar?'ليس لديك صلاحية استعادة هذا الحساب':'Vous n’avez pas le droit de restaurer ce compte.');
      await restoreParty(db,party.id);await load();Alert.alert(t('success'));
    }catch(error){Alert.alert(t('error'),errorMessage(error))}
  };

  return <Screen padded={false}>
    <FlatList
      data={items}
      keyExtractor={item=>item.id}
      contentContainerStyle={styles.content}
      ListHeaderComponent={<View style={styles.header}>
        <SectionTitle title={type==='customer'?t('customers'):t('suppliers')} action={canCreate&&!showArchived?<Button title={t('add')} onPress={()=>setOpen(true)}/>:undefined}/>
        <View style={styles.chips}>
          <Chip label={ar?'النشطون':'Actifs'} active={!showArchived} onPress={()=>setShowArchived(false)}/>
          <Chip label={ar?'المؤرشفون':'Archivés'} active={showArchived} onPress={()=>setShowArchived(true)}/>
        </View>
        <SearchField value={search} onChangeText={setSearch}/>
        {!showArchived?<View style={styles.metrics}>
          <Card elevated style={styles.metric}><AppText variant="caption" muted>{tradeLabel}</AppText><Money value={aggregate.trade}/></Card>
          {type==='customer'
            ?<Card elevated style={styles.metric}><AppText variant="caption" muted>{ar?'إجمالي الربح':'Bénéfice brut total'}</AppText><Money value={aggregate.profit} tone={aggregate.profit>0?'positive':aggregate.profit<0?'negative':'normal'}/></Card>
            :<Card elevated style={styles.metric}><AppText variant="caption" muted>{ar?'عدد فواتير الشراء':'Factures d’achat'}</AppText><AppText variant="heading">{number(aggregate.count)}</AppText></Card>}
          <Card elevated style={styles.metric}><AppText variant="caption" muted>{type==='customer'?(ar?'ما دفعه العملاء لنا':'Versé par les clients'):(ar?'ما دفعناه للموردين':'Versé aux fournisseurs')}</AppText><Money value={type==='customer'?aggregate.cashIn:aggregate.cashOut}/></Card>
          <Card elevated style={styles.metric}><AppText variant="caption" muted>{ar?'صافي الرصيد':'Solde net'}</AppText><Money value={Math.abs(net)} tone={net>0?'positive':net<0?'negative':'normal'}/></Card>
        </View>:<Card style={styles.archiveInfo}><AppText variant="caption" muted>{ar?'الحسابات المؤرشفة تبقى محفوظة لسلامة السجل التاريخي، ويمكن استعادتها عند الحاجة.':'Les comptes archivés restent conservés pour l’historique et peuvent être restaurés.'}</AppText></Card>}
      </View>}
      ListEmptyComponent={<EmptyState title={search?t('noResults'):t('noData')}/>}
      renderItem={({item})=>{
        const metric=summaryMap.get(item.id);
        const trade=type==='customer'?metric?.customerTradeTotal??0:metric?.supplierTradeTotal??0;
        const extra=type==='customer'
          ?`${ar?'إجمالي مشترياته':'Achats'}: ${number(trade)} MRU • ${ar?'الربح':'Bénéfice'}: ${number(metric?.customerGrossProfit??0)} MRU`
          :`${ar?'إجمالي مشترياتنا منه':'Nos achats'}: ${number(trade)} MRU`;
        return <Card elevated style={styles.partyCard}>
          <Row
            title={item.name}
            subtitle={showArchived?`${item.phone||'—'} • ${ar?'مؤرشف':'Archivé'}`:`${item.phone||'—'} • ${extra}`}
            trailing={showArchived
              ?(canEdit?<Button title={t('restore')} variant="secondary" onPress={()=>void restore(item)}/>:undefined)
              :<Money value={Math.abs(item.net)} tone={item.net>0?'positive':item.net<0?'negative':'normal'}/>}
            onPress={()=>router.push({pathname:'/parties/[id]',params:{id:item.id}})}
          />
        </Card>;
      }}
    />
    {open&&canCreate?<PartyModal visible={open} type={type} onClose={()=>setOpen(false)} onSave={async(name,phone)=>{
      try{
        if(!auth.has(createCapability))throw new Error(ar?'ليس لديك صلاحية إنشاء هذا الحساب':'Vous n’avez pas le droit de créer ce compte.');
        await createParty(db,{name,phone,partyType:type});setOpen(false);await load();
      }catch(error){Alert.alert(t('error'),errorMessage(error))}
    }}/>:null}
  </Screen>;
}

function PartyModal({visible,type,onClose,onSave}:{visible:boolean;type:PartyType;onClose:()=>void;onSave:(name:string,phone:string)=>Promise<void>}){
  const {t}=useI18n();const [name,setName]=useState(''),[phone,setPhone]=useState('');
  return <Modal visible={visible} animationType="slide" onRequestClose={onClose}><Screen scroll>
    <SectionTitle title={t('createParty')}/>
    <Card elevated><Field label={t('name')} value={name} onChangeText={setName}/><Field label={t('phone')} keyboardType="phone-pad" value={phone} onChangeText={setPhone}/><AppText muted>{type==='customer'?t('customer'):t('supplier')}</AppText></Card>
    <Button title={t('save')} disabled={!name.trim()} onPress={()=>void onSave(name,phone)}/>
    <Button title={t('cancel')} variant="ghost" onPress={onClose}/>
  </Screen></Modal>;
}

const styles=StyleSheet.create({
  content:{padding:spacing.md,gap:spacing.sm,paddingBottom:spacing.xxl,backgroundColor:colors.background},
  header:{gap:spacing.md,marginBottom:spacing.xs},
  chips:{flexDirection:'row',flexWrap:'wrap',gap:spacing.xs},
  metrics:{flexDirection:'row',flexWrap:'wrap',gap:spacing.sm},
  metric:{minWidth:145,flexGrow:1},
  partyCard:{paddingVertical:spacing.xs},
  archiveInfo:{paddingVertical:spacing.sm},
});
