import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type { Party, PaymentAccount } from '@/domain/types';
import { listParties, listPaymentAccounts } from '@/db/queries';
import { listAccountTransfers, listFinancialMovements, type AccountTransfer, type FinancialMovement } from '@/db/finance-queries';
import { adjustAccount, correctOpeningBalance, createPaymentAccount, transferAccount } from '@/services/accounting-service';
import { archivePaymentAccount, restorePaymentAccount, updatePaymentAccount } from '@/services/management-service';
import { AppText, Badge, Button, Chip, EmptyState, Field, GroupedList, IconTile, Money, PageHeader, Screen, SectionTitle, SegmentedControl, Surface } from '@/components/ui';
import { FilterSheet, Sheet } from '@/components/mobile-interactions';
import { useI18n } from '@/i18n/provider';
import type { MessageKey } from '@/i18n/messages';
import { useAuth } from '@/auth/provider';
import { colors, spacing } from '@/theme';

type ModalMode='create'|'transfer'|'deposit'|'withdrawal'|'edit'|'correct'|null;
type BankTab='accounts'|'movements'|'transfers'|'adjustments';
type Payload={name:string;amount:string;from:string;to:string;note:string;color:string;isActive:boolean};

const movementLabels:Record<string,MessageKey>={
  sale:'accountMoveSale',purchase:'accountMovePurchase',expense:'accountMoveExpense','party-receipt':'accountMoveCustomerPayment','party-payment':'accountMoveSupplierPayment',
  'transfer-in':'accountMoveTransferIn','transfer-out':'accountMoveTransferOut','manual-deposit':'accountMoveDeposit','manual-withdrawal':'accountMoveWithdrawal',
  'opening-balance':'accountMoveOpening','opening-balance-correction':'accountMoveOpeningCorrection','balance-correction':'accountMoveBalanceCorrection',
};

function localDay(){const value=new Date(),y=value.getFullYear(),m=String(value.getMonth()+1).padStart(2,'0'),d=String(value.getDate()).padStart(2,'0');return `${y}-${m}-${d}`}
const within=(occurredAt:string,from:string,to:string)=>(!from||occurredAt.slice(0,10)>=from)&&(!to||occurredAt.slice(0,10)<=to);
const format=(template:string,values:Record<string,string|number>)=>Object.entries(values).reduce((output,[key,value])=>output.replaceAll('{'+key+'}',String(value)),template);

