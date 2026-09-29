import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type { DocumentRecord, PaymentAccount } from '@/domain/types';
import { getDocumentById, listDocumentHeaders } from '@/db/document-queries';
import { getParty, listPaymentAccounts } from '@/db/queries';
import { voidExpense, voidInvoice } from '@/services/document-revision-service';
import { printDocument, shareDocumentPdf } from '@/services/document-sharing-service';
import { voidAccountAdjustment, voidAccountTransfer, voidPartyCash, voidStockAdjustment, voidStockTransfer } from '@/services/transaction-lifecycle-service';
import {
  AppText,
  Badge,
  Button,
  Chip,
  EmptyState,
  FinancialSummary,
  FormField,
  FramedSection,
  Money,
  PageHeader,
  Screen,
  SearchField,
  SegmentedControl,
} from '@/components/ui';
import { FilterSheet } from '@/components/mobile-interactions';
import { useI18n } from '@/i18n/provider';
import type { MessageKey } from '@/i18n/messages';
import { useAuth } from '@/auth/provider';
import { colors, radius, spacing } from '@/theme';

const kindLabels:Record<DocumentRecord['kind'],MessageKey>={
  sale:'recordKindSale',
  purchase:'recordKindPurchase',
  return:'recordKindReturn',
  transfer:'recordKindTransfer',
  adjustment:'recordKindAdjustment',
  expense:'recordKindExpense',
  payment:'recordKindPayment',
  offset:'recordKindOffset',
  settlement:'recordKindSettlement',
  'account-transfer':'recordKindAccountTransfer',
  'account-adjustment':'recordKindAccountAdjustment',
};

const selectableKinds:DocumentRecord['kind'][]=[
  'sale','purchase','expense','payment','return','transfer','adjustment','account-transfer','account-adjustment','offset','settlement',
];
const primaryKinds:Array<DocumentRecord['kind']|''>=['','sale','purchase','expense'];

type Period='today'|'week'|'month'|'all'|'custom';
type RecordStatus=DocumentRecord['status']|'';

function localDay(value=new Date()){
  const y=value.getFullYear(),m=String(value.getMonth()+1).padStart(2,'0'),d=String(value.getDate()).padStart(2,'0');
  return `${y}-${m}-${d}`;
}
function shiftedDay(offset:number){
  const value=new Date();
  value.setDate(value.getDate()+offset);
  return localDay(value);
}
function monthStart(){
  const value=new Date();
  value.setDate(1);
  return localDay(value);
}
function timeLabel(value:string,locale:'ar'|'fr'){
  try{return new Intl.DateTimeFormat(locale==='ar'?'ar-MR':'fr-FR',{hour:'2-digit',minute:'2-digit'}).format(new Date(value))}
  catch{return value.slice(11,16)}
}
const format=(template:string,values:Record<string,string|number>)=>Object.entries(values).reduce((output,[key,value])=>output.replaceAll('{'+key+'}',String(value)),template);

function kindTone(kind:DocumentRecord['kind']):'neutral'|'primary'|'positive'|'negative'|'warning'{
  if(kind==='sale')return 'positive';
  if(kind==='purchase')return 'warning';
  if(kind==='expense')return 'negative';
  if(kind==='payment'||kind==='settlement')return 'primary';
  return 'neutral';
}

function paymentName(item:DocumentRecord,accounts:PaymentAccount[],creditLabel:string){
  if(item.paymentMethod==='note')return creditLabel;
  if(!item.paymentMethod)return null;
  const account=accounts.find(value=>value.id===item.paymentMethod||value.code===item.paymentMethod);
  return account?.name??null;
}

function documentStatus(item:DocumentRecord,t:(key:MessageKey)=>string):{label:string;tone:'neutral'|'positive'|'negative'|'warning'}{
  if(item.status==='voided')return{label:t('voided'),tone:'negative'};
  if((item.kind==='sale'||item.kind==='purchase')&&item.dueTotal>0)return{label:t('recordsCreditStatus'),tone:'warning'};
  if((item.kind==='sale'||item.kind==='purchase')&&item.total>0&&item.paidTotal>=item.total)return{label:t('recordsPaidStatus'),tone:'positive'};
  return{label:t('recordsPostedStatus'),tone:'neutral'};
}

