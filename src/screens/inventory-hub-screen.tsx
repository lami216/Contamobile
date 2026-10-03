import { useCallback, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { dashboardSummary } from '@/db/queries';
import { Screen } from '@/components/ui';
import { StitchHeader, StitchAction, StitchPanel, StitchSection, StitchText, stitch } from '@/components/stitch';
import { useI18n } from '@/i18n/provider';
import { useAuth } from '@/auth/provider';
export function InventoryHubScreen(){const {t,locale,isRTL,money,number}=useI18n(),auth=useAuth(),db=useSQLiteContext(),ar=locale==='ar';const [value,setValue]=useState(0),[low,setLow]=useState(0),[count,setCount]=useState(0);useFocusEffect(useCallback(()=>{void Promise.all([dashboardSummary(db),db.getFirstAsync<{count:number}>('SELECT COUNT(*) count FROM products WHERE is_archived=0')]).then(([s,p])=>{setValue(s.inventoryValue);setLow(s.lowStockCount);setCount(p?.count??0)})},[db]));return <Screen scroll padded={false}><StitchHeader module="INVENTORY"/><View style={s.content}><StitchSection title={ar?'مركز مراقبة المخزون':'Centre de contrôle du stock'}/><StitchPanel><StitchText size={12} color={stitch.muted}>{ar?'إجمالي قيمة المخزون الحالي (سعر التكلفة)':t('inventoryValue')}</StitchText><StitchText size={30} bold color={stitch.lightGold}>{money(value)}</StitchText></StitchPanel><View style={[s.stats,{flexDirection:isRTL?'row-reverse':'row'}]}><StitchPanel style={s.stat}><StitchText size={12} color={stitch.muted}>{ar?'الأصناف المسجلة':t('products')}</StitchText><StitchText size={24} bold>{number(count)}</StitchText></StitchPanel><StitchPanel style={s.stat}><StitchText size={12} color={stitch.muted}>{t('lowStock')}</StitchText><StitchText size={24} bold color="#F59E0B">{number(low)}</StitchText></StitchPanel></View><StitchSection title={ar?'العمليات والأدلة الرئيسية':'Opérations et catalogues'}/>
 {auth.has('products.view')?<StitchAction title={ar?'قائمة المنتجات':t('products')} description={t('inventoryHubProductsHint')} button={ar?'استعراض الدليل':t('products')} icon="inventory" onPress={()=>router.push('/inventory/products')}/>:null}
 {auth.has('warehouses.inventory.view')?<StitchAction title={ar?'جرد المخزون':t('stock')} description={t('inventoryHubStockHint')} button={ar?'بدء الجرد الدوري':t('stock')} icon="audit" color={stitch.blue} onPress={()=>router.push('/inventory/stock')}/>:null}
 {auth.has('warehouses.view')?<StitchAction title={t('warehouses')} description={t('inventoryHubWarehousesHint')} button={t('warehouses')} icon="warehouse" onPress={()=>router.push('/inventory/warehouses')}/>:null}
 {auth.has('warehouses.transfer')?<StitchAction title={t('transfer')} description={t('inventoryHubTransferHint')} button={t('transfer')} icon="transfer" color={stitch.amber} onPress={()=>router.push('/inventory/transfer')}/>:null}
 {auth.has('warehouses.adjust')?<StitchAction title={t('adjustment')} description={t('inventoryHubAdjustmentHint')} button={t('adjustment')} icon="edit" color={stitch.red} onPress={()=>router.push('/inventory/adjustment')}/>:null}
 </View></Screen>}
const s=StyleSheet.create({content:{padding:16,gap:16},stats:{gap:12},stat:{flex:1}});