export function AccountsScreen(){
  const db=useSQLiteContext(),{t,date,isRTL,number,errorMessage}=useI18n(),auth=useAuth(),today=localDay();
  const [accounts,setAccounts]=useState<PaymentAccount[]>([]),[archived,setArchived]=useState<PaymentAccount[]>([]),[movements,setMovements]=useState<FinancialMovement[]>([]),[transfers,setTransfers]=useState<AccountTransfer[]>([]),[parties,setParties]=useState<Party[]>([]);
  const [showArchived,setShowArchived]=useState(false),[filtersOpen,setFiltersOpen]=useState(false),[mode,setMode]=useState<ModalMode>(null),[selected,setSelected]=useState<PaymentAccount|null>(null),[tab,setTab]=useState<BankTab>('accounts'),[busy,setBusy]=useState(false);
  const [movementFrom,setMovementFrom]=useState(today),[movementTo,setMovementTo]=useState(today),[movementAccount,setMovementAccount]=useState(''),[movementType,setMovementType]=useState('');
  const [transferFromDate,setTransferFromDate]=useState(today),[transferToDate,setTransferToDate]=useState(today),[transferFromAccount,setTransferFromAccount]=useState(''),[transferToAccount,setTransferToAccount]=useState('');
  const [adjustFrom,setAdjustFrom]=useState(today),[adjustTo,setAdjustTo]=useState(today),[adjustAccountFilter,setAdjustAccountFilter]=useState(''),[adjustType,setAdjustType]=useState('');

  const canView=auth.has('banks.view'),canCreate=auth.has('banks.create'),canEdit=auth.has('banks.edit'),canDelete=auth.has('banks.delete'),canMovements=auth.has('banks.movements.view'),canTransfer=auth.has('banks.transfer'),canAdjust=auth.has('banks.deposit_withdraw'),canCorrect=auth.has('banks.balance_correct');

  const load=useCallback(async()=>{
    if(!canView)return;
    const [all,m,tfr,customers,suppliers]=await Promise.all([
      listPaymentAccounts(db,true),
      canMovements?listFinancialMovements(db,undefined,500):Promise.resolve([]),
      canTransfer?listAccountTransfers(db,500):Promise.resolve([]),
      listParties(db,'customer','',10000),
      listParties(db,'supplier','',10000),
    ]);
    setAccounts(all.filter(account=>!account.isArchived));
    setArchived(all.filter(account=>account.isArchived));
    setMovements(m);setTransfers(tfr);setParties([...customers,...suppliers]);
  },[canMovements,canTransfer,canView,db]);

  useFocusEffect(useCallback(()=>{void load()},[load]));

  const activeAccounts=accounts.filter(account=>account.isActive);
  const accountName=(id:string)=>accounts.find(account=>account.id===id||account.code===id)?.name??id;
  const open=(next:ModalMode,account?:PaymentAccount)=>{setSelected(account??null);setMode(next)};
  const modeAllowed=(value:Exclude<ModalMode,null>)=>value==='create'?canCreate:value==='transfer'?canTransfer:value==='deposit'||value==='withdrawal'?canAdjust:value==='correct'?canCorrect:value==='edit'?canEdit:false;
  const operational=movements.filter(movement=>!['opening-balance','opening-balance-correction'].includes(movement.type));
  const visibleMovements=operational.filter(movement=>within(movement.occurredAt,movementFrom,movementTo)&&(!movementAccount||movement.paymentMethod===movementAccount)&&(!movementType||movement.type===movementType));
  const visibleTransfers=transfers.filter(row=>within(row.occurredAt,transferFromDate,transferToDate)&&(!transferFromAccount||row.fromAccountId===transferFromAccount)&&(!transferToAccount||row.toAccountId===transferToAccount));
  const adjustments=operational.filter(movement=>['manual-deposit','manual-withdrawal'].includes(movement.type)&&within(movement.occurredAt,adjustFrom,adjustTo)&&(!adjustAccountFilter||movement.paymentMethod===adjustAccountFilter)&&(!adjustType||movement.type===adjustType));
  const summary=(()=>{
    const currentBalance=accounts.reduce((sum,account)=>sum+account.balance,0);
    const nonOperating=new Set(['transfer-in','transfer-out','opening-balance','opening-balance-correction','balance-correction']);
    const operating=movements.filter(movement=>!nonOperating.has(movement.type));
    const income=operating.filter(movement=>movement.direction==='in').reduce((sum,movement)=>sum+movement.amount,0);
    const expenses=operating.filter(movement=>movement.direction==='out').reduce((sum,movement)=>sum+movement.amount,0);
    let owedToUs=0,weOwe=0;
    for(const party of parties){if(party.net>0)owedToUs+=party.net;else if(party.net<0)weOwe+=Math.abs(party.net)}
    return{currentBalance,income,expenses,owedToUs,weOwe};
  })();

  const tabs:Array<{value:BankTab;label:MessageKey;allowed:boolean}>=[
    {value:'accounts',label:'accounts',allowed:true},
    {value:'movements',label:'accountsMovements',allowed:canMovements},
    {value:'transfers',label:'accountsTransfers',allowed:canTransfer},
    {value:'adjustments',label:'accountsAdjustments',allowed:canAdjust},
  ];

  if(!canView)return <Screen><EmptyState title={t('accountsNoPermission')}/></Screen>;

  const runPayload=async(payload:Payload)=>{
    if(!mode||!modeAllowed(mode)||busy)return;
    setBusy(true);
    try{
      if(mode==='create')await createPaymentAccount(db,{name:payload.name,openingBalance:Number(payload.amount||0)});
      else if(mode==='transfer')await transferAccount(db,{fromAccountId:payload.from,toAccountId:payload.to,amount:Number(payload.amount),note:payload.note});
      else if(mode==='deposit'||mode==='withdrawal')await adjustAccount(db,{accountId:payload.from,direction:mode,amount:Number(payload.amount),note:payload.note});
      else if(mode==='edit'&&selected)await updatePaymentAccount(db,selected.id,{name:payload.name,color:payload.color,isActive:payload.isActive});
      else if(mode==='correct'&&selected)await correctOpeningBalance(db,{accountId:selected.id,newOpeningBalance:Number(payload.amount),reason:payload.note});
      setMode(null);await load();
    }catch(error){Alert.alert(t('error'),errorMessage(error))}finally{setBusy(false)}
  };

  const restore=async(account:PaymentAccount)=>{
    if(!canEdit||busy)return;
    setBusy(true);
    try{await restorePaymentAccount(db,account.id);await load()}
    catch(error){Alert.alert(t('error'),errorMessage(error))}
    finally{setBusy(false)}
  };

  const archive=selected&&selected.code!=='cash'&&canDelete?()=>Alert.alert(
    t('accountsArchiveTitle'),
    selected.name,
    [{text:t('cancel'),style:'cancel'},{text:t('confirm'),style:'destructive',onPress:()=>void (async()=>{
      setBusy(true);
      try{await archivePaymentAccount(db,selected.id);setMode(null);await load()}
      catch(error){Alert.alert(t('error'),errorMessage(error))}
      finally{setBusy(false)}
    })()}],
  ):undefined;

  return <Screen padded={false}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <PageHeader title={t('accounts')}/>
      <View style={styles.toolbar}>
        <SegmentedControl
          value={tab}
          options={tabs.filter(item=>item.allowed).map(item=>({value:item.value,label:t(item.label)}))}
          onChange={value=>{setTab(value);setShowArchived(false);setFiltersOpen(false)}}
        />
        {tab==='accounts'&&canCreate?<Button title={t('add')} onPress={()=>open('create')}/>:null}
      </View>

      {tab==='accounts'?<>
        <Surface style={styles.balanceSurface}>
          <View style={[styles.balanceHead,{flexDirection:isRTL?'row-reverse':'row'}]}>
            <IconTile tone="primary"><WalletGlyph/></IconTile>
            <View style={styles.flex}><AppText variant="caption" muted>{t('accountsCurrentBalance')}</AppText><Money value={summary.currentBalance} tone={summary.currentBalance<0?'negative':'normal'} large/><AppText variant="caption" muted>{format(t('accountsActiveCount'),{count:number(activeAccounts.length)})}</AppText></View>
          </View>
        </Surface>

        <View style={[styles.metrics,{flexDirection:isRTL?'row-reverse':'row'}]}>
          <AccountMetric label={t('accountsIncome')} value={summary.income} tone="positive"/>
          <AccountMetric label={t('accountsExpenses')} value={summary.expenses} tone="negative"/>
          <DebtMetric label={t('accountsDebtSummary')} first={summary.owedToUs} second={summary.weOwe}/>
        </View>

        {archived.length&&canEdit?<View style={styles.archiveToggle}><Button compact title={showArchived?t('accountsShowActive'):format(t('accountsArchived'),{count:archived.length})} variant="secondary" onPress={()=>setShowArchived(value=>!value)}/></View>:null}

        <GroupedList>
          {showArchived
            ?archived.length?archived.map((account,index)=><AccountRow key={account.id} account={account} archived last={index===archived.length-1} busy={busy} onRestore={()=>void restore(account)}/>):<EmptyState title={t('noData')}/>
            :accounts.length?accounts.map((account,index)=><AccountRow key={account.id} account={account} last={index===accounts.length-1} canEdit={canEdit} onEdit={()=>open('edit',account)}/>):<EmptyState title={t('noData')}/>}
        </GroupedList>
      </>:null}

      {tab==='movements'&&canMovements?<>
        <SectionTitle title={t('accountsMovementsTitle')}/>
        <DateFilter from={movementFrom} to={movementTo} setFrom={setMovementFrom} setTo={setMovementTo} reset={()=>{setMovementFrom('');setMovementTo('');setMovementAccount('');setMovementType('')}}/>
        <View style={styles.filterTrigger}><Button title={t('reportsFilters')} variant="secondary" onPress={()=>setFiltersOpen(true)}/></View>
        <MovementList rows={visibleMovements} label={movement=>`${t(movementLabels[movement.type]??'partyMovementOther')} • ${accountName(movement.paymentMethod)}`} subtitle={movement=>`${date(movement.occurredAt)} • ${movement.documentNumber}${movement.note?' • '+movement.note:''}`} empty={t('noData')}/>
      </>:null}

      {tab==='transfers'&&canTransfer?<>
        <SectionTitle title={t('accountsTransfersTitle')} action={<Button compact title={t('add')} onPress={()=>open('transfer')}/>}/>
        <DateFilter from={transferFromDate} to={transferToDate} setFrom={setTransferFromDate} setTo={setTransferToDate} reset={()=>{setTransferFromDate('');setTransferToDate('');setTransferFromAccount('');setTransferToAccount('')}}/>
        <View style={styles.filterTrigger}><Button title={t('reportsFilters')} variant="secondary" onPress={()=>setFiltersOpen(true)}/></View>
        <TransferList rows={visibleTransfers} date={date} empty={t('noData')} isRTL={isRTL}/>
      </>:null}

      {tab==='adjustments'&&canAdjust?<>
        <SectionTitle title={t('accountsAdjustmentsTitle')} action={<View style={[styles.inlineActions,{flexDirection:isRTL?'row-reverse':'row'}]}><Button compact title={t('accountsDeposit')} onPress={()=>open('deposit')}/><Button compact title={t('accountsWithdrawal')} variant="secondary" onPress={()=>open('withdrawal')}/></View>}/>
        <DateFilter from={adjustFrom} to={adjustTo} setFrom={setAdjustFrom} setTo={setAdjustTo} reset={()=>{setAdjustFrom('');setAdjustTo('');setAdjustAccountFilter('');setAdjustType('')}}/>
        <View style={styles.filterTrigger}><Button title={t('reportsFilters')} variant="secondary" onPress={()=>setFiltersOpen(true)}/></View>
        <MovementList rows={adjustments} label={movement=>`${t(movementLabels[movement.type]??'partyMovementOther')} • ${accountName(movement.paymentMethod)}`} subtitle={movement=>`${date(movement.occurredAt)} • ${movement.documentNumber}${movement.note?' • '+movement.note:''}`} empty={t('noData')}/>
      </>:null}
    </ScrollView>

    <FilterSheet visible={filtersOpen&&tab!=='accounts'} title={t('reportsFilters')} onClose={()=>setFiltersOpen(false)} applyLabel={t('confirm')} onApply={()=>setFiltersOpen(false)}>
      {tab==='movements'?<>
        <FilterLabel label={t('accountsFilterAccount')}/>
        <View style={[styles.chips,{flexDirection:isRTL?'row-reverse':'row'}]}><Chip label={t('accountsAll')} active={!movementAccount} onPress={()=>setMovementAccount('')}/>{accounts.map(account=><Chip key={account.id} label={account.name} active={movementAccount===account.id} onPress={()=>setMovementAccount(account.id)}/>)}</View>
        <FilterLabel label={t('accountsFilterType')}/>
        <View style={[styles.chips,{flexDirection:isRTL?'row-reverse':'row'}]}><Chip label={t('accountsAll')} active={!movementType} onPress={()=>setMovementType('')}/>{Object.entries(movementLabels).filter(([key])=>!['opening-balance','opening-balance-correction'].includes(key)).map(([key,label])=><Chip key={key} label={t(label)} active={movementType===key} onPress={()=>setMovementType(key)}/>)}</View>
      </>:null}
      {tab==='transfers'?<>
        <FilterLabel label={t('from')}/>
        <View style={[styles.chips,{flexDirection:isRTL?'row-reverse':'row'}]}><Chip label={t('accountsAll')} active={!transferFromAccount} onPress={()=>setTransferFromAccount('')}/>{accounts.map(account=><Chip key={account.id} label={account.name} active={transferFromAccount===account.id} onPress={()=>setTransferFromAccount(account.id)}/>)}</View>
        <FilterLabel label={t('to')}/>
        <View style={[styles.chips,{flexDirection:isRTL?'row-reverse':'row'}]}><Chip label={t('accountsAll')} active={!transferToAccount} onPress={()=>setTransferToAccount('')}/>{accounts.map(account=><Chip key={account.id} label={account.name} active={transferToAccount===account.id} onPress={()=>setTransferToAccount(account.id)}/>)}</View>
      </>:null}
      {tab==='adjustments'?<>
        <FilterLabel label={t('accountsFilterAccount')}/>
        <View style={[styles.chips,{flexDirection:isRTL?'row-reverse':'row'}]}><Chip label={t('accountsAll')} active={!adjustAccountFilter} onPress={()=>setAdjustAccountFilter('')}/>{accounts.map(account=><Chip key={account.id} label={account.name} active={adjustAccountFilter===account.id} onPress={()=>setAdjustAccountFilter(account.id)}/>)}</View>
        <FilterLabel label={t('accountsFilterType')}/>
        <View style={[styles.chips,{flexDirection:isRTL?'row-reverse':'row'}]}><Chip label={t('accountsDepositWithdrawal')} active={!adjustType} onPress={()=>setAdjustType('')}/><Chip label={t('accountsDeposit')} active={adjustType==='manual-deposit'} onPress={()=>setAdjustType('manual-deposit')}/><Chip label={t('accountsWithdrawal')} active={adjustType==='manual-withdrawal'} onPress={()=>setAdjustType('manual-withdrawal')}/></View>
      </>:null}
    </FilterSheet>

    {mode&&modeAllowed(mode)?<AccountSheet mode={mode} selected={selected} accounts={activeAccounts} busy={busy} onClose={()=>{if(!busy)setMode(null)}} onRun={payload=>void runPayload(payload)} onArchive={mode==='edit'?archive:undefined} onCorrect={mode==='edit'&&selected&&canCorrect?()=>setMode('correct'):undefined}/>:null}
  </Screen>;
}

