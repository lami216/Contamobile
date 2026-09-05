import { router } from 'expo-router';
import { FeatureMenu } from '@/components/feature-menu';
import { AppText, Screen } from '@/components/ui';
import { useI18n } from '@/i18n/provider';
export function MoreHubScreen(){const {t}=useI18n();return <Screen scroll><AppText variant="title">{t('more')}</AppText><FeatureMenu items={[
{title:t('accounts'),description:'الأرصدة والحركات والتحويل والسحب والإيداع',onPress:()=>router.push('/more/accounts')},
{title:t('reports'),description:'المبيعات والأرباح والمخزون والديون والمصاريف',onPress:()=>router.push('/more/reports')},
{title:t('settings'),description:'اللغة والبيانات والنسخ الاحتياطي',onPress:()=>router.push('/more/settings')},
]}/></Screen>}
