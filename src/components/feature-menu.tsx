import { Pressable, StyleSheet, View } from 'react-native';
import { AppText, Card } from './ui';
import { colors, radius, spacing, touch } from '@/theme';
import { useI18n } from '@/i18n/provider';

export type FeatureItem={title:string;description:string;onPress:()=>void;badge?:string};
export function FeatureMenu({items}:{items:FeatureItem[]}) {
  const {isRTL}=useI18n();
  return <View style={styles.list}>{items.map((item,index)=><Pressable accessibilityRole="button" key={item.title} onPress={item.onPress} style={({pressed})=>[styles.pressable,pressed&&styles.pressed]}>
    <Card elevated style={[styles.item,{flexDirection:isRTL?'row-reverse':'row'}]}>
      <View style={styles.index}><AppText variant="caption" style={styles.indexText}>{String(index+1).padStart(2,'0')}</AppText></View>
      <View style={styles.body}><AppText variant="subheading" style={styles.title}>{item.title}</AppText><AppText variant="caption" muted>{item.description}</AppText></View>
      {item.badge?<View style={styles.badge}><AppText variant="caption" style={styles.badgeText}>{item.badge}</AppText></View>:null}
      <AppText style={[styles.arrow,{transform:[{scaleX:isRTL?-1:1}]}]}>›</AppText>
    </Card>
  </Pressable>)}</View>;
}
const styles=StyleSheet.create({
  list:{gap:spacing.sm},
  pressable:{borderRadius:radius.lg},
  item:{minHeight:touch.min+30,alignItems:'center',gap:spacing.sm},
  index:{width:36,height:36,borderRadius:12,alignItems:'center',justifyContent:'center',backgroundColor:colors.primarySoft},
  indexText:{color:colors.primary,fontWeight:'800'},
  body:{flex:1,gap:spacing.xxs},
  title:{fontWeight:'700'},
  badge:{backgroundColor:colors.accentSoft,paddingHorizontal:spacing.sm,paddingVertical:spacing.xxs,borderRadius:99},
  badgeText:{color:colors.accent,fontWeight:'700'},
  arrow:{fontSize:28,color:colors.textSubtle},
  pressed:{opacity:.72,transform:[{scale:.99}]},
});