export function RecordsScreen(){
  const db=useSQLiteContext(),{t,isRTL,errorMessage,locale}=useI18n(),auth=useAuth(),today=localDay(),params=useLocalSearchParams<{documentId?:string}>(),deepDocumentId=typeof params.documentId==='string'?params.documentId:'';
  const [items,setItems]=useState<DocumentRecord[]>([]),[accounts,setAccounts]=useState<PaymentAccount[]>([]);
  const [search,setSearch]=useState(''),[kind,setKind]=useState<DocumentRecord['kind']|''>('sale'),[status,setStatus]=useState<RecordStatus>('posted');
  const [period,setPeriod]=useState<Period>('today'),[from,setFrom]=useState(today),[to,setTo]=useState(today);
  const [filtersOpen,setFiltersOpen]=useState(false),[draftKind,setDraftKind]=useState<DocumentRecord['kind']|''>('sale'),[draftStatus,setDraftStatus]=useState<RecordStatus>('posted'),[draftPeriod,setDraftPeriod]=useState<Period>('today'),[draftFrom,setDraftFrom]=useState(today),[draftTo,setDraftTo]=useState(today);
  const [selected,setSelected]=useState<DocumentRecord|null>(null),[openingId,setOpeningId]=useState<string|null>(null);
  const deepOpenedId=useRef('');

  const range=useMemo(()=>{
    if(period==='today')return{from:today,to:today};
    if(period==='week')return{from:shiftedDay(-6),to:today};
    if(period==='month')return{from:monthStart(),to:today};
    if(period==='custom')return{from:from||undefined,to:to||undefined};
    return{from:undefined,to:undefined};
  },[from,period,to,today]);

  const load=useCallback(async()=>{
    if(!auth.has('records.view'))return;
    const rows=await listDocumentHeaders(db,{
      search,
      kind:kind||undefined,
      from:range.from,
      to:range.to,
      status:status||undefined,
      limit:200,
    });
    setItems(rows);
  },[auth,db,kind,range.from,range.to,search,status]);

  const loadAccounts=useCallback(async()=>{
    if(!auth.has('records.view'))return;
    try{setAccounts(await listPaymentAccounts(db,true))}
    catch(error){Alert.alert(t('error'),errorMessage(error))}
  },[auth,db,errorMessage,t]);

  useFocusEffect(useCallback(()=>{void load()},[load]));
  useFocusEffect(useCallback(()=>{void loadAccounts()},[loadAccounts]));

  const openDocument=useCallback(async(id:string)=>{
    if(openingId)return;
    setOpeningId(id);
    try{
      const doc=await getDocumentById(db,id);
      if(doc)setSelected(doc);
      else Alert.alert(t('error'),t('recordsDocumentMissing'));
    }catch(error){Alert.alert(t('error'),errorMessage(error))}
    finally{setOpeningId(null)}
  },[db,errorMessage,openingId,t]);

  useEffect(()=>{
    if(!deepDocumentId||deepOpenedId.current===deepDocumentId||!auth.has('records.view'))return;
    deepOpenedId.current=deepDocumentId;
    void openDocument(deepDocumentId);
  },[auth,deepDocumentId,openDocument]);

  if(!auth.has('records.view'))return <Screen><EmptyState title={t('recordsNoPermission')}/></Screen>;

  const periodLabel=period==='today'?t('recordsToday'):period==='week'?t('recordsWeek'):period==='month'?t('recordsMonth'):period==='all'?t('recordsAllTime'):`${from} → ${to}`;
  const draftPeriodLabel=draftPeriod==='today'?t('recordsToday'):draftPeriod==='week'?t('recordsWeek'):draftPeriod==='month'?t('recordsMonth'):draftPeriod==='all'?t('recordsAllTime'):`${draftFrom} → ${draftTo}`;
  const advancedKind=!primaryKinds.includes(kind);
  const advancedActive=advancedKind||period==='custom'||status!=='posted';

  const openFilters=()=>{
    setDraftKind(kind);
    setDraftStatus(status);
    setDraftPeriod(period);
    setDraftFrom(from);
    setDraftTo(to);
    setFiltersOpen(true);
  };

  const applyFilters=()=>{
    setKind(draftKind);
    setStatus(draftStatus);
    setPeriod(draftPeriod);
    setFrom(draftFrom);
    setTo(draftTo);
    setFiltersOpen(false);
  };

  const resetDraft=()=>{
    setDraftKind('sale');
    setDraftStatus('posted');
    setDraftPeriod('today');
    setDraftFrom(today);
    setDraftTo(today);
  };

  return <Screen padded={false}>
    <FlatList
      data={items}
      keyExtractor={item=>item.id}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.list}
      ListHeaderComponent={<View style={styles.header}>
        <PageHeader title={t('records')} subtitle={format(t('recordsCount'),{count:items.length})}/>
        <SearchField value={search} onChangeText={setSearch} placeholder={t('recordsSearchPlaceholder')}/>

        <View style={styles.controlBlock}>
          <AppText variant="caption" muted>{t('recordsPeriod')}</AppText>
          <SegmentedControl
            value={period}
            options={[
              {value:'today',label:t('recordsToday')},
              {value:'week',label:t('recordsWeek')},
              {value:'month',label:t('recordsMonth')},
              {value:'all',label:t('recordsAllTime')},
            ]}
            onChange={setPeriod}
          />
        </View>

        <View style={styles.controlBlock}>
          <View style={[styles.filterHeading,{flexDirection:isRTL?'row-reverse':'row'}]}>
            <AppText variant="caption" muted style={styles.flex}>{t('recordsTransactionType')}</AppText>
            <Pressable accessibilityRole="button" onPress={openFilters} style={({pressed})=>[styles.filterButton,{flexDirection:isRTL?'row-reverse':'row'},advancedActive&&styles.filterButtonActive,pressed&&styles.pressed]}>
              <FilterGlyph active={advancedActive}/>
              <AppText variant="caption" style={advancedActive?styles.filterTextActive:styles.filterText}>{t('recordsFilters')}</AppText>
              {advancedActive?<View style={styles.filterDot}/>:null}
            </Pressable>
          </View>
          <SegmentedControl
            value={kind}
            options={[
              {value:'',label:t('recordsAllKinds')},
              {value:'sale',label:t('recordKindSale')},
              {value:'purchase',label:t('recordKindPurchase')},
              {value:'expense',label:t('recordKindExpense')},
            ]}
            onChange={setKind}
          />
        </View>

        <View style={[styles.metaRow,{flexDirection:isRTL?'row-reverse':'row'}]}>
          <Badge label={periodLabel} tone={period==='custom'?'primary':'neutral'}/>
          {advancedKind&&kind?<Badge label={t(kindLabels[kind])} tone="primary"/>:null}
          {status==='voided'?<Badge label={t('voided')} tone="negative"/>:status===''?<Badge label={t('recordsAllStatuses')} tone="neutral"/>:null}
        </View>
      </View>}
      ListEmptyComponent={<EmptyState title={search?t('noResults'):t('noData')} description={t('recordsEmptyHint')}/>}
      renderItem={({item,index})=><RecordRow
        item={item}
        accounts={accounts}
        locale={locale}
        first={index===0}
        last={index===items.length-1}
        disabled={openingId!==null}
        onPress={()=>void openDocument(item.id)}
      />}
    />

    <FilterSheet
      visible={filtersOpen}
      title={t('recordsAdvancedFilters')}
      onClose={()=>setFiltersOpen(false)}
      applyLabel={t('recordsApplyFilters')}
      onApply={applyFilters}
      resetLabel={t('recordsResetFilters')}
      onReset={resetDraft}
      applyDisabled={draftPeriod==='custom'&&(!draftFrom||!draftTo)}
    >
      <View style={styles.sheetSection}>
        <AppText variant="subheading">{t('recordsTransactionType')}</AppText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.kindChips,{flexDirection:isRTL?'row-reverse':'row'}]}>
          <Chip label={t('recordsAllKinds')} active={draftKind===''} onPress={()=>setDraftKind('')}/>
          {selectableKinds.map(value=><Chip key={value} label={t(kindLabels[value])} active={draftKind===value} onPress={()=>setDraftKind(value)}/>)}
        </ScrollView>
      </View>

      <View style={styles.sheetSection}>
        <AppText variant="subheading">{t('recordsStatus')}</AppText>
        <SegmentedControl
          value={draftStatus}
          options={[
            {value:'',label:t('recordsAllStatuses')},
            {value:'posted',label:t('posted')},
            {value:'voided',label:t('voided')},
          ]}
          onChange={setDraftStatus}
        />
      </View>

      <View style={styles.sheetSection}>
        <AppText variant="subheading">{t('recordsPeriod')}</AppText>
        <View style={[styles.periodActions,{flexDirection:isRTL?'row-reverse':'row'}]}>
          <View style={styles.periodAction}><Button compact title={t('recordsAllTime')} variant={draftPeriod==='all'?'primary':'secondary'} onPress={()=>setDraftPeriod('all')}/></View>
          <View style={styles.periodAction}><Button compact title={t('recordsCustomPeriod')} variant={draftPeriod==='custom'?'primary':'secondary'} onPress={()=>setDraftPeriod('custom')}/></View>
        </View>
        {draftPeriod==='custom'?<>
          <View style={[styles.dates,{flexDirection:isRTL?'row-reverse':'row'}]}>
            <FormField label={t('from')} value={draftFrom} onChangeText={setDraftFrom} placeholder="YYYY-MM-DD" containerStyle={styles.flex}/>
            <FormField label={t('to')} value={draftTo} onChangeText={setDraftTo} placeholder="YYYY-MM-DD" containerStyle={styles.flex}/>
          </View>
          <AppText variant="caption" muted>{t('recordsDateFormatHint')}</AppText>
        </>:<AppText variant="caption" muted>{draftPeriodLabel}</AppText>}
      </View>
    </FilterSheet>

    {selected?<DocumentModal item={selected} accounts={accounts} onClose={()=>setSelected(null)} onChanged={async()=>{setSelected(null);await load()}}/>:null}
  </Screen>;
}