function AccountRow({account,last,archived=false,canEdit=false,busy=false,onEdit,onRestore}:{account:PaymentAccount;last:boolean;archived?:boolean;canEdit?:boolean;busy?:boolean;onEdit?:()=>void;onRestore?:()=>void}){
  const {t,isRTL}=useI18n();
  return <View style={[styles.accountRow,last&&styles.lastRow,{flexDirection:isRTL?'row-reverse':'row'}]}>
    <View style={[styles.accountDot,{backgroundColor:account.color||colors.primary}]}/>
    <View style={styles.flex}>
      <View style={[styles.accountTitle,{flexDirection:isRTL?'row-reverse':'row'}]}><AppText variant="subheading" numberOfLines={1}>{account.name}</AppText>{archived?<Badge label={t('accountsArchivedBadge')} tone="neutral"/>:!account.isActive?<Badge label={t('accountsInactive')} tone="warning"/>:null}</View>
      <AppText variant="caption" muted>{account.code}</AppText>
    </View>
    {archived?<Button compact title={t('restore')} variant="secondary" disabled={busy} onPress={()=>onRestore?.()}/>:<View style={styles.accountEnd}><Money value={account.balance} tone={account.balance<0?'negative':'normal'}/>{canEdit?<Button compact title={t('edit')} variant="ghost" onPress={()=>onEdit?.()}/>:null}</View>}
  </View>;
}

