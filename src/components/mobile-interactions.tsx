import { type ReactNode } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, Money } from '@/components/ui';
import { colors, elevation, radius, spacing, touch } from '@/theme';
import { useI18n } from '@/i18n/provider';

export function QuantityStepper({value,onDecrease,onIncrease,onEdit}:{value:number;onDecrease:()=>void;onIncrease:()=>void;onEdit?:()=>void}){
  const {isRTL,number}=useI18n();
  const controls=<><Pressable accessibilityRole="button" accessibilityLabel="decrease" onPress={onDecrease} style={({pressed})=>[styles.stepButton,pressed&&styles.stepPressed]}><AppText variant="heading" style={styles.stepSymbol}>−</AppText></Pressable><Pressable accessibilityRole={onEdit?'button':undefined} onPress={onEdit} disabled={!onEdit} style={({pressed})=>[styles.stepValue,pressed&&onEdit&&styles.stepPressed]}><AppText variant="subheading" style={styles.stepNumber}>{number(value)}</AppText></Pressable><Pressable accessibilityRole="button" accessibilityLabel="increase" onPress={onIncrease} style={({pressed})=>[styles.stepButton,styles.stepButtonPrimary,pressed&&styles.stepPressed]}><AppText variant="heading" style={styles.stepPlus}>+</AppText></Pressable></>;
  return <View style={[styles.stepper,{flexDirection:isRTL?'row-reverse':'row'}]}>{controls}</View>;
}

export function BottomActionBar({label,total,count,onPress,disabled=false,loading=false,secondary}:{label:string;total:number;count?:number;onPress:()=>void;disabled?:boolean;loading?:boolean;secondary?:string}){
  const insets=useSafeAreaInsets(),{isRTL,number}=useI18n();
  return <View style={[styles.bottomBar,{paddingBottom:Math.max(insets.bottom,spacing.sm)}]}><View style={[styles.bottomInner,{flexDirection:isRTL?'row-reverse':'row'}]}><View style={styles.bottomSummary}>{typeof count==='number'?<AppText variant="caption" muted>{number(count)} {secondary??''}</AppText>:secondary?<AppText variant="caption" muted>{secondary}</AppText>:null}<Money value={total} large/></View><Pressable accessibilityRole="button" disabled={disabled||loading} onPress={onPress} style={({pressed})=>[styles.checkout,pressed&&styles.checkoutPressed,(disabled||loading)&&styles.disabled]}>{loading?<ActivityIndicator color={colors.onPrimary}/>:<AppText variant="subheading" style={styles.checkoutText}>{label}</AppText>}</Pressable></View></View>;
}

export function StickyActionBar({label,onPress,disabled=false,loading=false,summary,secondaryAction}:{label:string;onPress:()=>void;disabled?:boolean;loading?:boolean;summary?:string;secondaryAction?:ReactNode}){
  const insets=useSafeAreaInsets(),{isRTL}=useI18n();
  return <View style={[styles.bottomBar,{paddingBottom:Math.max(insets.bottom,spacing.sm)}]}><View style={[styles.bottomInner,{flexDirection:isRTL?'row-reverse':'row'}]}>{summary?<View style={styles.bottomSummary}><AppText variant="caption" muted>{summary}</AppText></View>:secondaryAction?<View style={styles.secondarySlot}>{secondaryAction}</View>:<View style={styles.bottomSummary}/>}<Pressable accessibilityRole="button" disabled={disabled||loading} onPress={onPress} style={({pressed})=>[styles.checkout,pressed&&styles.checkoutPressed,(disabled||loading)&&styles.disabled]}>{loading?<ActivityIndicator color={colors.onPrimary}/>:<AppText variant="subheading" style={styles.checkoutText}>{label}</AppText>}</Pressable></View></View>;
}

export function Sheet({visible,title,onClose,children,footer}:{visible:boolean;title:string;onClose:()=>void;children:ReactNode;footer?:ReactNode}){
  const insets=useSafeAreaInsets(),{isRTL}=useI18n();
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View style={styles.overlay}><Pressable accessibilityRole="button" accessibilityLabel="close" style={StyleSheet.absoluteFill} onPress={onClose}/><View style={[styles.sheet,{paddingBottom:Math.max(insets.bottom,spacing.lg)}]}><View style={styles.handle}/><View style={[styles.sheetHead,{flexDirection:isRTL?'row-reverse':'row'}]}><AppText variant="heading">{title}</AppText><Pressable accessibilityRole="button" onPress={onClose} style={({pressed})=>[styles.close,pressed&&styles.closePressed]}><AppText variant="subheading" muted>×</AppText></Pressable></View><View style={styles.sheetBody}>{children}</View>{footer?<View style={styles.sheetFooter}>{footer}</View>:null}</View></View></Modal>;
}

