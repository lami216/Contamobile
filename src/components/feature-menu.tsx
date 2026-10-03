import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { AppText, Badge } from './ui';
import { colors, radius, spacing } from '@/theme';
import { useI18n } from '@/i18n/provider';

export type FeatureItem={title:string;description:string;onPress:()=>void;badge?:string;primary?:boolean};

export function FeatureMenu({items}:{items:FeatureItem[]}){
  const {isRTL}=useI18n(),{width}=useWindowDimensions();
  return <View style={[styles.grid,{flexDirection:isRTL?'row-reverse':'row'}]}>{items.map((item,index)=><Pressable accessibilityRole="button" key={item.title} onPress={item.onPress} style={({pressed})=>[
    styles.item,width<360&&styles.narrow,item.primary&&styles.primary,pressed&&styles.pressed,
  ]}>
    <View style={[styles.top,{flexDirection:isRTL?'row-reverse':'row'}]}><View style={styles.marker}><View style={styles.markerRule}/><AppText variant="caption" style={styles.markerText}>{String(index+1).padStart(2,'0')}</AppText></View><AppText variant="heading" style={styles.arrow}>{isRTL?'‹':'›'}</AppText></View>
    <View style={styles.body}><AppText variant="subheading">{item.title}</AppText><AppText variant="caption" muted style={styles.description}>{item.description}</AppText>{item.badge?<Badge label={item.badge} tone="primary"/>:null}</View>
  </Pressable>)}</View>;
}

const styles=StyleSheet.create({
  grid:{flexWrap:'wrap',gap:spacing.sm,alignItems:'stretch'},
  item:{width:'47.8%',flexGrow:1,minHeight:150,padding:spacing.md,borderWidth:1,borderColor:colors.borderStrong,borderRadius:radius.lg,backgroundColor:colors.surface,gap:spacing.sm},
  narrow:{width:'100%'},
  primary:{borderColor:colors.accent,backgroundColor:colors.surfaceRaised},
  top:{alignItems:'center',justifyContent:'space-between'},
  marker:{width:44,height:44,borderRadius:radius.md,alignItems:'center',justifyContent:'center',gap:4,backgroundColor:colors.accentSoft,borderWidth:1,borderColor:colors.borderStrong},
  markerRule:{width:18,height:2,borderRadius:2,backgroundColor:colors.accent},
  markerText:{color:colors.accent,fontWeight:'800'},
  body:{gap:spacing.xs},
  description:{lineHeight:19},
  arrow:{color:colors.accent},
  pressed:{backgroundColor:colors.surfaceStrong,transform:[{scale:.985}]},
});
