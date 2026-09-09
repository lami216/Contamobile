import { router } from 'expo-router';
import { FeatureMenu } from '@/components/feature-menu';
import { HeroAction } from '@/components/mobile-interactions';
import { AppText, EmptyState, Screen } from '@/components/ui';
import { useI18n } from '@/i18n/provider';
import { useAuth } from '@/auth/provider';
import { spacing } from '@/theme';
import { StyleSheet, View } from 'react-native';

export function SalesHubScreen(){
  const {t,locale}=useI18n(),auth=useAuth(),ar=locale==='ar';
  const canNewSale=auth.has('pos.create');
  const items=[
    auth.has('purchases.view')||auth.has('purchases.create')?{title:t('purchases'),description:ar?'فواتير الموردين وتحديث تكلفة المخزون':'Factures fournisseurs et mise à jour du coût du stock.',onPress:()=>router.push('/sales/purchases')}:null,
    auth.has('expenses.view')?{title:t('expenses'),description:ar?'تسجيل ومراجعة المصاريف من وسائل الدفع':'Saisir et consulter les dépenses par moyen de paiement.',onPress:()=>router.push('/sales/expenses')}:null,
    auth.has('records.view')?{title:t('records'),description:ar?'مراجعة الفواتير والحركات السابقة والتعديل والمشاركة':'Consulter, modifier et partager les opérations précédentes.',onPress:()=>router.push('/sales/records')}:null,
  ].filter((item):item is NonNullable<typeof item>=>item!==null);
  if(!canNewSale&&!items.length)return <Screen><EmptyState title={ar?'لا توجد وظائف متاحة لحسابك':'Aucune fonction disponible pour ce compte.'}/></Screen>;
  return <Screen scroll><View style={styles.header}><AppText variant="title">{t('sales')}</AppText><AppText variant="caption" muted>{ar?'البيع اليومي أولًا، ثم العمليات الأقل تكرارًا.':'La vente quotidienne d’abord, puis les opérations secondaires.'}</AppText></View>{canNewSale?<HeroAction eyebrow={ar?'الأسرع':'Accès rapide'} title={t('newSale')} subtitle={ar?'ابحث عن المنتج، عدّل الكمية بإبهامك، ثم أكمل الدفع بدون مغادرة السلة.':'Recherchez, ajustez la quantité puis payez sans quitter le panier.'} actionLabel={ar?'فتح نقطة البيع':'Ouvrir la caisse'} onPress={()=>router.push('/sales/pos')}/>:null}{items.length?<FeatureMenu items={items}/>:null}</Screen>;
}

const styles=StyleSheet.create({header:{gap:spacing.xxs}});
