import { Pressable, StyleSheet, View } from 'react-native';
import { AppText, Badge } from './ui';
import { colors, radius, spacing, touch } from '@/theme';
import { useI18n } from '@/i18n/provider';

export type FeatureItem={title:string;description:string;onPress:()=>void;badge?:string;primary?:boolean};

export function FeatureMenu({items}:{items:FeatureItem[]}){
  const {isRTL}=useI18n();
  return <View style={styles.list}>{items.map((item,index)=><Pressable accessibilityRole="button" key={item.title} onPress={item.onPress} style={({pressed})=>[styles.item,item.primary&&styles.primary,pressed&&styles.pressed,{flexDirection:isRTL?'row-reverse':'row'}]}><View style={[styles.marker,item.primary&&styles.markerPrimary]}><AppText variant="subheading" style={item.primary?styles.markerTextPrimary:styles.markerText}>{String(index+1).padStart(2,'0')}</AppText></View><View style={styles.body}><View style={[styles.titleRow,{flexDirection:isRTL?'row-reverse':'row'}]}><AppText variant="subheading" style={styles.title}>{item.title}</AppText>{item.badge?<Badge label={item.badge} tone={item.primary?'primary':'neutral'}/>:null}</View><AppText variant="caption" muted style={styles.description}>{item.description}</AppText></View><View style={[styles.arrow,{transform:[{scaleX:isRTL?-1:1}]}]}><AppText variant="heading" style={item.primary?styles.arrowPrimary:styles.arrowText}>›</AppText></View></Pressable>)}</View>;
}

const styles=StyleSheet.create({
  list:{gap:spacing.sm},
  item:{minHeight:86,alignItems:'center',gap:spacing.sm,padding:spacing.md,borderRadius:radius.lg,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border},
  primary:{backgroundColor:colors.primaryFaint,borderColor:colors.primarySoft},
  marker:{width:touch.min,height:touch.min,borderRadius:radius.md,backgroundColor:colors.surfaceMuted,alignItems:'center',justifyContent:'center'},
  markerPrimary:{backgroundColor:colors.primary},
  markerText:{color:colors.textMuted},
  markerTextPrimary:{color:colors.onPrimary},
  body:{flex:1,gap:spacing.xs},
  titleRow:{alignItems:'center',gap:spacing.xs,flexWrap:'wrap'},
  title:{flexShrink:1},
  description:{lineHeight:18},
  arrow:{width:32,height:44,alignItems:'center',justifyContent:'center'},
  arrowText:{color:colors.textSoft},
  arrowPrimary:{color:colors.primary},
  pressed:{opacity:.66,transform:[{scale:.992}]},
});
