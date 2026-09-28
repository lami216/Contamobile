import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Modal, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type { Product, ProductCategory, Warehouse } from '@/domain/types';
import { listProductCategories, listProducts, listWarehouses } from '@/db/queries';
import { archiveProduct, createProduct } from '@/services/accounting-service';
import { createProductCategory, deleteProductCategory, updateProduct, updateProductCategory } from '@/services/management-service';
import { AppText, Button, Card, Chip, EmptyState, Field, Money, Row, Screen, SearchField, SectionTitle } from '@/components/ui';
import { useI18n } from '@/i18n/provider';
import { useAuth } from '@/auth/provider';
import { colors, spacing } from '@/theme';

const num=(value:string)=>value.trim()===''?null:Number(value);

export function ProductsScreen(){
  const db=useSQLiteContext(),{t,number,locale,errorMessage}=useI18n(),auth=useAuth(),ar=locale==='ar';
  const [items,setItems]=useState<Product[]>([]),[warehouses,setWarehouses]=useState<Warehouse[]>([]),[categories,setCategories]=useState<ProductCategory[]>([]);
  const [search,setSearch]=useState(''),[categoryId,setCategoryId]=useState(''),[showArchived,setShowArchived]=useState(false),[editing,setEditing]=useState<Product|null|undefined>(undefined),[categoryManager,setCategoryManager]=useState(false),[busy,setBusy]=useState(false);
  const allowed=auth.has('products.view'),canCreate=auth.has('products.create'),canEdit=auth.has('products.edit'),canDelete=auth.has('products.delete');
  const load=useCallback(async()=>{
    if(!allowed)return;
    const [all,w,c]=await Promise.all([
      listProducts(db,search,undefined,showArchived,200,0,categoryId||undefined),
      listWarehouses(db),
      listProductCategories(db),
    ]);
    setItems(showArchived?all.filter(item=>item.isArchived):all);
    setWarehouses(w);setCategories(c);
  },[allowed,categoryId,db,search,showArchived]);
  useFocusEffect(useCallback(()=>{void load()},[load]));
  const categoryMap=useMemo(()=>new Map(categories.map(category=>[category.id,category.name])),[categories]);
  if(!allowed)return <Screen><EmptyState title={ar?'ليس لديك صلاحية عرض المنتجات':'Vous n’avez pas accès aux produits.'}/></Screen>;

  const restore=async(item:Product)=>{try{if(!canEdit)throw new Error(ar?'ليس لديك صلاحية استعادة المنتجات':'Vous n’avez pas le droit de restaurer les produits.');await archiveProduct(db,item.id,true);await load();Alert.alert(t('success'))}catch(error){Alert.alert(t('error'),errorMessage(error))}};

  return <Screen padded={false}>
    <FlatList
      data={items}
      keyExtractor={item=>item.id}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.content}
      ListHeaderComponent={<View style={styles.header}>
        <SectionTitle title={t('products')} action={canCreate&&!showArchived?<Button title={t('add')} onPress={()=>setEditing(null)}/>:undefined}/>
        <SearchField value={search} onChangeText={setSearch}/>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip label={ar?'كل الفئات':'Toutes les catégories'} active={!categoryId} onPress={()=>setCategoryId('')}/>
          {categories.map(category=><Chip key={category.id} label={category.name} active={categoryId===category.id} onPress={()=>setCategoryId(category.id)}/>)}
        </ScrollView>
        <View style={styles.toolbar}>
          <Chip label={ar?'النشطة':'Actifs'} active={!showArchived} onPress={()=>setShowArchived(false)}/>
          <Chip label={ar?'المؤرشفة':'Archivés'} active={showArchived} onPress={()=>setShowArchived(true)}/>
          {(canCreate||canEdit||canDelete)?<Button title={ar?'إدارة الفئات':'Gérer les catégories'} variant="secondary" onPress={()=>setCategoryManager(true)}/>:null}
        </View>
      </View>}
      ListEmptyComponent={<EmptyState title={search?t('noResults'):t('noData')}/>}
      renderItem={({item})=>{
        const category=item.categoryId?categoryMap.get(item.categoryId):undefined;
        const stock=Object.values(item.stocks??{}).reduce((a,b)=>a+b,0);
        return <Card elevated style={styles.productCard}>
          <Row
            title={item.name}
            subtitle={[item.sku,item.barcode||null,category||null,`${number(stock)} ${ar?'وحدة':'unités'}`].filter(Boolean).join(' • ')}
            trailing={item.isArchived?(canEdit?<Button title={t('restore')} variant="secondary" onPress={()=>void restore(item)}/>:undefined):<Money value={item.piecePrice??0}/>}
            onPress={!item.isArchived&&canEdit?()=>setEditing(item):undefined}
          />
        </Card>;
      }}
    />
    {editing!==undefined&&!showArchived?<ProductEditor product={editing} warehouses={warehouses} categories={categories} busy={busy} canOpeningStock={auth.has('warehouses.adjust')} onClose={()=>setEditing(undefined)} onSave={async input=>{
      setBusy(true);
      try{
        if(editing){if(!canEdit)throw new Error(ar?'ليس لديك صلاحية تعديل المنتجات':'Vous n’avez pas le droit de modifier les produits.');await updateProduct(db,editing.id,input)}
        else{if(!canCreate)throw new Error(ar?'ليس لديك صلاحية إنشاء المنتجات':'Vous n’avez pas le droit de créer des produits.');if(Number(input.openingStock??0)>0&&!auth.has('warehouses.adjust'))throw new Error(ar?'إدخال رصيد بداية يتطلب صلاحية تصحيح المخزون':'Un stock initial nécessite le droit d’ajuster le stock.');await createProduct(db,input)}
        setEditing(undefined);await load();
      }catch(error){Alert.alert(t('error'),errorMessage(error))}finally{setBusy(false)}
    }} onArchive={editing&&canDelete?()=>Alert.alert(t('delete'),editing.name,[{text:t('cancel'),style:'cancel'},{text:t('confirm'),style:'destructive',onPress:()=>void (async()=>{try{await archiveProduct(db,editing.id);setEditing(undefined);await load()}catch(error){Alert.alert(t('error'),errorMessage(error))}})()}]):undefined}/>:null}
    {categoryManager?<CategoryManager categories={categories} canCreate={canCreate} canEdit={canEdit} canDelete={canDelete} onClose={()=>setCategoryManager(false)} onChanged={load}/>:null}
  </Screen>;
}

