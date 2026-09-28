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
import { AppText, Badge, Button, Chip, EmptyState, ErrorState, Field, IconTile, LoadingState, Money, PageHeader, Screen, Surface } from '@/components/ui';
import { Sheet } from '@/components/mobile-interactions';
import { useI18n } from '@/i18n/provider';
import { useAuth } from '@/auth/provider';
import { colors, elevation, radius, spacing } from '@/theme';

type Action='receive'|'pay'|'settlement'|'offset'|'edit'|null;
type Period='today'|'all'|'custom';

const emptySummary=(partyId=''):PartyFinancialSummary=>({partyId,cashIn:0,cashOut:0,customerTradeTotal:0,customerGrossProfit:0,supplierTradeTotal:0,supplierInvoiceCount:0});
function localDay(){const value=new Date(),y=value.getFullYear(),m=String(value.getMonth()+1).padStart(2,'0'),d=String(value.getDate()).padStart(2,'0');return `${y}-${m}-${d}`}
function format(template:string,values:Record<string,string|number>){return Object.entries(values).reduce((output,[key,value])=>output.replaceAll('{'+key+'}',String(value)),template)}

export function PartyDetailScreen(){
  const {id}=useLocalSearchParams<{id:string}>(),db=useSQLiteContext(),{t,date,isRTL,number,errorMessage}=useI18n(),auth=useAuth(),today=localDay();
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
      setParty(p);setDocs(d);setAccounts(a.filter(account=>account.isActive&&!account.isArchived));setSummary(s);setLoadError(false);
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

  const movementTone=(doc:DocumentRecord):'neutral'|'primary'|'positive'|'negative'|'warning'=>doc.kind==='sale'?'positive':doc.kind==='purchase'?'warning':doc.kind==='payment'?'primary':doc.status==='voided'?'negative':'neutral';

  return <Screen padded={false}>
    <FlatList
      data={docs}
      keyExtractor={item=>item.id}
      contentContainerStyle={styles.list}
      ListHeaderComponent={<View style={styles.header}>
        <PageHeader title={party.name} subtitle={party.phone||undefined} onBack={()=>router.back()}/>

        <Surface style={styles.balanceCard}>
          <View style={[styles.identityRow,{flexDirection:isRTL?'row-reverse':'row'}]}>
            <IconTile tone="neutral"><PersonGlyph/></IconTile>
            <View style={styles.flex}>
              <View style={[styles.badges,{flexDirection:isRTL?'row-reverse':'row'}]}>
                <Badge label={customer?t('customer'):t('supplier')} tone="primary"/>
                {party.isArchived?<Badge label={t('partyAccountArchived')} tone="warning"/>:null}
              </View>
              <AppText variant="caption" muted>{balanceTitle}</AppText>
              <Money value={Math.abs(party.net)} tone={balanceTone} large/>
            </View>
          </View>

          <View style={[styles.balanceSplit,{flexDirection:isRTL?'row-reverse':'row'}]}>
            <BalanceMini label={t('partyReceivableShort')} value={party.receivable} tone="positive"/>
            <View style={styles.balanceDivider}/>
            <BalanceMini label={t('partyPayableShort')} value={party.payable} tone="negative"/>
          </View>

          {(canEdit||canArchive)?<View style={[styles.adminActions,{flexDirection:isRTL?'row-reverse':'row'}]}>
            {canEdit?<View style={styles.adminAction}><Button compact title={t('edit')} variant="ghost" onPress={()=>setAction('edit')}/></View>:null}
            {canArchive?<View style={styles.adminAction}><Button compact title={t('partyArchive')} variant="ghost" disabled={busy} onPress={confirmArchive}/></View>:null}
          </View>:null}
        </Surface>

        {(canMove||canLedger)?<View style={styles.actionPanel}>
          <View style={[styles.actionRow,{flexDirection:isRTL?'row-reverse':'row'}]}>
            {canMove?<ActionSlot><Button title={t('receive')} onPress={()=>setAction('receive')}/></ActionSlot>:null}
            {canMove?<ActionSlot><Button title={t('pay')} variant="secondary" onPress={()=>setAction('pay')}/></ActionSlot>:null}
          </View>
          {(canLedger&&party.net!==0)||(canLedger&&party.receivable>0&&party.payable>0)?<View style={[styles.actionRow,{flexDirection:isRTL?'row-reverse':'row'}]}>
            {canLedger&&party.net!==0?<ActionSlot><Button title={t('partySettlement')} variant="secondary" onPress={()=>setAction('settlement')}/></ActionSlot>:null}
            {canLedger&&party.receivable>0&&party.payable>0?<ActionSlot><Button title={t('partyOffset')} variant="secondary" onPress={()=>setAction('offset')}/></ActionSlot>:null}
          </View>:null}
        </View>:null}

        <View style={[styles.metrics,{flexDirection:isRTL?'row-reverse':'row'}]}>
          <MetricTile label={customer?t('partyTradeCustomer'):t('partyTradeSupplier')} value={trade}/>
          <MetricTile label={customer?t('partyCashCustomer'):t('partyCashSupplier')} value={cash}/>
          {customer
            ?<MetricTile label={t('partyGrossProfit')} value={summary.customerGrossProfit} tone={summary.customerGrossProfit>=0?'positive':'negative'}/>
            :<CountTile label={t('partyPurchaseInvoices')} value={number(summary.supplierInvoiceCount)}/>}
        </View>

        <View style={styles.ledgerHead}>
          <View style={[styles.ledgerTitleRow,{flexDirection:isRTL?'row-reverse':'row'}]}>
            <AppText variant="heading">{t('partyLedger')}</AppText>
            <AppText variant="caption" muted>{periodLabel}</AppText>
          </View>
          <View style={[styles.periods,{flexDirection:isRTL?'row-reverse':'row'}]}>
            <Chip label={t('partyToday')} active={period==='today'} onPress={()=>setPeriod('today')}/>
            <Chip label={t('partyAllPeriod')} active={period==='all'} onPress={()=>setPeriod('all')}/>
            <Button compact title={t('partyCustomPeriod')} variant={period==='custom'?'secondary':'ghost'} onPress={()=>setDateSheet(true)}/>
          </View>
        </View>
      </View>}
      ListEmptyComponent={<EmptyState title={t('partyNoPeriodRecords')}/>}
      renderItem={({item,index})=><View style={[styles.ledgerRow,index===0&&styles.firstLedgerRow,index===docs.length-1&&styles.lastLedgerRow,{flexDirection:isRTL?'row-reverse':'row'}]}>
        <View style={styles.ledgerCopy}>
          <View style={[styles.rowTop,{flexDirection:isRTL?'row-reverse':'row'}]}>
            <Badge label={movementLabel(item)} tone={movementTone(item)}/>
            <AppText variant="caption" muted>{date(item.occurredAt)}</AppText>
          </View>
          <AppText variant="subheading" numberOfLines={1}>{item.title??item.number}</AppText>
          <AppText variant="caption" muted numberOfLines={1}>{item.number}</AppText>
        </View>
        <Money value={item.total}/>
      </View>}
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

    <Sheet visible={dateSheet} title={t('partyCustomPeriod')} onClose={()=>setDateSheet(false)} footer={<><Button title={t('confirm')} disabled={!from||!to} onPress={()=>{setPeriod('custom');setDateSheet(false)}}/><Button title={t('cancel')} variant="ghost" onPress={()=>setDateSheet(false)}/></>}>
      <View style={[styles.datePair,{flexDirection:isRTL?'row-reverse':'row'}]}>
        <Field label={t('from')} value={from} onChangeText={setFrom} placeholder="YYYY-MM-DD" containerStyle={styles.flex}/>
        <Field label={t('to')} value={to} onChangeText={setTo} placeholder="YYYY-MM-DD" containerStyle={styles.flex}/>
      </View>
    </Sheet>
  </Screen>;
}

