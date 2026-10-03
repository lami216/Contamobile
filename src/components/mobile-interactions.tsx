import { type ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, Button, Money } from '@/components/ui';
import { actionColors, colors, elevation, radius, spacing, touch } from '@/theme';
import { useI18n } from '@/i18n/provider';

export function QuantityStepper({value,onDecrease,onIncrease,onEdit,compact=false}:{value:number;onDecrease:()=>void;onIncrease:()=>void;onEdit?:()=>void;compact?:boolean}){
  const {isRTL,number}=useI18n(),hitSlop=compact?5:0;
  const controls=<><Pressable accessibilityRole="button" accessibilityLabel="decrease" hitSlop={hitSlop} onPress={onDecrease} style={({pressed})=>[styles.stepButton,compact&&styles.stepButtonCompact,pressed&&styles.stepPressed]}><AppText variant="heading" style={styles.stepSymbol}>−</AppText></Pressable><Pressable accessibilityRole={onEdit?'button':undefined} hitSlop={hitSlop} onPress={onEdit} disabled={!onEdit} style={({pressed})=>[styles.stepValue,compact&&styles.stepValueCompact,pressed&&onEdit&&styles.stepPressed]}><AppText variant="subheading" style={styles.stepNumber}>{number(value)}</AppText></Pressable><Pressable accessibilityRole="button" accessibilityLabel="increase" hitSlop={hitSlop} onPress={onIncrease} style={({pressed})=>[styles.stepButton,styles.stepButtonPrimary,compact&&styles.stepButtonCompact,pressed&&styles.stepPressed]}><AppText variant="heading" style={styles.stepPlus}>+</AppText></Pressable></>;
  return <View style={[styles.stepper,compact&&styles.stepperCompact,{flexDirection:isRTL?'row-reverse':'row'}]}>{controls}</View>;
}

export function BottomActionBar({label,total,count,onPress,disabled=false,loading=false,secondary,tone='sale'}:{label:string;total:number;count?:number;onPress:()=>void;disabled?:boolean;loading?:boolean;secondary?:string;tone?:'sale'|'purchase'}){
  const insets=useSafeAreaInsets(),{isRTL,number}=useI18n();
  return <View style={[styles.bottomBar,{paddingBottom:Math.max(insets.bottom,spacing.sm)}]}><View style={[styles.bottomInner,{flexDirection:isRTL?'row-reverse':'row'}]}><View style={styles.bottomSummary}>{typeof count==='number'?<AppText variant="caption" muted>{number(count)} {secondary??''}</AppText>:secondary?<AppText variant="caption" muted>{secondary}</AppText>:null}<Money value={total} large/></View><Pressable accessibilityRole="button" disabled={disabled||loading} onPress={onPress} style={({pressed})=>[styles.checkout,{backgroundColor:actionColors[tone]},pressed&&styles.checkoutPressed,(disabled||loading)&&styles.disabled]}>{loading?<ActivityIndicator color={colors.onPrimary}/>:<AppText variant="subheading" style={styles.checkoutText}>{label}</AppText>}</Pressable></View></View>;
}

export function StickyActionBar({label,onPress,disabled=false,loading=false,summary,secondaryAction}:{label:string;onPress:()=>void;disabled?:boolean;loading?:boolean;summary?:string;secondaryAction?:ReactNode}){
  const insets=useSafeAreaInsets(),{isRTL}=useI18n();
  return <View style={[styles.bottomBar,{paddingBottom:Math.max(insets.bottom,spacing.sm)}]}><View style={[styles.bottomInner,{flexDirection:isRTL?'row-reverse':'row'}]}>{summary?<View style={styles.bottomSummary}><AppText variant="caption" muted>{summary}</AppText></View>:secondaryAction?<View style={styles.secondarySlot}>{secondaryAction}</View>:<View style={styles.bottomSummary}/>}<Pressable accessibilityRole="button" disabled={disabled||loading} onPress={onPress} style={({pressed})=>[styles.checkout,pressed&&styles.checkoutPressed,(disabled||loading)&&styles.disabled]}>{loading?<ActivityIndicator color={colors.onPrimary}/>:<AppText variant="subheading" style={styles.checkoutText}>{label}</AppText>}</Pressable></View></View>;
}

export function Sheet({visible,title,onClose,children,footer,fixedHeight=false,scrollable=true}:{visible:boolean;title:string;onClose:()=>void;children:ReactNode;footer?:ReactNode;fixedHeight?:boolean;scrollable?:boolean}){
  const insets=useSafeAreaInsets(),{isRTL}=useI18n();
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS==='ios'?'padding':undefined}><Pressable accessibilityRole="button" accessibilityLabel="close" style={StyleSheet.absoluteFill} onPress={onClose}/><View style={[styles.sheet,fixedHeight&&styles.sheetFixed,{paddingBottom:Math.max(insets.bottom,spacing.lg)}]}><View style={styles.handle}/><View style={[styles.sheetHead,{flexDirection:isRTL?'row-reverse':'row'}]}><AppText variant="heading">{title}</AppText><Pressable accessibilityRole="button" onPress={onClose} style={({pressed})=>[styles.close,pressed&&styles.closePressed]}><AppText variant="subheading" muted>×</AppText></Pressable></View>{scrollable?<ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>{children}</ScrollView>:<View style={styles.sheetContent}>{children}</View>}{footer?<View style={styles.sheetFooter}>{footer}</View>:null}</View></KeyboardAvoidingView></Modal>;
}

