import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Modal, ScrollView, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type { DocumentRecord } from '@/domain/types';
import { listDocuments } from '@/db/queries';
import { voidExpense, voidInvoice } from '@/services/document-revision-service';
import { shareDocumentPdf } from '@/services/document-sharing-service';
import { AppText, Button, Card, Chip, EmptyState, Field, Money, Row, Screen, SearchField, SectionTitle } from '@/components/ui';
import { useI18n } from '@/i18n/provider';
import { useAuth } from '@/auth/provider';
import { colors, spacing } from '@/theme';

const kindLabels:Record<DocumentRecord['kind'],{ar:string;fr:string}>={sale:{ar:'بيع',fr:'Vente'},purchase:{ar:'شراء',fr:'Achat'},return:{ar:'حركة تاريخية',fr:'Mouvement historique'},transfer:{ar:'تحويل',fr:'Transfert'},adjustment:{ar:'تصحيح',fr:'Ajustement'},expense:{ar:'مصروف',fr:'Dépense'},payment:{ar:'دفع/تحصيل',fr:'Paiement'},offset:{ar:'مقاصة',fr:'Compensation'},settlement:{ar:'تسوية',fr:'Règlement'}};
const selectableKinds:DocumentRecord['kind'][]=['sale','purchase','expense','payment','transfer','adjustment','offset','settlement'];
function localDay(){const value=new Date(),y=value.getFullYear(),m=String(value.getMonth()+1).padStart(2,'0'),d=String(value.getDate()).padStart(2,'0');return `${y}-${m}-${d}`}

export function RecordsScreen(){
  const db=useSQLiteContext(),{t,date,locale,isRTL}=useI18n(),auth=useAuth(),today=localDay();
  const [items,setItems]=useState<DocumentRecord[]>([]),[search,setSearch]=useState(''),[kind,setKind]=useState<DocumentRecord['kind']|''>('sale'),[from,setFrom]=useState(today),[to,setTo]=useState(today),[allTime,setAllTime]=useState(false),[selected,setSelected]=useState<DocumentRecord|null>(null);
  const load=useCallback(async()=>{const rows=await listDocuments(db,{search,kind:kind||undefined,from:allTime?undefined:from||undefined,to:allTime?undefined:to||undefined,limit:250});setItems(rows.filter(item=>item.status==='posted'))},[allTime,db,from,kind,search,to]);
  useFocusEffect(useCallback(()=>{void load()},[load]));
  if(!auth.has('records.view'))return <Screen><EmptyState title={locale==='ar'?'ليس لديك صلاحية عرض سجل الفواتير':'Vous n’avez pas accès à l’historique des documents.'}/></Screen>;
  const resetAll=()=>{setSearch('');setKind('');setFrom('');setTo('');setAllTime(true)};
  return <Screen><SectionTitle title={t('records')}/><Card><SearchField value={search} onChangeText={setSearch}/><View style={styles.kinds}><Chip label={locale==='ar'?'كل المعاملات':'Toutes'} active={kind===''} onPress={()=>setKind('')}/>{selectableKinds.map(value=><Chip key={value} label={kindLabels[value][locale]} active={kind===value} onPress={()=>setKind(value)}/>)}</View><View style={[styles.dates,{flexDirection:isRTL?'row-reverse':'row'}]}><Field label={t('from')} value={from} onChangeText={value=>{setFrom(value);setAllTime(false)}} placeholder="YYYY-MM-DD" style={styles.flex}/><Field label={t('to')} value={to} onChangeText={value=>{setTo(value);setAllTime(false)}} placeholder="YYYY-MM-DD" style={styles.flex}/></View><Button title={locale==='ar'?'كل المدة':'Toute la période'} variant="secondary" onPress={resetAll}/></Card><FlatList data={items} keyExtractor={x=>x.id} ListEmptyComponent={<EmptyState title={search?t('noResults'):t('noData')}/>} renderItem={({item})=><Row title={`${kindLabels[item.kind][locale]} • ${item.partyName??item.title??item.number}`} subtitle={`${date(item.occurredAt)} • ${item.number}`} trailing={<Money value={item.total}/>} onPress={()=>setSelected(item)}/>}/>{selected?<DocumentModal item={selected} onClose={()=>setSelected(null)} onChanged={async()=>{setSelected(null);await load()}}/>:null}</Screen>;
}