function RecordRow({item,accounts,locale,first,last,disabled,onPress}:{item:DocumentRecord;accounts:PaymentAccount[];locale:'ar'|'fr';first:boolean;last:boolean;disabled:boolean;onPress:()=>void}){
  const {t,date,isRTL}=useI18n();
  const name=item.partyName??item.title??t(kindLabels[item.kind]);
  const payment=paymentName(item,accounts,t('onCredit'));
  const status=documentStatus(item,t);
  const moment=`${date(item.occurredAt)} • ${timeLabel(item.occurredAt,locale)}`;

  return <Pressable
    accessibilityRole="button"
    disabled={disabled}
    onPress={onPress}
    style={({pressed})=>[styles.row,first&&styles.firstRow,last&&styles.lastRow,{flexDirection:isRTL?'row-reverse':'row'},pressed&&styles.pressed,disabled&&styles.disabled]}
  >
    <View style={styles.rowBody}>
      <View style={[styles.rowTop,{flexDirection:isRTL?'row-reverse':'row'}]}>
        <Badge label={t(kindLabels[item.kind])} tone={kindTone(item.kind)}/>
        <AppText variant="caption" muted numberOfLines={1}>{item.number}</AppText>
      </View>
      <AppText variant="subheading" numberOfLines={1}>{name}</AppText>
      <View style={[styles.rowMeta,{flexDirection:isRTL?'row-reverse':'row'}]}>
        <AppText variant="caption" muted numberOfLines={1}>{moment}</AppText>
        {payment&&item.paymentMethod!=='note'?<AppText variant="caption" muted numberOfLines={1}>• {payment}</AppText>:null}
      </View>
    </View>
    <View style={styles.amountSide}>
      <Money value={item.total}/>
      <Badge label={status.label} tone={status.tone}/>
      <AppText variant="heading" style={styles.arrow}>{isRTL?'‹':'›'}</AppText>
    </View>
  </Pressable>;
}

