import { useCallback, useState, type ReactNode } from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type { DocumentRecord, Party, PaymentAccount } from '@/domain/types';
import { getParty, getPartyFinancialSummary, listPaymentAccounts, type PartyFinancialSummary } from '@/db/queries';
import { listDocumentHeaders } from '@/db/document-queries';
import { postPartyCash } from '@/services/accounting-service';
import { archiveParty, updateParty } from '@/services/management-service';
import { postOffset, postSettlement } from '@/services/party-ledger-service';
import {
  AlertCard,
  AppText,
  Badge,
  Button,
  EmptyState,
  ErrorState,
  FinancialSummary,
  FormField,
  FramedSection,
  LoadingState,
  Money,
  PageHeader,
  PaymentMethodCard,
  Screen,
  SegmentedControl,
} from '@/components/ui';
import { Sheet } from '@/components/mobile-interactions';
import { useI18n } from '@/i18n/provider';
import { useAuth } from '@/auth/provider';
import { colors, radius, spacing } from '@/theme';

type Action='receive'|'pay'|'settlement'|'offset'|'edit'|null;
type Period='today'|'all'|'custom';

const emptySummary=(partyId=''):PartyFinancialSummary=>({partyId,cashIn:0,cashOut:0,customerTradeTotal:0,customerGrossProfit:0,supplierTradeTotal:0,supplierInvoiceCount:0});
function localDay(){const value=new Date(),y=value.getFullYear(),m=String(value.getMonth()+1).padStart(2,'0'),d=String(value.getDate()).padStart(2,'0');return `${y}-${m}-${d}`}
function format(template:string,values:Record<string,string|number>){return Object.entries(values).reduce((output,[key,value])=>output.replaceAll('{'+key+'}',String(value)),template)}
function timeLabel(value:string,locale:'ar'|'fr'){
  try{return new Intl.DateTimeFormat(locale==='ar'?'ar-MR':'fr-FR',{hour:'2-digit',minute:'2-digit'}).format(new Date(value))}
  catch{return value.slice(11,16)}
}

