import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type { Product, ProductCategory, Warehouse } from '@/domain/types';
import { listProductCategories, listProducts, listWarehouses } from '@/db/queries';
import { archiveProduct, createProduct } from '@/services/accounting-service';
import { createProductCategory, deleteProductCategory, renameProductCategory, updateProduct } from '@/services/management-service';
import { AppText, Badge, Button, Chip, EmptyState, Field, Money, Screen, SearchField, SectionTitle } from '@/components/ui';
import { Sheet } from '@/components/mobile-interactions';
import { useI18n } from '@/i18n/provider';
import { useAuth } from '@/auth/provider';
import { colors, radius, spacing } from '@/theme';

const num=(value:string)=>value.trim()===''?null:Number(value);
const stockOf=(item:Product)=>Object.values(item.stocks??{}).reduce((a,b)=>a+b,0);
function expiryTone(value:string|null){if(!value)return null;const today=new Date();today.setHours(0,0,0,0);const target=new Date(`${value}T00:00:00`);const days=Math.ceil((target.getTime()-today.getTime())/86400000);if(days<0)return'expired' as const;if(days<=30)return'soon' as const;return null}

export function ProductsScreen(){
  const db=useSQLiteContext(),{t,number,locale,isRTL,errorMessage}=useI18n(),auth=useAuth(),ar=locale==='ar';
  const [items,setItems]=useState<Product[]>([]),[warehouses,setWarehouses]=useState<Warehouse[]>([]),[categories,setCategories]=useState<ProductCategory[]>([]),[categoryId,setCategoryId]=useState(''),[search,setSearch]=useState(''),[showArchived,setShowArchived]=useState(false),[viewing,setViewing]=useState<Product|undefined>(undefined),[editing,setEditing]=useState<Product|null|undefined>(undefined),[busy,setBusy]=useState(false);
  const [categoryManager,setCategoryManager]=useState(false),[categoryDraft,setCategoryDraft]=useState(''),[categoryEditing,setCategoryEditing]=useState<ProductCategory|null>(null);
  const load=useCallback(async()=>{if(!auth.has('products.view'))return;const [all,wh,cats]=await Promise.all([listProducts(db,search,undefined,showArchived,150,0,categoryId),listWarehouses(db),listProductCategories(db)]);setItems(showArchived?all.filter(item=>item.isArchived):all);setWarehouses(wh);setCategories(cats);if(categoryId&&!cats.some(category=>category.id===categoryId))setCategoryId('')},[auth,categoryId,db,search,showArchived]);
  useFocusEffect(useCallback(()=>{void load()},[load]));
  const summary=useMemo(()=>items.reduce((acc,item)=>{const qty=stockOf(item);acc.stock+=qty;if(!item.isArchived&&qty<=5)acc.low+=1;const expiry=expiryTone(item.expiryDate);if(expiry==='expired'||expiry==='soon')acc.expiry+=1;return acc},{stock:0,low:0,expiry:0}),[items]);
  if(!auth.has('products.view'))return <Screen><EmptyState title={ar?'ليس لديك صلاحية عرض المنتجات':'Vous n’avez pas accès aux produits.'}/></Screen>;
  const canCreate=auth.has('products.create'),canEdit=auth.has('products.edit'),canDelete=auth.has('products.delete');
  const restore=async(item:Product)=>{try{if(!canEdit)throw new Error(ar?'ليس لديك صلاحية استعادة المنتجات':'Vous n’avez pas le droit de restaurer les produits.');await archiveProduct(db,item.id,true);await load()}catch(error){Alert.alert(t('error'),errorMessage(error))}};
  const saveCategory=async()=>{if(!categoryDraft.trim()||busy)return;setBusy(true);try{if(categoryEditing)await renameProductCategory(db,categoryEditing.id,categoryDraft);else await createProductCategory(db,categoryDraft);setCategoryDraft('');setCategoryEditing(null);await load()}catch(error){Alert.alert(t('error'),errorMessage(error))}finally{setBusy(false)}};
  const removeCategory=(category:ProductCategory)=>Alert.alert(ar?'حذف الفئة':'Supprimer la catégorie',ar?`سيتم حذف «${category.name}» فقط، وتبقى المنتجات بدون فئة.`:`« ${category.name} » sera supprimée, les produits resteront sans catégorie.`,[{text:t('cancel'),style:'cancel'},{text:t('confirm'),style:'destructive',onPress:()=>void(async()=>{setBusy(true);try{await deleteProductCategory(db,category.id);if(categoryId===category.id)setCategoryId('');if(categoryEditing?.id===category.id){setCategoryEditing(null);setCategoryDraft('')}await load()}catch(error){Alert.alert(t('error'),errorMessage(error))}finally{setBusy(false)}})()}]);
  return <Screen padded={false}><FlatList data={items} keyExtractor={item=>item.id} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.list} ListHeaderComponent={<View style={styles.header}>
    <SectionTitle title={t('products')} subtitle={ar?'ابحث بسرعة، راقب المخزون والصلاحية، ونظّم المنتجات بالفئات.':'Recherchez vite, surveillez stock et péremption, et organisez les produits par catégories.'} action={canCreate&&!showArchived?<Button compact title={t('add')} onPress={()=>setEditing(null)}/>:undefined}/>
    <View style={[styles.filters,{flexDirection:isRTL?'row-reverse':'row'}]}><Chip label={ar?'النشطة':'Actifs'} active={!showArchived} onPress={()=>setShowArchived(false)}/><Chip label={ar?'المؤرشفة':'Archivés'} active={showArchived} onPress={()=>setShowArchived(true)}/>{canEdit?<Button compact title={ar?'إدارة الفئات':'Catégories'} variant="ghost" onPress={()=>setCategoryManager(true)}/>:null}</View>
    {!showArchived?<View style={[styles.summaryPanel,{flexDirection:isRTL?'row-reverse':'row'}]}><MiniMetric label={ar?'الكمية الكلية':'Quantité totale'} value={number(summary.stock)}/><MiniMetric label={t('lowStock')} value={number(summary.low)} tone={summary.low>0?'warning':'normal'}/><MiniMetric label={ar?'صلاحية تحتاج انتباه':'Péremption à surveiller'} value={number(summary.expiry)} tone={summary.expiry>0?'warning':'normal'} last/></View>:null}
    {categories.length?<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.filters,{flexDirection:isRTL?'row-reverse':'row'}]}><Chip label={ar?'كل الفئات':'Toutes'} active={!categoryId} onPress={()=>setCategoryId('')}/>{categories.map(category=><Chip key={category.id} label={category.name} active={categoryId===category.id} onPress={()=>setCategoryId(category.id)}/>)}</ScrollView>:null}
    <SearchField value={search} onChangeText={setSearch} placeholder={ar?'اسم المنتج، SKU أو الباركود…':'Nom, SKU ou code-barres…'}/>
  </View>} ListEmptyComponent={<EmptyState title={search?t('noResults'):t('noData')} description={!search&&!showArchived&&canCreate?(ar?'أضف أول منتج ليظهر في البيع والمخزون.':'Ajoutez le premier produit pour la vente et le stock.'):undefined}/>} renderItem={({item})=>{
    const qty=stockOf(item),expiry=expiryTone(item.expiryDate);
    return <Pressable accessibilityRole="button" onPress={()=>setViewing(item)} style={({pressed})=>[styles.row,{flexDirection:isRTL?'row-reverse':'row'},pressed&&styles.pressed]}><View style={styles.body}><View style={[styles.nameRow,{flexDirection:isRTL?'row-reverse':'row'}]}><AppText variant="subheading" numberOfLines={1} style={styles.name}>{item.name}</AppText>{item.categoryName?<Badge label={item.categoryName} tone="neutral"/>:null}{item.isArchived?<Badge label={ar?'مؤرشف':'Archivé'} tone="neutral"/>:qty<=5?<Badge label={t('lowStock')} tone="warning"/>:null}{expiry==='expired'?<Badge label={ar?'منتهي':'Expiré'} tone="negative"/>:expiry==='soon'?<Badge label={ar?'قريب الانتهاء':'Bientôt expiré'} tone="warning"/>:null}</View><AppText variant="caption" muted>{item.sku}{item.barcode?` • ${item.barcode}`:''}</AppText><View style={[styles.meta,{flexDirection:isRTL?'row-reverse':'row'}]}><AppText variant="caption" muted>{t('quantity')}: {number(qty)}</AppText>{item.expiryDate?<AppText variant="caption" muted>{t('expiryDate')}: {item.expiryDate}</AppText>:null}</View></View><View style={styles.trailing}>{item.isArchived?(canEdit?<Button compact title={t('restore')} variant="secondary" onPress={()=>void restore(item)}/>:null):<><AppText variant="caption" muted>{t('salePrice')}</AppText><Money value={item.piecePrice??0}/>{canEdit?<AppText variant="heading" style={styles.arrow}>{isRTL?'‹':'›'}</AppText>:null}</>}</View></Pressable>;
  }}/>{viewing?<ProductDetail product={viewing} warehouses={warehouses} canEdit={canEdit&&!viewing.isArchived} onClose={()=>setViewing(undefined)} onEdit={()=>{const product=viewing;setViewing(undefined);setEditing(product)}}/>:null}{editing!==undefined&&!showArchived?<ProductEditor product={editing} warehouses={warehouses} categories={categories} busy={busy} onClose={()=>setEditing(undefined)} onSave={async input=>{setBusy(true);try{if(editing){if(!canEdit)throw new Error(ar?'ليس لديك صلاحية تعديل المنتجات':'Vous n’avez pas le droit de modifier les produits.');await updateProduct(db,editing.id,input)}else{if(!canCreate)throw new Error(ar?'ليس لديك صلاحية إنشاء المنتجات':'Vous n’avez pas le droit de créer des produits.');const productId=await createProduct(db,input);if(input.categoryId)await updateProduct(db,productId,input)}setEditing(undefined);await load()}catch(error){Alert.alert(t('error'),errorMessage(error))}finally{setBusy(false)}}} onArchive={editing&&canDelete?()=>Alert.alert(ar?'أرشفة المنتج':'Archiver le produit',editing.name,[{text:t('cancel'),style:'cancel'},{text:t('confirm'),style:'destructive',onPress:()=>void (async()=>{try{await archiveProduct(db,editing.id);setEditing(undefined);await load()}catch(error){Alert.alert(t('error'),errorMessage(error))}})()}]):undefined}/>:null}
  <Sheet visible={categoryManager} title={ar?'إدارة فئات المنتجات':'Catégories de produits'} onClose={()=>{setCategoryManager(false);setCategoryEditing(null);setCategoryDraft('')}} footer={<Button title={t('close')} variant="ghost" onPress={()=>{setCategoryManager(false);setCategoryEditing(null);setCategoryDraft('')}}/>}><Field label={categoryEditing?(ar?'الاسم الجديد':'Nouveau nom'):(ar?'فئة جديدة':'Nouvelle catégorie')} value={categoryDraft} onChangeText={setCategoryDraft} placeholder={ar?'مثال: مشروبات':'Ex. Boissons'}/><Button title={categoryEditing?(ar?'حفظ التعديل':'Enregistrer'):(ar?'إضافة الفئة':'Ajouter')} loading={busy} disabled={!categoryDraft.trim()} onPress={()=>void saveCategory()}/>{categoryEditing?<Button title={t('cancel')} variant="ghost" onPress={()=>{setCategoryEditing(null);setCategoryDraft('')}}/>:null}<View style={styles.categoryList}>{categories.length?categories.map(category=><View key={category.id} style={[styles.categoryRow,{flexDirection:isRTL?'row-reverse':'row'}]}><AppText variant="subheading" style={styles.flex}>{category.name}</AppText><Button compact title={t('edit')} variant="ghost" onPress={()=>{setCategoryEditing(category);setCategoryDraft(category.name)}}/><Button compact title={ar?'حذف':'Supprimer'} variant="danger" onPress={()=>removeCategory(category)}/></View>):<EmptyState title={ar?'لا توجد فئات بعد':'Aucune catégorie'}/>}</View></Sheet>
  </Screen>;
}