function DocumentModal({item,accounts,onClose,onChanged}:{item:DocumentRecord;accounts:PaymentAccount[];onClose:()=>void;onChanged:()=>Promise<void>}){
  const db=useSQLiteContext(),{t,date,isRTL,locale,errorMessage}=useI18n(),auth=useAuth();
  const [partyType,setPartyType]=useState<'customer'|'supplier'|null>(null);
  const payment=paymentName(item,accounts,t('onCredit'));
  const status=documentStatus(item,t);

  useEffect(()=>{
    let live=true;
    if(item.kind==='payment'&&item.partyId)void getParty(db,item.partyId).then(party=>{if(live)setPartyType(party?.partyType??null)});
    return()=>{live=false};
  },[db,item.kind,item.partyId]);

  const paymentVoid=partyType==='supplier'?auth.has('suppliers.pay.delete'):partyType==='customer'?auth.has('customers.collect.delete'):false;
  const canEdit=item.status==='posted'&&((item.kind==='sale'&&auth.has('pos.edit'))||(item.kind==='purchase'&&auth.has('purchases.edit'))||(item.kind==='transfer'&&auth.has('warehouses.transfer.edit'))||(item.kind==='adjustment'&&auth.has('warehouses.adjust.edit')));
  const canVoid=item.status==='posted'&&((item.kind==='sale'&&auth.has('pos.delete'))||(item.kind==='purchase'&&auth.has('purchases.delete'))||(item.kind==='expense'&&auth.has('expenses.delete'))||(item.kind==='transfer'&&auth.has('warehouses.transfer.delete'))||(item.kind==='adjustment'&&auth.has('warehouses.adjust.delete'))||(item.kind==='payment'&&paymentVoid)||(item.kind==='account-transfer'&&auth.has('banks.transfer.delete'))||(item.kind==='account-adjustment'&&auth.has('banks.deposit_withdraw.delete')));

  const edit=()=>{
    if(item.kind==='sale'||item.kind==='purchase'){onClose();router.push({pathname:'/sales/edit/[id]',params:{id:item.id,kind:item.kind}})}
    else if(item.kind==='transfer'){onClose();router.push({pathname:'/inventory/transfer',params:{documentId:item.id}})}
    else if(item.kind==='adjustment'){onClose();router.push({pathname:'/inventory/adjustment',params:{documentId:item.id}})}
  };

  const runVoid=()=>Alert.alert(
    t('recordsVoid'),
    t('recordsVoidDescription'),
    [{text:t('cancel'),style:'cancel'},{text:t('confirm'),style:'destructive',onPress:()=>void (async()=>{
      try{
        if(item.kind==='sale'||item.kind==='purchase')await voidInvoice(db,item.kind,item.id);
        else if(item.kind==='expense')await voidExpense(db,item.id);
        else if(item.kind==='payment')await voidPartyCash(db,item.id);
        else if(item.kind==='transfer')await voidStockTransfer(db,item.id);
        else if(item.kind==='adjustment')await voidStockAdjustment(db,item.id);
        else if(item.kind==='account-transfer')await voidAccountTransfer(db,item.id);
        else if(item.kind==='account-adjustment')await voidAccountAdjustment(db,item.id);
        await onChanged();
      }catch(error){Alert.alert(t('error'),errorMessage(error))}
    })()}],
  );

  const print=async()=>{try{await printDocument(db,item,locale)}catch(error){Alert.alert(t('error'),errorMessage(error))}};
  const share=async()=>{try{await shareDocumentPdf(db,item,locale)}catch(error){Alert.alert(t('error'),errorMessage(error))}};

  return <Modal animationType="slide" onRequestClose={onClose}>
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.modal}>
        <PageHeader title={item.number} subtitle={`${date(item.occurredAt)} • ${timeLabel(item.occurredAt,locale)}`} onBack={onClose}/>

        <FramedSection
          title={item.partyName??item.title??t(kindLabels[item.kind])}
          subtitle={item.warehouseName??undefined}
          action={<Badge label={t(kindLabels[item.kind])} tone={kindTone(item.kind)}/>}
        >
          <View style={[styles.documentMeta,{flexDirection:isRTL?'row-reverse':'row'}]}>
            <Badge label={status.label} tone={status.tone}/>
            {payment?<View style={styles.documentMetaCopy}><AppText variant="caption" muted>{t('recordsPaymentMethod')}</AppText><AppText variant="subheading" numberOfLines={1}>{payment}</AppText></View>:null}
          </View>
        </FramedSection>

        <FinancialSummary items={[
          {label:t('total'),value:item.total,emphasize:item.paidTotal===0&&item.dueTotal===0},
          {label:t('paid'),value:item.paidTotal,tone:item.paidTotal>0?'positive':'normal'},
          {label:t('due'),value:item.dueTotal,tone:item.dueTotal>0?'negative':'normal',emphasize:item.dueTotal>0},
        ]}/>

        <FramedSection title={t('recordsDetails')} subtitle={format(t('recordsLinesCount'),{count:item.lines.length})} padded={false}>
          {item.lines.length?item.lines.map((line,index)=><View key={line.id} style={[styles.line,index===item.lines.length-1&&styles.lastLine,{flexDirection:isRTL?'row-reverse':'row'}]}>
            <View style={styles.flex}>
              <AppText variant="subheading" numberOfLines={2}>{line.description}</AppText>
              <AppText variant="caption" muted>{line.quantity} × {line.unitPrice}</AppText>
            </View>
            <Money value={line.lineTotal}/>
          </View>):<EmptyState title={t('noData')}/>}
        </FramedSection>

        <View style={styles.actions}>
          <Button title={t('recordsPrint')} onPress={()=>void print()}/>
          <Button title={t('recordsSharePdf')} variant="secondary" onPress={()=>void share()}/>
          {canEdit?<Button title={t('edit')} variant="secondary" onPress={edit}/>:null}
          {canVoid?<Button title={t('recordsVoid')} variant="danger" onPress={runVoid}/>:null}
        </View>
      </ScrollView>
    </Screen>
  </Modal>;
}

