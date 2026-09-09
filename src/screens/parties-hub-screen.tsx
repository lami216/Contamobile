import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { FeatureMenu } from '@/components/feature-menu';
import { AppText, EmptyState, Screen } from '@/components/ui';
import { useI18n } from '@/i18n/provider';
import { useAuth } from '@/auth/provider';
import { spacing } from '@/theme';

export function PartiesHubScreen(){
  const {t,locale}=useI18n(),auth=useAuth();const ar=locale==='ar';
  const items=[
    auth.has('customers.view')?{title:t('customers'),description:ar?'الأرصدة والتحصيل وسجل تعاملات العملاء في مكان واحد':'Soldes, encaissements et historique des clients au même endroit.',onPress:()=>router.push('/parties/customers'),primary:true}:null,
    auth.has('suppliers.view')?{title:t('suppliers'),description:ar?'الأرصدة والدفع وسجل تعاملات الموردين':'Soldes, paiements et historique des fournisseurs.',onPress:()=>router.push('/parties/suppliers')}:null,
  ].filter((item):item is NonNullable<typeof item>=>item!==null);
  return <Screen scroll><View style={styles.header}><AppText variant="title">{t('parties')}</AppText><AppText variant="caption" muted>{ar?'اعرف الرصيد أولًا، ثم نفّذ التحصيل أو الدفع من صفحة الحساب.':'Voyez le solde d’abord, puis encaissez ou payez depuis le compte.'}</AppText></View>{items.length?<FeatureMenu items={items}/>:<EmptyState title={ar?'لا توجد وظائف متاحة لحسابك':'Aucune fonction disponible pour ce compte.'}/>}</Screen>;
}

const styles=StyleSheet.create({header:{gap:spacing.xxs}});
