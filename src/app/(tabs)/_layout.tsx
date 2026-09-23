import { Tabs } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useI18n } from '@/i18n/provider';
import { useAuth } from '@/auth/provider';
import { colors, radius, shadow, type } from '@/theme';

const glyphs:Record<string,string>={index:'⌂',sales:'↗',inventory:'▦',parties:'◉',more:'•••'};
function TabIcon({route,color,focused}:{route:string;color:string;focused:boolean}) {
  return <View style={[styles.iconShell,focused&&styles.iconShellActive]}><Text style={[styles.icon,{color}]}>{glyphs[route]}</Text></View>;
}

export default function TabsLayout(){
  const {t}=useI18n(),auth=useAuth();
  const canSales=['pos.view','pos.create','purchases.view','purchases.create','expenses.view','records.view'].some(cap=>auth.has(cap as Parameters<typeof auth.has>[0]));
  const canInventory=['products.view','warehouses.view','warehouses.inventory.view','warehouses.transfer','warehouses.adjust'].some(cap=>auth.has(cap as Parameters<typeof auth.has>[0]));
  const canParties=auth.has('customers.view')||auth.has('suppliers.view');
  const canMore=auth.has('banks.view')||auth.has('reports.view')||auth.has('settings.view');
  return <Tabs screenOptions={({route})=>({
    headerShown:false,
    tabBarHideOnKeyboard:true,
    tabBarActiveTintColor:colors.primary,
    tabBarInactiveTintColor:colors.textSubtle,
    tabBarStyle:styles.tabBar,
    tabBarLabelStyle:styles.tabLabel,
    tabBarItemStyle:styles.tabItem,
    tabBarIcon:({color,focused})=><TabIcon route={route.name} color={color} focused={focused}/>,
  })}>
    <Tabs.Screen name="index" options={{title:t('home')}}/>
    <Tabs.Screen name="sales" options={{title:t('sales'),href:canSales?undefined:null}}/>
    <Tabs.Screen name="inventory" options={{title:t('inventory'),href:canInventory?undefined:null}}/>
    <Tabs.Screen name="parties" options={{title:t('parties'),href:canParties?undefined:null}}/>
    <Tabs.Screen name="more" options={{title:t('more'),href:canMore?undefined:null}}/>
  </Tabs>;
}

const styles=StyleSheet.create({
  tabBar:{height:74,paddingTop:7,paddingBottom:10,paddingHorizontal:8,borderTopWidth:0,backgroundColor:colors.surface,borderTopLeftRadius:radius.xl,borderTopRightRadius:radius.xl,...shadow.floating},
  tabItem:{borderRadius:radius.md},
  tabLabel:{fontSize:type.caption,fontWeight:'800',marginTop:1},
  iconShell:{minWidth:34,height:26,borderRadius:13,alignItems:'center',justifyContent:'center'},
  iconShellActive:{backgroundColor:colors.primarySoft},
  icon:{fontSize:18,fontWeight:'800',lineHeight:22},
});
