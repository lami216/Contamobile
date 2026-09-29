import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type { Product, ProductCategory, Warehouse } from '@/domain/types';
import { getProduct, listProductCategories, listProducts, listWarehouses } from '@/db/queries';
import { archiveProduct, createProduct } from '@/services/accounting-service';
import { createProductCategory, deleteProductCategory, renameProductCategory, updateProduct } from '@/services/management-service';
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
import { Sheet } from '@/components/mobile-interactions';
import { useI18n } from '@/i18n/provider';
import { useAuth } from '@/auth/provider';
import { colors, radius, spacing, touch } from '@/theme';

const num=(value:string)=>value.trim()===''?null:Number(value);
const stockOf=(item:Product)=>Object.values(item.stocks??{}).reduce((a,b)=>a+b,0);
type ProductState='active'|'archived';

function expiryTone(value:string|null){
  if(!value)return null;
  const today=new Date();today.setHours(0,0,0,0);
  const target=new Date(`${value}T00:00:00`);
  const days=Math.ceil((target.getTime()-today.getTime())/86400000);
  if(days<0)return'expired' as const;
  if(days<=30)return'soon' as const;
  return null;
}

export function ProductsScreen(){
  const db=useSQLiteContext(),{t,number,isRTL,errorMessage}=useI18n(),auth=useAuth(),params=useLocalSearchParams<{productId?:string}>(),deepProductId=typeof params.productId==='string'?params.productId:'';
  const [items,setItems]=useState<Product[]>([]),[warehouses,setWarehouses]=useState<Warehouse[]>([]),[categories,setCategories]=useState<ProductCategory[]>([]);
  const [categoryId,setCategoryId]=useState(''),[search,setSearch]=useState(''),[state,setState]=useState<ProductState>('active');
  const [viewing,setViewing]=useState<Product|undefined>(undefined),[editing,setEditing]=useState<Product|null|undefined>(undefined),[busy,setBusy]=useState(false);
  const [categoryManager,setCategoryManager]=useState(false),[categoryDraft,setCategoryDraft]=useState(''),[categoryEditing,setCategoryEditing]=useState<ProductCategory|null>(null);
  const deepOpenedId=useRef('');
  const showArchived=state==='archived';

  const load=useCallback(async()=>{
    if(!auth.has('products.view'))return;
    const [all,wh,cats]=await Promise.all([
      listProducts(db,search,undefined,showArchived,150,0,categoryId),
      listWarehouses(db),
      listProductCategories(db),
    ]);
    setItems(showArchived?all.filter(item=>item.isArchived):all);
    setWarehouses(wh);
    setCategories(cats);
    if(categoryId&&!cats.some(category=>category.id===categoryId))setCategoryId('');
  },[auth,categoryId,db,search,showArchived]);

  useFocusEffect(useCallback(()=>{void load()},[load]));

  useEffect(()=>{
    if(!deepProductId||deepOpenedId.current===deepProductId||!auth.has('products.view'))return;
    deepOpenedId.current=deepProductId;
    void getProduct(db,deepProductId)
      .then(product=>{if(product)setViewing(product);else Alert.alert(t('error'),t('productNotFound'))})
      .catch(error=>Alert.alert(t('error'),errorMessage(error)));
  },[auth,db,deepProductId,errorMessage,t]);

  if(!auth.has('products.view'))return <Screen><EmptyState title={t('productsNoPermission')}/></Screen>;

  const canCreate=auth.has('products.create'),canEdit=auth.has('products.edit'),canDelete=auth.has('products.delete'),canManageCategories=canCreate||canEdit||canDelete;

  const restore=async(item:Product)=>{
    try{
      if(!canEdit)throw new Error(t('productRestoreDenied'));
      await archiveProduct(db,item.id,true);
      await load();
    }catch(error){Alert.alert(t('error'),errorMessage(error))}
  };

  const saveCategory=async()=>{
    if(!categoryDraft.trim()||busy)return;
    setBusy(true);
    try{
      if(categoryEditing){
        if(!canEdit)throw new Error(t('productCategoryEditDenied'));
        await renameProductCategory(db,categoryEditing.id,categoryDraft);
      }else{
        if(!canCreate)throw new Error(t('productCategoryCreateDenied'));
        await createProductCategory(db,categoryDraft);
      }
      setCategoryDraft('');
      setCategoryEditing(null);
      await load();
    }catch(error){Alert.alert(t('error'),errorMessage(error))}
    finally{setBusy(false)}
  };

  const removeCategory=(category:ProductCategory)=>{
    if(!canDelete){Alert.alert(t('error'),t('productCategoryDeleteDenied'));return}
    Alert.alert(t('productCategoryDelete'),`${t('productCategoryDeleteDescription')}\n${category.name}`,[
      {text:t('cancel'),style:'cancel'},
      {text:t('confirm'),style:'destructive',onPress:()=>void(async()=>{
        setBusy(true);
        try{
          await deleteProductCategory(db,category.id);
          if(categoryId===category.id)setCategoryId('');
          if(categoryEditing?.id===category.id){setCategoryEditing(null);setCategoryDraft('')}
          await load();
        }catch(error){Alert.alert(t('error'),errorMessage(error))}
        finally{setBusy(false)}
      })()},
    ]);
  };

  return <Screen padded={false}>
    <FlatList
      data={items}
      keyExtractor={item=>item.id}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.list}
      ListHeaderComponent={<View style={styles.header}>
        <PageHeader
          title={t('products')}
          trailing={canCreate&&!showArchived?<HeaderAddButton label={t('add')} onPress={()=>setEditing(null)}/>:undefined}
        />
        <SearchField value={search} onChangeText={setSearch} placeholder={t('productsSearchPlaceholder')}/>

        <SegmentedControl
          value={state}
          options={[
            {value:'active',label:t('productsActive')},
            {value:'archived',label:t('productsArchived')},
          ]}
          onChange={setState}
        />

        {categories.length?<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.filters,{flexDirection:isRTL?'row-reverse':'row'}]}>
          <Chip label={t('productsAllCategories')} active={!categoryId} onPress={()=>setCategoryId('')}/>
          {categories.map(category=><Chip key={category.id} label={category.name} active={categoryId===category.id} onPress={()=>setCategoryId(category.id)}/>)}
        </ScrollView>:null}

        <View style={[styles.toolsLine,{flexDirection:isRTL?'row-reverse':'row'}]}>
          {canManageCategories?<Button compact title={t('productsManageCategories')} variant="ghost" onPress={()=>setCategoryManager(true)}/>:<View/>}
          <Badge label={number(items.length)} tone="neutral"/>
        </View>
      </View>}
      ListEmptyComponent={<EmptyState title={search?t('noResults'):t('noData')}/>}
      renderItem={({item,index})=><ProductRow
        item={item}
        first={index===0}
        last={index===items.length-1}
        canRestore={canEdit&&item.isArchived}
        onRestore={()=>void restore(item)}
        onPress={()=>setViewing(item)}
      />}
    />

    {viewing?<ProductDetail
      product={viewing}
      warehouses={warehouses}
      canEdit={canEdit&&!viewing.isArchived}
      onClose={()=>setViewing(undefined)}
      onEdit={()=>{const product=viewing;setViewing(undefined);setEditing(product)}}
    />:null}

    {editing!==undefined&&state==='active'?<ProductEditor
      product={editing}
      warehouses={warehouses}
      categories={categories}
      busy={busy}
      onClose={()=>setEditing(undefined)}
      onSave={async input=>{
        setBusy(true);
        try{
          if(editing){
            if(!canEdit)throw new Error(t('productEditDenied'));
            await updateProduct(db,editing.id,input);
          }else{
            if(!canCreate)throw new Error(t('productCreateDenied'));
            const productId=await createProduct(db,input);
            if(input.categoryId)await updateProduct(db,productId,input);
          }
          setEditing(undefined);
          await load();
        }catch(error){Alert.alert(t('error'),errorMessage(error))}
        finally{setBusy(false)}
      }}
      onArchive={editing&&canDelete?()=>Alert.alert(t('productArchiveTitle'),editing.name,[
        {text:t('cancel'),style:'cancel'},
        {text:t('confirm'),style:'destructive',onPress:()=>void (async()=>{
          try{
            await archiveProduct(db,editing.id);
            setEditing(undefined);
            await load();
          }catch(error){Alert.alert(t('error'),errorMessage(error))}
        })()},
      ]):undefined}
    />:null}

    <Sheet
      visible={categoryManager}
      title={t('productCategoryTitle')}
      onClose={()=>{setCategoryManager(false);setCategoryEditing(null);setCategoryDraft('')}}
      footer={<Button title={t('close')} variant="ghost" onPress={()=>{setCategoryManager(false);setCategoryEditing(null);setCategoryDraft('')}}/>}
    >
      {(categoryEditing&&canEdit)||(!categoryEditing&&canCreate)?<>
        <FormField
          label={categoryEditing?t('productCategoryNewName'):t('productCategoryNew')}
          value={categoryDraft}
          onChangeText={setCategoryDraft}
          placeholder={t('productCategoryExample')}
        />
        <Button title={categoryEditing?t('productCategorySave'):t('productCategoryAdd')} loading={busy} disabled={!categoryDraft.trim()} onPress={()=>void saveCategory()}/>
        {categoryEditing?<Button title={t('cancel')} variant="ghost" onPress={()=>{setCategoryEditing(null);setCategoryDraft('')}}/>:null}
      </>:null}

      <View style={styles.categoryList}>
        {categories.length?categories.map(category=><View key={category.id} style={[styles.categoryRow,{flexDirection:isRTL?'row-reverse':'row'}]}>
          <AppText variant="subheading" style={styles.flex}>{category.name}</AppText>
          {canEdit?<Button compact title={t('edit')} variant="ghost" onPress={()=>{setCategoryEditing(category);setCategoryDraft(category.name)}}/>:null}
          {canDelete?<Button compact title={t('delete')} variant="danger" onPress={()=>removeCategory(category)}/>:null}
        </View>):<EmptyState title={t('productCategoryNone')}/>}
      </View>
    </Sheet>
  </Screen>;
}

