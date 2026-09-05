import { router } from 'expo-router';
import { FeatureMenu } from '@/components/feature-menu';
import { AppText, Screen } from '@/components/ui';
import { useI18n } from '@/i18n/provider';
export function PartiesHubScreen(){const {t}=useI18n();return <Screen scroll><AppText variant="title">{t('parties')}</AppText><FeatureMenu items={[
{title:t('customers'),description:'الأرصدة والتحصيل وسجل تعاملات العملاء',onPress:()=>router.push('/parties/customers')},
{title:t('suppliers'),description:'الأرصدة والدفع وسجل تعاملات الموردين',onPress:()=>router.push('/parties/suppliers')},
]}/></Screen>}