export function PartyDetailScreen(){
  const {id}=useLocalSearchParams<{id:string}>(),db=useSQLiteContext(),{t,date,isRTL,number,locale,errorMessage}=useI18n(),auth=useAuth(),today=localDay();
  const [party,setParty]=useState<Party|null>(null),[docs,setDocs]=useState<DocumentRecord[]>([]),[accounts,setAccounts]=useState<PaymentAccount[]>([]),[summary,setSummary]=useState<PartyFinancialSummary>(()=>emptySummary(id));
  const [action,setAction]=useState<Action>(null),[period,setPeriod]=useState<Period>('today'),[from,setFrom]=useState(today),[to,setTo]=useState(today),[dateSheet,setDateSheet]=useState(false),[busy,setBusy]=useState(false);
  const [loaded,setLoaded]=useState(false),[loadError,setLoadError]=useState(false);

  const load=useCallback(async()=>{
    if(!id)return;
    const range=period==='today'?{from:today,to:today}:period==='custom'?{from:from||undefined,to:to||undefined}:{from:undefined,to:undefined};
    try{
      const [p,d,a,s]=await Promise.all([
        getParty(db,id),
        listDocumentHeaders(db,{partyId:id,...range,limit:150}),
        listPaymentAccounts(db),
        getPartyFinancialSummary(db,id),
      ]);
      setParty(p);
      setDocs(d);
      setAccounts(a.filter(account=>account.isActive&&!account.isArchived));
      setSummary(s);
      setLoadError(false);
    }catch{
      setLoadError(true);
    }finally{setLoaded(true)}
  },[db,from,id,period,to,today]);

  useFocusEffect(useCallback(()=>{void load()},[load]));

  if(!loaded)return <Screen><LoadingState/></Screen>;
  if(loadError&&!party)return <Screen><PageHeader title={t('partyLedger')} onBack={()=>router.back()}/><ErrorState title={t('partyLoadFailed')} action={<Button title={t('tryAgain')} variant="secondary" onPress={()=>{setLoaded(false);void load()}}/>}/></Screen>;
  if(!party)return <Screen><PageHeader title={t('partyLedger')} onBack={()=>router.back()}/><EmptyState title={t('noData')}/></Screen>;

  const customer=party.partyType==='customer';
  const canView=auth.has(customer?'customers.view':'suppliers.view');
  const canMove=auth.has(customer?'customers.collect':'suppliers.pay')&&!party.isArchived;
  const canEdit=auth.has(customer?'customers.edit':'suppliers.edit')&&!party.isArchived;
  const canArchive=auth.has(customer?'customers.delete':'suppliers.delete')&&!party.isArchived;
  const canLedger=canEdit;

  if(!canView)return <Screen><PageHeader title={party.name} onBack={()=>router.back()}/><EmptyState title={t('partyDetailNoPermission')}/></Screen>;

  const trade=customer?summary.customerTradeTotal:summary.supplierTradeTotal;
  const cash=customer?summary.cashIn:summary.cashOut;
  const balanceTitle=party.net>0?t('partyDueToUs'):party.net<0?t('partyDueByUs'):t('partyAccountSettled');
  const balanceTone=party.net>0?'positive':party.net<0?'negative':'normal';
  const periodLabel=period==='today'?t('partyToday'):period==='all'?t('partyAllPeriod'):`${from} → ${to}`;

  const run=async(task:()=>Promise<unknown>)=>{
    if(busy)return;
    setBusy(true);
    try{await task();setAction(null);await load()}
    catch(error){Alert.alert(t('error'),errorMessage(error))}
    finally{setBusy(false)}
  };

  const confirmArchive=()=>Alert.alert(
    t('partyArchiveTitle'),
    party.net!==0?t('partyArchiveNeedsSettlement'):t('partyArchiveDescription'),
    party.net!==0
      ?[{text:t('confirm')}]
      :[{text:t('cancel'),style:'cancel'},{text:t('confirm'),style:'destructive',onPress:()=>void (async()=>{
        if(busy)return;
        setBusy(true);
        try{await archiveParty(db,party.id);router.back()}
        catch(error){Alert.alert(t('error'),errorMessage(error));setBusy(false)}
      })()}],
  );

  const movementLabel=(doc:DocumentRecord)=>{
    if(doc.kind==='sale')return t('partyMovementSale');
    if(doc.kind==='purchase')return t('partyMovementPurchase');
    if(doc.kind==='expense')return t('partyMovementExpense');
    if(doc.kind==='payment')return t('partyMovementPayment');
    if(doc.kind==='settlement')return t('partyMovementSettlement');
    if(doc.kind==='offset')return t('partyMovementOffset');
    return t('partyMovementOther');
  };

  const movementTone=(doc:DocumentRecord):'neutral'|'primary'|'positive'|'negative'|'warning'=>doc.status==='voided'?'negative':doc.kind==='sale'?'positive':doc.kind==='purchase'?'warning':doc.kind==='payment'?'primary':'neutral';

  const changePeriod=(value:Period)=>{
    if(value==='custom'){setDateSheet(true);return}
    setPeriod(value);
  };

  return <Screen padded={false}>
    <FlatList
      data={docs}
      keyExtractor={item=>item.id}
      contentContainerStyle={styles.list}
      ListHeaderComponent={<View style={styles.header}>
        <PageHeader title={party.name} subtitle={party.phone||undefined} onBack={()=>router.back()}/>

        <FramedSection
          title={t('partyAccountSummary')}
          action={<View style={[styles.badges,{flexDirection:isRTL?'row-reverse':'row'}]}>
            <Badge label={customer?t('customer'):t('supplier')} tone="primary"/>
            {party.isArchived?<Badge label={t('partyAccountArchived')} tone="warning"/>:null}
          </View>}
        >
          <View style={[styles.primaryBalance,{flexDirection:isRTL?'row-reverse':'row'}]}>
            <View style={styles.flex}>
              <AppText variant="caption" muted>{balanceTitle}</AppText>
              <Money value={Math.abs(party.net)} tone={balanceTone} large/>
            </View>
            {(canEdit||canArchive)?<View style={styles.adminButtons}>
              {canEdit?<Button compact title={t('edit')} variant="ghost" onPress={()=>setAction('edit')}/>:null}
              {canArchive?<Button compact title={t('partyArchive')} variant="ghost" disabled={busy} onPress={confirmArchive}/>:null}
            </View>:null}
          </View>
          <FinancialSummary items={[
            {label:t('partyReceivableShort'),value:party.receivable,tone:party.receivable>0?'positive':'normal'},
            {label:t('partyPayableShort'),value:party.payable,tone:party.payable>0?'negative':'normal'},
          ]}/>
        </FramedSection>

        {(canMove||canLedger)?<View style={styles.actionsPanel}>
          <View style={[styles.actionRow,{flexDirection:isRTL?'row-reverse':'row'}]}>
            {canMove?<ActionSlot><Button title={t('receive')} onPress={()=>setAction('receive')}/></ActionSlot>:null}
            {canMove?<ActionSlot><Button title={t('pay')} variant="secondary" onPress={()=>setAction('pay')}/></ActionSlot>:null}
          </View>
          {(canLedger&&party.net!==0)||(canLedger&&party.receivable>0&&party.payable>0)?<View style={[styles.actionRow,{flexDirection:isRTL?'row-reverse':'row'}]}>
            {canLedger&&party.net!==0?<ActionSlot><Button title={t('partySettlement')} variant="secondary" onPress={()=>setAction('settlement')}/></ActionSlot>:null}
            {canLedger&&party.receivable>0&&party.payable>0?<ActionSlot><Button title={t('partyOffset')} variant="secondary" onPress={()=>setAction('offset')}/></ActionSlot>:null}
          </View>:null}
        </View>:null}

        <FramedSection title={t('partyActivitySummary')} padded={false}>
          <FinancialSummary items={customer?[
            {label:t('partyTradeCustomer'),value:trade},
            {label:t('partyCashCustomer'),value:cash,tone:cash>0?'positive':'normal'},
            {label:t('partyGrossProfit'),value:summary.customerGrossProfit,tone:summary.customerGrossProfit>=0?'positive':'negative',emphasize:true},
          ]:[
            {label:t('partyTradeSupplier'),value:trade},
            {label:t('partyCashSupplier'),value:cash,tone:cash>0?'negative':'normal'},
            {label:t('partyPurchaseInvoices'),value:summary.supplierInvoiceCount,format:'number',emphasize:true},
          ]}/>
        </FramedSection>

        <View style={styles.ledgerHead}>
          <View style={[styles.ledgerTitleRow,{flexDirection:isRTL?'row-reverse':'row'}]}>
            <View style={styles.flex}>
              <AppText variant="heading">{t('partyLedger')}</AppText>
              <AppText variant="caption" muted>{periodLabel}</AppText>
            </View>
            <Badge label={number(docs.length)} tone="neutral"/>
          </View>
          <SegmentedControl
            value={period}
            options={[
              {value:'today',label:t('partyToday')},
              {value:'all',label:t('partyAllPeriod')},
              {value:'custom',label:t('partyCustomPeriod')},
            ]}
            onChange={changePeriod}
          />
        </View>
      </View>}
      ListEmptyComponent={<EmptyState title={t('partyNoPeriodRecords')}/>}
      renderItem={({item,index})=><LedgerRow
        item={item}
        label={movementLabel(item)}
        tone={movementTone(item)}
        moment={`${date(item.occurredAt)} • ${timeLabel(item.occurredAt,locale)}`}
        first={index===0}
        last={index===docs.length-1}
      />}
    />

    <Sheet visible={action==='edit'} title={t('partyEditAccount')} onClose={()=>{if(!busy)setAction(null)}}>
      {action==='edit'?<EditPartyForm party={party} busy={busy} onCancel={()=>setAction(null)} onSave={(name,phone)=>void run(()=>updateParty(db,party.id,{name,phone}))}/>:null}
    </Sheet>

    <Sheet visible={action==='receive'||action==='pay'} title={action==='receive'?t('receive'):t('pay')} onClose={()=>{if(!busy)setAction(null)}}>
      {action==='receive'||action==='pay'?<CashForm direction={action} accounts={accounts} busy={busy} onCancel={()=>setAction(null)} onSave={(amount,method,note)=>void run(()=>postPartyCash(db,{partyId:party.id,direction:action,amount,paymentMethod:method,note}))}/>:null}
    </Sheet>

    <Sheet visible={action==='settlement'||action==='offset'} title={action==='offset'?t('partyOffset'):t('partyAccountingSettlement')} onClose={()=>{if(!busy)setAction(null)}}>
      {action==='settlement'||action==='offset'?<LedgerForm mode={action} party={party} busy={busy} onCancel={()=>setAction(null)} onSave={(amount,note)=>void run(()=>action==='offset'?postOffset(db,{partyId:party.id,amount,note}):postSettlement(db,{partyId:party.id,side:party.receivable>0?'receivable':'payable',amount,note}))}/>:null}
    </Sheet>

    <Sheet
      visible={dateSheet}
      title={t('partyCustomPeriod')}
      onClose={()=>setDateSheet(false)}
      footer={<>
        <Button title={t('confirm')} disabled={!from||!to} onPress={()=>{setPeriod('custom');setDateSheet(false)}}/>
        <Button title={t('cancel')} variant="ghost" onPress={()=>setDateSheet(false)}/>
      </>}
    >
      <View style={[styles.datePair,{flexDirection:isRTL?'row-reverse':'row'}]}>
        <FormField label={t('from')} value={from} onChangeText={setFrom} placeholder="YYYY-MM-DD" containerStyle={styles.flex}/>
        <FormField label={t('to')} value={to} onChangeText={setTo} placeholder="YYYY-MM-DD" containerStyle={styles.flex}/>
      </View>
    </Sheet>
  </Screen>;
}