function ProductRow({item,first,last,canRestore,onRestore,onPress}:{item:Product;first:boolean;last:boolean;canRestore:boolean;onRestore:()=>void;onPress:()=>void}){
  const {t,isRTL,number}=useI18n();
  const qty=stockOf(item),expiry=expiryTone(item.expiryDate);
  const status=item.isArchived
    ?{label:t('productArchived'),tone:'neutral' as const}
    :expiry==='expired'
      ?{label:t('productExpired'),tone:'negative' as const}
      :qty===0
        ?{label:t('stockFilterOut'),tone:'negative' as const}
        :expiry==='soon'
          ?{label:t('productExpiringSoon'),tone:'warning' as const}
          :qty<=5
            ?{label:t('lowStock'),tone:'warning' as const}
            :null;
  const context=[item.categoryName,item.sku?'#'+item.sku:null,item.barcode].filter(Boolean).join(' • ');
  const purchaseCost=Number(item.lastPurchaseCost??item.pieceCost??0);

  return <Pressable
    accessibilityRole="button"
    onPress={onPress}
    style={({pressed})=>[
      styles.row,
      first&&styles.firstRow,
      last&&styles.lastRow,
      {flexDirection:isRTL?'row-reverse':'row'},
      pressed&&styles.pressed,
    ]}
  >
    <View style={styles.body}>
      <View style={[styles.nameRow,{flexDirection:isRTL?'row-reverse':'row'}]}>
        <AppText variant="subheading" numberOfLines={2} style={styles.name}>{item.name}</AppText>
        {status?<Badge label={status.label} tone={status.tone}/>:null}
      </View>
      {context?<AppText variant="caption" muted numberOfLines={1}>{context}</AppText>:null}
      <View style={[styles.meta,{flexDirection:isRTL?'row-reverse':'row'}]}>
        <AppText variant="caption" muted>{t('productsStock')}: <AppText variant="caption" style={[styles.stockValue,qty===0&&styles.negative,qty>0&&qty<=5&&styles.warning]}>{number(qty)}</AppText></AppText>
        {item.expiryDate?<AppText variant="caption" muted>{t('expiryDate')}: {item.expiryDate}</AppText>:null}
      </View>
    </View>

    <View style={styles.trailing}>
      {item.isArchived&&canRestore?<Button compact title={t('restore')} variant="secondary" onPress={onRestore}/>:<>
        <View style={styles.priceValue}><AppText variant="caption" muted>{t('salePrice')}</AppText><Money value={item.piecePrice??0}/></View>
        <View style={styles.priceValue}><AppText variant="caption" muted>{t('purchasePrice')}</AppText><Money value={purchaseCost}/></View>
        <AppText variant="heading" style={styles.arrow}>{isRTL?'‹':'›'}</AppText>
      </>}
    </View>
  </Pressable>;
}

