import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type { DocumentRecord } from '@/domain/types';
import { getDocumentById, listDocumentHeaders } from '@/db/document-queries';
import { voidExpense, voidInvoice } from '@/services/document-revision-service';
import { shareDocumentPdf } from '@/services/document-sharing-service';
import { AppText, Badge, Button, Chip, EmptyState, Field, Money, Screen, SearchField, SectionTitle } from '@/components/ui';
import { Sheet } from '@/components/mobile-interactions';
import { useI18n } from '@/i18n/provider';
import { useAuth } from '@/auth/provider';
import { colors, radius, spacing } from '@/theme';

const kindLabels:Record<DocumentRecord['kind'],{ar:string;fr:string}>={sale:{ar:'بيع',fr:'Vente'},purchase:{ar:'شراء',fr:'Achat'},return:{ar:'حركة تاريخية',fr:'Mouvement historique'},transfer:{ar:'تحويل',fr:'Transfert'},adjustment:{ar:'تصحيح',fr:'Ajustement'},expense:{ar:'مصروف',fr:'Dépense'},payment:{ar:'دفع/تحصيل',fr:'Paiement'},offset:{ar:'مقاصة',fr:'Compensation'},settlement:{ar:'تسوية',fr:'Règlement'}};
const selectableKinds:DocumentRecord['kind'][]=['sale','purchase','expense','payment','transfer','adjustment','offset','settlement'];
function localDay(){const value=new Date(),y=value.getFullYear(),m=String(value.getMonth()+1).padStart(2,'0'),d=String(value.getDate()).padStart(2,'0');return `${y}-${m}-${d}`}

type Period='today'|'all'|'custom';

