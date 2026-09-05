import { router } from 'expo-router';
import { FeatureMenu } from '@/components/feature-menu';
import { AppText, Screen } from '@/components/ui';
import { useI18n } from '@/i18n/provider';
export function InventoryHubScreen(){const {t}=useI18n();return <Screen scroll><AppText variant="title">{t('inventory')}</AppText><FeatureMenu items={[
{title:t('products'),description:'الأسعار والباركود والصلاحية ورصيد البداية',onPress:()=>router.push('/inventory/products')},
{title:t('stock'),description:'الكميات المتوفرة حسب المخزن',onPress:()=>router.push('/inventory/stock')},
{title:t('warehouses'),description:'إنشاء المخازن وتحديد مخزن البيع',onPress:()=>router.push('/inventory/warehouses')},
{title:t('transfer'),description:'نقل الكميات بين مخزنين بأمان',onPress:()=>router.push('/inventory/transfer')},
{title:t('adjustment'),description:'مطابقة الرصيد الفعلي مع النظام',onPress:()=>router.push('/inventory/adjustment')},
]}/></Screen>}