function HeaderAddButton({label,onPress}:{label:string;onPress:()=>void}){
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({pressed})=>[styles.headerAdd,pressed&&styles.headerAddPressed]}>
    <AppText variant="heading" style={styles.headerPlus}>+</AppText>
  </Pressable>;
}

function ProductDetail({product,warehouses,canEdit,onClose,onEdit}:{product:Product;warehouses:Warehouse[];canEdit:boolean;onClose:()=>void;onEdit:()=>void}){
  const {t,number,isRTL}=useI18n(),totalStock=stockOf(product),expiry=expiryTone(product.expiryDate);
  const purchaseCost=Number(product.lastPurchaseCost??product.pieceCost??0);
  const status=product.isArchived
    ?<Badge label={t('productArchived')} tone="neutral"/>
    :expiry==='expired'
      ?<Badge label={t('productExpired')} tone="negative"/>
      :totalStock===0
        ?<Badge label={t('stockFilterOut')} tone="negative"/>
        :expiry==='soon'
          ?<Badge label={t('productExpiringSoon')} tone="warning"/>
          :totalStock<=5?<Badge label={t('lowStock')} tone="warning"/>:null;

  return <Modal animationType="slide" onRequestClose={onClose}>
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.modal}>
        <PageHeader title={product.name} subtitle={product.categoryName??t('productNoCategory')} onBack={onClose}/>

        <FramedSection
          title={t('productDetails')}
          subtitle={[product.sku,product.barcode].filter(Boolean).join(' • ')||undefined}
          action={status}
        >
          <View style={[styles.detailStockRow,{flexDirection:isRTL?'row-reverse':'row'}]}>
            <AppText variant="caption" muted>{t('productsStock')}</AppText>
            <AppText variant="amountLarge" style={[totalStock===0&&styles.negative,totalStock>0&&totalStock<=5&&styles.warning]}>{number(totalStock)}</AppText>
          </View>
        </FramedSection>

        <FinancialSummary items={[
          {label:t('purchasePrice'),value:purchaseCost},
          {label:t('salePrice'),value:product.piecePrice??0,emphasize:true},
          {label:t('wholesalePrice'),value:product.wholesalePrice??0},
        ]}/>

        <FramedSection title={t('productStockByWarehouse')} padded={false}>
          {warehouses.map((warehouse,index)=>{
            const value=Number(product.stocks?.[warehouse.id]??0);
            return <View key={warehouse.id} style={[styles.stockRow,{flexDirection:isRTL?'row-reverse':'row'},index===warehouses.length-1&&styles.lastStockRow]}>
              <View style={styles.flex}>
                <AppText variant="subheading">{warehouse.name}</AppText>
                {warehouse.isSalesDefault?<AppText variant="caption" muted>{t('productDefaultWarehouse')}</AppText>:null}
              </View>
              <AppText variant="heading" style={[styles.tabular,value===0&&styles.negative,value>0&&value<=5&&styles.warning]}>{number(value)}</AppText>
            </View>;
          })}
        </FramedSection>

        {(product.expiryDate||product.note)?<FramedSection title={t('productAdditionalDetails')}>
          {product.expiryDate?<View style={styles.infoLine}><AppText variant="caption" muted>{t('expiryDate')}</AppText><AppText variant="subheading">{product.expiryDate}</AppText></View>:null}
          {product.note?<View style={styles.infoLine}><AppText variant="caption" muted>{t('note')}</AppText><AppText>{product.note}</AppText></View>:null}
        </FramedSection>:null}

        <View style={styles.actions}>
          {canEdit?<Button title={t('edit')} onPress={onEdit}/>:null}
          <Button title={t('close')} variant="secondary" onPress={onClose}/>
        </View>
      </ScrollView>
    </Screen>
  </Modal>;
}

