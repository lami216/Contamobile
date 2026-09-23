import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Modal, ScrollView, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type { DocumentRecord, PartyType, PaymentAccount } from '@/domain/types';
import { getParty, listDocuments, listPaymentAccounts } from '@/db/queries';
import { voidExpense, voidInvoice } from '@/services/document-revision-service';
import { shareDocumentPdf } from '@/services/document-sharing-service';
import { updatePartyCash, voidAccountAdjustment, voidAccountTransfer, voidPartyCash, voidStockAdjustment, voidStockTransfer } from '@/services/transaction-lifecycle-service';
import { AppText, Button, Card, Chip, EmptyState, Field, Money, Row, Screen, SearchField, SectionTitle } from '@/components/ui';
import { useI18n } from '@/i18n/provider';
import { useAuth } from '@/auth/provider';
import { colors, spacing } from '@/theme';

const kindLabels:Record<DocumentRecord['kind'],{ar:string;fr:string}>={
  sale:{ar:'بيع',fr:'Vente'},purchase:{ar:'شراء',fr:'Achat'},return:{ar:'حركة تاريخية',fr:'Mouvement historique'},transfer:{ar:'تحويل مخزون',fr:'Transfert de stock'},adjustment:{ar:'تصحيح مخزون',fr:'Ajustement de stock'},expense:{ar:'مصروف',fr:'Dépense'},payment:{ar:'دفع/تحصيل طرف',fr:'Paiement tiers'},offset:{ar:'مقاصة',fr:'Compensation'},settlement:{ar:'تسوية',fr:'Règlement'},'account-transfer':{ar:'تحويل حسابات',fr:'Transfert de comptes'},'account-adjustment':{ar:'سحب/إيداع',fr:'Retrait / dépôt'}
};
const selectableKinds:DocumentRecord['kind'][]=['sale','purchase','expense','payment','transfer','adjustment','account-transfer','account-adjustment','offset','settlement'];
function localDay(){const value=new Date(),y=value.getFullYear(),m=String(value.getMonth()+1).padStart(2,'0'),d=String(value.getDate()).padStart(2,'0');return `${y}-${m}-${d}`}

export function RecordsScreen(){
  const db=useSQLiteContext(),{t,date,locale,isRTL}=useI18n(),auth=useAuth(),today=localDay();
  const [items,setItems]=useState<DocumentRecord[]>([]),[search,setSearch]=useState(''),[kind,setKind]=useState<DocumentRecord['kind']|''>('sale'),[from,setFrom]=useState(today),[to,setTo]=useState(today),[allTime,setAllTime]=useState(false),[selected,setSelected]=useState<DocumentRecord|null>(null);
  const load=useCallback(async()=>{const rows=await listDocuments(db,{search,kind:kind||undefined,from:allTime?undefined:from||undefined,to:allTime?undefined:to||undefined,limit:300});setItems(rows.filter(item=>item.status==='posted'))},[allTime,db,from,kind,search,to]);
  useFocusEffect(useCallback(()=>{void load()},[load]));
  if(!auth.has('records.view'))return <Screen><EmptyState title={locale==='ar'?'ليس لديك صلاحية عرض سجل الفواتير':'Vous n’avez pas accès à l’historique des documents.'}/></Screen>;
  const resetAll=()=>{setSearch('');setKind('');setFrom('');setTo('');setAllTime(true)};
  return <Screen padded={false}>
    <FlatList
      data={items}
      keyExtractor={x=>x.id}
      contentContainerStyle={styles.content}
      ListHeaderComponent={<View style={styles.header}>
        <SectionTitle title={t('records')}/>
        <Card elevated><SearchField value={search} onChangeText={setSearch}/><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.kinds}><Chip label={locale==='ar'?'كل المعاملات':'Toutes'} active={kind===''} onPress={()=>setKind('')}/>{selectableKinds.map(value=><Chip key={value} label={kindLabels[value][locale]} active={kind===value} onPress={()=>setKind(value)}/>)}</ScrollView><View style={[styles.dates,{flexDirection:isRTL?'row-reverse':'row'}]}><Field label={t('from')} value={from} onChangeText={value=>{setFrom(value);setAllTime(false)}} placeholder="YYYY-MM-DD" style={styles.flex}/><Field label={t('to')} value={to} onChangeText={value=>{setTo(value);setAllTime(false)}} placeholder="YYYY-MM-DD" style={styles.flex}/></View><Button title={locale==='ar'?'كل المدة':'Toute la période'} variant="secondary" onPress={resetAll}/></Card>
      </View>}
      ListEmptyComponent={<EmptyState title={search?t('noResults'):t('noData')}/>}
      renderItem={({item})=><Card elevated style={styles.recordCard}><Row title={`${kindLabels[item.kind][locale]} • ${item.partyName??item.title??item.number}`} subtitle={`${date(item.occurredAt)} • ${item.number} • ${locale==='ar'?'مراجعة':'Rév.'} ${item.revision}`} trailing={<Money value={item.total}/>} onPress={()=>setSelected(item)}/></Card>}
    />
    {selected?<DocumentModal item={selected} onClose={()=>setSelected(null)} onChanged={async()=>{setSelected(null);await load()}}/>:null}
  </Screen>;
}

