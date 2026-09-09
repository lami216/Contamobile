import { type ReactNode } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, Money } from '@/components/ui';
import { colors, elevation, radius, spacing, touch } from '@/theme';
import { useI18n } from '@/i18n/provider';

export function QuantityStepper({value,onDecrease,onIncrease,onEdit}:{value:number;onDecrease:()=>void;onIncrease:()=>void;onEdit?:()=>void}){
  const {isRTL,number}=useI18n();
  const controls=<>
    <Pressable accessibilityRole="button" accessibilityLabel="decrease" onPress={onDecrease} style={({pressed})=>[styles.stepButton,pressed&&styles.pressed]}><AppText variant="heading" style={styles.stepSymbol}>−</AppText></Pressable>
    <Pressable accessibilityRole={onEdit?'button':undefined} onPress={onEdit} disabled={!onEdit} style={({pressed})=>[styles.stepValue,pressed&&onEdit&&styles.pressed]}><AppText variant="subheading" style={styles.stepNumber}>{number(value)}</AppText></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="increase" onPress={onIncrease} style={({pressed})=>[styles.stepButton,styles.stepButtonPrimary,pressed&&styles.pressed]}><AppText variant="heading" style={styles.stepPlus}>+</AppText></Pressable>
  </>;
  return <View style={[styles.stepper,{flexDirection:isRTL?'row-reverse':'row'}]}>{controls}</View>;
}

export function BottomActionBar({label,total,count,onPress,disabled=false,loading=false,secondary}:{label:string;total:number;count?:number;onPress:()=>void;disabled?:boolean;loading?:boolean;secondary?:string}){
  const insets=useSafeAreaInsets(),{isRTL,number}=useI18n();
  return <View style={[styles.bottomBar,{paddingBottom:Math.max(insets.bottom,spacing.sm)}]}><View style={[styles.bottomInner,{flexDirection:isRTL?'row-reverse':'row'}]}><View style={styles.bottomSummary}>{typeof count==='number'?<AppText variant="caption" muted>{number(count)} {secondary??''}</AppText>:secondary?<AppText variant="caption" muted>{secondary}</AppText>:null}<Money value={total} large/></View><Pressable accessibilityRole="button" disabled={disabled||loading} onPress={onPress} style={({pressed})=>[styles.checkout,pressed&&styles.pressed,(disabled||loading)&&styles.disabled]}>{loading?<ActivityIndicator color={colors.onPrimary}/>:<AppText variant="subheading" style={styles.checkoutText}>{label}</AppText>}</Pressable></View></View>;
}

export function Sheet({visible,title,onClose,children,footer}:{visible:boolean;title:string;onClose:()=>void;children:ReactNode;footer?:ReactNode}){
  const insets=useSafeAreaInsets(),{isRTL}=useI18n();
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View style={styles.overlay}><Pressable accessibilityRole="button" accessibilityLabel="close" style={StyleSheet.absoluteFill} onPress={onClose}/><View style={[styles.sheet,{paddingBottom:Math.max(insets.bottom,spacing.lg)}]}><View style={styles.handle}/><View style={[styles.sheetHead,{flexDirection:isRTL?'row-reverse':'row'}]}><AppText variant="heading">{title}</AppText><Pressable accessibilityRole="button" onPress={onClose} style={({pressed})=>[styles.close,pressed&&styles.pressed]}><AppText variant="subheading" muted>×</AppText></Pressable></View><View style={styles.sheetBody}>{children}</View>{footer?<View style={styles.sheetFooter}>{footer}</View>:null}</View></View></Modal>;
}

export function HeroAction({eyebrow,title,subtitle,actionLabel,onPress,trailing}:{eyebrow?:string;title:string;subtitle?:string;actionLabel:string;onPress:()=>void;trailing?:ReactNode}){
  const {isRTL}=useI18n();
  return <View style={styles.hero}><View style={[styles.heroTop,{flexDirection:isRTL?'row-reverse':'row'}]}><View style={styles.heroCopy}>{eyebrow?<AppText variant="caption" style={styles.heroEyebrow}>{eyebrow}</AppText>:null}<AppText variant="title" style={styles.heroTitle}>{title}</AppText>{subtitle?<AppText variant="caption" style={styles.heroSubtitle}>{subtitle}</AppText>:null}</View>{trailing}</View><Pressable accessibilityRole="button" onPress={onPress} style={({pressed})=>[styles.heroButton,pressed&&styles.pressed]}><AppText variant="subheading" style={styles.heroButtonText}>{actionLabel}</AppText><AppText variant="heading" style={styles.heroArrow}>{isRTL?'←':'→'}</AppText></Pressable></View>;
}

