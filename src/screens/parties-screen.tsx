import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type { Party, PartyType } from '@/domain/types';
import { listParties, listPartyFinancialSummaries, type PartyFinancialSummary } from '@/db/queries';
import { createParty } from '@/services/accounting-service';
import { AppText, Badge, Button, EmptyState, Field, Money, Screen, SearchField, SectionTitle } from '@/components/ui';
import { CompactMetric, Sheet } from '@/components/mobile-interactions';
import { useI18n } from '@/i18n/provider';
import { useAuth } from '@/auth/provider';
import { colors, radius, spacing } from '@/theme';

export function PartiesScreen({type}:{type:PartyType}){
  const db=useSQLiteContext(),{t,locale,number,isRTL,errorMessage}=useI18n(),auth=useAuth(),ar=locale==='ar';
  const [items,setItems]=useState<Party[]>([]),[summaries,setSummaries]=useState<PartyFinancialSummary[]>([]),[search,setSearch]=useState('');
  const [createOpen,setCreateOpen]=useState(false),[name,setName]=useState(''),[phone,setPhone]=useState(''),[busy,setBusy]=useState(false);
  const viewCapability=type==='customer'?'customers.view':'suppliers.view',createCapability=type==='customer'?'customers.create':'suppliers.create',allowed=auth.has(viewCapability),canCreate=auth.has(createCapability);
  const load=useCallback(async()=>{if(!allowed)return;const [parties,metrics]=await Promise.all([listParties(db,type,search,150),listPartyFinancialSummaries(db,type)]);setItems(parties);setSummaries(metrics)},[allowed,db,type,search]);
  useFocusEffect(useCallback(()=>{void load()},[load]));
  const summaryMap=useMemo(()=>new Map(summaries.map(item=>[item.partyId,item])),[summaries]);
  const visibleSummaries=useMemo(()=>{if(!search.trim())return summaries;const visibleIds=new Set(items.map(item=>item.id));return summaries.filter(item=>visibleIds.has(item.partyId))},[items,search,summaries]);
  const aggregate=useMemo(()=>visibleSummaries.reduce((total,item)=>{total.cashIn+=item.cashIn;total.cashOut+=item.cashOut;total.trade+=type==='customer'?item.customerTradeTotal:item.supplierTradeTotal;total.profit+=type==='customer'?item.customerGrossProfit:0;total.count+=type==='supplier'?item.supplierInvoiceCount:0;return total},{cashIn:0,cashOut:0,trade:0,profit:0,count:0}),[visibleSummaries,type]);
  const net=useMemo(()=>items.reduce((sum,item)=>sum+item.net,0),[items]);
  const closeCreate=()=>{if(busy)return;setCreateOpen(false);setName('');setPhone('')};
  const saveParty=async()=>{
    if(!canCreate||busy)return;
    setBusy(true);
    try{await createParty(db,{name,phone,partyType:type});setCreateOpen(false);setName('');setPhone('');await load()}
    catch(error){Alert.alert(t('error'),errorMessage(error))}
    finally{setBusy(false)}
  };
  if(!allowed)return <Screen><EmptyState title={type==='customer'?(ar?'ليس لديك صلاحية عرض العملاء':'Vous n’avez pas accès aux clients.'):(ar?'ليس لديك صلاحية عرض الموردين':'Vous n’avez pas accès aux fournisseurs.')}/></Screen>;
  const title=type==='customer'?t('customers'):t('suppliers');
  const tradeLabel=type==='customer'?(ar?'إجمالي المبيعات لهم':'Ventes aux clients'):(ar?'إجمالي المشتريات منهم':'Achats fournisseurs');
  const balanceLabel=net>0?(ar?'مستحق لنا':'À recevoir'):net<0?(ar?'مستحق علينا':'À payer'):(ar?'الرصيد مسدد':'Solde réglé');
  const balanceTone=net>0?'positive':net<0?'negative':'normal';
  return <Screen padded={false}>
    <FlatList data={items} keyExtractor={item=>item.id} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.list} ListHeaderComponent={<View style={styles.header}>
      <SectionTitle title={title} subtitle={type==='customer'?(ar?'ابحث عن العميل واعرف الرصيد قبل التحصيل أو البيع الآجل.':'Trouvez le client et voyez son solde avant encaissement ou crédit.'):(ar?'اعرف ما علينا لكل مورد قبل الدفع أو تسجيل شراء جديد.':'Voyez ce qui est dû avant paiement ou nouvel achat.')} action={canCreate?<Button compact title={t('add')} onPress={()=>setCreateOpen(true)}/>:undefined}/>
      <View style={styles.balanceHero}><View style={styles.balanceRule}/><AppText variant="caption" muted>{balanceLabel}</AppText><Money value={Math.abs(net)} tone={balanceTone} large/><AppText variant="caption" muted>{ar?`${number(items.length)} حساب ظاهر`:`${number(items.length)} comptes affichés`}</AppText></View>
      <View style={[styles.metrics,{flexDirection:isRTL?'row-reverse':'row'}]}><CompactMetric label={tradeLabel} value={aggregate.trade}/>{type==='customer'?<CompactMetric label={ar?'الربح الإجمالي':'Bénéfice brut'} value={aggregate.profit} tone={aggregate.profit>=0?'positive':'negative'}/>:<CountMetric label={ar?'فواتير الشراء':'Factures d’achat'} value={number(aggregate.count)}/>}<CompactMetric label={type==='customer'?(ar?'المبالغ المحصلة':'Encaissements'):(ar?'المبالغ المدفوعة':'Paiements')} value={type==='customer'?aggregate.cashIn:aggregate.cashOut}/></View>
      <SearchField value={search} onChangeText={setSearch} placeholder={type==='customer'?(ar?'ابحث باسم العميل أو الهاتف…':'Nom ou téléphone du client…'):(ar?'ابحث باسم المورد أو الهاتف…':'Nom ou téléphone du fournisseur…')}/>
    </View>} ListEmptyComponent={<EmptyState title={search?t('noResults'):t('noData')} description={!search&&canCreate?(ar?'أضف أول حساب لتبدأ متابعة الرصيد والحركات.':'Ajoutez le premier compte pour suivre solde et opérations.'):undefined}/>} renderItem={({item})=>{
      const metric=summaryMap.get(item.id),trade=type==='customer'?metric?.customerTradeTotal??0:metric?.supplierTradeTotal??0;
      const stateLabel=item.net>0?(ar?'لنا عليه':'À recevoir'):item.net<0?(ar?'له علينا':'À payer'):(ar?'مسدد':'Soldé');
      const stateTone=item.net>0?'positive':item.net<0?'negative':'neutral';
      return <Pressable accessibilityRole="button" onPress={()=>router.push({pathname:'/parties/[id]',params:{id:item.id}})} style={({pressed})=>[styles.row,{flexDirection:isRTL?'row-reverse':'row'},pressed&&styles.pressed]}><View style={styles.body}><View style={[styles.nameRow,{flexDirection:isRTL?'row-reverse':'row'}]}><AppText variant="subheading" numberOfLines={1} style={styles.name}>{item.name}</AppText><Badge label={stateLabel} tone={stateTone}/></View>{item.phone?<AppText variant="caption" muted>{item.phone}</AppText>:null}<AppText variant="caption" muted>{type==='customer'?(ar?`إجمالي مشترياته ${number(trade)} MRU`:`Achats ${number(trade)} MRU`):(ar?`إجمالي مشترياتنا ${number(trade)} MRU`:`Nos achats ${number(trade)} MRU`)}</AppText></View><View style={styles.trailing}><AppText variant="caption" muted>{ar?'الرصيد':'Solde'}</AppText><Money value={Math.abs(item.net)} tone={item.net>0?'positive':item.net<0?'negative':'normal'}/><AppText variant="heading" style={styles.arrow}>{isRTL?'‹':'›'}</AppText></View></Pressable>;
    }}/>

    <Sheet visible={createOpen&&canCreate} title={type==='customer'?(ar?'عميل جديد':'Nouveau client'):(ar?'مورد جديد':'Nouveau fournisseur')} onClose={closeCreate} footer={<><Button title={t('save')} loading={busy} disabled={!name.trim()} onPress={()=>void saveParty()}/><Button title={t('cancel')} variant="ghost" disabled={busy} onPress={closeCreate}/></>}><Field label={t('name')} value={name} onChangeText={setName} autoFocus/><Field label={t('phone')} keyboardType="phone-pad" value={phone} onChangeText={setPhone}/><View style={styles.sheetNote}><View style={styles.noteRule}/><AppText variant="caption" muted>{type==='customer'?(ar?'يمكنك إضافة الرصيد والحركات لاحقًا من صفحة العميل.':'Le solde et les opérations se gèrent ensuite depuis le client.'):(ar?'يمكنك تسجيل الشراء والدفع لاحقًا من حساب المورد.':'Les achats et paiements se gèrent ensuite depuis le fournisseur.')}</AppText></View></Sheet>
  </Screen>;
}