function LedgerRow({item,label,tone,moment,first,last}:{item:DocumentRecord;label:string;tone:'neutral'|'primary'|'positive'|'negative'|'warning';moment:string;first:boolean;last:boolean}){
  const {isRTL}=useI18n();
  return <View style={[styles.ledgerRow,first&&styles.firstLedgerRow,last&&styles.lastLedgerRow,{flexDirection:isRTL?'row-reverse':'row'}]}>
    <View style={styles.ledgerCopy}>
      <View style={[styles.rowTop,{flexDirection:isRTL?'row-reverse':'row'}]}>
        <Badge label={label} tone={tone}/>
        {item.status==='voided'?<Badge label="×" tone="negative"/>:null}
      </View>
      <AppText variant="subheading" numberOfLines={1}>{item.title??item.number}</AppText>
      <AppText variant="caption" muted numberOfLines={1}>{item.number} • {moment}</AppText>
    </View>
    <Money value={item.total} tone={item.status==='voided'?'normal':item.kind==='sale'?'positive':item.kind==='purchase'||item.kind==='expense'?'negative':'normal'}/>
  </View>;
}

function ActionSlot({children}:{children:ReactNode}){return <View style={styles.actionSlot}>{children}</View>}

function EditPartyForm({party,busy,onCancel,onSave}:{party:Party;busy:boolean;onCancel:()=>void;onSave:(name:string,phone:string)=>void}){
  const {t}=useI18n();
  const [name,setName]=useState(party.name),[phone,setPhone]=useState(party.phone);
  return <View style={styles.form}>
    <FormField label={t('name')} value={name} onChangeText={setName} autoFocus/>
    <FormField label={t('phone')} keyboardType="phone-pad" value={phone} onChangeText={setPhone}/>
    <Button title={t('save')} loading={busy} disabled={!name.trim()} onPress={()=>onSave(name.trim(),phone.trim())}/>
    <Button title={t('cancel')} variant="ghost" disabled={busy} onPress={onCancel}/>
  </View>;
}