type Form={name:string;barcode:string;categoryId:string;pieceCost:string;piecePrice:string;wholesalePrice:string;expiryDate:string;note:string;openingStock:string;openingWarehouseId:string};

function ProductEditor({product,warehouses,categories,busy,onClose,onSave,onArchive}:{product:Product|null;warehouses:Warehouse[];categories:ProductCategory[];busy:boolean;onClose:()=>void;onSave:(input:{name:string;barcode:string;categoryId:string|null;pieceCost:number|null;piecePrice:number|null;wholesalePrice:number|null;expiryDate:string|null;note:string|null;openingStock?:number;openingWarehouseId?:string})=>Promise<void>;onArchive?:()=>void}){
  const {t,isRTL}=useI18n();
  const [form,setForm]=useState<Form>({
    name:product?.name??'',
    barcode:product?.barcode??'',
    categoryId:product?.categoryId??'',
    pieceCost:String(product?.pieceCost??''),
    piecePrice:String(product?.piecePrice??''),
    wholesalePrice:String(product?.wholesalePrice??''),
    expiryDate:product?.expiryDate??'',
    note:product?.note??'',
    openingStock:'0',
    openingWarehouseId:warehouses.find(w=>w.isSalesDefault)?.id??warehouses[0]?.id??'',
  });
  const set=(key:keyof Form)=>(value:string)=>setForm(current=>({...current,[key]:value}));

  const save=async()=>{
    const opening=product?0:Number(form.openingStock||0),purchaseCost=num(form.pieceCost);
    if(!Number.isFinite(opening)||opening<0){Alert.alert(t('error'),t('productOpeningStockInvalid'));return}
    if(!product&&opening>0&&(!Number.isFinite(Number(purchaseCost))||Number(purchaseCost)<=0)){Alert.alert(t('purchasePrice'),t('productOpeningCostRequired'));return}
    if(!product&&opening>0&&!form.openingWarehouseId){Alert.alert(t('warehouse'),t('productOpeningWarehouseRequired'));return}
    await onSave({
      name:form.name,
      barcode:form.barcode,
      categoryId:form.categoryId||null,
      pieceCost:purchaseCost,
      piecePrice:num(form.piecePrice),
      wholesalePrice:num(form.wholesalePrice),
      expiryDate:form.expiryDate||null,
      note:form.note||null,
      ...(!product?{openingStock:opening,openingWarehouseId:form.openingWarehouseId}: {}),
    });
  };

  return <Modal animationType="slide" onRequestClose={onClose}>
    <Screen padded={false}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modal}>
        <PageHeader title={product?product.name:t('createProduct')} subtitle={product?t('productEditHint'):t('productCreateHint')} onBack={onClose}/>

        <FramedSection title={t('productIdentity')}>
          <FormField label={t('name')} value={form.name} onChangeText={set('name')} autoFocus={!product}/>
          <FormField label={t('barcode')} value={form.barcode} onChangeText={set('barcode')} autoCapitalize="none"/>
          {categories.length?<View style={styles.formBlock}>
            <AppText variant="caption" muted>{t('productCategoryLabel')}</AppText>
            <View style={[styles.chips,{flexDirection:isRTL?'row-reverse':'row'}]}>
              <Chip label={t('productNoCategory')} active={!form.categoryId} onPress={()=>set('categoryId')('')}/>
              {categories.map(category=><Chip key={category.id} label={category.name} active={form.categoryId===category.id} onPress={()=>set('categoryId')(category.id)}/>)}
            </View>
          </View>:null}
        </FramedSection>

        <FramedSection title={t('productPrices')}>
          <View style={[styles.pair,{flexDirection:isRTL?'row-reverse':'row'}]}>
            <FormField label={t('purchasePrice')} value={form.pieceCost} onChangeText={set('pieceCost')} keyboardType="number-pad" containerStyle={styles.flex} trailing={<AppText variant="caption" muted>MRU</AppText>}/>
            <FormField label={t('salePrice')} value={form.piecePrice} onChangeText={set('piecePrice')} keyboardType="number-pad" containerStyle={styles.flex} trailing={<AppText variant="caption" muted>MRU</AppText>}/>
          </View>
          <FormField label={t('wholesalePrice')} value={form.wholesalePrice} onChangeText={set('wholesalePrice')} keyboardType="number-pad" trailing={<AppText variant="caption" muted>MRU</AppText>}/>
        </FramedSection>

        <FramedSection title={t('productAdditionalDetails')}>
          <FormField label={t('expiryDate')} value={form.expiryDate} onChangeText={set('expiryDate')} placeholder="YYYY-MM-DD"/>
          <FormField label={t('note')} value={form.note} onChangeText={set('note')} multiline numberOfLines={3}/>
        </FramedSection>

        {!product?<FramedSection title={t('openingBalance')} subtitle={t('productOpeningStockHelp')} tone="primary">
          <FormField label={t('quantity')} value={form.openingStock} onChangeText={set('openingStock')} keyboardType="decimal-pad"/>
          <View style={[styles.chips,{flexDirection:isRTL?'row-reverse':'row'}]}>
            {warehouses.map(warehouse=><Chip key={warehouse.id} label={warehouse.name} active={form.openingWarehouseId===warehouse.id} onPress={()=>set('openingWarehouseId')(warehouse.id)}/>)}
          </View>
        </FramedSection>:null}

        <Button loading={busy} disabled={!form.name.trim()} title={t('save')} onPress={()=>void save()}/>
        {onArchive?<Button title={t('productArchiveTitle')} variant="danger" onPress={onArchive}/>:null}
        <Button title={t('cancel')} variant="ghost" disabled={busy} onPress={onClose}/>
      </ScrollView>
    </Screen>
  </Modal>;
}

