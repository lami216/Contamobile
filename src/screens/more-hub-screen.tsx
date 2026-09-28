import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { AppText, EmptyState, GroupedList, IconTile, PageHeader, Screen } from '@/components/ui';
import { useI18n } from '@/i18n/provider';
import { useAuth } from '@/auth/provider';
import { colors, spacing } from '@/theme';

type MoreItem={title:string;description:string;icon:'accounts'|'reports'|'settings';onPress:()=>void;primary?:boolean};

export function MoreHubScreen(){
  const {t,isRTL}=useI18n(),auth=useAuth();
  const items=[
    auth.has('banks.view')?{title:t('accounts'),description:t('moreAccountsHint'),icon:'accounts',onPress:()=>router.push('/more/accounts'),primary:true}:null,
    auth.has('reports.view')?{title:t('reports'),description:t('moreReportsHint'),icon:'reports',onPress:()=>router.push('/more/reports')}:null,
    auth.has('settings.view')?{title:t('settings'),description:t('moreSettingsHint'),icon:'settings',onPress:()=>router.push('/more/settings')}:null,
  ].filter((item):item is MoreItem=>item!==null);

  return <Screen scroll>
    <PageHeader title={t('more')} subtitle={t('moreSubtitle')}/>
    {items.length?<GroupedList>{items.map((item,index)=><MoreRow key={item.title} item={item} last={index===items.length-1} isRTL={isRTL}/>)}</GroupedList>:<EmptyState title={t('moreNoFunctions')}/>}
  </Screen>;
}

function MoreRow({item,last,isRTL}:{item:MoreItem;last:boolean;isRTL:boolean}){
  return <Pressable accessibilityRole="button" onPress={item.onPress} style={({pressed})=>[styles.row,item.primary&&styles.primary,last&&styles.lastRow,{flexDirection:isRTL?'row-reverse':'row'},pressed&&styles.pressed]}>
    <IconTile tone={item.primary?'primary':'neutral'}>{item.icon==='accounts'?<AccountsGlyph/>:item.icon==='reports'?<ReportsGlyph/>:<SettingsGlyph/>}</IconTile>
    <View style={styles.body}><AppText variant="subheading" style={item.primary?styles.primaryText:undefined}>{item.title}</AppText><AppText variant="caption" muted style={styles.description}>{item.description}</AppText></View>
    <AppText variant="heading" style={[styles.arrow,item.primary&&styles.primaryText]}>{isRTL?'‹':'›'}</AppText>
  </Pressable>;
}

function AccountsGlyph(){return <View style={styles.accountsGlyph}><View style={styles.walletBody}/><View style={styles.walletFlap}/><View style={styles.walletDot}/></View>}
function ReportsGlyph(){return <View style={styles.reportsGlyph}><View style={[styles.reportBar,{height:8}]}/><View style={[styles.reportBar,{height:14}]}/><View style={[styles.reportBar,{height:20}]}/></View>}
function SettingsGlyph(){return <View style={styles.settingsGlyph}><View style={styles.gearOuter}/><View style={styles.gearInner}/><View style={styles.gearTickOne}/><View style={styles.gearTickTwo}/></View>}

const styles=StyleSheet.create({
  row:{minHeight:82,alignItems:'center',gap:spacing.sm,paddingHorizontal:spacing.md,paddingVertical:spacing.sm,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border},
  primary:{backgroundColor:colors.primaryFaint},
  lastRow:{borderBottomWidth:0},
  pressed:{backgroundColor:colors.surfaceMuted},
  body:{flex:1,minWidth:0,gap:spacing.xs},
  description:{lineHeight:18},
  arrow:{color:colors.textSoft,lineHeight:22},
  primaryText:{color:colors.primary},
  accountsGlyph:{width:25,height:22,position:'relative'},
  walletBody:{position:'absolute',left:1,right:1,bottom:1,height:16,borderWidth:2,borderColor:colors.primary,borderRadius:5},
  walletFlap:{position:'absolute',left:5,right:1,top:2,height:8,borderWidth:2,borderColor:colors.primary,borderRadius:4,backgroundColor:colors.primaryFaint},
  walletDot:{position:'absolute',right:5,top:7,width:4,height:4,borderRadius:2,backgroundColor:colors.primary},
  reportsGlyph:{width:24,height:22,flexDirection:'row',alignItems:'flex-end',justifyContent:'center',gap:3},
  reportBar:{width:4,borderRadius:2,backgroundColor:colors.textMuted},
  settingsGlyph:{width:24,height:24,alignItems:'center',justifyContent:'center',position:'relative'},
  gearOuter:{width:18,height:18,borderRadius:9,borderWidth:2,borderColor:colors.textMuted},
  gearInner:{position:'absolute',width:6,height:6,borderRadius:3,borderWidth:2,borderColor:colors.textMuted},
  gearTickOne:{position:'absolute',width:24,height:2,backgroundColor:colors.textMuted,borderRadius:2},
  gearTickTwo:{position:'absolute',width:2,height:24,backgroundColor:colors.textMuted,borderRadius:2},
});
