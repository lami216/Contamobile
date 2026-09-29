import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { FeatureMenu } from '@/components/feature-menu';
import { AppText, EmptyState, Screen } from '@/components/ui';
import { useI18n } from '@/i18n/provider';
import { useAuth } from '@/auth/provider';
import { spacing } from '@/theme';

export function InventoryHubScreen(){
  const {t}=useI18n(),auth=useAuth();
  const items=[
    auth.has('warehouses.inventory.view')?{title:t('stock'),description:t('inventoryHubStockHint'),onPress:()=>router.push('/inventory/stock'),primary:true}:null,
    auth.has('products.view')?{title:t('products'),description:t('inventoryHubProductsHint'),onPress:()=>router.push('/inventory/products')}:null,
    auth.has('warehouses.transfer')?{title:t('transfer'),description:t('inventoryHubTransferHint'),onPress:()=>router.push('/inventory/transfer')}:null,
    auth.has('warehouses.adjust')?{title:t('adjustment'),description:t('inventoryHubAdjustmentHint'),onPress:()=>router.push('/inventory/adjustment')}:null,
    auth.has('warehouses.view')?{title:t('warehouses'),description:t('inventoryHubWarehousesHint'),onPress:()=>router.push('/inventory/warehouses')}:null,
  ].filter((item):item is NonNullable<typeof item>=>item!==null);
  return <Screen scroll><View style={styles.header}><AppText variant="title">{t('inventory')}</AppText><AppText variant="caption" muted>{t('inventoryHubHint')}</AppText></View>{items.length?<FeatureMenu items={items}/>:<EmptyState title={t('hubNoFunctions')}/>}</Screen>;
}

const styles=StyleSheet.create({header:{gap:spacing.xxs}});
