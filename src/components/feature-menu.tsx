import { Pressable, StyleSheet, View } from 'react-native';
import { AppText, Card } from './ui';
import { colors, spacing, touch } from '@/theme';
import { useI18n } from '@/i18n/provider';

export type FeatureItem={title:string;description:string;onPress:()=>void;badge?:string};
export function FeatureMenu({items}:{items:FeatureItem[]}){const {isRTL}=useI18n();return <View style={styles.list}>{items.map(item=><Pressable accessibilityRole="button" key={item.title} onPress={item.onPress} style={({pressed})=>pressed&&styles.pressed}><Card style={[styles.item,{flexDirection:isRTL?'row-reverse':'row'}]}><View style={styles.body}><AppText variant="subheading">{item.title}</AppText><AppText variant="caption" muted>{item.description}</AppText></View>{item.badge?<View style={styles.badge}><AppText variant="caption">{item.badge}</AppText></View>:null}</Card></Pressable>)}</View>}
const styles=StyleSheet.create({list:{gap:spacing.sm},item:{minHeight:touch.min+28,alignItems:'center'},body:{flex:1,gap:spacing.xxs},badge:{backgroundColor:colors.primarySoft,paddingHorizontal:spacing.sm,paddingVertical:spacing.xxs,borderRadius:99},pressed:{opacity:.7}});