export function FilterSheet({visible,title,onClose,children,applyLabel,onApply,resetLabel,onReset,applyDisabled=false}:{visible:boolean;title:string;onClose:()=>void;children:ReactNode;applyLabel:string;onApply:()=>void;resetLabel?:string;onReset?:()=>void;applyDisabled?:boolean}){
  const footer=<><Button title={applyLabel} disabled={applyDisabled} onPress={onApply}/>{resetLabel&&onReset?<Button title={resetLabel} variant="ghost" onPress={onReset}/>:null}</>;
  return <Sheet visible={visible} title={title} onClose={onClose} footer={footer}>{children}</Sheet>;
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
  stepper:{alignItems:'center',borderRadius:radius.md,backgroundColor:colors.surfaceStrong,padding:2,gap:2,borderWidth:1,borderColor:colors.borderStrong},
  stepperCompact:{padding:1,gap:1},
  stepButton:{width:touch.min,height:touch.min,borderRadius:radius.sm,alignItems:'center',justifyContent:'center',backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border},
  stepButtonCompact:{width:34,height:34},
  stepButtonPrimary:{backgroundColor:colors.primarySoft},
  stepValue:{minWidth:46,height:touch.min,alignItems:'center',justifyContent:'center'},
  stepValueCompact:{minWidth:34,height:34},
  stepNumber:{fontVariant:['tabular-nums']},
  stepSymbol:{lineHeight:25,color:colors.text},
  stepPlus:{lineHeight:25,color:colors.primary},
  stepPressed:{opacity:.68,transform:[{scale:.97}]},
  bottomBar:{backgroundColor:colors.surface,borderTopWidth:1,borderTopColor:colors.borderStrong,paddingTop:spacing.xs,paddingHorizontal:spacing.md,...elevation.subtle},
  bottomInner:{alignItems:'center',gap:spacing.sm},
  bottomSummary:{flex:1,gap:spacing.xxs},
  secondarySlot:{flex:1},
  checkout:{minHeight:48,minWidth:144,borderRadius:radius.md,alignItems:'center',justifyContent:'center',paddingHorizontal:spacing.lg,backgroundColor:actionColors.sale,borderWidth:1,borderColor:colors.accent},
  checkoutPressed:{backgroundColor:colors.primaryPressed,transform:[{scale:.99}]},
  checkoutText:{color:colors.onPrimary},
  overlay:{flex:1,justifyContent:'flex-end',backgroundColor:colors.overlay},
  sheet:{maxHeight:'90%',backgroundColor:colors.surface,borderTopLeftRadius:radius.lg,borderTopRightRadius:radius.lg,paddingTop:spacing.xs,paddingHorizontal:spacing.md,borderTopWidth:1,borderLeftWidth:1,borderRightWidth:1,borderColor:colors.borderStrong,...elevation.floating},
  sheetFixed:{height:'78%',minHeight:520},
  handle:{width:38,height:4,borderRadius:99,backgroundColor:colors.borderStrong,alignSelf:'center',marginBottom:spacing.sm},
  sheetHead:{minHeight:touch.comfortable,alignItems:'center',justifyContent:'space-between',gap:spacing.md,borderBottomWidth:1,borderBottomColor:colors.border},
  close:{width:touch.min,height:touch.min,borderRadius:radius.sm,alignItems:'center',justifyContent:'center',backgroundColor:colors.surfaceMuted,borderWidth:1,borderColor:colors.border},
  closePressed:{backgroundColor:colors.surfaceStrong},
  sheetScroll:{flexShrink:1,flexGrow:1},
  sheetBody:{gap:spacing.sm,paddingVertical:spacing.sm},
  sheetContent:{flex:1,minHeight:0,paddingVertical:spacing.sm,gap:spacing.sm},
  sheetFooter:{paddingTop:spacing.sm,gap:spacing.xs,borderTopWidth:1,borderTopColor:colors.border},
  hero:{position:'relative',overflow:'hidden',borderRadius:radius.xl,borderWidth:1,borderColor:colors.accent,backgroundColor:colors.surfaceRaised,padding:spacing.lg,gap:spacing.lg,...elevation.floating},
  heroAccent:{position:'absolute',top:0,left:0,right:0,height:3,backgroundColor:colors.accent},
  heroTop:{alignItems:'flex-start',justifyContent:'space-between',gap:spacing.md},
  heroCopy:{flex:1,gap:spacing.xs},
  heroEyebrow:{color:colors.onPrimarySoft,fontWeight:'700',letterSpacing:.25},
  heroTitle:{color:colors.onPrimary},
  heroSubtitle:{color:colors.onPrimaryMuted,lineHeight:18,maxWidth:420},
  heroButton:{minHeight:52,borderRadius:radius.md,backgroundColor:actionColors.sale,alignItems:'center',justifyContent:'space-between',paddingHorizontal:spacing.md,gap:spacing.md,borderWidth:1,borderColor:colors.accent},
  heroButtonPressed:{backgroundColor:colors.primaryPressed,transform:[{scale:.99}]},
  heroButtonText:{color:colors.onPrimary},
  heroArrow:{color:colors.onPrimary},
  metric:{flex:1,minWidth:132,backgroundColor:colors.surface,paddingVertical:spacing.md,paddingHorizontal:spacing.md,gap:spacing.xs,borderBottomWidth:1,borderBottomColor:colors.border},
  metricRule:{width:28,height:2,borderRadius:2,backgroundColor:colors.accent,marginBottom:spacing.xxs},
});
