import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type { Party, PaymentAccount } from '@/domain/types';
import { listParties, listPaymentAccounts } from '@/db/queries';
import { listAccountTransfers, listFinancialMovements, type AccountTransfer, type FinancialMovement } from '@/db/finance-queries';
import { adjustAccount, correctOpeningBalance, createPaymentAccount, transferAccount } from '@/services/accounting-service';
import { archivePaymentAccount, restorePaymentAccount, updatePaymentAccount } from '@/services/management-service';
import { AppText, Badge, Button, Chip, EmptyState, Field, Money, Screen, SectionTitle } from '@/components/ui';
import { CompactMetric, Sheet } from '@/components/mobile-interactions';
import { useI18n } from '@/i18n/provider';
import { useAuth } from '@/auth/provider';
import { colors, radius, spacing } from '@/theme';

type ModalMode='create'|'transfer'|'deposit'|'withdrawal'|'edit'|'correct'|null;
type BankTab='accounts'|'movements'|'transfers'|'adjustments';
type Payload={name:string;amount:string;from:string;to:string;note:string;color:string;isActive:boolean};
function localDay(){const value=new Date(),y=value.getFullYear(),m=String(value.getMonth()+1).padStart(2,'0'),d=String(value.getDate()).padStart(2,'0');return `${y}-${m}-${d}`}
const within=(occurredAt:string,from:string,to:string)=>(!from||occurredAt.slice(0,10)>=from)&&(!to||occurredAt.slice(0,10)<=to);