const styles=StyleSheet.create({
  list:{paddingHorizontal:spacing.md,paddingBottom:spacing.xxl,backgroundColor:colors.background},
  header:{gap:spacing.sm,marginBottom:spacing.sm},
  filters:{gap:spacing.xs},
  toolsLine:{minHeight:38,alignItems:'center',justifyContent:'space-between',gap:spacing.sm},
  row:{minHeight:78,alignItems:'center',gap:spacing.sm,paddingHorizontal:spacing.sm,paddingVertical:spacing.xs,backgroundColor:colors.surface,borderLeftWidth:1,borderRightWidth:1,borderTopWidth:1,borderColor:colors.border},
  firstRow:{borderTopColor:colors.borderStrong,borderLeftColor:colors.borderStrong,borderRightColor:colors.borderStrong,borderTopLeftRadius:radius.lg,borderTopRightRadius:radius.lg},
  lastRow:{borderBottomWidth:1,borderBottomColor:colors.borderStrong,borderBottomLeftRadius:radius.lg,borderBottomRightRadius:radius.lg},
  body:{flex:1,minWidth:0,gap:3},
  nameRow:{alignItems:'center',gap:spacing.xs},
  name:{flex:1,minWidth:0},
  meta:{alignItems:'center',gap:spacing.sm,flexWrap:'wrap'},
  stockValue:{fontWeight:'800',fontVariant:['tabular-nums']},
  trailing:{alignItems:'flex-end',gap:3,minWidth:108},
  priceValue:{alignItems:'flex-end',gap:1},
  arrow:{color:colors.textSoft,lineHeight:18},
  pressed:{backgroundColor:colors.surfaceMuted},
  headerAdd:{width:touch.min,height:touch.min,borderRadius:radius.md,alignItems:'center',justifyContent:'center',backgroundColor:colors.primary},
  headerAddPressed:{backgroundColor:colors.primaryPressed,transform:[{scale:.98}]},
  headerPlus:{color:colors.onPrimary,fontSize:24,lineHeight:25},
  modal:{paddingHorizontal:spacing.md,gap:spacing.sm,paddingBottom:spacing.xxl,backgroundColor:colors.background},
  detailStockRow:{minHeight:48,alignItems:'center',justifyContent:'space-between',gap:spacing.md},
  stockRow:{minHeight:58,alignItems:'center',gap:spacing.md,paddingHorizontal:spacing.sm,paddingVertical:spacing.xs,borderBottomWidth:1,borderBottomColor:colors.border},
  lastStockRow:{borderBottomWidth:0},
  infoLine:{gap:spacing.xs},
  actions:{gap:spacing.xs},
  pair:{gap:spacing.sm},
  flex:{flex:1,minWidth:0},
  chips:{flexWrap:'wrap',gap:spacing.xs},
  formBlock:{gap:spacing.xs},
  categoryList:{gap:spacing.xs},
  categoryRow:{alignItems:'center',gap:spacing.xs,paddingVertical:spacing.xs,borderBottomWidth:1,borderBottomColor:colors.border},
  tabular:{fontVariant:['tabular-nums']},
  warning:{color:colors.warning},
  negative:{color:colors.negative},
});