function DocumentModal({item,onClose,onChanged}:{item:DocumentRecord;onClose:()=>void;onChanged:()=>Promise<void>}){
  const db=useSQLiteContext(),{t,date,isRTL,locale,errorMessage}=useI18n(),auth=useAuth(),ar=locale==='ar';
  const [partyType,setPartyType]=useState<PartyType|null>(null),[accounts,setAccounts]=useState<PaymentAccount[]>([]),[cashEditor,setCashEditor]=useState(false);
  useEffect(()=>{void (async()=>{if(item.partyId)setPartyType((await getParty(db,item.partyId))?.partyType??null);setAccounts((await listPaymentAccounts(db)).filter(account=>account.isActive&&!account.isArchived))})()},[db,item.partyId]);
  const summary=useMemo(()=>[[t('total'),item.total],[t('paid'),item.paidTotal],[t('due'),item.dueTotal]] as const,[item,t]);
  const paymentEdit=partyType==='customer'?auth.has('customers.collect.edit'):partyType==='supplier'?auth.has('suppliers.pay.edit'):false;
  const paymentDelete=partyType==='customer'?auth.has('customers.collect.delete'):partyType==='supplier'?auth.has('suppliers.pay.delete'):false;
  const openingAdjustment=item.kind==='adjustment'&&(item.number.startsWith('OPEN')||item.title==='رصيد بداية'||item.title==='تصحيح رصيد البداية');
  const canEdit=item.status==='posted'&&(
    (item.kind==='sale'&&auth.has('pos.edit'))||
    (item.kind==='purchase'&&auth.has('purchases.edit'))||
    (item.kind==='payment'&&paymentEdit)||
    (item.kind==='transfer'&&auth.has('warehouses.transfer.edit'))||
    (item.kind==='adjustment'&&!openingAdjustment&&auth.has('warehouses.adjust.edit'))
  );
  const canVoid=item.status==='posted'&&(
    (item.kind==='sale'&&auth.has('pos.delete'))||
    (item.kind==='purchase'&&auth.has('purchases.delete'))||
    (item.kind==='expense'&&auth.has('expenses.delete'))||
    (item.kind==='payment'&&paymentDelete)||
    (item.kind==='transfer'&&auth.has('warehouses.transfer.delete'))||
    (item.kind==='adjustment'&&!openingAdjustment&&auth.has('warehouses.adjust.delete'))||
    (item.kind==='account-transfer'&&auth.has('banks.transfer.delete'))||
    (item.kind==='account-adjustment'&&auth.has('banks.deposit_withdraw.delete'))
  );
  const edit=()=>{
    if(item.kind==='sale'||item.kind==='purchase'){onClose();router.push({pathname:'/sales/edit/[id]',params:{id:item.id,kind:item.kind}})}
    else if(item.kind==='transfer'){onClose();router.push({pathname:'/inventory/transfer',params:{id:item.id}})}
    else if(item.kind==='adjustment'){onClose();router.push({pathname:'/inventory/adjustment',params:{id:item.id}})}
    else if(item.kind==='payment')setCashEditor(true);
  };
  const runVoid=()=>Alert.alert(ar?'إلغاء المستند':'Annuler le document',ar?'سيتم عكس أثر هذا المستند مع الاحتفاظ بسجل المراجعة.':'L’effet de ce document sera inversé tout en conservant la trace d’audit.',[{text:t('cancel'),style:'cancel'},{text:t('confirm'),style:'destructive',onPress:()=>void (async()=>{try{
    if(item.kind==='sale'||item.kind==='purchase')await voidInvoice(db,item.kind,item.id);
    else if(item.kind==='expense')await voidExpense(db,item.id);
    else if(item.kind==='payment')await voidPartyCash(db,item.id);
    else if(item.kind==='transfer')await voidStockTransfer(db,item.id);
    else if(item.kind==='adjustment')await voidStockAdjustment(db,item.id);
    else if(item.kind==='account-transfer')await voidAccountTransfer(db,item.id);
    else if(item.kind==='account-adjustment')await voidAccountAdjustment(db,item.id);
    await onChanged();Alert.alert(t('success'));
  }catch(error){Alert.alert(t('error'),errorMessage(error))}})()}]);
  const share=async()=>{try{await shareDocumentPdf(db,item,locale)}catch(error){Alert.alert(t('error'),errorMessage(error))}};
  return <Modal animationType="slide" onRequestClose={onClose}><Screen padded={false}><ScrollView contentContainerStyle={styles.modal}>
    <SectionTitle title={item.number} action={<Button title={t('cancel')} variant="ghost" onPress={onClose}/>}/>
    <Card elevated><AppText variant="subheading">{item.partyName??item.title??kindLabels[item.kind][locale]}</AppText><AppText muted>{date(item.occurredAt)}{item.warehouseName?` • ${item.warehouseName}`:''}</AppText><AppText variant="caption" muted>{item.status==='voided'?t('voided'):t('posted')} • {ar?'المراجعة':'Révision'} {item.revision}</AppText>{item.note?<AppText variant="caption" muted>{item.note}</AppText>:null}{summary.map(([label,value])=><View key={label} style={[styles.summary,{flexDirection:isRTL?'row-reverse':'row'}]}><AppText>{label}</AppText><Money value={value}/></View>)}</Card>
    {item.lines.map(line=><Card elevated key={line.id}><AppText variant="subheading">{line.description}</AppText><View style={[styles.summary,{flexDirection:isRTL?'row-reverse':'row'}]}><AppText muted>{line.quantity} × {line.unitPrice}</AppText><Money value={line.lineTotal}/></View></Card>)}
    <Button title={ar?'مشاركة PDF':'Partager en PDF'} variant="secondary" onPress={()=>void share()}/>
    {canEdit?<Button title={t('edit')} variant="secondary" onPress={edit}/>:null}
    {canVoid?<Button title={ar?'إلغاء الحركة':'Annuler l’opération'} variant="danger" onPress={runVoid}/>:null}
  </ScrollView>
    {cashEditor&&item.partyCashDirection?<PartyCashEditModal item={item} accounts={accounts} onClose={()=>setCashEditor(false)} onSave={async(direction,amount,paymentMethod,note)=>{try{await updatePartyCash(db,item.id,{direction,amount,paymentMethod,note});setCashEditor(false);await onChanged();Alert.alert(t('success'))}catch(error){Alert.alert(t('error'),errorMessage(error))}}}/>:null}
  </Screen></Modal>;
}

