import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Modal, ScrollView, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type { DocumentRecord } from '@/domain/types';
import { listDocuments } from '@/db/queries';
import { voidExpense, voidInvoice } from '@/services/document-revision-service';
import { AppText, Button, Card, EmptyState, Money, Row, Screen, SearchField, SectionTitle } from '@/components/ui';
import { useI18n } from '@/i18n/provider';
import { useAuth } from '@/auth/provider';
import { colors, spacing } from '@/theme';

const labels:Record<DocumentRecord['kind'],string>={sale:'بيع',purchase:'شراء',return:'مرتجع',transfer:'تحويل',adjustment:'تصحيح',expense:'مصروف',payment:'دفع/تحصيل',offset:'مقاصة',settlement:'تسوية'};

export function RecordsScreen(){
  const db=useSQLiteContext(),{t,date}=useI18n(),auth=useAuth();
  const [items,setItems]=useState<DocumentRecord[]>([]),[search,setSearch]=useState(''),[selected,setSelected]=useState<DocumentRecord|null>(null);
  const load=useCallback(async()=>setItems(await listDocuments(db,{search,limit:150})),[db,search]);
  useFocusEffect(useCallback(()=>{void load()},[load]));
  if(!auth.has('records.view'))return <Screen><EmptyState title="ليس لديك صلاحية عرض سجل الفواتير"/></Screen>;
  return <Screen><SectionTitle title={t('records')}/><SearchField value={search} onChangeText={setSearch}/><FlatList data={items} keyExtractor={x=>x.id} ListEmptyComponent={<EmptyState title={search?t('noResults'):t('noData')}/>} renderItem={({item})=><Row title={`${labels[item.kind]} • ${item.partyName??item.title??item.number}`} subtitle={`${date(item.occurredAt)} • ${item.number} • ${item.status==='voided'?t('voided'):t('posted')}`} trailing={<Money value={item.total}/>} onPress={()=>setSelected(item)}/>}/>{selected?<DocumentModal item={selected} onClose={()=>setSelected(null)} onChanged={async()=>{setSelected(null);await load()}}/>:null}</Screen>;
}

function DocumentModal({item,onClose,onChanged}:{item:DocumentRecord;onClose:()=>void;onChanged:()=>Promise<void>}){
  const db=useSQLiteContext(),{t,date,isRTL}=useI18n(),auth=useAuth();
  const summary=useMemo(()=>[[t('total'),item.total],[t('paid'),item.paidTotal],[t('due'),item.dueTotal]] as const,[item,t]);
  const canEdit=item.status==='posted'&&((item.kind==='sale'&&auth.has('pos.edit'))||(item.kind==='purchase'&&auth.has('purchases.edit')));
  const canVoid=item.status==='posted'&&((item.kind==='sale'&&auth.has('pos.delete'))||(item.kind==='purchase'&&auth.has('purchases.delete'))||(item.kind==='expense'&&auth.has('expenses.delete')));
  const edit=()=>{if(item.kind==='sale'||item.kind==='purchase'){onClose();router.push({pathname:'/sales/edit/[id]',params:{id:item.id,kind:item.kind}})}};
  const runVoid=()=>Alert.alert('إلغاء المستند','سيتم عكس أثر هذا المستند على المخزون والديون والحساب المالي. لا يمكن اعتبار هذه العملية حذفًا شكليًا.',[{text:t('cancel'),style:'cancel'},{text:t('confirm'),style:'destructive',onPress:()=>void (async()=>{try{if(item.kind==='sale'||item.kind==='purchase')await voidInvoice(db,item.kind,item.id);else if(item.kind==='expense')await voidExpense(db,item.id);await onChanged();Alert.alert(t('success'))}catch(error){Alert.alert(t('error'),error instanceof Error?error.message:t('error'))}})()}]);
  return <Modal animationType="slide" onRequestClose={onClose}><Screen padded={false}><ScrollView contentContainerStyle={styles.modal}><SectionTitle title={item.number} action={<Button title={t('cancel')} variant="ghost" onPress={onClose}/>}/><Card><AppText variant="subheading">{item.partyName??item.title??labels[item.kind]}</AppText><AppText muted>{date(item.occurredAt)} • {item.warehouseName??''}</AppText><AppText variant="caption" muted>{item.status==='voided'?t('voided'):t('posted')} • revision {item.revision}</AppText>{summary.map(([label,value])=><View key={label} style={[styles.summary,{flexDirection:isRTL?'row-reverse':'row'}]}><AppText>{label}</AppText><Money value={value}/></View>)}</Card>{item.lines.map(line=><Card key={line.id}><AppText variant="subheading">{line.description}</AppText><View style={[styles.summary,{flexDirection:isRTL?'row-reverse':'row'}]}><AppText muted>{line.quantity} × {line.unitPrice}</AppText><Money value={line.lineTotal}/></View></Card>)}{canEdit?<Button title={t('edit')} variant="secondary" onPress={edit}/>:null}{canVoid?<Button title={t('delete')} variant="danger" onPress={runVoid}/>:null}</ScrollView></Screen></Modal>;
}

const styles=StyleSheet.create({modal:{padding:spacing.md,gap:spacing.sm,paddingBottom:spacing.xxl,backgroundColor:colors.background},summary:{justifyContent:'space-between',alignItems:'center',gap:spacing.sm}});