export function RecordsScreen(){
  const db=useSQLiteContext(),{t,date,locale,isRTL,errorMessage}=useI18n(),auth=useAuth(),today=localDay(),ar=locale==='ar';
  const [items,setItems]=useState<DocumentRecord[]>([]),[search,setSearch]=useState(''),[kind,setKind]=useState<DocumentRecord['kind']|''>('sale');
  const [period,setPeriod]=useState<Period>('today'),[from,setFrom]=useState(today),[to,setTo]=useState(today),[dateSheet,setDateSheet]=useState(false);
  const [selected,setSelected]=useState<DocumentRecord|null>(null),[openingId,setOpeningId]=useState<string|null>(null);
  const load=useCallback(async()=>{if(!auth.has('records.view'))return;const rows=await listDocumentHeaders(db,{search,kind:kind||undefined,from:period==='today'?today:period==='custom'?from||undefined:undefined,to:period==='today'?today:period==='custom'?to||undefined:undefined,status:'posted',limit:200});setItems(rows)},[auth,db,from,kind,period,search,to,today]);
  useFocusEffect(useCallback(()=>{void load()},[load]));
  const openDocument=async(id:string)=>{if(openingId)return;setOpeningId(id);try{const doc=await getDocumentById(db,id);if(doc)setSelected(doc);else Alert.alert(t('error'),ar?'المستند غير موجود.':'Document introuvable.')}catch(error){Alert.alert(t('error'),errorMessage(error))}finally{setOpeningId(null)}};
  if(!auth.has('records.view'))return <Screen><EmptyState title={ar?'ليس لديك صلاحية عرض سجل الفواتير':'Vous n’avez pas accès à l’historique des documents.'}/></Screen>;
  const periodLabel=period==='today'?(ar?'اليوم':'Aujourd’hui'):period==='all'?(ar?'كل المدة':'Toute la période'):`${from} → ${to}`;
  return <Screen padded={false}>
    <FlatList data={items} keyExtractor={item=>item.id} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.list} ListHeaderComponent={<View style={styles.header}>
      <SectionTitle title={t('records')} subtitle={ar?'ابحث بسرعة، ثم افتح التفاصيل فقط عندما تحتاجها.':'Recherchez vite ; les détails ne chargent qu’à l’ouverture.'}/>
      <SearchField value={search} onChangeText={setSearch} placeholder={ar?'رقم الفاتورة أو اسم الحساب…':'Numéro ou nom du compte…'}/>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.kinds,{flexDirection:isRTL?'row-reverse':'row'}]}><Chip label={ar?'الكل':'Toutes'} active={kind===''} onPress={()=>setKind('')}/>{selectableKinds.map(value=><Chip key={value} label={kindLabels[value][locale]} active={kind===value} onPress={()=>setKind(value)}/>)}</ScrollView>
      <View style={[styles.periodRow,{flexDirection:isRTL?'row-reverse':'row'}]}><Chip label={ar?'اليوم':'Aujourd’hui'} active={period==='today'} onPress={()=>setPeriod('today')}/><Chip label={ar?'كل المدة':'Toute la période'} active={period==='all'} onPress={()=>setPeriod('all')}/><Button compact title={ar?'فترة مخصصة':'Période'} variant={period==='custom'?'secondary':'ghost'} onPress={()=>setDateSheet(true)}/></View>
      <View style={[styles.filterSummary,{flexDirection:isRTL?'row-reverse':'row'}]}><View style={styles.filterRule}/><View style={styles.flex}><AppText variant="caption" muted>{ar?'الفترة الحالية':'Période active'}</AppText><AppText variant="subheading">{periodLabel}</AppText></View><Badge label={ar?`${items.length} مستند`:`${items.length} documents`} tone="primary"/></View>
    </View>} ListEmptyComponent={<EmptyState title={search?t('noResults'):t('noData')} description={ar?'جرّب تغيير نوع المعاملة أو الفترة.':'Essayez un autre type ou une autre période.'}/>} renderItem={({item})=>{
      const name=item.partyName??item.title??item.number;
      const kindTone=item.kind==='sale'?'positive':item.kind==='expense'?'negative':item.kind==='purchase'?'warning':'neutral';
      return <Pressable accessibilityRole="button" disabled={openingId!==null} onPress={()=>void openDocument(item.id)} style={({pressed})=>[styles.row,{flexDirection:isRTL?'row-reverse':'row'},pressed&&styles.pressed]}><View style={styles.body}><View style={[styles.titleLine,{flexDirection:isRTL?'row-reverse':'row'}]}><Badge label={kindLabels[item.kind][locale]} tone={kindTone}/>{item.dueTotal>0?<Badge label={ar?`متبقي ${item.dueTotal}`:`Reste ${item.dueTotal}`} tone="negative"/>:null}</View><AppText variant="subheading" numberOfLines={1}>{name}</AppText><AppText variant="caption" muted>{item.number} • {date(item.occurredAt)}</AppText></View><View style={styles.trailing}><Money value={item.total}/><AppText variant="heading" style={styles.arrow}>{isRTL?'‹':'›'}</AppText></View></Pressable>;
    }}/>

    <Sheet visible={dateSheet} title={ar?'فترة مخصصة':'Période personnalisée'} onClose={()=>setDateSheet(false)} footer={<><Button title={t('confirm')} disabled={!from||!to} onPress={()=>{setPeriod('custom');setDateSheet(false)}}/><Button title={t('cancel')} variant="ghost" onPress={()=>setDateSheet(false)}/></>}><View style={[styles.dates,{flexDirection:isRTL?'row-reverse':'row'}]}><Field label={t('from')} value={from} onChangeText={setFrom} placeholder="YYYY-MM-DD" containerStyle={styles.flex}/><Field label={t('to')} value={to} onChangeText={setTo} placeholder="YYYY-MM-DD" containerStyle={styles.flex}/></View><AppText variant="caption" muted>{ar?'التاريخ بصيغة سنة-شهر-يوم.':'Format année-mois-jour.'}</AppText></Sheet>
    {selected?<DocumentModal item={selected} onClose={()=>setSelected(null)} onChanged={async()=>{setSelected(null);await load()}}/>:null}
  </Screen>;
}

