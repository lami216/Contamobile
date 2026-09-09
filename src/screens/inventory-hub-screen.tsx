import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { FeatureMenu } from '@/components/feature-menu';
import { AppText, EmptyState, Screen } from '@/components/ui';
import { useI18n } from '@/i18n/provider';
import { useAuth } from '@/auth/provider';
import { spacing } from '@/theme';

export function InventoryHubScreen(){
  const {t,locale}=useI18n(),auth=useAuth();const ar=locale==='ar';
  const items=[
    auth.has('warehouses.inventory.view')?{title:t('stock'),description:ar?'شاهد الكميات المتوفرة بسرعة حسب المخزن وابحث عن أي منتج.':'Consultez rapidement les quantités par dépôt et recherchez un produit.',onPress:()=>router.push('/inventory/stock'),primary:true}:null,
    auth.has('products.view')?{title:t('products'),description:ar?'الأسعار والباركود والصلاحية ورصيد البداية':'Prix, codes-barres, péremption et stock initial.',onPress:()=>router.push('/inventory/products')}:null,
    auth.has('warehouses.transfer')?{title:t('transfer'),description:ar?'نقل الكميات بين مخزنين بأمان':'Transférer les quantités entre deux dépôts.',onPress:()=>router.push('/inventory/transfer')}:null,
    auth.has('warehouses.adjust')?{title:t('adjustment'),description:ar?'مطابقة الرصيد الفعلي مع النظام':'Aligner le stock réel avec le système.',onPress:()=>router.push('/inventory/adjustment')}:null,
    auth.has('warehouses.view')?{title:t('warehouses'),description:ar?'إدارة المخازن وتحديد مخزن البيع الافتراضي':'Gérer les dépôts et le dépôt de vente par défaut.',onPress:()=>router.push('/inventory/warehouses')}:null,
  ].filter((item):item is NonNullable<typeof item>=>item!==null);
  return <Screen scroll><View style={styles.header}><AppText variant="title">{t('inventory')}</AppText><AppText variant="caption" muted>{ar?'ابدأ من الكمية الفعلية، ثم انتقل للإدارة عند الحاجة.':'Commencez par le stock réel, puis passez à la gestion si nécessaire.'}</AppText></View>{items.length?<FeatureMenu items={items}/>:<EmptyState title={ar?'لا توجد وظائف متاحة لحسابك':'Aucune fonction disponible pour ce compte.'}/>}</Screen>;
}

const styles=StyleSheet.create({header:{gap:spacing.xxs}});