function PartyCashEditModal({item,accounts,onClose,onSave}:{item:DocumentRecord;accounts:PaymentAccount[];onClose:()=>void;onSave:(direction:'receive'|'pay',amount:number,paymentMethod:string,note:string)=>Promise<void>}){
  const {t,locale}=useI18n(),ar=locale==='ar';
  const [direction,setDirection]=useState<'receive'|'pay'>(item.partyCashDirection??'receive'),[amount,setAmount]=useState(String(item.cashAmount||item.total)),[method,setMethod]=useState(item.paymentMethod??accounts[0]?.id??''),[note,setNote]=useState(item.note??'');
  return <Modal animationType="slide" onRequestClose={onClose}><Screen scroll><SectionTitle title={ar?'تعديل حركة الطرف':'Modifier le mouvement du tiers'}/><Card elevated><View style={styles.kinds}><Chip label={t('receive')} active={direction==='receive'} onPress={()=>setDirection('receive')}/><Chip label={t('pay')} active={direction==='pay'} onPress={()=>setDirection('pay')}/></View><Field label={t('amount')} value={amount} keyboardType="number-pad" onChangeText={setAmount}/><AppText variant="caption" muted>{t('paymentMethod')}</AppText><View style={styles.kinds}>{accounts.map(account=><Chip key={account.id} label={account.name} active={method===account.id||method===account.code} onPress={()=>setMethod(account.id)}/>)}</View><Field label={t('note')} value={note} onChangeText={setNote}/></Card><Button title={t('save')} disabled={!Number(amount)||!method} onPress={()=>void onSave(direction,Number(amount),method,note)}/><Button title={t('cancel')} variant="ghost" onPress={onClose}/></Screen></Modal>;
}

const styles=StyleSheet.create({
  content:{padding:spacing.md,gap:spacing.sm,paddingBottom:spacing.xxl,backgroundColor:colors.background},
  header:{gap:spacing.md,marginBottom:spacing.xs},
  recordCard:{paddingVertical:spacing.xs},
  modal:{padding:spacing.md,gap:spacing.sm,paddingBottom:spacing.xxl,backgroundColor:colors.background},
  summary:{justifyContent:'space-between',alignItems:'center',gap:spacing.sm},
  kinds:{flexDirection:'row',flexWrap:'wrap',gap:spacing.xs},
  dates:{gap:spacing.sm},flex:{flex:1},
});
