import { router } from 'expo-router';
import { FeatureMenu } from '@/components/feature-menu';
import { AppText, Screen } from '@/components/ui';
import { useI18n } from '@/i18n/provider';
export function SalesHubScreen(){const {t}=useI18n();return <Screen scroll><AppText variant="title">{t('sales')}</AppText><FeatureMenu items={[
{title:t('newSale'),description:'بيع سريع مع مخزون ودفع أو آجل',onPress:()=>router.push('/sales/pos')},
{title:t('purchases'),description:'إدخال فواتير الموردين وتحديث تكلفة المخزون',onPress:()=>router.push('/sales/purchases')},
{title:t('expenses'),description:'تسجيل المصاريف من وسائل الدفع',onPress:()=>router.push('/sales/expenses')},
{title:t('records'),description:'مراجعة الفواتير والحركات السابقة',onPress:()=>router.push('/sales/records')},
]}/></Screen>}