type Form={name:string;barcode:string;pieceCost:string;piecePrice:string;wholesalePrice:string;expiryDate:string;note:string;categoryId:string;openingStock:string;openingWarehouseId:string};
function ProductEditor({product,warehouses,categories,busy,canOpeningStock,onClose,onSave,onArchive}:{product:Product|null;warehouses:Warehouse[];categories:ProductCategory[];busy:boolean;canOpeningStock:boolean;onClose:()=>void;onSave:(input:{name:string;barcode:string;pieceCost:number|null;piecePrice:number|null;wholesalePrice:number|null;expiryDate:string|null;note:string|null;categoryId:string|null;openingStock?:number;openingWarehouseId?:string})=>Promise<void>;onArchive?:()=>void}){
  const {t,isRTL,locale}=useI18n(),ar=locale==='ar';
  const [form,setForm]=useState<Form>({name:product?.name??'',barcode:product?.barcode??'',pieceCost:String(product?.pieceCost??''),piecePrice:String(product?.piecePrice??''),wholesalePrice:String(product?.wholesalePrice??''),expiryDate:product?.expiryDate??'',note:product?.note??'',categoryId:product?.categoryId??'',openingStock:'0',openingWarehouseId:warehouses.find(w=>w.isSalesDefault)?.id??warehouses[0]?.id??''});
  const set=(key:keyof Form)=>(value:string)=>setForm(current=>({...current,[key]:value}));
  return <Modal animationType="slide" onRequestClose={onClose}><Screen padded={false}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modal}>
    <SectionTitle title={product?product.name:t('createProduct')}/>
    <Card elevated>
      <Field label={t('name')} value={form.name} onChangeText={set('name')}/>
      <Field label={t('barcode')} value={form.barcode} onChangeText={set('barcode')}/>
      <AppText variant="caption" muted>{ar?'الفئة':'Catégorie'}</AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <Chip label={ar?'بدون فئة':'Sans catégorie'} active={!form.categoryId} onPress={()=>set('categoryId')('')}/>
        {categories.map(category=><Chip key={category.id} label={category.name} active={form.categoryId===category.id} onPress={()=>set('categoryId')(category.id)}/>)}
      </ScrollView>
      <View style={[styles.pair,{flexDirection:isRTL?'row-reverse':'row'}]}>
        <View style={styles.flex}><Field label={t('purchasePrice')} value={form.pieceCost} onChangeText={set('pieceCost')} keyboardType="number-pad"/></View>
        <View style={styles.flex}><Field label={t('salePrice')} value={form.piecePrice} onChangeText={set('piecePrice')} keyboardType="number-pad"/></View>
      </View>
      <Field label={t('wholesalePrice')} value={form.wholesalePrice} onChangeText={set('wholesalePrice')} keyboardType="number-pad"/>
      <Field label={t('expiryDate')} value={form.expiryDate} onChangeText={set('expiryDate')} placeholder="YYYY-MM-DD"/>
      <Field label={t('note')} value={form.note} onChangeText={set('note')} multiline/>
    </Card>
    {!product&&canOpeningStock?<Card elevated><AppText variant="subheading">{t('openingBalance')}</AppText><Field label={t('quantity')} value={form.openingStock} onChangeText={set('openingStock')} keyboardType="decimal-pad"/><View style={styles.chips}>{warehouses.map(w=><Chip key={w.id} label={w.name} active={form.openingWarehouseId===w.id} onPress={()=>set('openingWarehouseId')(w.id)}/>)}</View></Card>:null}
    <Button loading={busy} disabled={!form.name.trim()} title={t('save')} onPress={()=>void onSave({name:form.name,barcode:form.barcode,pieceCost:num(form.pieceCost),piecePrice:num(form.piecePrice),wholesalePrice:num(form.wholesalePrice),expiryDate:form.expiryDate||null,note:form.note||null,categoryId:form.categoryId||null,...(!product?{openingStock:Number(form.openingStock||0),openingWarehouseId:form.openingWarehouseId}: {})})}/>
    {onArchive?<Button title={t('delete')} variant="danger" onPress={onArchive}/>:null}
    <Button title={t('cancel')} variant="ghost" onPress={onClose}/>
  </ScrollView></Screen></Modal>;
}