function CashForm({direction,accounts,busy,onCancel,onSave}:{direction:'receive'|'pay';accounts:PaymentAccount[];busy:boolean;onCancel:()=>void;onSave:(amount:number,method:string,note:string)=>void}){
  const {t,isRTL}=useI18n();
  const [amount,setAmount]=useState(''),[method,setMethod]=useState(accounts.find(account=>account.code==='cash')?.id??accounts[0]?.id??''),[note,setNote]=useState('');
  const value=Number(amount),valid=Number.isFinite(value)&&value>0&&Boolean(method);
  return <View style={styles.form}>
    <FormField label={t('amount')} value={amount} keyboardType="number-pad" onChangeText={setAmount} autoFocus trailing={<AppText variant="caption" muted>MRU</AppText>}/>
    <View style={styles.formBlock}>
      <AppText variant="caption" muted>{t('paymentMethod')}</AppText>
      {accounts.length?<View style={[styles.paymentMethods,{flexDirection:isRTL?'row-reverse':'row'}]}>
        {accounts.map(account=><PaymentMethodCard key={account.id} label={account.name} selected={method===account.id} onPress={()=>setMethod(account.id)} style={styles.paymentMethod}/>)}
      </View>:<AlertCard title={t('partyNoPaymentMethod')} tone="warning"/>}
    </View>
    <FormField label={t('note')} value={note} onChangeText={setNote}/>
    <Button title={direction==='receive'?t('receive'):t('pay')} loading={busy} disabled={!valid} onPress={()=>onSave(value,method,note)}/>
    <Button title={t('cancel')} variant="ghost" disabled={busy} onPress={onCancel}/>
  </View>;
}

