import { Tabs } from 'expo-router';
import { useI18n } from '@/i18n/provider';
import { colors, type } from '@/theme';

export default function TabsLayout(){const {t}=useI18n();return <Tabs screenOptions={{headerShown:false,tabBarActiveTintColor:colors.primary,tabBarInactiveTintColor:colors.textMuted,tabBarStyle:{height:64,paddingTop:6,paddingBottom:8,borderTopColor:colors.border,backgroundColor:colors.surface},tabBarLabelStyle:{fontSize:type.caption,fontWeight:'700'}}}>
  <Tabs.Screen name="index" options={{title:t('home')}}/>
  <Tabs.Screen name="sales" options={{title:t('sales')}}/>
  <Tabs.Screen name="inventory" options={{title:t('inventory')}}/>
  <Tabs.Screen name="parties" options={{title:t('parties')}}/>
  <Tabs.Screen name="more" options={{title:t('more')}}/>
</Tabs>}