function CategoryManager({categories,canCreate,canEdit,canDelete,onClose,onChanged}:{categories:ProductCategory[];canCreate:boolean;canEdit:boolean;canDelete:boolean;onClose:()=>void;onChanged:()=>Promise<void>}){
  const db=useSQLiteContext(),{t,locale,errorMessage}=useI18n(),ar=locale==='ar';
  const [selected,setSelected]=useState<ProductCategory|null>(null),[name,setName]=useState(''),[busy,setBusy]=useState(false);
  const reset=()=>{setSelected(null);setName('')};
  const save=async()=>{setBusy(true);try{if(selected){if(!canEdit)throw new Error(ar?'ليس لديك صلاحية تعديل الفئات':'Accès refusé.');await updateProductCategory(db,selected.id,name)}else{if(!canCreate)throw new Error(ar?'ليس لديك صلاحية إنشاء الفئات':'Accès refusé.');await createProductCategory(db,name)}reset();await onChanged()}catch(error){Alert.alert(t('error'),errorMessage(error))}finally{setBusy(false)}};
  const remove=(category:ProductCategory)=>Alert.alert(ar?'حذف الفئة':'Supprimer la catégorie',category.name,[{text:t('cancel'),style:'cancel'},{text:t('confirm'),style:'destructive',onPress:()=>void (async()=>{try{if(!canDelete)throw new Error(ar?'ليس لديك صلاحية حذف الفئات':'Accès refusé.');await deleteProductCategory(db,category.id);reset();await onChanged()}catch(error){Alert.alert(t('error'),errorMessage(error))}})()}]);
  return <Modal animationType="slide" onRequestClose={onClose}><Screen padded={false}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modal}>
    <SectionTitle title={ar?'فئات المنتجات':'Catégories de produits'} action={<Button title={t('cancel')} variant="ghost" onPress={onClose}/>}/>
    <Card elevated>
      <Field label={selected?(ar?'تعديل اسم الفئة':'Modifier la catégorie'):(ar?'فئة جديدة':'Nouvelle catégorie')} value={name} onChangeText={setName} maxLength={80}/>
      <View style={styles.categoryActions}><Button title={selected?t('save'):t('add')} loading={busy} disabled={!name.trim()} onPress={()=>void save()}/>{selected?<Button title={t('cancel')} variant="ghost" onPress={reset}/>:null}</View>
    </Card>
    {categories.length?categories.map(category=><Card key={category.id} elevated><Row title={category.name} onPress={canEdit?()=>{setSelected(category);setName(category.name)}:undefined} trailing={canDelete?<Button title={t('delete')} variant="ghost" onPress={()=>remove(category)}/>:undefined}/></Card>):<EmptyState title={t('noData')}/>}
    <AppText variant="caption" muted>{ar?'حذف الفئة لا يحذف المنتجات؛ تصبح المنتجات بدون فئة.':'Supprimer une catégorie ne supprime pas les produits; ils deviennent sans catégorie.'}</AppText>
  </ScrollView></Screen></Modal>;
}

const styles=StyleSheet.create({
  content:{padding:spacing.md,gap:spacing.sm,paddingBottom:spacing.xxl,backgroundColor:colors.background},
  header:{gap:spacing.md,marginBottom:spacing.xs},
  toolbar:{flexDirection:'row',flexWrap:'wrap',gap:spacing.xs,alignItems:'center'},
  modal:{padding:spacing.md,gap:spacing.md,paddingBottom:spacing.xxl,backgroundColor:colors.background},
  pair:{gap:spacing.sm},flex:{flex:1},chips:{flexDirection:'row',gap:spacing.xs},productCard:{paddingVertical:spacing.xs},
  categoryActions:{flexDirection:'row',gap:spacing.xs,flexWrap:'wrap'},
});