function ProductDetail({product,warehouses,canEdit,onClose,onEdit}:{product:Product;warehouses:Warehouse[];canEdit:boolean;onClose:()=>void;onEdit:()=>void}){
  const {t,number,locale,isRTL}=useI18n(),ar=locale==='ar',totalStock=stockOf(product),expiry=expiryTone(product.expiryDate);
  return <Modal animationType="slide" onRequestClose={onClose}><Screen padded={false}><ScrollView contentContainerStyle={styles.modal}>
    <SectionTitle title={product.name} subtitle={product.categoryName??(ar?'بدون فئة':'Sans catégorie')} action={<Button compact title={t('close')} variant="ghost" onPress={onClose}/>}/>
    <View style={styles.productDetailHero}><View style={styles.detailRule}/><View style={[styles.detailHeroRow,{flexDirection:isRTL?'row-reverse':'row'}]}><View style={styles.flex}><View style={[styles.nameRow,{flexDirection:isRTL?'row-reverse':'row'}]}>{product.isArchived?<Badge label={ar?'مؤرشف':'Archivé'} tone="neutral"/>:null}{expiry==='expired'?<Badge label={ar?'منتهي':'Expiré'} tone="negative"/>:expiry==='soon'?<Badge label={ar?'قريب الانتهاء':'Bientôt expiré'} tone="warning"/>:null}</View><AppText variant="caption" muted>{product.sku}{product.barcode?` • ${product.barcode}`:''}</AppText></View><View style={styles.detailStock}><AppText variant="caption" muted>{t('quantity')}</AppText><AppText variant="amountLarge">{number(totalStock)}</AppText></View></View></View>
    <SectionTitle title={ar?'الأسعار':'Prix'}/><View style={[styles.priceStrip,{flexDirection:isRTL?'row-reverse':'row'}]}><DetailMoney label={t('purchasePrice')} value={product.pieceCost??0}/><DetailMoney label={t('salePrice')} value={product.piecePrice??0}/><DetailMoney label={t('wholesalePrice')} value={product.wholesalePrice??0} last/></View>
    <SectionTitle title={ar?'المخزون حسب المخزن':'Stock par dépôt'}/><View style={styles.stockPanel}>{warehouses.map((warehouse,index)=><View key={warehouse.id} style={[styles.stockRow,{flexDirection:isRTL?'row-reverse':'row'},index===warehouses.length-1&&styles.lastStockRow]}><View style={styles.flex}><AppText variant="subheading">{warehouse.name}</AppText>{warehouse.isSalesDefault?<AppText variant="caption" muted>{ar?'مخزن البيع الافتراضي':'Dépôt de vente par défaut'}</AppText>:null}</View><AppText variant="heading">{number(Number(product.stocks?.[warehouse.id]??0))}</AppText></View>)}</View>
    {(product.expiryDate||product.note)?<View style={styles.detailInfo}>{product.expiryDate?<View style={styles.infoLine}><AppText variant="caption" muted>{t('expiryDate')}</AppText><AppText variant="subheading">{product.expiryDate}</AppText></View>:null}{product.note?<View style={styles.infoLine}><AppText variant="caption" muted>{t('note')}</AppText><AppText>{product.note}</AppText></View>:null}</View>:null}
    <View style={styles.actions}>{canEdit?<Button title={t('edit')} onPress={onEdit}/>:null}<Button title={t('close')} variant="secondary" onPress={onClose}/></View>
  </ScrollView></Screen></Modal>;
}

