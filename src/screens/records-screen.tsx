import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type { DocumentRecord } from '@/domain/types';
import { getDocumentById, listDocumentHeaders } from '@/db/document-queries';
import { getParty } from '@/db/queries';
import { voidExpense, voidInvoice } from '@/services/document-revision-service';
import { printDocument, shareDocumentPdf } from '@/services/document-sharing-service';
import { voidAccountAdjustment, voidAccountTransfer, voidPartyCash, voidStockAdjustment, voidStockTransfer } from '@/services/transaction-lifecycle-service';
import { AppText, Badge, Button, Chip, EmptyState, Field, GroupedList, Money, PageHeader, Screen, SearchField, SectionTitle, Surface } from '@/components/ui';
import { Sheet } from '@/components/mobile-interactions';
import { useI18n } from '@/i18n/provider';
import type { MessageKey } from '@/i18n/messages';
import { useAuth } from '@/auth/provider';
import { colors, radius, spacing } from '@/theme';

const kindLabels:Record<DocumentRecord['kind'],MessageKey>={
  sale:'recordKindSale',purchase:'recordKindPurchase',return:'recordKindReturn',transfer:'recordKindTransfer',adjustment:'recordKindAdjustment',expense:'recordKindExpense',
  payment:'recordKindPayment',offset:'recordKindOffset',settlement:'recordKindSettlement','account-transfer':'recordKindAccountTransfer','account-adjustment':'recordKindAccountAdjustment',
};
const selectableKinds:DocumentRecord['kind'][]=['sale','purchase','expense','payment','transfer','adjustment','account-transfer','account-adjustment','offset','settlement'];
type Period='today'|'all'|'custom';

function localDay(){const value=new Date(),y=value.getFullYear(),m=String(value.getMonth()+1).padStart(2,'0'),d=String(value.getDate()).padStart(2,'0');return `${y}-${m}-${d}`}
const format=(template:string,values:Record<string,string|number>)=>Object.entries(values).reduce((output,[key,value])=>output.replaceAll('{'+key+'}',String(value)),template);

export function RecordsScreen(){
  const db=useSQLiteContext(),{t,isRTL,errorMessage}=useI18n(),auth=useAuth(),today=localDay(),params=useLocalSearchParams<{documentId?:string}>(),deepDocumentId=typeof params.documentId==='string'?params.documentId:'';
  const [items,setItems]=useState<DocumentRecord[]>([]),[search,setSearch]=useState(''),[kind,setKind]=useState<DocumentRecord['kind']|''>('sale');
  const [period,setPeriod]=useState<Period>('today'),[from,setFrom]=useState(today),[to,setTo]=useState(today),[dateSheet,setDateSheet]=useState(false);
  const [selected,setSelected]=useState<DocumentRecord|null>(null),[openingId,setOpeningId]=useState<string|null>(null);
  const deepOpenedId=useRef('');

  const load=useCallback(async()=>{
    if(!auth.has('records.view'))return;
    const rows=await listDocumentHeaders(db,{
      search,
      kind:kind||undefined,
      from:period==='today'?today:period==='custom'?from||undefined:undefined,
      to:period==='today'?today:period==='custom'?to||undefined:undefined,
      status:'posted',
      limit:200,
    });
    setItems(rows);
  },[auth,db,from,kind,period,search,to,today]);

  useFocusEffect(useCallback(()=>{void load()},[load]));

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

  const periodLabel=period==='today'?t('recordsToday'):period==='all'?t('recordsAllTime'):`${from} → ${to}`;

  return <Screen padded={false}>
    <FlatList
      data={items}
      keyExtractor={item=>item.id}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.list}
      ListHeaderComponent={<View style={styles.header}>
        <PageHeader title={t('records')}/>
        <SearchField value={search} onChangeText={setSearch} placeholder={t('recordsSearchPlaceholder')}/>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.kinds,{flexDirection:isRTL?'row-reverse':'row'}]}>
          <Chip label={t('recordsAllKinds')} active={kind===''} onPress={()=>setKind('')}/>
          {selectableKinds.map(value=><Chip key={value} label={t(kindLabels[value])} active={kind===value} onPress={()=>setKind(value)}/>)}
        </ScrollView>

        <Surface style={styles.periodSurface}>
          <View style={[styles.periodRow,{flexDirection:isRTL?'row-reverse':'row'}]}>
            <Chip label={t('recordsToday')} active={period==='today'} onPress={()=>setPeriod('today')}/>
            <Chip label={t('recordsAllTime')} active={period==='all'} onPress={()=>setPeriod('all')}/>
            <Button compact title={t('recordsCustomPeriod')} variant={period==='custom'?'secondary':'ghost'} onPress={()=>setDateSheet(true)}/>
          </View>
          <View style={[styles.periodSummary,{flexDirection:isRTL?'row-reverse':'row'}]}>
            <View style={styles.flex}><AppText variant="caption" muted>{t('recordsActivePeriod')}</AppText><AppText variant="subheading">{periodLabel}</AppText></View>
            <Badge label={format(t('recordsCount'),{count:items.length})} tone="primary"/>
          </View>
        </Surface>
      </View>}
      ListEmptyComponent={<EmptyState title={search?t('noResults'):t('noData')} description={t('recordsEmptyHint')}/>}
      renderItem={({item,index})=><RecordRow item={item} first={index===0} last={index===items.length-1} disabled={openingId!==null} onPress={()=>void openDocument(item.id)}/>}
    />

    <Sheet visible={dateSheet} title={t('recordsCustomPeriod')} onClose={()=>setDateSheet(false)} footer={<><Button title={t('confirm')} disabled={!from||!to} onPress={()=>{setPeriod('custom');setDateSheet(false)}}/><Button title={t('cancel')} variant="ghost" onPress={()=>setDateSheet(false)}/></>}>
      <View style={[styles.dates,{flexDirection:isRTL?'row-reverse':'row'}]}><Field label={t('from')} value={from} onChangeText={setFrom} placeholder="YYYY-MM-DD" containerStyle={styles.flex}/><Field label={t('to')} value={to} onChangeText={setTo} placeholder="YYYY-MM-DD" containerStyle={styles.flex}/></View>
      <AppText variant="caption" muted>{t('recordsDateFormatHint')}</AppText>
    </Sheet>

    {selected?<DocumentModal item={selected} onClose={()=>setSelected(null)} onChanged={async()=>{setSelected(null);await load()}}/>:null}
  </Screen>;
}

