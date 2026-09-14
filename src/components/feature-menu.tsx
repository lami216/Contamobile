import { Pressable, StyleSheet, View } from 'react-native';
import { AppText, Badge } from './ui';
import { colors, radius, spacing, touch } from '@/theme';
import { useI18n } from '@/i18n/provider';

export type FeatureItem={title:string;description:string;onPress:()=>void;badge?:string;primary?:boolean};

export function FeatureMenu({items}:{items:FeatureItem[]}){
  const {isRTL}=useI18n();
  return <View style={styles.panel}>{items.map((item,index)=><Pressable accessibilityRole="button" key={item.title} onPress={item.onPress} style={({pressed})=>[
    styles.item,
    item.primary&&styles.primary,
    index===items.length-1&&styles.lastItem,
    pressed&&styles.pressed,
    {flexDirection:isRTL?'row-reverse':'row'},
  ]}><View style={styles.marker}><View style={[styles.markerRule,item.primary&&styles.markerRulePrimary]}/><AppText variant="caption" style={item.primary?styles.markerTextPrimary:styles.markerText}>{String(index+1).padStart(2,'0')}</AppText></View><View style={styles.body}><View style={[styles.titleRow,{flexDirection:isRTL?'row-reverse':'row'}]}><AppText variant="subheading" style={styles.title}>{item.title}</AppText>{item.badge?<Badge label={item.badge} tone={item.primary?'primary':'neutral'}/>:null}</View><AppText variant="caption" muted style={styles.description}>{item.description}</AppText></View><View style={[styles.arrow,{transform:[{scaleX:isRTL?-1:1}]}]}><AppText variant="heading" style={item.primary?styles.arrowPrimary:styles.arrowText}>›</AppText></View></Pressable>)}</View>;
}

const styles=StyleSheet.create({
  panel:{backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,overflow:'hidden'},
  item:{minHeight:82,alignItems:'center',gap:spacing.sm,paddingHorizontal:spacing.md,paddingVertical:spacing.sm,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border},
  lastItem:{borderBottomWidth:0},
  primary:{backgroundColor:colors.primaryFaint},
  marker:{width:touch.min,alignItems:'center',justifyContent:'center',gap:5},
  markerRule:{width:20,height:2,borderRadius:2,backgroundColor:colors.borderStrong},
  markerRulePrimary:{backgroundColor:colors.accent},
  markerText:{color:colors.textSoft,fontWeight:'700'},
  markerTextPrimary:{color:colors.primary,fontWeight:'800'},
  body:{flex:1,gap:spacing.xs},
  titleRow:{alignItems:'center',gap:spacing.xs,flexWrap:'wrap'},
  title:{flexShrink:1},
  description:{lineHeight:18},
  arrow:{width:28,height:touch.min,alignItems:'center',justifyContent:'center'},
  arrowText:{color:colors.textSoft},
  arrowPrimary:{color:colors.primary},
  pressed:{backgroundColor:colors.surfaceMuted},
});
