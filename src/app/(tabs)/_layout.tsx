import { Tabs } from 'expo-router';
import { StitchIcon, StitchText, type StitchIconName } from '@/components/stitch';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Pressable, StyleSheet, View, type ColorValue } from 'react-native';
import { useI18n } from '@/i18n/provider';
import { useAuth } from '@/auth/provider';
import { colors, radius, type } from '@/theme';

function TabGlyph({route,color,focused}:{route:string;color:ColorValue;focused:boolean}){
 const names:Record<string,StitchIconName>={index:'home',sales:'pos',inventory:'inventory',parties:'people',more:'more'};
 return <View style={[styles.iconShell,focused&&styles.iconShellActive]}><StitchIcon name={names[route]??'more'} size={23} color={String(color)}/></View>;
}

export default function TabsLayout(){
  const {t,isRTL}=useI18n(),auth=useAuth(),insets=useSafeAreaInsets();
  const canSales=['pos.view','pos.create','purchases.view','purchases.create','expenses.view','records.view'].some(cap=>auth.has(cap as Parameters<typeof auth.has>[0]));
  const canInventory=['products.view','warehouses.view','warehouses.inventory.view','warehouses.transfer','warehouses.adjust'].some(cap=>auth.has(cap as Parameters<typeof auth.has>[0]));
  const canParties=auth.has('customers.view')||auth.has('suppliers.view');
  const canMore=auth.has('banks.view')||auth.has('reports.view')||auth.has('settings.view');
  const labels={index:t('home'),sales:t('sales'),inventory:t('inventory'),parties:t('parties'),more:t('more')};
  const allowed={index:true,sales:canSales,inventory:canInventory,parties:canParties,more:canMore};
  return <Tabs tabBar={({state,navigation})=><View accessibilityRole="tablist" style={{flexDirection:isRTL?'row-reverse':'row',paddingBottom:Math.max(insets.bottom,8),paddingTop:8,minHeight:64+insets.bottom,backgroundColor:colors.background,borderTopWidth:1,borderTopColor:colors.border}}>{state.routes.filter(route=>allowed[route.name as keyof typeof allowed]).map(route=>{const focused=state.routes[state.index]?.key===route.key;return <Pressable key={route.key} accessibilityRole="tab" accessibilityState={{selected:focused}} accessibilityLabel={labels[route.name as keyof typeof labels]} onPress={()=>{const event=navigation.emit({type:'tabPress',target:route.key,canPreventDefault:true});if(!focused&&!event.defaultPrevented)navigation.navigate(route.name)}} onLongPress={()=>navigation.emit({type:'tabLongPress',target:route.key})} style={{flex:1,minHeight:44,alignItems:'center',justifyContent:'center',gap:2}}>{focused?<View style={{position:'absolute',top:0,width:24,height:2,borderRadius:2,backgroundColor:colors.accent}}/>:null}<TabGlyph route={route.name} focused={focused} color={focused?colors.accent:colors.textSoft}/><StitchText size={11} bold={focused} color={focused?colors.accent:colors.textSoft}>{labels[route.name as keyof typeof labels]}</StitchText></Pressable>})}</View>} screenOptions={({route})=>({
    headerShown:false,
    tabBarHideOnKeyboard:true,
    tabBarActiveTintColor:colors.accent,
    tabBarInactiveTintColor:colors.textSoft,
    sceneStyle:{backgroundColor:colors.background},
    tabBarStyle:[styles.tabBar,{height:64+insets.bottom,paddingBottom:Math.max(insets.bottom,8)}],
    tabBarItemStyle:styles.tabItem,
    tabBarLabelStyle:styles.tabLabel,
    tabBarIcon:({color,focused})=><TabGlyph route={route.name} color={color} focused={focused}/>,
  })}>
    <Tabs.Screen name="index" options={{title:t('home')}}/>
    <Tabs.Screen name="sales" options={{title:t('sales'),href:canSales?undefined:null}}/>
    <Tabs.Screen name="inventory" options={{title:t('inventory'),href:canInventory?undefined:null}}/>
    <Tabs.Screen name="parties" options={{title:t('parties'),href:canParties?undefined:null}}/>
    <Tabs.Screen name="more" options={{title:t('more'),href:canMore?undefined:null}}/>
  </Tabs>;
}

const styles=StyleSheet.create({
  tabBar:{height:72,paddingTop:6,paddingBottom:8,borderTopColor:colors.border,backgroundColor:colors.surface,elevation:0},
  tabItem:{marginHorizontal:1,marginVertical:1},
  tabLabel:{fontSize:type.caption,fontWeight:'500',fontFamily:'StitchArabic',marginTop:1},
  iconShell:{width:38,height:30,borderRadius:radius.md,alignItems:'center',justifyContent:'center'},
  iconShellActive:{backgroundColor:colors.accentSoft},
  homeGlyph:{width:20,height:19,alignItems:'center',justifyContent:'flex-end'},
  homeRoof:{position:'absolute',top:1,width:13,height:13,borderTopWidth:2,borderLeftWidth:2,transform:[{rotate:'45deg'}],borderRadius:2},
  homeBody:{width:14,height:11,borderWidth:2,borderTopWidth:0,borderRadius:3},
  salesGlyph:{width:20,height:20,alignItems:'flex-start',justifyContent:'center',gap:3},
  salesBar:{height:2,borderRadius:2},
  salesDot:{position:'absolute',right:1,top:4,width:5,height:5,borderRadius:3},
  gridGlyph:{width:19,height:19,flexDirection:'row',flexWrap:'wrap',gap:3},
  gridCell:{width:8,height:8,borderWidth:2,borderRadius:2},
  peopleGlyph:{width:22,height:20,alignItems:'center',justifyContent:'flex-end'},
  personHead:{position:'absolute',top:1,left:3,width:8,height:8,borderWidth:2,borderRadius:4},
  personHeadSmall:{left:13,top:4,width:6,height:6,borderRadius:3},
  personBody:{width:17,height:9,borderWidth:2,borderBottomWidth:0,borderTopLeftRadius:9,borderTopRightRadius:9},
  moreGlyph:{flexDirection:'row',gap:3,alignItems:'center'},
  moreDot:{width:5,height:5,borderRadius:3},
});