function RecordRow({item,first,last,disabled,onPress}:{item:DocumentRecord;first:boolean;last:boolean;disabled:boolean;onPress:()=>void}){
  const {t,date,isRTL,money}=useI18n();
  const name=item.partyName??item.title??item.number;
  const kindTone=item.kind==='sale'?'positive':item.kind==='expense'?'negative':item.kind==='purchase'?'warning':'neutral';
  return <Pressable
    accessibilityRole="button"
    disabled={disabled}
    onPress={onPress}
    style={({pressed})=>[styles.row,first&&styles.firstRow,last&&styles.lastRow,{flexDirection:isRTL?'row-reverse':'row'},pressed&&styles.pressed,disabled&&styles.disabled]}
  >
    <View style={styles.body}>
      <View style={[styles.titleLine,{flexDirection:isRTL?'row-reverse':'row'}]}><Badge label={t(kindLabels[item.kind])} tone={kindTone}/>{item.dueTotal>0?<Badge label={format(t('recordsDue'),{value:money(item.dueTotal)})} tone="negative"/>:null}</View>
      <AppText variant="subheading" numberOfLines={1}>{name}</AppText>
      <AppText variant="caption" muted>{item.number} • {date(item.occurredAt)}</AppText>
    </View>
    <View style={styles.trailing}><Money value={item.total}/><AppText variant="heading" style={styles.arrow}>{isRTL?'‹':'›'}</AppText></View>
  </Pressable>;
}