function LedgerForm({mode,party,busy,onCancel,onSave}:{mode:'settlement'|'offset';party:Party;busy:boolean;onCancel:()=>void;onSave:(amount:number,note:string)=>void}){
  const {t}=useI18n();
  const maximum=mode==='offset'?Math.min(party.receivable,party.payable):party.receivable>0?party.receivable:party.payable;
  const [amount,setAmount]=useState(String(maximum)),[note,setNote]=useState('');
  const value=Number(amount),valid=Number.isFinite(value)&&value>0&&value<=maximum;
  return <View style={styles.form}>
    <AlertCard title={mode==='offset'?t('partyOffset'):t('partyAccountingSettlement')} description={mode==='offset'?t('partyOffsetHelp'):t('partySettlementHelp')} tone="primary"/>
    <AppText variant="caption" muted>{format(t('partyMaximum'),{value:maximum})}</AppText>
    <FormField label={t('amount')} value={amount} keyboardType="number-pad" onChangeText={setAmount} trailing={<AppText variant="caption" muted>MRU</AppText>}/>
    <FormField label={t('note')} value={note} onChangeText={setNote}/>
    <Button title={t('confirm')} loading={busy} disabled={!valid} onPress={()=>onSave(value,note)}/>
    <Button title={t('cancel')} variant="ghost" disabled={busy} onPress={onCancel}/>
  </View>;
}

const styles=StyleSheet.create({
  list:{paddingHorizontal:spacing.md,paddingBottom:spacing.xxl,backgroundColor:colors.background},
  header:{gap:spacing.sm,marginBottom:spacing.sm},
  flex:{flex:1,minWidth:0},
  badges:{alignItems:'center',gap:spacing.xs,flexWrap:'wrap'},
  primaryBalance:{alignItems:'center',gap:spacing.md},
  adminButtons:{alignItems:'flex-end',gap:spacing.xxs},
  actionsPanel:{gap:spacing.xs},
  actionRow:{gap:spacing.xs},
  actionSlot:{flex:1,minWidth:0},
  ledgerHead:{gap:spacing.sm},
  ledgerTitleRow:{alignItems:'center',justifyContent:'space-between',gap:spacing.sm},
  ledgerRow:{minHeight:70,alignItems:'center',gap:spacing.sm,paddingHorizontal:spacing.sm,paddingVertical:spacing.xs,backgroundColor:colors.surface,borderLeftWidth:1,borderRightWidth:1,borderTopWidth:1,borderColor:colors.border},
  firstLedgerRow:{borderTopColor:colors.borderStrong,borderLeftColor:colors.borderStrong,borderRightColor:colors.borderStrong,borderTopLeftRadius:radius.lg,borderTopRightRadius:radius.lg},
  lastLedgerRow:{borderBottomWidth:1,borderBottomColor:colors.borderStrong,borderBottomLeftRadius:radius.lg,borderBottomRightRadius:radius.lg},
  ledgerCopy:{flex:1,minWidth:0,gap:3},
  rowTop:{alignItems:'center',gap:spacing.xs,flexWrap:'wrap'},
  form:{gap:spacing.sm},
  formBlock:{gap:spacing.xs},
  paymentMethods:{flexWrap:'wrap',gap:spacing.xs},
  paymentMethod:{width:'48.5%',flexGrow:0,flexBasis:'48.5%',minWidth:120},
  datePair:{gap:spacing.sm},
});