export function CompactMetric({label,value,tone='normal'}:{label:string;value:number;tone?:'normal'|'positive'|'negative'}){
  return <View style={styles.metric}><AppText variant="caption" muted>{label}</AppText><Money value={value} tone={tone}/></View>;
}

const styles=StyleSheet.create({
  pressed:{opacity:.68,transform:[{scale:.985}]},
  disabled:{opacity:.48},
  stepper:{alignItems:'center',borderRadius:radius.full,backgroundColor:colors.surfaceMuted,padding:3,gap:3},
  stepButton:{width:touch.min,height:touch.min,borderRadius:radius.full,alignItems:'center',justifyContent:'center',backgroundColor:colors.surface},
  stepButtonPrimary:{backgroundColor:colors.primarySoft},
  stepValue:{minWidth:46,height:touch.min,alignItems:'center',justifyContent:'center'},
  stepNumber:{fontVariant:['tabular-nums']},
  stepSymbol:{lineHeight:25,color:colors.text},
  stepPlus:{lineHeight:25,color:colors.primary},
  bottomBar:{backgroundColor:colors.surface,borderTopWidth:1,borderTopColor:colors.border,paddingTop:spacing.sm,paddingHorizontal:spacing.md,...elevation.floating},
  bottomInner:{alignItems:'center',gap:spacing.md},
  bottomSummary:{flex:1,gap:spacing.xxs},
  checkout:{minHeight:58,minWidth:148,borderRadius:radius.lg,alignItems:'center',justifyContent:'center',paddingHorizontal:spacing.lg,backgroundColor:colors.primary},
  checkoutText:{color:colors.onPrimary},
  overlay:{flex:1,justifyContent:'flex-end',backgroundColor:colors.overlay},
  sheet:{maxHeight:'88%',backgroundColor:colors.surface,borderTopLeftRadius:radius.xl,borderTopRightRadius:radius.xl,paddingTop:spacing.xs,paddingHorizontal:spacing.md,...elevation.floating},
  handle:{width:42,height:5,borderRadius:99,backgroundColor:colors.borderStrong,alignSelf:'center',marginBottom:spacing.sm},
  sheetHead:{minHeight:touch.comfortable,alignItems:'center',justifyContent:'space-between',gap:spacing.md},
  close:{width:touch.min,height:touch.min,borderRadius:radius.full,alignItems:'center',justifyContent:'center',backgroundColor:colors.surfaceMuted},
  sheetBody:{gap:spacing.md,paddingVertical:spacing.md},
  sheetFooter:{paddingTop:spacing.sm,gap:spacing.sm},
  hero:{borderRadius:radius.xl,backgroundColor:colors.primary,padding:spacing.lg,gap:spacing.lg,...elevation.floating},
  heroTop:{alignItems:'flex-start',justifyContent:'space-between',gap:spacing.md},
  heroCopy:{flex:1,gap:spacing.xs},
  heroEyebrow:{color:'#CDE8DF',fontWeight:'800'},
  heroTitle:{color:colors.onPrimary},
  heroSubtitle:{color:'#DCEFE9',lineHeight:18},
  heroButton:{minHeight:56,borderRadius:radius.lg,backgroundColor:colors.surface,alignItems:'center',justifyContent:'space-between',paddingHorizontal:spacing.md,flexDirection:'row',gap:spacing.md},
  heroButtonText:{color:colors.primary},
  heroArrow:{color:colors.primary},
  metric:{flex:1,minWidth:132,borderRadius:radius.lg,backgroundColor:colors.surface,padding:spacing.md,gap:spacing.xs,borderWidth:1,borderColor:colors.border,...elevation.subtle},
});