function FilterGlyph({active}:{active:boolean}){
  const color=active?colors.primary:colors.textMuted;
  return <View style={styles.filterGlyph}>
    <View style={[styles.filterLine,{top:2,backgroundColor:color}]}/><View style={[styles.filterKnob,{top:0,left:5,borderColor:color}]}/>
    <View style={[styles.filterLine,{top:9,backgroundColor:color}]}/><View style={[styles.filterKnob,{top:7,right:4,borderColor:color}]}/>
    <View style={[styles.filterLine,{top:16,backgroundColor:color}]}/><View style={[styles.filterKnob,{top:14,left:8,borderColor:color}]}/>
  </View>;
}

const styles=StyleSheet.create({
  list:{paddingHorizontal:spacing.md,paddingBottom:spacing.xxl,backgroundColor:colors.background},
  header:{gap:spacing.sm,marginBottom:spacing.sm},
  controlBlock:{gap:spacing.xs},
  filterHeading:{minHeight:32,alignItems:'center',gap:spacing.sm},
  filterButton:{minHeight:36,alignItems:'center',gap:spacing.xs,paddingHorizontal:spacing.sm,borderRadius:radius.md,borderWidth:1,borderColor:colors.borderStrong,backgroundColor:colors.surface},
  filterButtonActive:{borderColor:colors.primary,backgroundColor:colors.primaryFaint},
  filterText:{color:colors.textMuted},
  filterTextActive:{color:colors.primary,fontWeight:'700'},
  filterDot:{width:6,height:6,borderRadius:3,backgroundColor:colors.primary},
  filterGlyph:{width:22,height:20,position:'relative'},
  filterLine:{position:'absolute',left:1,right:1,height:2,borderRadius:2},
  filterKnob:{position:'absolute',width:6,height:6,borderRadius:3,borderWidth:2,backgroundColor:colors.surface},
  metaRow:{minHeight:30,alignItems:'center',gap:spacing.xs,flexWrap:'wrap'},
  row:{minHeight:76,alignItems:'center',gap:spacing.sm,paddingHorizontal:spacing.sm,paddingVertical:spacing.xs,backgroundColor:colors.surface,borderLeftWidth:1,borderRightWidth:1,borderTopWidth:1,borderColor:colors.border},
  firstRow:{borderTopColor:colors.borderStrong,borderLeftColor:colors.borderStrong,borderRightColor:colors.borderStrong,borderTopLeftRadius:radius.lg,borderTopRightRadius:radius.lg},
  lastRow:{borderBottomWidth:1,borderBottomColor:colors.borderStrong,borderBottomLeftRadius:radius.lg,borderBottomRightRadius:radius.lg},
  rowBody:{flex:1,minWidth:0,gap:3},
  rowTop:{alignItems:'center',gap:spacing.xs},
  rowMeta:{alignItems:'center',gap:4,flexWrap:'wrap'},
  amountSide:{minWidth:92,alignItems:'flex-end',justifyContent:'center',gap:4},
  arrow:{color:colors.textSoft,lineHeight:18},
  pressed:{backgroundColor:colors.surfaceMuted},
  disabled:{opacity:.55},
  flex:{flex:1,minWidth:0,gap:spacing.xs},
  sheetSection:{gap:spacing.sm},
  kindChips:{gap:spacing.xs,paddingVertical:2},
  periodActions:{gap:spacing.sm},
  periodAction:{flex:1,minWidth:0},
  dates:{gap:spacing.sm},
  modal:{paddingHorizontal:spacing.md,gap:spacing.sm,paddingBottom:spacing.xxl,backgroundColor:colors.background},
  documentMeta:{alignItems:'center',gap:spacing.md,flexWrap:'wrap'},
  documentMetaCopy:{flex:1,minWidth:120,gap:2},
  line:{minHeight:58,alignItems:'center',gap:spacing.md,paddingHorizontal:spacing.sm,paddingVertical:spacing.xs,borderBottomWidth:1,borderBottomColor:colors.border},
  lastLine:{borderBottomWidth:0},
  actions:{gap:spacing.xs,paddingTop:spacing.xs},
});
