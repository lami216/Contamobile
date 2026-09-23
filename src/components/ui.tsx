import { forwardRef, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, type TextInputProps, type TextStyle, View, type ViewStyle, type StyleProp } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, shadow, spacing, touch, type as typography } from '@/theme';
import { useI18n } from '@/i18n/provider';

export function Screen({children,scroll=false,padded=true}:{children:ReactNode;scroll?:boolean;padded?:boolean}) {
  const content=<View style={[styles.screenContent,padded&&styles.padded]}>{children}</View>;
  return <SafeAreaView edges={['top']} style={styles.safe}>{scroll?<ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>{content}</ScrollView>:content}</SafeAreaView>;
}

export function AppText({children,variant='body',muted=false,style}:{children:ReactNode;variant?:'title'|'heading'|'subheading'|'body'|'caption'|'amount'|'heroAmount';muted?:boolean;style?:StyleProp<TextStyle>}) {
  const {isRTL}=useI18n();
  return <Text style={[styles.text,{fontSize:typography[variant],textAlign:isRTL?'right':'left'},muted&&styles.muted,style]}>{children}</Text>;
}

export function Card({children,style,elevated=false}:{children:ReactNode;style?:StyleProp<ViewStyle>;elevated?:boolean}) {
  return <View style={[styles.card,elevated&&styles.cardElevated,style]}>{children}</View>;
}

export function SectionTitle({title,action,eyebrow}:{title:string;action?:ReactNode;eyebrow?:string}) {
  const {isRTL}=useI18n();
  return <View style={[styles.sectionHead,{flexDirection:isRTL?'row-reverse':'row'}]}><View style={styles.sectionTitleBody}>{eyebrow?<AppText variant="caption" muted>{eyebrow}</AppText>:null}<AppText variant="heading">{title}</AppText></View>{action}</View>;
}

export function Button({title,onPress,variant='primary',disabled=false,loading=false}:{title:string;onPress:()=>void;variant?:'primary'|'secondary'|'danger'|'ghost';disabled?:boolean;loading?:boolean}) {
  return <Pressable accessibilityRole="button" disabled={disabled||loading} onPress={onPress} style={({pressed})=>[styles.button,variant==='primary'&&styles.buttonPrimary,variant==='secondary'&&styles.buttonSecondary,variant==='danger'&&styles.buttonDanger,variant==='ghost'&&styles.buttonGhost,(pressed||disabled)&&styles.buttonDim]}>
    {loading?<ActivityIndicator color={variant==='primary'?colors.onPrimary:colors.primary}/>:<Text style={[styles.buttonText,variant==='primary'&&styles.buttonTextPrimary,variant==='danger'&&styles.buttonTextPrimary]}>{title}</Text>}
  </Pressable>;
}

export const Field=forwardRef<TextInput,TextInputProps & {label:string;error?:string}>(({label,error,style,...props},ref)=>{
  const {isRTL}=useI18n();
  return <View style={styles.field}><AppText variant="caption" style={styles.fieldLabel}>{label}</AppText><TextInput ref={ref} placeholderTextColor={colors.textSubtle} style={[styles.input,{textAlign:isRTL?'right':'left'},style]} {...props}/>{error?<Text style={styles.error}>{error}</Text>:null}</View>;
});
Field.displayName='Field';

export function SearchField(props:Omit<TextInputProps,'style'>) {
  const {t,isRTL}=useI18n();
  return <View style={styles.searchShell}><Text style={styles.searchIcon}>⌕</Text><TextInput accessibilityLabel={t('search')} placeholder={t('search')} placeholderTextColor={colors.textSubtle} style={[styles.search,{textAlign:isRTL?'right':'left'}]} {...props}/></View>;
}

export function EmptyState({title}:{title:string}) {
  return <View style={styles.empty}><View style={styles.emptyMark}/><AppText muted style={styles.emptyText}>{title}</AppText></View>;
}

export function Money({value,tone='normal',large=false}:{value:number;tone?:'normal'|'positive'|'negative';large?:boolean}) {
  const {money}=useI18n();
  return <Text style={[styles.money,large&&styles.moneyLarge,tone==='positive'&&styles.positive,tone==='negative'&&styles.negative]}>{money(value)}</Text>;
}

export function Chip({label,active,onPress}:{label:string;active:boolean;onPress:()=>void}) {
  return <Pressable accessibilityRole="button" accessibilityState={{selected:active}} onPress={onPress} style={({pressed})=>[styles.chip,active&&styles.chipActive,pressed&&styles.buttonDim]}><Text style={[styles.chipText,active&&styles.chipTextActive]}>{label}</Text></Pressable>;
}