function AccountMetric({label,value,tone}:{label:string;value:number;tone:'positive'|'negative'}){
  return <Surface style={styles.metricTile}><AppText variant="caption" muted>{label}</AppText><Money value={value} tone={tone}/></Surface>;
}

function DebtMetric({label,first,second}:{label:string;first:number;second:number}){
  const {number}=useI18n();
  return <Surface style={styles.metricTile}><AppText variant="caption" muted>{label}</AppText><AppText variant="subheading">{number(first)} / {number(second)} MRU</AppText></Surface>;
}

function FilterLabel({label}:{label:string}){return <AppText variant="caption" muted>{label}</AppText>}

function DateFilter({from,to,setFrom,setTo,reset}:{from:string;to:string;setFrom:(value:string)=>void;setTo:(value:string)=>void;reset:()=>void}){
  const {t,isRTL}=useI18n();
  return <Surface style={styles.datePanel}><View style={[styles.dateRow,{flexDirection:isRTL?'row-reverse':'row'}]}><Field label={t('from')} value={from} onChangeText={setFrom} placeholder="YYYY-MM-DD" containerStyle={styles.flex}/><Field label={t('to')} value={to} onChangeText={setTo} placeholder="YYYY-MM-DD" containerStyle={styles.flex}/></View><Button compact title={t('accountsAllTime')} variant="ghost" onPress={reset}/></Surface>;
}