function ActionSlot({children}:{children:ReactNode}){return <View style={styles.actionSlot}>{children}</View>}

function BalanceMini({label,value,tone}:{label:string;value:number;tone:'positive'|'negative'}){
  return <View style={styles.balanceMini}><AppText variant="caption" muted>{label}</AppText><Money value={value} tone={value>0?tone:'normal'}/></View>;
}

function MetricTile({label,value,tone='normal'}:{label:string;value:number;tone?:'normal'|'positive'|'negative'}){
  return <Surface style={styles.metricTile}><AppText variant="caption" muted numberOfLines={2}>{label}</AppText><Money value={value} tone={tone}/></Surface>;
}

function CountTile({label,value}:{label:string;value:string}){
  return <Surface style={styles.metricTile}><AppText variant="caption" muted numberOfLines={2}>{label}</AppText><AppText variant="amount">{value}</AppText></Surface>;
}

function InfoNote({children,warning=false}:{children:string;warning?:boolean}){
  return <View style={[styles.note,warning&&styles.noteWarning]}><View style={[styles.noteRule,warning&&styles.noteRuleWarning]}/><AppText variant="caption" muted>{children}</AppText></View>;
}

function EditPartyForm({party,busy,onCancel,onSave}:{party:Party;busy:boolean;onCancel:()=>void;onSave:(name:string,phone:string)=>void}){
  const {t}=useI18n();
  const [name,setName]=useState(party.name),[phone,setPhone]=useState(party.phone);
  return <View style={styles.form}><Field label={t('name')} value={name} onChangeText={setName} autoFocus/><Field label={t('phone')} keyboardType="phone-pad" value={phone} onChangeText={setPhone}/><Button title={t('save')} loading={busy} disabled={!name.trim()} onPress={()=>onSave(name.trim(),phone)}/><Button title={t('cancel')} variant="ghost" disabled={busy} onPress={onCancel}/></View>;
}

