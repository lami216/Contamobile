import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type { Product, Warehouse } from '@/domain/types';
import { listProducts, listWarehouses } from '@/db/queries';
import { archiveProduct, createProduct } from '@/services/accounting-service';
import { updateProduct } from '@/services/management-service';
import { AppText, Badge, Button, Chip, EmptyState, Field, Money, Screen, SearchField, SectionTitle } from '@/components/ui';
import { useI18n } from '@/i18n/provider';
import { useAuth } from '@/auth/provider';
import { colors, radius, spacing } from '@/theme';

const num=(value:string)=>value.trim()===''?null:Number(value);
const stockOf=(item:Product)=>Object.values(item.stocks??{}).reduce((a,b)=>a+b,0);
function expiryTone(value:string|null){if(!value)return null;const today=new Date();today.setHours(0,0,0,0);const target=new Date(`${value}T00:00:00`);const days=Math.ceil((target.getTime()-today.getTime())/86400000);if(days<0)return'expired' as const;if(days<=30)return'soon' as const;return null}

export function ProductsScreen(){
  const db=useSQLiteContext(),{t,number,locale,isRTL,errorMessage}=useI18n(),auth=useAuth(),ar=locale==='ar';
  const [items,setItems]=useState<Product[]>([]),[warehouses,setWarehouses]=useState<Warehouse[]>([]),[search,setSearch]=useState(''),[showArchived,setShowArchived]=useState(false),[editing,setEditing]=useState<Product|null|undefined>(undefined),[busy,setBusy]=useState(false);
  const load=useCallback(async()=>{if(!auth.has('products.view'))return;const [all,wh]=await Promise.all([listProducts(db,search,undefined,showArchived,150),listWarehouses(db)]);setItems(showArchived?all.filter(item=>item.isArchived):all);setWarehouses(wh)},[auth,db,search,showArchived]);
  useFocusEffect(useCallback(()=>{void load()},[load]));
  const summary=useMemo(()=>items.reduce((acc,item)=>{const qty=stockOf(item);acc.stock+=qty;if(!item.isArchived&&qty<=5)acc.low+=1;const expiry=expiryTone(item.expiryDate);if(expiry==='expired'||expiry==='soon')acc.expiry+=1;return acc},{stock:0,low:0,expiry:0}),[items]);
  if(!auth.has('products.view'))return <Screen><EmptyState title={ar?'ليس لديك صلاحية عرض المنتجات':'Vous n’avez pas accès aux produits.'}/></Screen>;
  const canCreate=auth.has('products.create'),canEdit=auth.has('products.edit'),canDelete=auth.has('products.delete');
  const restore=async(item:Product)=>{try{if(!canEdit)throw new Error(ar?'ليس لديك صلاحية استعادة المنتجات':'Vous n’avez pas le droit de restaurer les produits.');await archiveProduct(db,item.id,true);await load()}catch(error){Alert.alert(t('error'),errorMessage(error))}};
  return <Screen padded={false}><FlatList data={items} keyExtractor={item=>item.id} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.list} ListHeaderComponent={<View style={styles.header}>
    <SectionTitle title={t('products')} subtitle={ar?'ابحث بسرعة، راقب المخزون والصلاحية، وافتح التعديل فقط عند الحاجة.':'Recherchez vite, surveillez stock et péremption, modifiez seulement si nécessaire.'} action={canCreate&&!showArchived?<Button compact title={t('add')} onPress={()=>setEditing(null)}/>:undefined}/>
    <View style={[styles.filters,{flexDirection:isRTL?'row-reverse':'row'}]}><Chip label={ar?'النشطة':'Actifs'} active={!showArchived} onPress={()=>setShowArchived(false)}/><Chip label={ar?'المؤرشفة':'Archivés'} active={showArchived} onPress={()=>setShowArchived(true)}/></View>
    {!showArchived?<View style={[styles.summaryPanel,{flexDirection:isRTL?'row-reverse':'row'}]}><MiniMetric label={ar?'الكمية الكلية':'Quantité totale'} value={number(summary.stock)}/><MiniMetric label={t('lowStock')} value={number(summary.low)} tone={summary.low>0?'warning':'normal'}/><MiniMetric label={ar?'صلاحية تحتاج انتباه':'Péremption à surveiller'} value={number(summary.expiry)} tone={summary.expiry>0?'warning':'normal'} last/></View>:null}
    <SearchField value={search} onChangeText={setSearch} placeholder={ar?'اسم المنتج، SKU أو الباركود…':'Nom, SKU ou code-barres…'}/>
  </View>} ListEmptyComponent={<EmptyState title={search?t('noResults'):t('noData')} description={!search&&!showArchived&&canCreate?(ar?'أضف أول منتج ليظهر في البيع والمخزون.':'Ajoutez le premier produit pour la vente et le stock.'):undefined}/>} renderItem={({item})=>{
    const qty=stockOf(item),expiry=expiryTone(item.expiryDate);
    return <Pressable accessibilityRole={item.isArchived||!canEdit?undefined:'button'} disabled={item.isArchived||!canEdit} onPress={()=>setEditing(item)} style={({pressed})=>[styles.row,{flexDirection:isRTL?'row-reverse':'row'},pressed&&styles.pressed]}><View style={styles.body}><View style={[styles.nameRow,{flexDirection:isRTL?'row-reverse':'row'}]}><AppText variant="subheading" numberOfLines={1} style={styles.name}>{item.name}</AppText>{item.isArchived?<Badge label={ar?'مؤرشف':'Archivé'} tone="neutral"/>:qty<=5?<Badge label={t('lowStock')} tone="warning"/>:null}{expiry==='expired'?<Badge label={ar?'منتهي':'Expiré'} tone="negative"/>:expiry==='soon'?<Badge label={ar?'قريب الانتهاء':'Bientôt expiré'} tone="warning"/>:null}</View><AppText variant="caption" muted>{item.sku}{item.barcode?` • ${item.barcode}`:''}</AppText><View style={[styles.meta,{flexDirection:isRTL?'row-reverse':'row'}]}><AppText variant="caption" muted>{t('quantity')}: {number(qty)}</AppText>{item.expiryDate?<AppText variant="caption" muted>{t('expiryDate')}: {item.expiryDate}</AppText>:null}</View></View><View style={styles.trailing}>{item.isArchived?(canEdit?<Button compact title={t('restore')} variant="secondary" onPress={()=>void restore(item)}/>:null):<><AppText variant="caption" muted>{t('salePrice')}</AppText><Money value={item.piecePrice??0}/>{canEdit?<AppText variant="heading" style={styles.arrow}>{isRTL?'‹':'›'}</AppText>:null}</>}</View></Pressable>;
  }}/>{editing!==undefined&&!showArchived?<ProductEditor product={editing} warehouses={warehouses} busy={busy} onClose={()=>setEditing(undefined)} onSave={async input=>{setBusy(true);try{if(editing){if(!canEdit)throw new Error(ar?'ليس لديك صلاحية تعديل المنتجات':'Vous n’avez pas le droit de modifier les produits.');await updateProduct(db,editing.id,input)}else{if(!canCreate)throw new Error(ar?'ليس لديك صلاحية إنشاء المنتجات':'Vous n’avez pas le droit de créer des produits.');await createProduct(db,input)}setEditing(undefined);await load()}catch(error){Alert.alert(t('error'),errorMessage(error))}finally{setBusy(false)}}} onArchive={editing&&canDelete?()=>Alert.alert(ar?'أرشفة المنتج':'Archiver le produit',editing.name,[{text:t('cancel'),style:'cancel'},{text:t('confirm'),style:'destructive',onPress:()=>void (async()=>{try{await archiveProduct(db,editing.id);setEditing(undefined);await load()}catch(error){Alert.alert(t('error'),errorMessage(error))}})()}]):undefined}/>:null}</Screen>;
}

