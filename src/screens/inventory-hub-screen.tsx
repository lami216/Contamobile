import { router } from 'expo-router';
import { FeatureMenu } from '@/components/feature-menu';
import { AppText, EmptyState, Screen } from '@/components/ui';
import { useI18n } from '@/i18n/provider';
import { useAuth } from '@/auth/provider';
export function InventoryHubScreen(){const {t,locale}=useI18n(),auth=useAuth();const ar=locale==='ar';const items=[
auth.has('products.view')?{title:t('products'),description:ar?'الأسعار والباركود والصلاحية ورصيد البداية':'Prix, codes-barres, péremption et stock initial.',onPress:()=>router.push('/inventory/products')}:null,
auth.has('warehouses.inventory.view')?{title:t('stock'),description:ar?'الكميات المتوفرة حسب المخزن':'Quantités disponibles par dépôt.',onPress:()=>router.push('/inventory/stock')}:null,
auth.has('warehouses.view')?{title:t('warehouses'),description:ar?'إدارة المخازن وتحديد مخزن البيع':'Gérer les dépôts et le dépôt de vente par défaut.',onPress:()=>router.push('/inventory/warehouses')}:null,
auth.has('warehouses.transfer')?{title:t('transfer'),description:ar?'نقل الكميات بين مخزنين بأمان':'Transférer les quantités entre deux dépôts.',onPress:()=>router.push('/inventory/transfer')}:null,
auth.has('warehouses.adjust')?{title:t('adjustment'),description:ar?'مطابقة الرصيد الفعلي مع النظام':'Aligner le stock réel avec le système.',onPress:()=>router.push('/inventory/adjustment')}:null,
].filter((item):item is NonNullable<typeof item>=>item!==null);return <Screen scroll><AppText variant="title">{t('inventory')}</AppText>{items.length?<FeatureMenu items={items}/>:<EmptyState title={ar?'لا توجد وظائف متاحة لحسابك':'Aucune fonction disponible pour ce compte.'}/>}</Screen>}
