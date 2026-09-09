import { Tabs } from 'expo-router';
import { useI18n } from '@/i18n/provider';
import { useAuth } from '@/auth/provider';
import { colors, radius, type } from '@/theme';

export default function TabsLayout(){
  const {t}=useI18n(),auth=useAuth();
  const canSales=['pos.view','pos.create','purchases.view','purchases.create','expenses.view','records.view'].some(cap=>auth.has(cap as Parameters<typeof auth.has>[0]));
  const canInventory=['products.view','warehouses.view','warehouses.inventory.view','warehouses.transfer','warehouses.adjust'].some(cap=>auth.has(cap as Parameters<typeof auth.has>[0]));
  const canParties=auth.has('customers.view')||auth.has('suppliers.view');
  const canMore=auth.has('banks.view')||auth.has('reports.view')||auth.has('settings.view');
  return <Tabs screenOptions={{headerShown:false,tabBarHideOnKeyboard:true,tabBarActiveTintColor:colors.primary,tabBarInactiveTintColor:colors.textMuted,tabBarActiveBackgroundColor:colors.primaryFaint,sceneStyle:{backgroundColor:colors.background},tabBarStyle:{height:70,paddingTop:4,paddingBottom:6,borderTopColor:colors.border,backgroundColor:colors.surface},tabBarItemStyle:{borderRadius:radius.md,marginHorizontal:3,marginVertical:5},tabBarLabelStyle:{fontSize:type.caption,fontWeight:'800'}}}>
    <Tabs.Screen name="index" options={{title:t('home')}}/>
    <Tabs.Screen name="sales" options={{title:t('sales'),href:canSales?undefined:null}}/>
    <Tabs.Screen name="inventory" options={{title:t('inventory'),href:canInventory?undefined:null}}/>
    <Tabs.Screen name="parties" options={{title:t('parties'),href:canParties?undefined:null}}/>
    <Tabs.Screen name="more" options={{title:t('more'),href:canMore?undefined:null}}/>
  </Tabs>;
}