function CashForm({direction,accounts,busy,onCancel,onSave}:{direction:'receive'|'pay';accounts:PaymentAccount[];busy:boolean;onCancel:()=>void;onSave:(amount:number,method:string,note:string)=>void}){
  const {t,isRTL}=useI18n();
  const [amount,setAmount]=useState(''),[method,setMethod]=useState(accounts.find(a=>a.code==='cash')?.id??accounts[0]?.id??''),[note,setNote]=useState('');
  const value=Number(amount),valid=Number.isFinite(value)&&value>0&&Boolean(method);
  return <View style={styles.form}>
    <Field label={t('amount')} value={amount} keyboardType="number-pad" onChangeText={setAmount} autoFocus/>
    <View style={styles.form}><AppText variant="caption" muted>{t('paymentMethod')}</AppText>{accounts.length?<View style={[styles.chips,{flexDirection:isRTL?'row-reverse':'row'}]}>{accounts.map(account=><Chip key={account.id} label={account.name} active={method===account.id} onPress={()=>setMethod(account.id)}/>)}</View>:<InfoNote warning>{t('partyNoPaymentMethod')}</InfoNote>}</View>
    <Field label={t('note')} value={note} onChangeText={setNote}/>
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
    <InfoNote>{mode==='offset'?t('partyOffsetHelp'):t('partySettlementHelp')}</InfoNote>
    <AppText variant="caption" muted>{format(t('partyMaximum'),{value:maximum})}</AppText>
    <Field label={t('amount')} value={amount} keyboardType="number-pad" onChangeText={setAmount}/>
    <Field label={t('note')} value={note} onChangeText={setNote}/>
    <Button title={t('confirm')} loading={busy} disabled={!valid} onPress={()=>onSave(value,note)}/>
    <Button title={t('cancel')} variant="ghost" disabled={busy} onPress={onCancel}/>
  </View>;
}

function PersonGlyph(){
  return <View style={styles.personGlyph}><View style={styles.personHead}/><View style={styles.personBody}/></View>;
}

const styles=StyleSheet.create({
  list:{paddingHorizontal:spacing.md,paddingBottom:spacing.xxl,backgroundColor:colors.background},
  header:{gap:spacing.md,marginBottom:spacing.sm},
  flex:{flex:1,minWidth:0},
  balanceCard:{gap:spacing.md,...elevation.subtle},
  identityRow:{alignItems:'center',gap:spacing.sm},
  badges:{alignItems:'center',gap:spacing.xs,flexWrap:'wrap',marginBottom:2},
  balanceSplit:{alignItems:'stretch',borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:colors.border,paddingTop:spacing.sm},
  balanceMini:{flex:1,gap:2},
  balanceDivider:{width:StyleSheet.hairlineWidth,backgroundColor:colors.border,marginHorizontal:spacing.sm},
  adminActions:{alignItems:'center',gap:spacing.xs,borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:colors.border,paddingTop:spacing.xs},
  adminAction:{flex:1},
  actionPanel:{gap:spacing.xs},
  actionRow:{gap:spacing.xs},
  actionSlot:{flex:1},
  metrics:{gap:spacing.xs},
  metricTile:{flex:1,minWidth:0,gap:spacing.xs,padding:spacing.sm},
  ledgerHead:{gap:spacing.sm},
  ledgerTitleRow:{alignItems:'center',justifyContent:'space-between',gap:spacing.sm},
  periods:{alignItems:'center',gap:spacing.xs,flexWrap:'wrap'},
  ledgerRow:{minHeight:78,alignItems:'center',gap:spacing.sm,paddingHorizontal:spacing.md,paddingVertical:spacing.sm,backgroundColor:colors.surface,borderLeftWidth:1,borderRightWidth:1,borderTopWidth:StyleSheet.hairlineWidth,borderColor:colors.border},
  firstLedgerRow:{borderTopWidth:1,borderTopLeftRadius:radius.lg,borderTopRightRadius:radius.lg},
  lastLedgerRow:{borderBottomWidth:1,borderBottomLeftRadius:radius.lg,borderBottomRightRadius:radius.lg},
  ledgerCopy:{flex:1,minWidth:0,gap:3},
  rowTop:{alignItems:'center',gap:spacing.xs,flexWrap:'wrap'},
  form:{gap:spacing.md},
  chips:{flexWrap:'wrap',gap:spacing.xs},
  datePair:{gap:spacing.sm},
  note:{gap:spacing.xs,paddingVertical:spacing.xs},
  noteWarning:{backgroundColor:colors.warningSoft,borderRadius:radius.md,padding:spacing.sm},
  noteRule:{width:28,height:2,borderRadius:2,backgroundColor:colors.accent},
  noteRuleWarning:{backgroundColor:colors.warning},
  personGlyph:{width:24,height:24,alignItems:'center',justifyContent:'flex-end'},
  personHead:{position:'absolute',top:1,width:8,height:8,borderRadius:4,borderWidth:2,borderColor:colors.textMuted},
  personBody:{width:18,height:10,borderWidth:2,borderBottomWidth:0,borderColor:colors.textMuted,borderTopLeftRadius:9,borderTopRightRadius:9},
});
