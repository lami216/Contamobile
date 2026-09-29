import { router } from 'expo-router';
import { FeatureMenu } from '@/components/feature-menu';
import { HeroAction } from '@/components/mobile-interactions';
import { AppText, EmptyState, Screen } from '@/components/ui';
import { useI18n } from '@/i18n/provider';
import { useAuth } from '@/auth/provider';
import { spacing } from '@/theme';
import { StyleSheet, View } from 'react-native';

export function SalesHubScreen(){
  const {t}=useI18n(),auth=useAuth();
  const canNewSale=auth.has('pos.create');
  const items=[
    auth.has('purchases.view')||auth.has('purchases.create')?{title:t('purchases'),description:t('salesHubPurchaseHint'),onPress:()=>router.push('/sales/purchases')}:null,
    auth.has('expenses.view')?{title:t('expenses'),description:t('salesHubExpensesHint'),onPress:()=>router.push('/sales/expenses')}:null,
    auth.has('records.view')?{title:t('records'),description:t('salesHubRecordsHint'),onPress:()=>router.push('/sales/records')}:null,
  ].filter((item):item is NonNullable<typeof item>=>item!==null);
  if(!canNewSale&&!items.length)return <Screen><EmptyState title={t('hubNoFunctions')}/></Screen>;
  return <Screen scroll><View style={styles.header}><AppText variant="title">{t('sales')}</AppText><AppText variant="caption" muted>{t('salesHubHint')}</AppText></View>{canNewSale?<HeroAction eyebrow={t('salesHubFast')} title={t('newSale')} subtitle={t('salesHubNewSaleHint')} actionLabel={t('salesHubOpenPos')} onPress={()=>router.push('/sales/pos')}/>:null}{items.length?<FeatureMenu items={items}/>:null}</Screen>;
}

const styles=StyleSheet.create({header:{gap:spacing.xxs}});