export function AccountsScreen(){
  const db=useSQLiteContext(),{t,date,locale,isRTL,number,errorMessage}=useI18n(),auth=useAuth(),ar=locale==='ar',today=localDay();
  const [accounts,setAccounts]=useState<PaymentAccount[]>([]),[archived,setArchived]=useState<PaymentAccount[]>([]),[movements,setMovements]=useState<FinancialMovement[]>([]),[transfers,setTransfers]=useState<AccountTransfer[]>([]),[parties,setParties]=useState<Party[]>([]);
  const [showArchived,setShowArchived]=useState(false),[mode,setMode]=useState<ModalMode>(null),[selected,setSelected]=useState<PaymentAccount|null>(null),[tab,setTab]=useState<BankTab>('accounts'),[busy,setBusy]=useState(false);
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
    setAccounts(all.filter(account=>!account.isArchived));setArchived(all.filter(account=>account.isArchived));setMovements(m);setTransfers(tfr);setParties([...customers,...suppliers]);
  },[canMovements,canTransfer,canView,db]);
  useFocusEffect(useCallback(()=>{void load()},[load]));

  const activeAccounts=accounts.filter(account=>account.isActive),accountName=(id:string)=>accounts.find(account=>account.id===id||account.code===id)?.name??id;
  const open=(next:ModalMode,account?:PaymentAccount)=>{setSelected(account??null);setMode(next)};
  const modeAllowed=(value:Exclude<ModalMode,null>)=>value==='create'?canCreate:value==='transfer'?canTransfer:value==='deposit'||value==='withdrawal'?canAdjust:value==='correct'?canCorrect:value==='edit'?canEdit:false;
  const labels:Record<string,string>={sale:ar?'بيع':'Vente',purchase:ar?'شراء':'Achat',expense:ar?'مصروف':'Dépense','party-receipt':ar?'سداد عميل':'Règlement client','party-payment':ar?'سداد مورد':'Règlement fournisseur','transfer-in':ar?'تحويل داخل':'Transfert entrant','transfer-out':ar?'تحويل خارج':'Transfert sortant','manual-deposit':ar?'إيداع':'Dépôt','manual-withdrawal':ar?'سحب':'Retrait','opening-balance':ar?'رصيد بداية':'Solde initial','opening-balance-correction':ar?'تصحيح رصيد البداية':'Correction du solde initial','balance-correction':ar?'تصحيح رصيد سابق':'Correction de solde'};
  const operational=movements.filter(movement=>!['opening-balance','opening-balance-correction'].includes(movement.type));
  const visibleMovements=operational.filter(movement=>within(movement.occurredAt,movementFrom,movementTo)&&(!movementAccount||movement.paymentMethod===movementAccount)&&(!movementType||movement.type===movementType));
  const visibleTransfers=transfers.filter(row=>within(row.occurredAt,transferFromDate,transferToDate)&&(!transferFromAccount||row.fromAccountId===transferFromAccount)&&(!transferToAccount||row.toAccountId===transferToAccount));
  const adjustments=operational.filter(movement=>['manual-deposit','manual-withdrawal'].includes(movement.type)&&within(movement.occurredAt,adjustFrom,adjustTo)&&(!adjustAccountFilter||movement.paymentMethod===adjustAccountFilter)&&(!adjustType||movement.type===adjustType));
  const summary=(()=>{
    const currentBalance=accounts.filter(account=>account.isActive&&!account.isArchived).reduce((sum,account)=>sum+account.balance,0),nonOperating=new Set(['transfer-in','transfer-out','opening-balance','opening-balance-correction','balance-correction']),operating=movements.filter(movement=>!nonOperating.has(movement.type)),income=operating.filter(movement=>movement.direction==='in').reduce((sum,movement)=>sum+movement.amount,0),expenses=operating.filter(movement=>movement.direction==='out').reduce((sum,movement)=>sum+movement.amount,0);
    let owedToUs=0,weOwe=0;for(const party of parties){if(party.net>0)owedToUs+=party.net;else if(party.net<0)weOwe+=Math.abs(party.net)}return{currentBalance,income,expenses,owedToUs,weOwe};
  })();
  const tabs:[BankTab,string,boolean][]=[['accounts',t('accounts'),true],['movements',ar?'الحركة':'Mouvements',canMovements],['transfers',t('transfer'),canTransfer],['adjustments',ar?'سحب / إيداع':'Retrait / dépôt',canAdjust]];

  if(!canView)return <Screen><EmptyState title={ar?'ليس لديك صلاحية عرض وسائل الدفع':'Vous n’avez pas accès aux moyens de paiement.'}/></Screen>;

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
  const restore=async(account:PaymentAccount)=>{if(!canEdit||busy)return;setBusy(true);try{await restorePaymentAccount(db,account.id);await load()}catch(error){Alert.alert(t('error'),errorMessage(error))}finally{setBusy(false)}};
  const archive=selected&&selected.code!=='cash'&&canDelete?()=>Alert.alert(ar?'أرشفة وسيلة الدفع':'Archiver le moyen de paiement',selected.name,[{text:t('cancel'),style:'cancel'},{text:t('confirm'),style:'destructive',onPress:()=>void (async()=>{setBusy(true);try{await archivePaymentAccount(db,selected.id);setMode(null);await load()}catch(error){Alert.alert(t('error'),errorMessage(error))}finally{setBusy(false)}})()}]):undefined;

  return <Screen padded={false}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
    <SectionTitle title={t('accounts')} subtitle={ar?'الأرصدة والحركات المالية في مكان واحد، بدون إخفاء التفاصيل المهمة.':'Soldes et mouvements financiers au même endroit, sans masquer les détails utiles.'} action={tab==='accounts'&&canCreate?<Button compact title={t('add')} onPress={()=>open('create')}/>:undefined}/>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.tabs,{flexDirection:isRTL?'row-reverse':'row'}]}>{tabs.filter(([, ,allowed])=>allowed).map(([value,label])=><Chip key={value} label={label} active={tab===value} onPress={()=>{setTab(value);setShowArchived(false)}}/>)}</ScrollView>

    {tab==='accounts'?<>
      <View style={styles.balanceHero}><View style={styles.heroRule}/><AppText variant="caption" muted>{ar?'إجمالي الأرصدة الحالية':'Soldes actuels'}</AppText><Money value={summary.currentBalance} tone={summary.currentBalance<0?'negative':'normal'} large/><AppText variant="caption" muted>{ar?`${number(activeAccounts.length)} وسائل دفع نشطة`:`${number(activeAccounts.length)} moyens actifs`}</AppText></View>
      <View style={[styles.metrics,{flexDirection:isRTL?'row-reverse':'row'}]}><CompactMetric label={ar?'المداخيل':'Entrées'} value={summary.income} tone="positive"/><CompactMetric label={ar?'المصاريف':'Sorties'} value={summary.expenses} tone="negative"/><DebtMetric label={ar?'لنا / علينا':'À recevoir / à payer'} first={summary.owedToUs} second={summary.weOwe}/></View>
      {archived.length&&canEdit?<View style={styles.archiveToggle}><Button compact title={showArchived?(ar?'عرض النشطة':'Afficher actifs'):(ar?`المؤرشفة (${archived.length})`:`Archivés (${archived.length})`)} variant="secondary" onPress={()=>setShowArchived(value=>!value)}/></View>:null}
      <View style={styles.listPanel}>{showArchived?(archived.length?archived.map((account,index)=><View key={account.id} style={[styles.accountRow,{flexDirection:isRTL?'row-reverse':'row'},index===archived.length-1&&styles.lastRow]}><View style={[styles.accountDot,{backgroundColor:account.color||colors.borderStrong}]}/><View style={styles.flex}><AppText variant="subheading">{account.name}</AppText><AppText variant="caption" muted>{account.code} • {ar?'مؤرشف':'Archivé'}</AppText></View><Button compact title={t('restore')} variant="secondary" disabled={busy} onPress={()=>void restore(account)}/></View>):<EmptyState title={t('noData')}/>):(accounts.length?accounts.map((account,index)=><View key={account.id} style={[styles.accountRow,{flexDirection:isRTL?'row-reverse':'row'},index===accounts.length-1&&styles.lastRow]}><View style={[styles.accountDot,{backgroundColor:account.color||colors.primary}]}/><View style={styles.flex}><View style={[styles.accountTitle,{flexDirection:isRTL?'row-reverse':'row'}]}><AppText variant="subheading">{account.name}</AppText>{!account.isActive?<Badge label={ar?'متوقف':'Inactif'} tone="warning"/>:null}</View><AppText variant="caption" muted>{account.code}</AppText></View><View style={styles.accountEnd}><Money value={account.balance} tone={account.balance<0?'negative':'normal'}/>{canEdit?<Button compact title={t('edit')} variant="ghost" onPress={()=>open('edit',account)}/>:null}</View></View>):<EmptyState title={t('noData')}/>)}</View>
    </>:null}

    {tab==='movements'&&canMovements?<><SectionTitle title={ar?'حركة الحسابات':'Mouvements des comptes'}/><DateFilter from={movementFrom} to={movementTo} setFrom={setMovementFrom} setTo={setMovementTo} reset={()=>{setMovementFrom('');setMovementTo('');setMovementAccount('');setMovementType('')}}/><View style={styles.filterPanel}><FilterLabel label={ar?'الحساب':'Compte'}/><View style={[styles.chips,{flexDirection:isRTL?'row-reverse':'row'}]}><Chip label={ar?'الكل':'Tous'} active={!movementAccount} onPress={()=>setMovementAccount('')}/>{accounts.map(account=><Chip key={account.id} label={account.name} active={movementAccount===account.id} onPress={()=>setMovementAccount(account.id)}/>)}</View><View style={styles.divider}/><FilterLabel label={ar?'النوع':'Type'}/><View style={[styles.chips,{flexDirection:isRTL?'row-reverse':'row'}]}><Chip label={ar?'الكل':'Tous'} active={!movementType} onPress={()=>setMovementType('')}/>{Object.entries(labels).filter(([key])=>!['opening-balance','opening-balance-correction'].includes(key)).map(([key,label])=><Chip key={key} label={label} active={movementType===key} onPress={()=>setMovementType(key)}/>)}</View></View><MovementList rows={visibleMovements} label={movement=>`${labels[movement.type]??movement.type} • ${accountName(movement.paymentMethod)}`} subtitle={movement=>`${date(movement.occurredAt)} • ${movement.documentNumber}${movement.note?` • ${movement.note}`:''}`} empty={t('noData')}/></>:null}

    {tab==='transfers'&&canTransfer?<><SectionTitle title={ar?'التحويلات بين الحسابات':'Transferts entre comptes'} action={<Button compact title={t('add')} onPress={()=>open('transfer')}/>}/><DateFilter from={transferFromDate} to={transferToDate} setFrom={setTransferFromDate} setTo={setTransferToDate} reset={()=>{setTransferFromDate('');setTransferToDate('');setTransferFromAccount('');setTransferToAccount('')}}/><View style={styles.filterPanel}><FilterLabel label={t('from')}/><View style={[styles.chips,{flexDirection:isRTL?'row-reverse':'row'}]}><Chip label={ar?'الكل':'Tous'} active={!transferFromAccount} onPress={()=>setTransferFromAccount('')}/>{accounts.map(account=><Chip key={account.id} label={account.name} active={transferFromAccount===account.id} onPress={()=>setTransferFromAccount(account.id)}/>)}</View><View style={styles.divider}/><FilterLabel label={t('to')}/><View style={[styles.chips,{flexDirection:isRTL?'row-reverse':'row'}]}><Chip label={ar?'الكل':'Tous'} active={!transferToAccount} onPress={()=>setTransferToAccount('')}/>{accounts.map(account=><Chip key={account.id} label={account.name} active={transferToAccount===account.id} onPress={()=>setTransferToAccount(account.id)}/>)}</View></View><TransferList rows={visibleTransfers} date={date} empty={t('noData')} isRTL={isRTL}/></>:null}

    {tab==='adjustments'&&canAdjust?<><SectionTitle title={ar?'السحب والإيداع':'Retraits et dépôts'} action={<View style={[styles.inlineActions,{flexDirection:isRTL?'row-reverse':'row'}]}><Button compact title={ar?'إيداع':'Dépôt'} onPress={()=>open('deposit')}/><Button compact title={ar?'سحب':'Retrait'} variant="secondary" onPress={()=>open('withdrawal')}/></View>}/><DateFilter from={adjustFrom} to={adjustTo} setFrom={setAdjustFrom} setTo={setAdjustTo} reset={()=>{setAdjustFrom('');setAdjustTo('');setAdjustAccountFilter('');setAdjustType('')}}/><View style={styles.filterPanel}><FilterLabel label={ar?'الحساب':'Compte'}/><View style={[styles.chips,{flexDirection:isRTL?'row-reverse':'row'}]}><Chip label={ar?'الكل':'Tous'} active={!adjustAccountFilter} onPress={()=>setAdjustAccountFilter('')}/>{accounts.map(account=><Chip key={account.id} label={account.name} active={adjustAccountFilter===account.id} onPress={()=>setAdjustAccountFilter(account.id)}/>)}</View><View style={styles.divider}/><View style={[styles.chips,{flexDirection:isRTL?'row-reverse':'row'}]}><Chip label={ar?'إيداع وسحب':'Dépôts et retraits'} active={!adjustType} onPress={()=>setAdjustType('')}/><Chip label={ar?'إيداع':'Dépôt'} active={adjustType==='manual-deposit'} onPress={()=>setAdjustType('manual-deposit')}/><Chip label={ar?'سحب':'Retrait'} active={adjustType==='manual-withdrawal'} onPress={()=>setAdjustType('manual-withdrawal')}/></View></View><MovementList rows={adjustments} label={movement=>`${labels[movement.type]??movement.type} • ${accountName(movement.paymentMethod)}`} subtitle={movement=>`${date(movement.occurredAt)} • ${movement.documentNumber}${movement.note?` • ${movement.note}`:''}`} empty={t('noData')}/></>:null}
  </ScrollView>

  {mode&&modeAllowed(mode)?<AccountSheet mode={mode} selected={selected} accounts={activeAccounts} busy={busy} onClose={()=>{if(!busy)setMode(null)}} onRun={payload=>void runPayload(payload)} onArchive={mode==='edit'?archive:undefined} onCorrect={mode==='edit'&&selected&&canCorrect?()=>setMode('correct'):undefined}/>:null}
  </Screen>;
}

