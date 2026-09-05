import { router } from 'expo-router';
import { FeatureMenu } from '@/components/feature-menu';
import { AppText, EmptyState, Screen } from '@/components/ui';
import { useI18n } from '@/i18n/provider';
import { useAuth } from '@/auth/provider';
export function SalesHubScreen(){const {t,locale}=useI18n(),auth=useAuth();const ar=locale==='ar';const items=[
auth.has('pos.create')?{title:t('newSale'),description:ar?'بيع سريع مع مخزون ودفع أو آجل':'Vente rapide avec stock, paiement ou crédit.',onPress:()=>router.push('/sales/pos')}:null,
auth.has('purchases.view')||auth.has('purchases.create')?{title:t('purchases'),description:ar?'فواتير الموردين وتحديث تكلفة المخزون':'Factures fournisseurs et mise à jour du coût du stock.',onPress:()=>router.push('/sales/purchases')}:null,
auth.has('expenses.view')?{title:t('expenses'),description:ar?'تسجيل ومراجعة المصاريف من وسائل الدفع':'Saisir et consulter les dépenses par moyen de paiement.',onPress:()=>router.push('/sales/expenses')}:null,
auth.has('records.view')?{title:t('records'),description:ar?'مراجعة الفواتير والحركات السابقة':'Consulter les factures et opérations précédentes.',onPress:()=>router.push('/sales/records')}:null,
].filter((item):item is NonNullable<typeof item>=>item!==null);return <Screen scroll><AppText variant="title">{t('sales')}</AppText>{items.length?<FeatureMenu items={items}/>:<EmptyState title={ar?'لا توجد وظائف متاحة لحسابك':'Aucune fonction disponible pour ce compte.'}/>}</Screen>}