function MiniMetric({label,value,tone='normal',last=false}:{label:string;value:string;tone?:'normal'|'warning';last?:boolean}){return <View style={[styles.miniMetric,last&&styles.lastMetric]}><View style={[styles.metricRule,tone==='warning'&&styles.metricRuleWarning]}/><AppText variant="caption" muted>{label}</AppText><AppText variant="heading" style={tone==='warning'?styles.warning:undefined}>{value}</AppText></View>}

type Form={name:string;barcode:string;pieceCost:string;piecePrice:string;wholesalePrice:string;expiryDate:string;note:string;openingStock:string;openingWarehouseId:string};
function ProductEditor({product,warehouses,busy,onClose,onSave,onArchive}:{product:Product|null;warehouses:Warehouse[];busy:boolean;onClose:()=>void;onSave:(input:{name:string;barcode:string;pieceCost:number|null;piecePrice:number|null;wholesalePrice:number|null;expiryDate:string|null;note:string|null;openingStock?:number;openingWarehouseId?:string})=>Promise<void>;onArchive?:()=>void}){
  const {t,isRTL,locale}=useI18n(),ar=locale==='ar';
  const [form,setForm]=useState<Form>({name:product?.name??'',barcode:product?.barcode??'',pieceCost:String(product?.pieceCost??''),piecePrice:String(product?.piecePrice??''),wholesalePrice:String(product?.wholesalePrice??''),expiryDate:product?.expiryDate??'',note:product?.note??'',openingStock:'0',openingWarehouseId:warehouses.find(w=>w.isSalesDefault)?.id??warehouses[0]?.id??''});
  const set=(key:keyof Form)=>(value:string)=>setForm(current=>({...current,[key]:value}));
  return <Modal animationType="slide" onRequestClose={onClose}><Screen padded={false}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modal}>
    <SectionTitle title={product?product.name:t('createProduct')} subtitle={product?(ar?'عدّل البيانات التي يحتاجها البيع والمخزون فقط.':'Modifiez uniquement les données utiles à la vente et au stock.'):(ar?'ابدأ بالاسم والسعر؛ بقية الحقول اختيارية حسب المنتج.':'Commencez par le nom et le prix ; le reste est optionnel.')}/>
    <View style={styles.formPanel}>
      <FormSection title={ar?'هوية المنتج':'Identité'}><Field label={t('name')} value={form.name} onChangeText={set('name')} autoFocus={!product}/><Field label={t('barcode')} value={form.barcode} onChangeText={set('barcode')} autoCapitalize="none"/></FormSection>
      <FormSection title={ar?'الأسعار':'Prix'}><View style={[styles.pair,{flexDirection:isRTL?'row-reverse':'row'}]}><Field label={t('purchasePrice')} value={form.pieceCost} onChangeText={set('pieceCost')} keyboardType="number-pad" containerStyle={styles.flex}/><Field label={t('salePrice')} value={form.piecePrice} onChangeText={set('piecePrice')} keyboardType="number-pad" containerStyle={styles.flex}/></View><Field label={t('wholesalePrice')} value={form.wholesalePrice} onChangeText={set('wholesalePrice')} keyboardType="number-pad"/></FormSection>
      <FormSection title={ar?'تفاصيل إضافية':'Détails supplémentaires'}><Field label={t('expiryDate')} value={form.expiryDate} onChangeText={set('expiryDate')} placeholder="YYYY-MM-DD"/><Field label={t('note')} value={form.note} onChangeText={set('note')} multiline numberOfLines={3}/></FormSection>
      {!product?<FormSection title={t('openingBalance')} subtitle={ar?'اختياري: أدخل الكمية الموجودة حاليًا إذا كنت تبدأ بمنتج قديم.':'Optionnel : saisissez le stock existant pour un produit déjà en magasin.'} last><Field label={t('quantity')} value={form.openingStock} onChangeText={set('openingStock')} keyboardType="decimal-pad"/><View style={[styles.chips,{flexDirection:isRTL?'row-reverse':'row'}]}>{warehouses.map(w=><Chip key={w.id} label={w.name} active={form.openingWarehouseId===w.id} onPress={()=>set('openingWarehouseId')(w.id)}/>)}</View></FormSection>:null}
    </View>
    <Button loading={busy} disabled={!form.name.trim()} title={t('save')} onPress={()=>void onSave({name:form.name,barcode:form.barcode,pieceCost:num(form.pieceCost),piecePrice:num(form.piecePrice),wholesalePrice:num(form.wholesalePrice),expiryDate:form.expiryDate||null,note:form.note||null,...(!product?{openingStock:Number(form.openingStock||0),openingWarehouseId:form.openingWarehouseId}: {})})}/>{onArchive?<Button title={ar?'أرشفة المنتج':'Archiver le produit'} variant="danger" onPress={onArchive}/>:null}<Button title={t('cancel')} variant="ghost" disabled={busy} onPress={onClose}/>
  </ScrollView></Screen></Modal>;
}