function DocumentModal({item,onClose,onChanged}:{item:DocumentRecord;onClose:()=>void;onChanged:()=>Promise<void>}){
  const db=useSQLiteContext(),{t,date,isRTL,locale,errorMessage}=useI18n(),auth=useAuth();
  const summary=useMemo(()=>[[t('total'),item.total,'normal'],[t('paid'),item.paidTotal,'positive'],[t('due'),item.dueTotal,item.dueTotal>0?'negative':'normal']] as const,[item,t]);
  const [partyType,setPartyType]=useState<'customer'|'supplier'|null>(null);

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
        <PageHeader title={item.number} subtitle={date(item.occurredAt)} onBack={onClose}/>

        <Surface style={styles.detailPanel}>
          <View style={[styles.detailTitle,{flexDirection:isRTL?'row-reverse':'row'}]}>
            <View style={styles.flex}><Badge label={t(kindLabels[item.kind])} tone={item.kind==='sale'?'positive':item.kind==='expense'?'negative':item.kind==='purchase'?'warning':'neutral'}/><AppText variant="heading">{item.partyName??item.title??t(kindLabels[item.kind])}</AppText>{item.warehouseName?<AppText variant="caption" muted>{item.warehouseName}</AppText>:null}</View>
            <Money value={item.total} large/>
          </View>
          <View style={[styles.summaryStrip,{flexDirection:isRTL?'row-reverse':'row'}]}>{summary.map(([label,value,tone],index)=><View key={label} style={[styles.summaryCell,index===summary.length-1&&styles.lastSummary]}><AppText variant="caption" muted>{label}</AppText><Money value={value} tone={tone}/></View>)}</View>
        </Surface>

        <SectionTitle title={t('recordsDetails')} subtitle={format(t('recordsLinesCount'),{count:item.lines.length})}/>
        <GroupedList>{item.lines.length?item.lines.map((line,index)=><View key={line.id} style={[styles.line,index===item.lines.length-1&&styles.lastLine,{flexDirection:isRTL?'row-reverse':'row'}]}><View style={styles.flex}><AppText variant="subheading" numberOfLines={2}>{line.description}</AppText><AppText variant="caption" muted>{line.quantity} × {line.unitPrice}</AppText></View><Money value={line.lineTotal}/></View>):<EmptyState title={t('noData')}/>}</GroupedList>

        <View style={styles.actions}><Button title={t('recordsPrint')} onPress={()=>void print()}/><Button title={t('recordsSharePdf')} variant="secondary" onPress={()=>void share()}/>{canEdit?<Button title={t('edit')} variant="secondary" onPress={edit}/>:null}{canVoid?<Button title={t('recordsVoid')} variant="danger" onPress={runVoid}/>:null}</View>
      </ScrollView>
    </Screen>
  </Modal>;
}

const styles=StyleSheet.create({
  list:{paddingHorizontal:spacing.md,paddingBottom:spacing.xxl,backgroundColor:colors.background},
  header:{gap:spacing.sm,marginBottom:spacing.sm},
  kinds:{gap:spacing.xs},
  periodSurface:{gap:spacing.sm},
  periodRow:{alignItems:'center',gap:spacing.xs,flexWrap:'wrap'},
  periodSummary:{alignItems:'center',gap:spacing.sm,borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:colors.border,paddingTop:spacing.sm},
  row:{minHeight:78,alignItems:'center',gap:spacing.sm,paddingHorizontal:spacing.md,paddingVertical:spacing.sm,backgroundColor:colors.surface,borderLeftWidth:1,borderRightWidth:1,borderTopWidth:StyleSheet.hairlineWidth,borderColor:colors.border},
  firstRow:{borderTopWidth:1,borderTopLeftRadius:radius.lg,borderTopRightRadius:radius.lg},
  lastRow:{borderBottomWidth:1,borderBottomLeftRadius:radius.lg,borderBottomRightRadius:radius.lg},
  body:{flex:1,minWidth:0,gap:4},
  titleLine:{alignItems:'center',gap:spacing.xs,flexWrap:'wrap'},
  trailing:{alignItems:'flex-end',gap:spacing.xs},
  arrow:{color:colors.textSoft,lineHeight:20},
  pressed:{backgroundColor:colors.surfaceMuted},
  disabled:{opacity:.55},
  dates:{gap:spacing.sm},
  flex:{flex:1,minWidth:0,gap:spacing.xs},
  modal:{paddingHorizontal:spacing.md,gap:spacing.md,paddingBottom:spacing.xxl,backgroundColor:colors.background},
  detailPanel:{padding:0,overflow:'hidden'},
  detailTitle:{alignItems:'center',gap:spacing.md,padding:spacing.md},
  summaryStrip:{borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:colors.border},
  summaryCell:{flex:1,padding:spacing.md,gap:spacing.xs,borderRightWidth:StyleSheet.hairlineWidth,borderRightColor:colors.border},
  lastSummary:{borderRightWidth:0},
  line:{minHeight:62,alignItems:'center',gap:spacing.md,paddingHorizontal:spacing.md,paddingVertical:spacing.sm,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border},
  lastLine:{borderBottomWidth:0},
  actions:{gap:spacing.sm,paddingTop:spacing.sm},
});
