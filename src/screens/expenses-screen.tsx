import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type { DocumentRecord, PaymentAccount } from '@/domain/types';
import { listPaymentAccounts } from '@/db/queries';
import { listDocumentHeaders } from '@/db/document-queries';
import { postExpense } from '@/services/accounting-service';
import { updateExpense, voidExpense } from '@/services/document-revision-service';
import { AppText, Badge, Button, Chip, EmptyState, Field, Money, Screen, SearchField, SectionTitle } from '@/components/ui';
import { Sheet } from '@/components/mobile-interactions';
import { useI18n } from '@/i18n/provider';
import { useAuth } from '@/auth/provider';
import { colors, radius, spacing } from '@/theme';

function localDay(){const d=new Date(),y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return `${y}-${m}-${day}`}

type ExpenseInput={title:string;amount:number;paymentMethod:string;businessDate:string};

export function ExpensesScreen(){
  const db=useSQLiteContext(),{t,date,locale,isRTL,errorMessage}=useI18n(),auth=useAuth(),ar=locale==='ar',today=localDay();
  const [items,setItems]=useState<DocumentRecord[]>([]),[accounts,setAccounts]=useState<PaymentAccount[]>([]),[editing,setEditing]=useState<DocumentRecord|null|undefined>(undefined),[search,setSearch]=useState(''),[todayOnly,setTodayOnly]=useState(true),[busy,setBusy]=useState(false);
  const load=useCallback(async()=>{if(!auth.has('expenses.view'))return;const [docs,a]=await Promise.all([listDocumentHeaders(db,{kind:'expense',search,from:todayOnly?today:undefined,to:todayOnly?today:undefined,status:'posted',limit:150}),listPaymentAccounts(db)]);setItems(docs);setAccounts(a.filter(account=>account.isActive&&!account.isArchived))},[auth,db,search,today,todayOnly]);
  useFocusEffect(useCallback(()=>{void load()},[load]));
  const total=useMemo(()=>items.reduce((sum,item)=>sum+item.total,0),[items]);
  if(!auth.has('expenses.view'))return <Screen><EmptyState title={ar?'ليس لديك صلاحية عرض المصاريف':'Vous n’avez pas accès aux dépenses.'}/></Screen>;
  const canCreate=auth.has('expenses.create'),canEdit=auth.has('expenses.edit');
  const save=async(input:ExpenseInput)=>{if(busy)return;setBusy(true);try{if(editing){if(!canEdit)throw new Error(ar?'ليس لديك صلاحية تعديل المصروف':'Vous n’avez pas le droit de modifier cette dépense.');await updateExpense(db,editing.id,input)}else{if(!canCreate)throw new Error(ar?'ليس لديك صلاحية إنشاء المصروف':'Vous n’avez pas le droit de créer cette dépense.');await postExpense(db,input)}setEditing(undefined);await load()}catch(error){Alert.alert(t('error'),errorMessage(error))}finally{setBusy(false)}};
  const remove=editing&&auth.has('expenses.delete')?()=>Alert.alert(ar?'إلغاء المصروف':'Annuler la dépense',ar?'سيتم إعادة المبلغ إلى الحساب المالي وإلغاء المستند.':'Le montant sera recrédité sur le compte financier et le document sera annulé.',[{text:t('cancel'),style:'cancel'},{text:t('confirm'),style:'destructive',onPress:()=>void (async()=>{try{setBusy(true);await voidExpense(db,editing.id);setEditing(undefined);await load()}catch(error){Alert.alert(t('error'),errorMessage(error))}finally{setBusy(false)}})()}]):undefined;
  return <Screen padded={false}><FlatList data={items} keyExtractor={item=>item.id} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.list} ListHeaderComponent={<View style={styles.header}>
    <SectionTitle title={t('expenses')} subtitle={ar?'سجّل المصروف في خطوات قليلة وتابع مجموع اليوم فورًا.':'Saisissez une dépense en quelques gestes et suivez le total immédiatement.'} action={canCreate?<Button compact title={t('add')} onPress={()=>setEditing(null)}/>:undefined}/>
    <View style={styles.hero}><View style={styles.heroRule}/><AppText variant="caption" muted>{todayOnly?(ar?'مصاريف اليوم':'Dépenses du jour'):(ar?'مجموع النتائج':'Total affiché')}</AppText><Money value={total} tone="negative" large/><AppText variant="caption" muted>{ar?`${items.length} عملية`:`${items.length} opérations`}</AppText></View>
    <View style={[styles.filters,{flexDirection:isRTL?'row-reverse':'row'}]}><Chip label={ar?'اليوم':'Aujourd’hui'} active={todayOnly} onPress={()=>setTodayOnly(true)}/><Chip label={ar?'كل المدة':'Toute la période'} active={!todayOnly} onPress={()=>setTodayOnly(false)}/></View>
    <SearchField value={search} onChangeText={setSearch} placeholder={ar?'ابحث باسم المصروف أو الرقم…':'Nom ou numéro de dépense…'}/>
  </View>} ListEmptyComponent={<EmptyState title={search?t('noResults'):t('noData')} description={!search&&todayOnly?(ar?'لا توجد مصاريف مسجلة اليوم.':'Aucune dépense enregistrée aujourd’hui.'):undefined}/>} renderItem={({item})=><Pressable accessibilityRole={canEdit?'button':undefined} disabled={!canEdit} onPress={()=>setEditing(item)} style={({pressed})=>[styles.row,{flexDirection:isRTL?'row-reverse':'row'},pressed&&styles.pressed]}><View style={styles.body}><View style={[styles.titleRow,{flexDirection:isRTL?'row-reverse':'row'}]}><AppText variant="subheading" numberOfLines={1} style={styles.title}>{item.title??item.number}</AppText><Badge label={ar?'مصروف':'Dépense'} tone="negative"/></View><AppText variant="caption" muted>{date(item.occurredAt)} • {item.number}</AppText></View><View style={styles.trailing}><Money value={item.total} tone="negative"/>{canEdit?<AppText variant="heading" style={styles.arrow}>{isRTL?'‹':'›'}</AppText>:null}</View></Pressable>}/>
    {editing!==undefined?<ExpenseSheet key={editing?.id??'new-expense'} item={editing} accounts={accounts} busy={busy} canDelete={Boolean(remove)} onClose={()=>{if(!busy)setEditing(undefined)}} onSave={save} onDelete={remove}/>:null}
  </Screen>;
}