export function HeroAction({eyebrow,title,subtitle,actionLabel,onPress,trailing}:{eyebrow?:string;title:string;subtitle?:string;actionLabel:string;onPress:()=>void;trailing?:ReactNode}){
  const {isRTL}=useI18n();
  return <View style={styles.hero}><View style={styles.heroAccent}/><View style={[styles.heroTop,{flexDirection:isRTL?'row-reverse':'row'}]}><View style={styles.heroCopy}>{eyebrow?<AppText variant="caption" style={styles.heroEyebrow}>{eyebrow}</AppText>:null}<AppText variant="title" style={styles.heroTitle}>{title}</AppText>{subtitle?<AppText variant="caption" style={styles.heroSubtitle}>{subtitle}</AppText>:null}</View>{trailing}</View><Pressable accessibilityRole="button" onPress={onPress} style={({pressed})=>[styles.heroButton,{flexDirection:isRTL?'row-reverse':'row'},pressed&&styles.heroButtonPressed]}><AppText variant="subheading" style={styles.heroButtonText}>{actionLabel}</AppText><AppText variant="heading" style={styles.heroArrow}>{isRTL?'←':'→'}</AppText></Pressable></View>;
}

export function CompactMetric({label,value,tone='normal'}:{label:string;value:number;tone?:'normal'|'positive'|'negative'}){
  return <View style={styles.metric}><View style={styles.metricRule}/><AppText variant="caption" muted>{label}</AppText><Money value={value} tone={tone}/></View>;
}

const styles=StyleSheet.create({
  disabled:{opacity:.45},
  stepper:{alignItems:'center',borderRadius:radius.md,backgroundColor:colors.surfaceMuted,padding:3,gap:3,borderWidth:1,borderColor:colors.border},
  stepButton:{width:touch.min,height:touch.min,borderRadius:radius.sm,alignItems:'center',justifyContent:'center',backgroundColor:colors.surface},
  stepButtonPrimary:{backgroundColor:colors.primarySoft},
  stepValue:{minWidth:46,height:touch.min,alignItems:'center',justifyContent:'center'},
  stepNumber:{fontVariant:['tabular-nums']},
  stepSymbol:{lineHeight:25,color:colors.text},
  stepPlus:{lineHeight:25,color:colors.primary},
  stepPressed:{opacity:.68,transform:[{scale:.97}]},
  bottomBar:{backgroundColor:colors.surface,borderTopWidth:1,borderTopColor:colors.border,paddingTop:spacing.sm,paddingHorizontal:spacing.md,...elevation.floating},
  bottomInner:{alignItems:'center',gap:spacing.md},
  bottomSummary:{flex:1,gap:spacing.xxs},
  secondarySlot:{flex:1},
  checkout:{minHeight:54,minWidth:148,borderRadius:radius.md,alignItems:'center',justifyContent:'center',paddingHorizontal:spacing.lg,backgroundColor:colors.primary},
  checkoutPressed:{backgroundColor:colors.primaryPressed,transform:[{scale:.99}]},
  checkoutText:{color:colors.onPrimary},
  overlay:{flex:1,justifyContent:'flex-end',backgroundColor:colors.overlay},
  sheet:{maxHeight:'88%',backgroundColor:colors.surface,borderTopLeftRadius:radius.xl,borderTopRightRadius:radius.xl,paddingTop:spacing.xs,paddingHorizontal:spacing.md,...elevation.floating},
  handle:{width:38,height:4,borderRadius:99,backgroundColor:colors.borderStrong,alignSelf:'center',marginBottom:spacing.sm},
  sheetHead:{minHeight:touch.comfortable,alignItems:'center',justifyContent:'space-between',gap:spacing.md},
  close:{width:touch.min,height:touch.min,borderRadius:radius.sm,alignItems:'center',justifyContent:'center',backgroundColor:colors.surfaceMuted,borderWidth:1,borderColor:colors.border},
  closePressed:{backgroundColor:colors.surfaceStrong},
  sheetBody:{gap:spacing.md,paddingVertical:spacing.md},
  sheetFooter:{paddingTop:spacing.sm,gap:spacing.sm},
  hero:{position:'relative',overflow:'hidden',borderRadius:radius.xl,backgroundColor:colors.primary,padding:spacing.lg,gap:spacing.lg,...elevation.floating},
  heroAccent:{position:'absolute',top:0,left:0,right:0,height:3,backgroundColor:colors.accent},
  heroTop:{alignItems:'flex-start',justifyContent:'space-between',gap:spacing.md},
  heroCopy:{flex:1,gap:spacing.xs},
  heroEyebrow:{color:'#C9E1D8',fontWeight:'700',letterSpacing:.25},
  heroTitle:{color:colors.onPrimary},
  heroSubtitle:{color:'#DDEBE6',lineHeight:18,maxWidth:420},
  heroButton:{minHeight:52,borderRadius:radius.md,backgroundColor:colors.surface,alignItems:'center',justifyContent:'space-between',paddingHorizontal:spacing.md,gap:spacing.md,borderWidth:1,borderColor:'rgba(255,255,255,.72)'},
  heroButtonPressed:{backgroundColor:'#F2F5F2',transform:[{scale:.99}]},
  heroButtonText:{color:colors.primary},
  heroArrow:{color:colors.accent},
  metric:{flex:1,minWidth:132,backgroundColor:colors.surface,paddingVertical:spacing.md,paddingHorizontal:spacing.md,gap:spacing.xs,borderBottomWidth:1,borderBottomColor:colors.border},
  metricRule:{width:28,height:2,borderRadius:2,backgroundColor:colors.accent,marginBottom:spacing.xxs},
});