function FormSection({title,subtitle,children,last=false}:{title:string;subtitle?:string;children:ReactNode;last?:boolean}){return <View style={[styles.formSection,last&&styles.formSectionLast]}><SectionTitle title={title} subtitle={subtitle}/>{children}</View>}

const styles=StyleSheet.create({
  list:{padding:spacing.md,paddingBottom:spacing.xxl,backgroundColor:colors.background},
  header:{gap:spacing.md,marginBottom:spacing.sm},
  filters:{gap:spacing.xs,flexWrap:'wrap'},
  summaryPanel:{backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,overflow:'hidden'},
  miniMetric:{flex:1,minWidth:104,padding:spacing.md,gap:spacing.xs,borderRightWidth:StyleSheet.hairlineWidth,borderRightColor:colors.border},
  lastMetric:{borderRightWidth:0},
  metricRule:{width:24,height:2,borderRadius:2,backgroundColor:colors.accent},
  metricRuleWarning:{backgroundColor:colors.warning},
  warning:{color:colors.warning},
  row:{minHeight:98,alignItems:'center',gap:spacing.md,paddingVertical:spacing.md,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border},
  body:{flex:1,gap:spacing.xs},
  nameRow:{alignItems:'center',gap:spacing.xs,flexWrap:'wrap'},
  name:{flexShrink:1},
  meta:{alignItems:'center',gap:spacing.sm,flexWrap:'wrap'},
  trailing:{alignItems:'flex-end',gap:spacing.xxs,minWidth:92},
  arrow:{color:colors.textSoft,lineHeight:20},
  pressed:{backgroundColor:colors.surfaceMuted},
  modal:{padding:spacing.md,gap:spacing.md,paddingBottom:spacing.xxl,backgroundColor:colors.background},
  formPanel:{backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,overflow:'hidden'},
  formSection:{padding:spacing.md,gap:spacing.md,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border},
  formSectionLast:{borderBottomWidth:0,backgroundColor:colors.primaryFaint},
  pair:{gap:spacing.sm},
  flex:{flex:1},
  chips:{flexWrap:'wrap',gap:spacing.xs},
});