function DocumentModal({item,onClose,onChanged}:{item:DocumentRecord;onClose:()=>void;onChanged:()=>Promise<void>}){
  const db=useSQLiteContext(),{t,date,isRTL,locale,errorMessage}=useI18n(),auth=useAuth(),ar=locale==='ar';
  const summary=useMemo(()=>[[t('total'),item.total,'normal'],[t('paid'),item.paidTotal,'positive'],[t('due'),item.dueTotal,item.dueTotal>0?'negative':'normal']] as const,[item,t]);
  const canEdit=item.status==='posted'&&((item.kind==='sale'&&auth.has('pos.edit'))||(item.kind==='purchase'&&auth.has('purchases.edit')));
  const canVoid=item.status==='posted'&&((item.kind==='sale'&&auth.has('pos.delete'))||(item.kind==='purchase'&&auth.has('purchases.delete'))||(item.kind==='expense'&&auth.has('expenses.delete')));
  const edit=()=>{if(item.kind==='sale'||item.kind==='purchase'){onClose();router.push({pathname:'/sales/edit/[id]',params:{id:item.id,kind:item.kind}})}};
  const runVoid=()=>Alert.alert(ar?'إلغاء المستند':'Annuler le document',ar?'سيتم عكس أثر هذا المستند على المخزون والديون والحساب المالي.':'Les effets sur le stock, les dettes et le compte financier seront annulés.',[{text:t('cancel'),style:'cancel'},{text:t('confirm'),style:'destructive',onPress:()=>void (async()=>{try{if(item.kind==='sale'||item.kind==='purchase')await voidInvoice(db,item.kind,item.id);else if(item.kind==='expense')await voidExpense(db,item.id);await onChanged()}catch(error){Alert.alert(t('error'),errorMessage(error))}})()}]);
  const share=async()=>{try{await shareDocumentPdf(db,item,locale)}catch(error){Alert.alert(t('error'),errorMessage(error))}};
  return <Modal animationType="slide" onRequestClose={onClose}><Screen padded={false}><ScrollView contentContainerStyle={styles.modal}><SectionTitle title={item.number} action={<Button compact title={t('cancel')} variant="ghost" onPress={onClose}/>}/><View style={styles.detailPanel}><View style={styles.detailRule}/><View style={[styles.detailTitle,{flexDirection:isRTL?'row-reverse':'row'}]}><View style={styles.flex}><Badge label={kindLabels[item.kind][locale]} tone={item.kind==='sale'?'positive':item.kind==='expense'?'negative':'neutral'}/><AppText variant="heading">{item.partyName??item.title??kindLabels[item.kind][locale]}</AppText><AppText variant="caption" muted>{date(item.occurredAt)}{item.warehouseName?` • ${item.warehouseName}`:''}</AppText></View><Money value={item.total} large/></View><View style={[styles.summaryStrip,{flexDirection:isRTL?'row-reverse':'row'}]}>{summary.map(([label,value,tone],index)=><View key={label} style={[styles.summaryCell,index===summary.length-1&&styles.lastSummary]}><AppText variant="caption" muted>{label}</AppText><Money value={value} tone={tone}/></View>)}</View></View><SectionTitle title={ar?'التفاصيل':'Détails'} subtitle={ar?`${item.lines.length} سطر`:`${item.lines.length} lignes`}/>{item.lines.map(line=><View key={line.id} style={[styles.line,{flexDirection:isRTL?'row-reverse':'row'}]}><View style={styles.flex}><AppText variant="subheading" numberOfLines={2}>{line.description}</AppText><AppText variant="caption" muted>{line.quantity} × {line.unitPrice}</AppText></View><Money value={line.lineTotal}/></View>)}<View style={styles.actions}><Button title={ar?'مشاركة PDF':'Partager en PDF'} variant="secondary" onPress={()=>void share()}/>{canEdit?<Button title={t('edit')} variant="secondary" onPress={edit}/>:null}{canVoid?<Button title={ar?'إلغاء المستند':'Annuler le document'} variant="danger" onPress={runVoid}/>:null}</View></ScrollView></Screen></Modal>;
}

const styles=StyleSheet.create({
  list:{padding:spacing.md,paddingBottom:spacing.xxl,backgroundColor:colors.background},
  header:{gap:spacing.md,marginBottom:spacing.sm},
  kinds:{gap:spacing.xs},
  periodRow:{alignItems:'center',gap:spacing.xs,flexWrap:'wrap'},
  filterSummary:{alignItems:'center',gap:spacing.sm,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,padding:spacing.md},
  filterRule:{width:3,height:34,borderRadius:2,backgroundColor:colors.accent},
  row:{minHeight:92,alignItems:'center',gap:spacing.md,paddingVertical:spacing.md,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border},
  body:{flex:1,gap:spacing.xs},
  titleLine:{alignItems:'center',gap:spacing.xs,flexWrap:'wrap'},
  trailing:{alignItems:'flex-end',gap:spacing.xs},
  arrow:{color:colors.textSoft,lineHeight:20},
  pressed:{backgroundColor:colors.surfaceMuted},
  dates:{gap:spacing.sm},
  flex:{flex:1},
  modal:{padding:spacing.md,gap:spacing.md,paddingBottom:spacing.xxl,backgroundColor:colors.background},
  detailPanel:{backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,overflow:'hidden'},
  detailRule:{height:3,backgroundColor:colors.accent},
  detailTitle:{alignItems:'center',gap:spacing.md,padding:spacing.md},
  summaryStrip:{borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:colors.border},
  summaryCell:{flex:1,padding:spacing.md,gap:spacing.xs,borderRightWidth:StyleSheet.hairlineWidth,borderRightColor:colors.border},
  lastSummary:{borderRightWidth:0},
  line:{alignItems:'center',gap:spacing.md,paddingVertical:spacing.sm,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border},
  actions:{gap:spacing.sm,paddingTop:spacing.sm},
});