function CountMetric({label,value}:{label:string;value:string}){return <View style={styles.countMetric}><View style={styles.metricRule}/><AppText variant="caption" muted>{label}</AppText><AppText variant="heading">{value}</AppText></View>}

const styles=StyleSheet.create({
  list:{padding:spacing.md,paddingBottom:spacing.xxl,backgroundColor:colors.background},
  header:{gap:spacing.md,marginBottom:spacing.sm},
  balanceHero:{gap:spacing.xs,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,padding:spacing.md},
  balanceRule:{width:34,height:3,borderRadius:2,backgroundColor:colors.accent,marginBottom:spacing.xxs},
  metrics:{gap:spacing.xs,flexWrap:'wrap',borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,overflow:'hidden'},
  countMetric:{flex:1,minWidth:132,backgroundColor:colors.surface,paddingVertical:spacing.md,paddingHorizontal:spacing.md,gap:spacing.xs,borderBottomWidth:1,borderBottomColor:colors.border},
  metricRule:{width:28,height:2,borderRadius:2,backgroundColor:colors.accent,marginBottom:spacing.xxs},
  row:{minHeight:92,alignItems:'center',gap:spacing.md,paddingVertical:spacing.md,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border},
  body:{flex:1,gap:spacing.xs},
  nameRow:{alignItems:'center',gap:spacing.xs},
  name:{flexShrink:1},
  trailing:{alignItems:'flex-end',gap:spacing.xxs,minWidth:96},
  arrow:{color:colors.textSoft,lineHeight:20},
  pressed:{backgroundColor:colors.surfaceMuted},
  sheetNote:{gap:spacing.xs,paddingVertical:spacing.xs},
  noteRule:{width:28,height:2,borderRadius:2,backgroundColor:colors.accent},
});
