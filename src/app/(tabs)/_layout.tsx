import { Tabs } from 'expo-router';
import { useI18n } from '@/i18n/provider';
import { useAuth } from '@/auth/provider';
import { colors, type } from '@/theme';

export default function TabsLayout(){const {t}=useI18n(),auth=useAuth();const canSales=['pos.view','pos.create','purchases.view','purchases.create','expenses.view','records.view'].some(cap=>auth.has(cap as Parameters<typeof auth.has>[0]));const canInventory=['products.view','warehouses.view','warehouses.inventory.view','warehouses.transfer','warehouses.adjust'].some(cap=>auth.has(cap as Parameters<typeof auth.has>[0]));const canParties=auth.has('customers.view')||auth.has('suppliers.view');const canMore=auth.has('banks.view')||auth.has('reports.view')||auth.has('settings.view');return <Tabs screenOptions={{headerShown:false,tabBarActiveTintColor:colors.primary,tabBarInactiveTintColor:colors.textMuted,tabBarStyle:{height:64,paddingTop:6,paddingBottom:8,borderTopColor:colors.border,backgroundColor:colors.surface},tabBarLabelStyle:{fontSize:type.caption,fontWeight:'700'}}}>
  <Tabs.Screen name="index" options={{title:t('home')}}/>
  <Tabs.Screen name="sales" options={{title:t('sales'),href:canSales?undefined:null}}/>
  <Tabs.Screen name="inventory" options={{title:t('inventory'),href:canInventory?undefined:null}}/>
  <Tabs.Screen name="parties" options={{title:t('parties'),href:canParties?undefined:null}}/>
  <Tabs.Screen name="more" options={{title:t('more'),href:canMore?undefined:null}}/>
</Tabs>}
