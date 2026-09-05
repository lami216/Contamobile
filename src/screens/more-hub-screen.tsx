import { router } from 'expo-router';
import { FeatureMenu } from '@/components/feature-menu';
import { AppText, EmptyState, Screen } from '@/components/ui';
import { useI18n } from '@/i18n/provider';
import { useAuth } from '@/auth/provider';
export function MoreHubScreen(){const {t,locale}=useI18n(),auth=useAuth();const ar=locale==='ar';const items=[
auth.has('banks.view')?{title:t('accounts'),description:ar?'الأرصدة والحركات والتحويل والسحب والإيداع':'Soldes, mouvements, transferts, dépôts et retraits.',onPress:()=>router.push('/more/accounts')}:null,
auth.has('reports.view')?{title:t('reports'),description:ar?'المبيعات والأرباح والمخزون والديون والمصاريف':'Ventes, bénéfices, stock, dettes et dépenses.',onPress:()=>router.push('/more/reports')}:null,
auth.has('settings.view')?{title:t('settings'),description:ar?'اللغة والبيانات والنسخ الاحتياطي والمستخدمون':'Langue, données, sauvegardes et utilisateurs.',onPress:()=>router.push('/more/settings')}:null,
].filter((item):item is NonNullable<typeof item>=>item!==null);return <Screen scroll><AppText variant="title">{t('more')}</AppText>{items.length?<FeatureMenu items={items}/>:<EmptyState title={ar?'لا توجد وظائف متاحة لحسابك':'Aucune fonction disponible pour ce compte.'}/>}</Screen>}