function ExpenseSheet({item,accounts,busy,canDelete,onClose,onSave,onDelete}:{item:DocumentRecord|null;accounts:PaymentAccount[];busy:boolean;canDelete:boolean;onClose:()=>void;onSave:(input:ExpenseInput)=>Promise<void>;onDelete?:()=>void}){
  const {t,locale,isRTL}=useI18n(),ar=locale==='ar';
  const [title,setTitle]=useState(item?.title??''),[amount,setAmount]=useState(item?String(item.total):''),[date,setDate]=useState(item?.occurredAt.slice(0,10)??localDay()),[method,setMethod]=useState(item?.paymentMethod??accounts.find(a=>a.code==='cash')?.id??accounts[0]?.id??'');
  const unavailable=Boolean(item&&method&&!accounts.some(account=>account.id===method||account.code===method));
  const value=Number(amount),valid=title.trim()&&Number.isFinite(value)&&value>0&&method&&!unavailable;
  return <Sheet visible title={item?(ar?'تعديل المصروف':'Modifier la dépense'):(ar?'مصروف جديد':'Nouvelle dépense')} onClose={onClose} footer={<><Button title={t('save')} loading={busy} disabled={!valid} onPress={()=>void onSave({title:title.trim(),amount:value,paymentMethod:method,businessDate:date})}/>{canDelete&&onDelete?<Button title={ar?'إلغاء المصروف':'Annuler la dépense'} variant="danger" disabled={busy} onPress={onDelete}/>:null}<Button title={t('cancel')} variant="ghost" disabled={busy} onPress={onClose}/></>}><Field label={t('name')} value={title} onChangeText={setTitle} autoFocus={!item}/><Field label={t('amount')} value={amount} keyboardType="number-pad" onChangeText={setAmount} selectTextOnFocus/><Field label={t('date')} value={date} onChangeText={setDate} placeholder="YYYY-MM-DD"/>{unavailable?<View style={styles.warningNote}><View style={styles.warningRule}/><AppText variant="caption" muted>{ar?'وسيلة الدفع الأصلية متوقفة أو مؤرشفة. اختر وسيلة نشطة.':'Le moyen de paiement d’origine est inactif ou archivé. Choisissez un moyen actif.'}</AppText></View>:null}<View style={styles.payment}><AppText variant="caption" muted>{ar?'من أي حساب؟':'Depuis quel compte ?'}</AppText><View style={[styles.chips,{flexDirection:isRTL?'row-reverse':'row'}]}>{accounts.map(account=><Chip key={account.id} label={account.name} active={method===account.id||method===account.code} onPress={()=>setMethod(account.id)}/>)}</View></View></Sheet>;
}

const styles=StyleSheet.create({
  list:{padding:spacing.md,paddingBottom:spacing.xxl,backgroundColor:colors.background},
  header:{gap:spacing.md,marginBottom:spacing.sm},
  hero:{gap:spacing.xs,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,padding:spacing.md},
  heroRule:{width:34,height:3,borderRadius:2,backgroundColor:colors.accent,marginBottom:spacing.xxs},
  filters:{gap:spacing.xs,flexWrap:'wrap'},
  row:{minHeight:82,alignItems:'center',gap:spacing.md,paddingVertical:spacing.md,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border},
  body:{flex:1,gap:spacing.xs},
  titleRow:{alignItems:'center',gap:spacing.xs},
  title:{flexShrink:1},
  trailing:{alignItems:'flex-end',gap:spacing.xs},
  arrow:{color:colors.textSoft,lineHeight:20},
  pressed:{backgroundColor:colors.surfaceMuted},
  payment:{gap:spacing.sm},
  chips:{flexWrap:'wrap',gap:spacing.xs},
  warningNote:{gap:spacing.xs,padding:spacing.sm,borderRadius:radius.md,backgroundColor:colors.warningSoft},
  warningRule:{width:28,height:2,borderRadius:2,backgroundColor:colors.warning},
});