export function Row({title,subtitle,trailing,onPress}:{title:string;subtitle?:string;trailing?:ReactNode;onPress?:()=>void}) {
  const {isRTL}=useI18n();
  const body=<><View style={styles.rowBody}><AppText variant="subheading" style={styles.rowTitle}>{title}</AppText>{subtitle?<AppText variant="caption" muted>{subtitle}</AppText>:null}</View>{trailing}{onPress?<Text style={[styles.chevron,{transform:[{scaleX:isRTL?-1:1}]}]}>›</Text>:null}</>;
  return onPress?<Pressable onPress={onPress} style={({pressed})=>[styles.row,{flexDirection:isRTL?'row-reverse':'row'},pressed&&styles.rowPressed]}>{body}</Pressable>:<View style={[styles.row,{flexDirection:isRTL?'row-reverse':'row'}]}>{body}</View>;
}

export function Stat({label,value,tone='normal',hint}:{label:string;value:number;tone?:'normal'|'positive'|'negative';hint?:string}) {
  return <Card elevated style={styles.stat}><View style={[styles.statAccent,tone==='positive'&&styles.statAccentPositive,tone==='negative'&&styles.statAccentNegative]}/><AppText variant="caption" muted>{label}</AppText><Money value={value} tone={tone}/>{hint?<AppText variant="caption" muted>{hint}</AppText>:null}</Card>;
}

const styles=StyleSheet.create({
  safe:{flex:1,backgroundColor:colors.background},
  screenContent:{flex:1,gap:spacing.md},
  padded:{paddingHorizontal:spacing.md},
  scroll:{flexGrow:1,paddingBottom:spacing.xxl},
  text:{color:colors.text,fontWeight:'400',letterSpacing:.05},
  muted:{color:colors.textMuted},
  card:{backgroundColor:colors.surface,borderRadius:radius.lg,borderCurve:'continuous',borderWidth:1,borderColor:colors.border,padding:spacing.md,gap:spacing.sm},
  cardElevated:{...shadow.card,borderColor:'rgba(225,232,237,0.72)'},
  sectionHead:{minHeight:touch.min,justifyContent:'space-between',alignItems:'center',gap:spacing.md},
  sectionTitleBody:{flex:1,gap:2},
  button:{minHeight:touch.min,borderRadius:radius.md,borderCurve:'continuous',paddingHorizontal:spacing.lg,alignItems:'center',justifyContent:'center'},
  buttonPrimary:{backgroundColor:colors.primary,...shadow.card},
  buttonSecondary:{backgroundColor:colors.primarySoft,borderWidth:1,borderColor:colors.primarySoftStrong},
  buttonDanger:{backgroundColor:colors.negative},
  buttonGhost:{backgroundColor:'transparent'},
  buttonDim:{opacity:.64},
  buttonText:{fontSize:typography.body,fontWeight:'700',color:colors.primary},
  buttonTextPrimary:{color:colors.onPrimary},
  field:{gap:6},
  fieldLabel:{fontWeight:'700',color:colors.textMuted},
  input:{minHeight:50,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,borderCurve:'continuous',paddingHorizontal:spacing.md,backgroundColor:colors.surface,color:colors.text,fontSize:typography.body},
  searchShell:{minHeight:50,borderRadius:radius.full,paddingHorizontal:spacing.md,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,flexDirection:'row',alignItems:'center',gap:spacing.xs},
  searchIcon:{fontSize:20,color:colors.textMuted},
  search:{flex:1,minHeight:48,color:colors.text,fontSize:typography.body,paddingVertical:0},
  error:{color:colors.negative,fontSize:typography.caption},
  empty:{minHeight:150,alignItems:'center',justifyContent:'center',gap:spacing.sm,padding:spacing.lg},
  emptyMark:{width:38,height:5,borderRadius:99,backgroundColor:colors.borderStrong},
  emptyText:{textAlign:'center'},
  money:{fontSize:typography.amount,fontWeight:'800',color:colors.text,fontVariant:['tabular-nums'],letterSpacing:-.25},
  moneyLarge:{fontSize:typography.heroAmount},
  positive:{color:colors.positive},
  negative:{color:colors.negative},
  chip:{minHeight:38,paddingHorizontal:spacing.md,borderRadius:radius.full,backgroundColor:colors.surfaceStrong,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:'transparent'},
  chipActive:{backgroundColor:colors.primarySoft,borderColor:colors.primarySoftStrong},
  chipText:{color:colors.textMuted,fontWeight:'700'},
  chipTextActive:{color:colors.primary},
  row:{minHeight:68,alignItems:'center',gap:spacing.sm,paddingVertical:spacing.sm,paddingHorizontal:spacing.xs,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border},
  rowBody:{flex:1,gap:3},
  rowTitle:{fontWeight:'700'},
  rowPressed:{backgroundColor:colors.surfaceMuted,borderRadius:radius.md},
  chevron:{fontSize:28,lineHeight:28,color:colors.textSubtle},
  stat:{flex:1,minWidth:150,position:'relative',overflow:'hidden',paddingTop:spacing.lg},
  statAccent:{position:'absolute',top:0,left:0,right:0,height:4,backgroundColor:colors.accent},
  statAccentPositive:{backgroundColor:colors.positive},
  statAccentNegative:{backgroundColor:colors.negative},
});