function MovementList({rows,label,subtitle,empty}:{rows:FinancialMovement[];label:(row:FinancialMovement)=>string;subtitle:(row:FinancialMovement)=>string;empty:string}){
  const {isRTL}=useI18n();
  return <GroupedList>{rows.length?rows.map((row,index)=><View key={row.id} style={[styles.movementRow,{flexDirection:isRTL?'row-reverse':'row'},index===rows.length-1&&styles.lastRow]}><View style={styles.flex}><AppText variant="subheading" numberOfLines={1}>{label(row)}</AppText><AppText variant="caption" muted numberOfLines={2}>{subtitle(row)}</AppText></View><Money value={row.amount} tone={row.direction==='in'?'positive':'negative'}/></View>):<EmptyState title={empty}/>}</GroupedList>;
}

function TransferList({rows,date,empty,isRTL}:{rows:AccountTransfer[];date:(value:string)=>string;empty:string;isRTL:boolean}){
  return <GroupedList>{rows.length?rows.map((row,index)=><View key={row.id} style={[styles.movementRow,{flexDirection:isRTL?'row-reverse':'row'},index===rows.length-1&&styles.lastRow]}><View style={styles.flex}><AppText variant="subheading">{row.fromName} → {row.toName}</AppText><AppText variant="caption" muted>{date(row.occurredAt)} • {row.number}{row.note?' • '+row.note:''}</AppText></View><Money value={row.amount}/></View>):<EmptyState title={empty}/>}</GroupedList>;
}