function DebtMetric({label,first,second}:{label:string;first:number;second:number}){const {number}=useI18n();return <View style={styles.debtMetric}><View style={styles.metricRule}/><AppText variant="caption" muted>{label}</AppText><AppText variant="subheading">{number(first)} / {number(second)} MRU</AppText></View>}
function FilterLabel({label}:{label:string}){return <AppText variant="caption" muted>{label}</AppText>}
function DateFilter({from,to,setFrom,setTo,reset}:{from:string;to:string;setFrom:(value:string)=>void;setTo:(value:string)=>void;reset:()=>void}){const {t,isRTL,locale}=useI18n(),ar=locale==='ar';return <View style={styles.datePanel}><View style={[styles.dateRow,{flexDirection:isRTL?'row-reverse':'row'}]}><Field label={t('from')} value={from} onChangeText={setFrom} placeholder="YYYY-MM-DD" containerStyle={styles.flex}/><Field label={t('to')} value={to} onChangeText={setTo} placeholder="YYYY-MM-DD" containerStyle={styles.flex}/></View><Button compact title={ar?'كل المدة':'Toute la période'} variant="ghost" onPress={reset}/></View>}
function MovementList({rows,label,subtitle,empty}:{rows:FinancialMovement[];label:(row:FinancialMovement)=>string;subtitle:(row:FinancialMovement)=>string;empty:string}){const {isRTL}=useI18n();return <View style={styles.listPanel}>{rows.length?rows.map((row,index)=><View key={row.id} style={[styles.movementRow,{flexDirection:isRTL?'row-reverse':'row'},index===rows.length-1&&styles.lastRow]}><View style={styles.flex}><AppText variant="subheading" numberOfLines={1}>{label(row)}</AppText><AppText variant="caption" muted numberOfLines={2}>{subtitle(row)}</AppText></View><Money value={row.amount} tone={row.direction==='in'?'positive':'negative'}/></View>):<EmptyState title={empty}/>}</View>}
function TransferList({rows,date,empty,isRTL}:{rows:AccountTransfer[];date:(value:string)=>string;empty:string;isRTL:boolean}){return <View style={styles.listPanel}>{rows.length?rows.map((row,index)=><View key={row.id} style={[styles.movementRow,{flexDirection:isRTL?'row-reverse':'row'},index===rows.length-1&&styles.lastRow]}><View style={styles.flex}><AppText variant="subheading">{row.fromName} → {row.toName}</AppText><AppText variant="caption" muted>{date(row.occurredAt)} • {row.number}{row.note?` • ${row.note}`:''}</AppText></View><Money value={row.amount}/></View>):<EmptyState title={empty}/>}</View>}

