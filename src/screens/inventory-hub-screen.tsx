import { router } from 'expo-router';
import { FeatureMenu } from '@/components/feature-menu';
import { EmptyState, PageHeader, Screen } from '@/components/ui';
import { useI18n } from '@/i18n/provider';
import { useAuth } from '@/auth/provider';

export function InventoryHubScreen(){
  const {t}=useI18n(),auth=useAuth();
  const items=[
    auth.has('warehouses.inventory.view')?{title:t('stock'),description:t('inventoryHubStockHint'),onPress:()=>router.push('/inventory/stock'),primary:true}:null,
    auth.has('products.view')?{title:t('products'),description:t('inventoryHubProductsHint'),onPress:()=>router.push('/inventory/products')}:null,
    auth.has('warehouses.transfer')?{title:t('transfer'),description:t('inventoryHubTransferHint'),onPress:()=>router.push('/inventory/transfer')}:null,
    auth.has('warehouses.adjust')?{title:t('adjustment'),description:t('inventoryHubAdjustmentHint'),onPress:()=>router.push('/inventory/adjustment')}:null,
    auth.has('warehouses.view')?{title:t('warehouses'),description:t('inventoryHubWarehousesHint'),onPress:()=>router.push('/inventory/warehouses')}:null,
  ].filter((item):item is NonNullable<typeof item>=>item!==null);
  return <Screen scroll><PageHeader title={t('inventory')} subtitle={t('inventoryHubHint')}/>{items.length?<FeatureMenu items={items}/>:<EmptyState title={t('hubNoFunctions')}/>}</Screen>;
}