function AccountSheet({mode,selected,accounts,busy,onClose,onRun,onArchive,onCorrect}:{mode:Exclude<ModalMode,null>;selected:PaymentAccount|null;accounts:PaymentAccount[];busy:boolean;onClose:()=>void;onRun:(payload:Payload)=>void;onArchive?:()=>void;onCorrect?:()=>void}){
  const {t,isRTL}=useI18n();
  const [name,setName]=useState(selected?.name??''),[amount,setAmount]=useState(mode==='correct'?String(selected?.openingBalance??0):''),[from,setFrom]=useState(selected?.id??accounts[0]?.id??''),[to,setTo]=useState(accounts.find(account=>account.id!==from)?.id??''),[note,setNote]=useState(''),[color,setColor]=useState(selected?.color??'#1677c8'),[isActive,setActive]=useState(selected?.isActive??true);
  const title=mode==='create'?t('accountsNew'):mode==='transfer'?t('transfer'):mode==='deposit'?t('accountsDeposit'):mode==='withdrawal'?t('accountsWithdrawal'):mode==='correct'?t('accountsCorrectOpening'):selected?.name??t('accounts');
  const numeric=Number(amount),validAmount=Number.isFinite(numeric)&&numeric>0;
  const valid=mode==='create'?Boolean(name.trim()):mode==='edit'?Boolean(name.trim()):mode==='transfer'?Boolean(from&&to&&from!==to&&validAmount):(mode==='deposit'||mode==='withdrawal')?Boolean(from&&validAmount):mode==='correct'?Number.isFinite(numeric):false;
  const footer=<><Button title={t('confirm')} loading={busy} disabled={!valid} onPress={()=>onRun({name:name.trim(),amount,from,to,note,color,isActive})}/>{onCorrect?<Button title={t('accountsCorrectOpening')} variant="secondary" disabled={busy} onPress={onCorrect}/>:null}{onArchive?<Button title={t('accountsArchiveAction')} variant="danger" disabled={busy} onPress={onArchive}/>:null}<Button title={t('cancel')} variant="ghost" disabled={busy} onPress={onClose}/></>;
  return <Sheet visible title={title} onClose={onClose} footer={footer}>
    {mode==='create'||mode==='edit'?<><Field label={t('name')} value={name} onChangeText={setName} autoFocus/>{mode==='create'?<Field label={t('openingBalance')} keyboardType="number-pad" value={amount} onChangeText={setAmount}/>:<><Field label={t('accountsColor')} value={color} onChangeText={setColor} autoCapitalize="none"/><View style={[styles.chips,{flexDirection:isRTL?'row-reverse':'row'}]}><Chip label={t('accountsActive')} active={isActive} onPress={()=>setActive(true)}/><Chip label={t('accountsInactive')} active={!isActive} onPress={()=>setActive(false)}/></View></>}</>:null}
    {mode==='transfer'?<><FilterLabel label={t('from')}/><View style={[styles.chips,{flexDirection:isRTL?'row-reverse':'row'}]}>{accounts.map(account=><Chip key={account.id} label={account.name} active={from===account.id} onPress={()=>{setFrom(account.id);if(to===account.id)setTo('')}}/>)}</View><FilterLabel label={t('to')}/><View style={[styles.chips,{flexDirection:isRTL?'row-reverse':'row'}]}>{accounts.filter(account=>account.id!==from).map(account=><Chip key={account.id} label={account.name} active={to===account.id} onPress={()=>setTo(account.id)}/>)}</View><Field label={t('amount')} keyboardType="number-pad" value={amount} onChangeText={setAmount}/><Field label={t('note')} value={note} onChangeText={setNote}/></>:null}
    {mode==='deposit'||mode==='withdrawal'?<><FilterLabel label={t('accounts')}/><View style={[styles.chips,{flexDirection:isRTL?'row-reverse':'row'}]}>{accounts.map(account=><Chip key={account.id} label={account.name} active={from===account.id} onPress={()=>setFrom(account.id)}/>)}</View><Field label={t('amount')} keyboardType="number-pad" value={amount} onChangeText={setAmount}/><Field label={t('note')} value={note} onChangeText={setNote}/></>:null}
    {mode==='correct'?<><View style={styles.currentBalance}><AppText variant="caption" muted>{t('accountsCurrent')}</AppText><Money value={selected?.balance??0} large/></View><Field label={t('openingBalance')} keyboardType="number-pad" value={amount} onChangeText={setAmount}/><Field label={t('reason')} value={note} onChangeText={setNote}/></>:null}
  </Sheet>;
}

