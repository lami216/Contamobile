import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { FeatureMenu } from '@/components/feature-menu';
import { AppText, EmptyState, Screen } from '@/components/ui';
import { useI18n } from '@/i18n/provider';
import { useAuth } from '@/auth/provider';
import { spacing } from '@/theme';

export function PartiesHubScreen(){
  const {t}=useI18n(),auth=useAuth();
  const items=[
    auth.has('customers.view')?{title:t('customers'),description:t('partyHubCustomersHint'),onPress:()=>router.push('/parties/customers'),primary:true}:null,
    auth.has('suppliers.view')?{title:t('suppliers'),description:t('partyHubSuppliersHint'),onPress:()=>router.push('/parties/suppliers')}:null,
  ].filter((item):item is NonNullable<typeof item>=>item!==null);

  return <Screen scroll>
    <View style={styles.header}>
      <AppText variant="title">{t('parties')}</AppText>
      <AppText variant="caption" muted>{t('partyHubHint')}</AppText>
    </View>
    {items.length?<FeatureMenu items={items}/>:<EmptyState title={t('partyNoFunctions')}/>}
  </Screen>;
}

const styles=StyleSheet.create({header:{gap:spacing.xxs}});
