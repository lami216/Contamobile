import { Tabs } from 'expo-router';
import { StyleSheet, View, type ColorValue } from 'react-native';
import { useI18n } from '@/i18n/provider';
import { useAuth } from '@/auth/provider';
import { colors, radius, type } from '@/theme';

function TabGlyph({route,color,focused}:{route:string;color:ColorValue;focused:boolean}){
  return <View style={[styles.iconShell,focused&&styles.iconShellActive]}>
    {route==='index'?<View style={styles.homeGlyph}><View style={[styles.homeRoof,{borderColor:color}]}/><View style={[styles.homeBody,{borderColor:color}]}/></View>:null}
    {route==='sales'?<View style={styles.salesGlyph}><View style={[styles.salesBar,{backgroundColor:color,width:15}]}/><View style={[styles.salesBar,{backgroundColor:color,width:11}]}/><View style={[styles.salesDot,{backgroundColor:color}]}/></View>:null}
    {route==='inventory'?<View style={styles.gridGlyph}>{[0,1,2,3].map(i=><View key={i} style={[styles.gridCell,{borderColor:color}]}/>)}</View>:null}
    {route==='parties'?<View style={styles.peopleGlyph}><View style={[styles.personHead,{borderColor:color}]}/><View style={[styles.personBody,{borderColor:color}]}/><View style={[styles.personHead,styles.personHeadSmall,{borderColor:color}]}/></View>:null}
    {route==='more'?<View style={styles.moreGlyph}>{[0,1,2].map(i=><View key={i} style={[styles.moreDot,{backgroundColor:color}]}/>)}</View>:null}
  </View>;
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
    tabBarInactiveTintColor:colors.textSoft,
    sceneStyle:{backgroundColor:colors.background},
    tabBarStyle:styles.tabBar,
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
  tabLabel:{fontSize:type.caption,fontWeight:'700',marginTop:1},
  iconShell:{width:38,height:30,borderRadius:radius.md,alignItems:'center',justifyContent:'center'},
  iconShellActive:{backgroundColor:colors.primarySoft},
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
