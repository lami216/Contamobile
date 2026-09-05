import { useCallback, useState } from 'react';
import { Alert, FlatList, Modal, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type { DocumentRecord, PaymentAccount } from '@/domain/types';
import { listDocuments, listPaymentAccounts } from '@/db/queries';
import { postExpense } from '@/services/accounting-service';
import { updateExpense, voidExpense } from '@/services/document-revision-service';
import { AppText, Button, Card, Chip, EmptyState, Field, Money, Row, Screen, SectionTitle } from '@/components/ui';
import { useI18n } from '@/i18n/provider';
import { useAuth } from '@/auth/provider';
import { spacing } from '@/theme';

export function ExpensesScreen(){
  const db=useSQLiteContext(),{t,date,locale,errorMessage}=useI18n(),auth=useAuth(),ar=locale==='ar';
  const [items,setItems]=useState<DocumentRecord[]>([]),[accounts,setAccounts]=useState<PaymentAccount[]>([]),[editing,setEditing]=useState<DocumentRecord|null|undefined>(undefined);
  const load=useCallback(async()=>{const [docs,a]=await Promise.all([listDocuments(db,{kind:'expense',limit:100}),listPaymentAccounts(db)]);setItems(docs);setAccounts(a.filter(account=>account.isActive&&!account.isArchived))},[db]);
  useFocusEffect(useCallback(()=>{void load()},[load]));
  if(!auth.has('expenses.view'))return <Screen><EmptyState title={ar?'ليس لديك صلاحية عرض المصاريف':'Vous n’avez pas accès aux dépenses.'}/></Screen>;
  return <Screen><SectionTitle title={t('expenses')} action={auth.has('expenses.create')?<Button title={t('add')} onPress={()=>setEditing(null)}/>:undefined}/><FlatList data={items} keyExtractor={x=>x.id} ListEmptyComponent={<EmptyState title={t('noData')}/>} renderItem={({item})=><Row title={item.title??item.number} subtitle={`${date(item.occurredAt)} • ${item.number} • ${item.status==='voided'?t('voided'):t('posted')}`} trailing={<Money value={item.total} tone="negative"/>} onPress={item.status==='posted'&&auth.has('expenses.edit')?()=>setEditing(item):undefined}/>}/>{editing!==undefined?<ExpenseModal key={editing?.id??'new-expense'} item={editing} accounts={accounts} canDelete={Boolean(editing&&auth.has('expenses.delete'))} onClose={()=>setEditing(undefined)} onSave={async input=>{try{if(editing)await updateExpense(db,editing.id,input);else await postExpense(db,input);setEditing(undefined);await load();Alert.alert(t('success'))}catch(error){Alert.alert(t('error'),errorMessage(error))}}} onDelete={editing?()=>Alert.alert(ar?'إلغاء المصروف':'Annuler la dépense',ar?'سيتم إعادة المبلغ إلى الحساب المالي وإلغاء المستند.':'Le montant sera recrédité sur le compte financier et le document sera annulé.',[{text:t('cancel'),style:'cancel'},{text:t('confirm'),style:'destructive',onPress:()=>void (async()=>{try{await voidExpense(db,editing.id);setEditing(undefined);await load();Alert.alert(t('success'))}catch(error){Alert.alert(t('error'),errorMessage(error))}})()}]):undefined}/>:null}</Screen>;
}

function ExpenseModal({item,accounts,canDelete,onClose,onSave,onDelete}:{item:DocumentRecord|null;accounts:PaymentAccount[];canDelete:boolean;onClose:()=>void;onSave:(input:{title:string;amount:number;paymentMethod:string;businessDate:string})=>Promise<void>;onDelete?:()=>void}){
  const {t,locale}=useI18n(),ar=locale==='ar';
  const [title,setTitle]=useState(item?.title??''),[amount,setAmount]=useState(item?String(item.total):''),[date,setDate]=useState(item?.occurredAt.slice(0,10)??new Date().toISOString().slice(0,10)),[method,setMethod]=useState(item?.paymentMethod??accounts.find(a=>a.code==='cash')?.id??accounts[0]?.id??'');
  const unavailable=Boolean(item&&method&&!accounts.some(account=>account.id===method||account.code===method));
  return <Modal visible animationType="slide" onRequestClose={onClose}><Screen scroll><SectionTitle title={item?t('edit'):t('createExpense')}/><Card><Field label={t('name')} value={title} onChangeText={setTitle}/><Field label={t('amount')} value={amount} keyboardType="number-pad" onChangeText={setAmount}/><Field label={t('date')} value={date} onChangeText={setDate}/>{unavailable?<AppText variant="caption" muted>{ar?'وسيلة الدفع الأصلية متوقفة أو مؤرشفة. اختر وسيلة دفع نشطة قبل الحفظ.':'Le moyen de paiement d’origine est inactif ou archivé. Choisissez un moyen actif avant d’enregistrer.'}</AppText>:null}<View style={styles.chips}>{accounts.map(a=><Chip key={a.id} label={a.name} active={method===a.id||method===a.code} onPress={()=>setMethod(a.id)}/>)}</View></Card><Button title={t('save')} disabled={!method||unavailable} onPress={()=>void onSave({title,amount:Number(amount),paymentMethod:method,businessDate:date})}/>{canDelete&&onDelete?<Button title={t('delete')} variant="danger" onPress={onDelete}/>:null}<Button title={t('cancel')} variant="ghost" onPress={onClose}/></Screen></Modal>;
}
const styles=StyleSheet.create({chips:{flexDirection:'row',flexWrap:'wrap',gap:spacing.xs}});