function AccountSheet({mode,selected,accounts,busy,onClose,onRun,onArchive,onCorrect}:{mode:Exclude<ModalMode,null>;selected:PaymentAccount|null;accounts:PaymentAccount[];busy:boolean;onClose:()=>void;onRun:(payload:Payload)=>void;onArchive?:()=>void;onCorrect?:()=>void}){
  const {t,locale,isRTL}=useI18n(),ar=locale==='ar';
  const [name,setName]=useState(selected?.name??''),[amount,setAmount]=useState(mode==='correct'?String(selected?.openingBalance??0):''),[from,setFrom]=useState(selected?.id??accounts[0]?.id??''),[to,setTo]=useState(accounts.find(account=>account.id!==from)?.id??''),[note,setNote]=useState(''),[color,setColor]=useState(selected?.color??'#1677c8'),[isActive,setActive]=useState(selected?.isActive??true);
  const title=mode==='create'?(ar?'وسيلة دفع جديدة':'Nouveau moyen de paiement'):mode==='transfer'?t('transfer'):mode==='deposit'?(ar?'إيداع':'Dépôt'):mode==='withdrawal'?(ar?'سحب':'Retrait'):mode==='correct'?(ar?'تصحيح رصيد البداية':'Corriger le solde initial'):selected?.name??t('accounts');
  const numeric=Number(amount),validAmount=Number.isFinite(numeric)&&numeric>0;
  const valid=mode==='create'?Boolean(name.trim()):mode==='edit'?Boolean(name.trim()):mode==='transfer'?Boolean(from&&to&&from!==to&&validAmount):(mode==='deposit'||mode==='withdrawal')?Boolean(from&&validAmount):mode==='correct'?Number.isFinite(numeric):false;
  const footer=<><Button title={t('confirm')} loading={busy} disabled={!valid} onPress={()=>onRun({name:name.trim(),amount,from,to,note,color,isActive})}/>{onCorrect?<Button title={ar?'تصحيح رصيد البداية':'Corriger le solde initial'} variant="secondary" disabled={busy} onPress={onCorrect}/>:null}{onArchive?<Button title={ar?'أرشفة وسيلة الدفع':'Archiver le moyen'} variant="danger" disabled={busy} onPress={onArchive}/>:null}<Button title={t('cancel')} variant="ghost" disabled={busy} onPress={onClose}/></>;
  return <Sheet visible title={title} onClose={onClose} footer={footer}>{mode==='create'||mode==='edit'?<><Field label={t('name')} value={name} onChangeText={setName} autoFocus/>{mode==='create'?<Field label={t('openingBalance')} keyboardType="number-pad" value={amount} onChangeText={setAmount}/>:<><Field label={ar?'اللون (HEX)':'Couleur (HEX)'} value={color} onChangeText={setColor} autoCapitalize="none"/><View style={[styles.chips,{flexDirection:isRTL?'row-reverse':'row'}]}><Chip label={ar?'نشط':'Actif'} active={isActive} onPress={()=>setActive(true)}/><Chip label={ar?'متوقف':'Inactif'} active={!isActive} onPress={()=>setActive(false)}/></View></>}</>:null}{mode==='transfer'?<><FilterLabel label={t('from')}/><View style={[styles.chips,{flexDirection:isRTL?'row-reverse':'row'}]}>{accounts.map(account=><Chip key={account.id} label={account.name} active={from===account.id} onPress={()=>{setFrom(account.id);if(to===account.id)setTo('')}}/>)}</View><FilterLabel label={t('to')}/><View style={[styles.chips,{flexDirection:isRTL?'row-reverse':'row'}]}>{accounts.filter(account=>account.id!==from).map(account=><Chip key={account.id} label={account.name} active={to===account.id} onPress={()=>setTo(account.id)}/>)}</View><Field label={t('amount')} keyboardType="number-pad" value={amount} onChangeText={setAmount}/><Field label={t('note')} value={note} onChangeText={setNote}/></>:null}{mode==='deposit'||mode==='withdrawal'?<><FilterLabel label={t('accounts')}/><View style={[styles.chips,{flexDirection:isRTL?'row-reverse':'row'}]}>{accounts.map(account=><Chip key={account.id} label={account.name} active={from===account.id} onPress={()=>setFrom(account.id)}/>)}</View><Field label={t('amount')} keyboardType="number-pad" value={amount} onChangeText={setAmount}/><Field label={t('note')} value={note} onChangeText={setNote}/></>:null}{mode==='correct'?<><View style={styles.currentBalance}><AppText variant="caption" muted>{ar?'الرصيد الحالي':'Solde actuel'}</AppText><Money value={selected?.balance??0} large/></View><Field label={t('openingBalance')} keyboardType="number-pad" value={amount} onChangeText={setAmount}/><Field label={t('reason')} value={note} onChangeText={setNote}/></>:null}</Sheet>;
}

