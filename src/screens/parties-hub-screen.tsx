import { router } from 'expo-router';
import { FeatureMenu } from '@/components/feature-menu';
import { EmptyState, PageHeader, Screen } from '@/components/ui';
import { useI18n } from '@/i18n/provider';
import { useAuth } from '@/auth/provider';

export function PartiesHubScreen(){
  const {t}=useI18n(),auth=useAuth();
  const items=[
    auth.has('customers.view')?{title:t('customers'),description:t('partyHubCustomersHint'),onPress:()=>router.push('/parties/customers'),primary:true}:null,
    auth.has('suppliers.view')?{title:t('suppliers'),description:t('partyHubSuppliersHint'),onPress:()=>router.push('/parties/suppliers')}:null,
  ].filter((item):item is NonNullable<typeof item>=>item!==null);

  return <Screen scroll>\n    <PageHeader title={t('parties')} subtitle={t('partyHubHint')}/>
    {items.length?<FeatureMenu items={items}/>:<EmptyState title={t('partyNoFunctions')}/>}
  </Screen>;
}