function DocumentModal({item,onClose,onChanged}:{item:DocumentRecord;onClose:()=>void;onChanged:()=>Promise<void>}){
  const db=useSQLiteContext(),{t,date,isRTL,locale}=useI18n(),auth=useAuth();
  const summary=useMemo(()=>[[t('total'),item.total],[t('paid'),item.paidTotal],[t('due'),item.dueTotal]] as const,[item,t]);
  const canEdit=item.status==='posted'&&((item.kind==='sale'&&auth.has('pos.edit'))||(item.kind==='purchase'&&auth.has('purchases.edit')));
  const canVoid=item.status==='posted'&&((item.kind==='sale'&&auth.has('pos.delete'))||(item.kind==='purchase'&&auth.has('purchases.delete'))||(item.kind==='expense'&&auth.has('expenses.delete')));
  const edit=()=>{if(item.kind==='sale'||item.kind==='purchase'){onClose();router.push({pathname:'/sales/edit/[id]',params:{id:item.id,kind:item.kind}})}};
  const runVoid=()=>Alert.alert(locale==='ar'?'إلغاء المستند':'Annuler le document',locale==='ar'?'سيتم عكس أثر هذا المستند على المخزون والديون والحساب المالي. لا يمكن اعتبار هذه العملية حذفًا شكليًا.':'Les effets sur le stock, les dettes et le compte financier seront annulés.',[{text:t('cancel'),style:'cancel'},{text:t('confirm'),style:'destructive',onPress:()=>void (async()=>{try{if(item.kind==='sale'||item.kind==='purchase')await voidInvoice(db,item.kind,item.id);else if(item.kind==='expense')await voidExpense(db,item.id);await onChanged();Alert.alert(t('success'))}catch(error){Alert.alert(t('error'),error instanceof Error?error.message:t('error'))}})()}]);
  const share=async()=>{try{await shareDocumentPdf(db,item,locale)}catch(error){Alert.alert(t('error'),error instanceof Error?error.message:t('error'))}};
  return <Modal animationType="slide" onRequestClose={onClose}><Screen padded={false}><ScrollView contentContainerStyle={styles.modal}><SectionTitle title={item.number} action={<Button title={t('cancel')} variant="ghost" onPress={onClose}/>}/><Card><AppText variant="subheading">{item.partyName??item.title??kindLabels[item.kind][locale]}</AppText><AppText muted>{date(item.occurredAt)} • {item.warehouseName??''}</AppText><AppText variant="caption" muted>{item.status==='voided'?t('voided'):t('posted')} • revision {item.revision}</AppText>{summary.map(([label,value])=><View key={label} style={[styles.summary,{flexDirection:isRTL?'row-reverse':'row'}]}><AppText>{label}</AppText><Money value={value}/></View>)}</Card>{item.lines.map(line=><Card key={line.id}><AppText variant="subheading">{line.description}</AppText><View style={[styles.summary,{flexDirection:isRTL?'row-reverse':'row'}]}><AppText muted>{line.quantity} × {line.unitPrice}</AppText><Money value={line.lineTotal}/></View></Card>)}<Button title={locale==='ar'?'مشاركة PDF':'Partager en PDF'} variant="secondary" onPress={()=>void share()}/>{canEdit?<Button title={t('edit')} variant="secondary" onPress={edit}/>:null}{canVoid?<Button title={t('delete')} variant="danger" onPress={runVoid}/>:null}</ScrollView></Screen></Modal>;
}

const styles=StyleSheet.create({modal:{padding:spacing.md,gap:spacing.sm,paddingBottom:spacing.xxl,backgroundColor:colors.background},summary:{justifyContent:'space-between',alignItems:'center',gap:spacing.sm},kinds:{flexDirection:'row',flexWrap:'wrap',gap:spacing.xs},dates:{gap:spacing.sm},flex:{flex:1}});