function DetailMoney({label,value,last=false}:{label:string;value:number;last?:boolean}){return <View style={[styles.detailMoney,last&&styles.lastMetric]}><AppText variant="caption" muted>{label}</AppText><Money value={value}/></View>}

function MiniMetric({label,value,tone='normal',last=false}:{label:string;value:string;tone?:'normal'|'warning';last?:boolean}){return <View style={[styles.miniMetric,last&&styles.lastMetric]}><View style={[styles.metricRule,tone==='warning'&&styles.metricRuleWarning]}/><AppText variant="caption" muted>{label}</AppText><AppText variant="heading" style={tone==='warning'?styles.warning:undefined}>{value}</AppText></View>}

type Form={name:string;barcode:string;categoryId:string;pieceCost:string;piecePrice:string;wholesalePrice:string;expiryDate:string;note:string;openingStock:string;openingWarehouseId:string};
function ProductEditor({product,warehouses,categories,busy,onClose,onSave,onArchive}:{product:Product|null;warehouses:Warehouse[];categories:ProductCategory[];busy:boolean;onClose:()=>void;onSave:(input:{name:string;barcode:string;categoryId:string|null;pieceCost:number|null;piecePrice:number|null;wholesalePrice:number|null;expiryDate:string|null;note:string|null;openingStock?:number;openingWarehouseId?:string})=>Promise<void>;onArchive?:()=>void}){
  const {t,isRTL,locale}=useI18n(),ar=locale==='ar';
  const [form,setForm]=useState<Form>({name:product?.name??'',barcode:product?.barcode??'',categoryId:product?.categoryId??'',pieceCost:String(product?.pieceCost??''),piecePrice:String(product?.piecePrice??''),wholesalePrice:String(product?.wholesalePrice??''),expiryDate:product?.expiryDate??'',note:product?.note??'',openingStock:'0',openingWarehouseId:warehouses.find(w=>w.isSalesDefault)?.id??warehouses[0]?.id??''});
  const set=(key:keyof Form)=>(value:string)=>setForm(current=>({...current,[key]:value}));
  const save=async()=>{
    const opening=product?0:Number(form.openingStock||0),purchaseCost=num(form.pieceCost);
    if(!Number.isFinite(opening)||opening<0){Alert.alert(t('error'),ar?'أدخل كمية رصيد بداية صحيحة.':'Saisissez une quantité de stock initial valide.');return}
    if(!product&&opening>0&&(!Number.isFinite(Number(purchaseCost))||Number(purchaseCost)<=0)){Alert.alert(t('purchasePrice'),ar?'عند إدخال رصيد بداية، سعر الشراء إلزامي ويجب أن يكون أكبر من صفر.':'Avec un stock initial, le prix d’achat est obligatoire et doit être supérieur à zéro.');return}
    if(!product&&opening>0&&!form.openingWarehouseId){Alert.alert(t('warehouse'),ar?'اختر المخزن الذي يوجد فيه رصيد البداية.':'Choisissez l’entrepôt du stock initial.');return}
    await onSave({name:form.name,barcode:form.barcode,categoryId:form.categoryId||null,pieceCost:purchaseCost,piecePrice:num(form.piecePrice),wholesalePrice:num(form.wholesalePrice),expiryDate:form.expiryDate||null,note:form.note||null,...(!product?{openingStock:opening,openingWarehouseId:form.openingWarehouseId}: {})});
  };
  return <Modal animationType="slide" onRequestClose={onClose}><Screen padded={false}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modal}>
    <SectionTitle title={product?product.name:t('createProduct')} subtitle={product?(ar?'عدّل البيانات التي يحتاجها البيع والمخزون فقط.':'Modifiez uniquement les données utiles à la vente et au stock.'):(ar?'إذا أدخلت رصيد بداية، يصبح سعر الشراء والمخزن إلزاميين. ويمكن ترك الرصيد صفرًا وإدخال المنتج لاحقًا بفاتورة شراء.':'Si vous saisissez un stock initial, le prix d’achat et l’entrepôt deviennent obligatoires. Sinon laissez le stock à zéro et utilisez ensuite une facture d’achat.')}/>
    <View style={styles.formPanel}>
      <FormSection title={ar?'هوية المنتج':'Identité'}><Field label={t('name')} value={form.name} onChangeText={set('name')} autoFocus={!product}/><Field label={t('barcode')} value={form.barcode} onChangeText={set('barcode')} autoCapitalize="none"/>{categories.length?<><AppText variant="caption" muted>{ar?'الفئة':'Catégorie'}</AppText><View style={[styles.chips,{flexDirection:isRTL?'row-reverse':'row'}]}><Chip label={ar?'بدون فئة':'Sans catégorie'} active={!form.categoryId} onPress={()=>set('categoryId')('')}/>{categories.map(category=><Chip key={category.id} label={category.name} active={form.categoryId===category.id} onPress={()=>set('categoryId')(category.id)}/>)}</View></>:null}</FormSection>
      <FormSection title={ar?'الأسعار':'Prix'}><View style={[styles.pair,{flexDirection:isRTL?'row-reverse':'row'}]}><Field label={t('purchasePrice')} value={form.pieceCost} onChangeText={set('pieceCost')} keyboardType="number-pad" containerStyle={styles.flex}/><Field label={t('salePrice')} value={form.piecePrice} onChangeText={set('piecePrice')} keyboardType="number-pad" containerStyle={styles.flex}/></View><Field label={t('wholesalePrice')} value={form.wholesalePrice} onChangeText={set('wholesalePrice')} keyboardType="number-pad"/></FormSection>
      <FormSection title={ar?'تفاصيل إضافية':'Détails supplémentaires'}><Field label={t('expiryDate')} value={form.expiryDate} onChangeText={set('expiryDate')} placeholder="YYYY-MM-DD"/><Field label={t('note')} value={form.note} onChangeText={set('note')} multiline numberOfLines={3}/></FormSection>
      {!product?<FormSection title={t('openingBalance')} subtitle={ar?'اختياري. إذا كانت الكمية أكبر من صفر فيجب إدخال سعر شراء واختيار المخزن.':'Optionnel. Si la quantité est supérieure à zéro, renseignez obligatoirement le prix d’achat et l’entrepôt.'} last><Field label={t('quantity')} value={form.openingStock} onChangeText={set('openingStock')} keyboardType="decimal-pad"/><View style={[styles.chips,{flexDirection:isRTL?'row-reverse':'row'}]}>{warehouses.map(w=><Chip key={w.id} label={w.name} active={form.openingWarehouseId===w.id} onPress={()=>set('openingWarehouseId')(w.id)}/>)}</View></FormSection>:null}
    </View>
    <Button loading={busy} disabled={!form.name.trim()} title={t('save')} onPress={()=>void save()}/>{onArchive?<Button title={ar?'أرشفة المنتج':'Archiver le produit'} variant="danger" onPress={onArchive}/>:null}<Button title={t('cancel')} variant="ghost" disabled={busy} onPress={onClose}/>
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
  productDetailHero:{backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,overflow:'hidden'},
  detailRule:{height:3,backgroundColor:colors.accent},
  detailHeroRow:{alignItems:'center',gap:spacing.md,padding:spacing.md},
  detailStock:{alignItems:'flex-end',gap:spacing.xs},
  priceStrip:{backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,overflow:'hidden'},
  detailMoney:{flex:1,minWidth:100,padding:spacing.md,gap:spacing.xs,borderRightWidth:StyleSheet.hairlineWidth,borderRightColor:colors.border},
  stockPanel:{backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,overflow:'hidden'},
  stockRow:{minHeight:64,alignItems:'center',gap:spacing.md,paddingHorizontal:spacing.md,paddingVertical:spacing.sm,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border},
  lastStockRow:{borderBottomWidth:0},
  detailInfo:{gap:spacing.md,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,padding:spacing.md},
  infoLine:{gap:spacing.xs},
  actions:{gap:spacing.sm},
  formPanel:{backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,overflow:'hidden'},
  formSection:{padding:spacing.md,gap:spacing.md,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border},
  formSectionLast:{borderBottomWidth:0,backgroundColor:colors.primaryFaint},
  pair:{gap:spacing.sm},
  flex:{flex:1},
  chips:{flexWrap:'wrap',gap:spacing.xs},
  categoryList:{gap:spacing.xs},
  categoryRow:{alignItems:'center',gap:spacing.xs,paddingVertical:spacing.xs,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border},
});