function WalletGlyph(){return <View style={styles.walletGlyph}><View style={styles.walletBody}/><View style={styles.walletFlap}/><View style={styles.walletDot}/></View>}

const styles=StyleSheet.create({
  content:{paddingHorizontal:spacing.md,gap:spacing.md,paddingBottom:spacing.xxl,backgroundColor:colors.background},
  toolbar:{gap:spacing.sm},
  chips:{flexWrap:'wrap',gap:spacing.xs},
  balanceSurface:{gap:spacing.sm},
  balanceHead:{alignItems:'center',gap:spacing.sm},
  metrics:{gap:spacing.xs,flexWrap:'wrap'},
  metricTile:{flex:1,minWidth:132,gap:spacing.xs,padding:spacing.sm},
  archiveToggle:{alignItems:'flex-start'},
  accountRow:{minHeight:72,alignItems:'center',gap:spacing.sm,padding:spacing.md,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border},
  lastRow:{borderBottomWidth:0},
  accountDot:{width:10,height:10,borderRadius:5,flexShrink:0},
  accountTitle:{alignItems:'center',gap:spacing.xs,flexWrap:'wrap'},
  accountEnd:{alignItems:'flex-end',gap:spacing.xxs},
  flex:{flex:1,minWidth:0,gap:spacing.xs},
  datePanel:{gap:spacing.sm},
  dateRow:{gap:spacing.sm},
  filterPanel:{gap:spacing.sm},
  filterTrigger:{alignItems:'stretch'},
  divider:{height:StyleSheet.hairlineWidth,backgroundColor:colors.border},
  inlineActions:{gap:spacing.xs,flexWrap:'wrap'},
  movementRow:{minHeight:70,alignItems:'center',gap:spacing.md,padding:spacing.md,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border},
  currentBalance:{gap:spacing.xs,paddingVertical:spacing.sm},
  walletGlyph:{width:26,height:23,position:'relative'},
  walletBody:{position:'absolute',left:1,right:1,bottom:1,height:17,borderWidth:2,borderColor:colors.primary,borderRadius:5},
  walletFlap:{position:'absolute',left:5,right:1,top:2,height:8,borderWidth:2,borderColor:colors.primary,borderRadius:4,backgroundColor:colors.primaryFaint},
  walletDot:{position:'absolute',right:5,top:7,width:4,height:4,borderRadius:2,backgroundColor:colors.primary},
});
