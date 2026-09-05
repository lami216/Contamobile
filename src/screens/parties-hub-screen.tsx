import { router } from 'expo-router';
import { FeatureMenu } from '@/components/feature-menu';
import { AppText, EmptyState, Screen } from '@/components/ui';
import { useI18n } from '@/i18n/provider';
import { useAuth } from '@/auth/provider';
export function PartiesHubScreen(){const {t,locale}=useI18n(),auth=useAuth();const ar=locale==='ar';const items=[
auth.has('customers.view')?{title:t('customers'),description:ar?'الأرصدة والتحصيل وسجل تعاملات العملاء':'Soldes, encaissements et historique des clients.',onPress:()=>router.push('/parties/customers')}:null,
auth.has('suppliers.view')?{title:t('suppliers'),description:ar?'الأرصدة والدفع وسجل تعاملات الموردين':'Soldes, paiements et historique des fournisseurs.',onPress:()=>router.push('/parties/suppliers')}:null,
].filter((item):item is NonNullable<typeof item>=>item!==null);return <Screen scroll><AppText variant="title">{t('parties')}</AppText>{items.length?<FeatureMenu items={items}/>:<EmptyState title={ar?'لا توجد وظائف متاحة لحسابك':'Aucune fonction disponible pour ce compte.'}/>}</Screen>}