const styles=StyleSheet.create({
  content:{padding:spacing.md,gap:spacing.md,paddingBottom:spacing.xxl,backgroundColor:colors.background},
  tabs:{gap:spacing.xs},
  chips:{flexWrap:'wrap',gap:spacing.xs},
  balanceHero:{gap:spacing.xs,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,padding:spacing.md},
  heroRule:{width:34,height:3,borderRadius:2,backgroundColor:colors.accent},
  metrics:{gap:spacing.xs,flexWrap:'wrap',borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,overflow:'hidden'},
  debtMetric:{flex:1,minWidth:132,backgroundColor:colors.surface,padding:spacing.md,gap:spacing.xs,borderBottomWidth:1,borderBottomColor:colors.border},
  metricRule:{width:28,height:2,borderRadius:2,backgroundColor:colors.accent},
  archiveToggle:{alignItems:'flex-start'},
  listPanel:{backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,overflow:'hidden'},
  accountRow:{minHeight:76,alignItems:'center',gap:spacing.sm,padding:spacing.md,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border},
  accountDot:{width:10,height:10,borderRadius:5},
  accountTitle:{alignItems:'center',gap:spacing.xs,flexWrap:'wrap'},
  accountEnd:{alignItems:'flex-end',gap:spacing.xxs},
  movementRow:{minHeight:72,alignItems:'center',gap:spacing.md,padding:spacing.md,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border},
  lastRow:{borderBottomWidth:0},
  flex:{flex:1,gap:spacing.xs},
  datePanel:{gap:spacing.sm,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,padding:spacing.md},
  dateRow:{gap:spacing.sm},
  filterPanel:{gap:spacing.sm,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,padding:spacing.md},
  divider:{height:StyleSheet.hairlineWidth,backgroundColor:colors.border},
  inlineActions:{gap:spacing.xs,flexWrap:'wrap'},
  currentBalance:{gap:spacing.xs,paddingVertical:spacing.sm},
});
