import { forwardRef, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  type TextStyle,
  View,
  type ViewStyle,
  type StyleProp,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing, touch, type as typography } from '@/theme';
import { useI18n } from '@/i18n/provider';

export function Screen({children,scroll=false,padded=true}:{children:ReactNode;scroll?:boolean;padded?:boolean}){
  const content=<View style={[styles.screenContent,padded&&styles.padded]}>{children}</View>;
  return <SafeAreaView edges={['top']} style={styles.safe}>{scroll?<ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>{content}</ScrollView>:content}</SafeAreaView>;
}

export function AppText({children,variant='body',muted=false,style,numberOfLines}:{children:ReactNode;variant?:'display'|'title'|'heading'|'subheading'|'body'|'caption'|'amount'|'amountLarge';muted?:boolean;style?:StyleProp<TextStyle>;numberOfLines?:number}){
  const {isRTL}=useI18n();
  return <Text numberOfLines={numberOfLines} style={[styles.text,{fontSize:typography[variant],textAlign:isRTL?'right':'left'},variant==='display'&&styles.display,variant==='title'&&styles.title,variant==='heading'&&styles.heading,variant==='subheading'&&styles.subheading,variant==='amount'&&styles.amountWeight,variant==='amountLarge'&&styles.amountLargeWeight,muted&&styles.muted,style]}>{children}</Text>;
}

export function Card({children,style,tone='default'}:{children:ReactNode;style?:StyleProp<ViewStyle>;tone?:'default'|'muted'|'primary'|'warning'}){
  return <View style={[styles.card,tone==='muted'&&styles.cardMuted,tone==='primary'&&styles.cardPrimary,tone==='warning'&&styles.cardWarning,style]}>{children}</View>;
}

export function SectionTitle({title,action,subtitle}:{title:string;action?:ReactNode;subtitle?:string}){
  const {isRTL}=useI18n();
  return <View style={styles.sectionWrap}><View style={[styles.sectionHead,{flexDirection:isRTL?'row-reverse':'row'}]}><AppText variant="heading">{title}</AppText>{action}</View>{subtitle?<AppText variant="caption" muted>{subtitle}</AppText>:null}</View>;
}

export function Button({title,onPress,variant='primary',disabled=false,loading=false,compact=false}:{title:string;onPress:()=>void;variant?:'primary'|'secondary'|'danger'|'ghost';disabled?:boolean;loading?:boolean;compact?:boolean}){
  return <Pressable accessibilityRole="button" disabled={disabled||loading} onPress={onPress} style={({pressed})=>[
    styles.button,
    compact&&styles.buttonCompact,
    variant==='primary'&&styles.buttonPrimary,
    variant==='secondary'&&styles.buttonSecondary,
    variant==='danger'&&styles.buttonDanger,
    variant==='ghost'&&styles.buttonGhost,
    pressed&&variant==='primary'&&styles.buttonPrimaryPressed,
    pressed&&variant!=='primary'&&styles.buttonPressed,
    (disabled||loading)&&styles.disabled,
  ]}>{loading?<ActivityIndicator color={variant==='primary'||variant==='danger'?colors.onPrimary:colors.primary}/>:<Text style={[styles.buttonText,variant==='primary'&&styles.buttonTextPrimary,variant==='danger'&&styles.buttonTextPrimary,variant==='ghost'&&styles.buttonTextGhost]}>{title}</Text>}</Pressable>;
}

export const Field=forwardRef<TextInput,TextInputProps & {label:string;error?:string;containerStyle?:StyleProp<ViewStyle>}>(({label,error,style,containerStyle,...props},ref)=>{
  const {isRTL}=useI18n();
  return <View style={[styles.field,containerStyle]}><AppText variant="caption" style={styles.fieldLabel}>{label}</AppText><TextInput ref={ref} placeholderTextColor={colors.textSoft} selectionColor={colors.primary} style={[styles.input,{textAlign:isRTL?'right':'left'},style]} {...props}/>{error?<Text style={[styles.error,{textAlign:isRTL?'right':'left'}]}>{error}</Text>:null}</View>;
});
Field.displayName='Field';

export function SearchField(props:Omit<TextInputProps,'style'>){
  const {t,isRTL}=useI18n();
  return <TextInput accessibilityLabel={t('search')} placeholder={t('search')} placeholderTextColor={colors.textSoft} selectionColor={colors.primary} style={[styles.search,{textAlign:isRTL?'right':'left'}]} {...props}/>;
}

export function EmptyState({title,description,action}:{title:string;description?:string;action?:ReactNode}){
  return <View style={styles.empty}><View style={styles.emptyMark}><AppText variant="heading" style={styles.emptyMarkText}>—</AppText></View><AppText variant="subheading">{title}</AppText>{description?<AppText variant="caption" muted style={styles.emptyDescription}>{description}</AppText>:null}{action}</View>;
}

export function Money({value,tone='normal',large=false}:{value:number;tone?:'normal'|'positive'|'negative';large?:boolean}){
  const {money}=useI18n();
  return <Text style={[styles.money,large&&styles.moneyLarge,tone==='positive'&&styles.positive,tone==='negative'&&styles.negative]}>{money(value)}</Text>;
}

export function Chip({label,active,onPress,disabled=false}:{label:string;active:boolean;onPress:()=>void;disabled?:boolean}){
  return <Pressable accessibilityRole="button" accessibilityState={{selected:active,disabled}} disabled={disabled} onPress={onPress} style={({pressed})=>[styles.chip,active&&styles.chipActive,pressed&&styles.chipPressed,disabled&&styles.disabled]}><Text style={[styles.chipText,active&&styles.chipTextActive]}>{label}</Text></Pressable>;
}

export function Row({title,subtitle,trailing,onPress,leading}:{title:string;subtitle?:string;trailing?:ReactNode;onPress?:()=>void;leading?:ReactNode}){
  const {isRTL}=useI18n();
  const body=<>{leading}<View style={styles.rowBody}><AppText variant="subheading" numberOfLines={1}>{title}</AppText>{subtitle?<AppText variant="caption" muted numberOfLines={2}>{subtitle}</AppText>:null}</View>{trailing}</>;
  return onPress?<Pressable accessibilityRole="button" onPress={onPress} style={({pressed})=>[styles.row,{flexDirection:isRTL?'row-reverse':'row'},pressed&&styles.rowPressed]}>{body}</Pressable>:<View style={[styles.row,{flexDirection:isRTL?'row-reverse':'row'}]}>{body}</View>;
}

export function Stat({label,value,tone='normal'}:{label:string;value:number;tone?:'normal'|'positive'|'negative'}){
  return <Card style={styles.stat}><AppText variant="caption" muted>{label}</AppText><Money value={value} tone={tone}/></Card>;
}

export function Badge({label,tone='neutral'}:{label:string;tone?:'neutral'|'primary'|'positive'|'negative'|'warning'}){
  return <View style={[styles.badge,tone==='primary'&&styles.badgePrimary,tone==='positive'&&styles.badgePositive,tone==='negative'&&styles.badgeNegative,tone==='warning'&&styles.badgeWarning]}><AppText variant="caption" style={[styles.badgeText,tone==='primary'&&styles.badgeTextPrimary,tone==='positive'&&styles.badgeTextPositive,tone==='negative'&&styles.badgeTextNegative,tone==='warning'&&styles.badgeTextWarning]}>{label}</AppText></View>;
}

const styles=StyleSheet.create({
  safe:{flex:1,backgroundColor:colors.background},
  screenContent:{flex:1,gap:spacing.md},
  padded:{paddingHorizontal:spacing.md},
  scroll:{flexGrow:1,paddingBottom:spacing.xl},
  text:{color:colors.text,fontWeight:'400'},
  display:{fontWeight:'800',letterSpacing:-.65},
  title:{fontWeight:'800',letterSpacing:-.35},
  heading:{fontWeight:'700'},
  subheading:{fontWeight:'700'},
  amountWeight:{fontWeight:'800'},
  amountLargeWeight:{fontWeight:'800',letterSpacing:-.55},
  muted:{color:colors.textMuted},
  card:{backgroundColor:colors.surface,borderRadius:radius.lg,borderCurve:'continuous',borderWidth:1,borderColor:colors.border,padding:spacing.md,gap:spacing.sm},
  cardMuted:{backgroundColor:colors.surfaceMuted,borderColor:colors.surfaceMuted},
  cardPrimary:{backgroundColor:colors.primaryFaint,borderColor:colors.primarySoft},
  cardWarning:{backgroundColor:colors.warningSoft,borderColor:colors.warningSoft},
  sectionWrap:{gap:spacing.xxs},
  sectionHead:{minHeight:touch.min,justifyContent:'space-between',alignItems:'center',gap:spacing.sm},
  button:{minHeight:touch.comfortable,borderRadius:radius.md,borderCurve:'continuous',paddingHorizontal:spacing.md,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:'transparent'},
  buttonCompact:{minHeight:touch.min,paddingHorizontal:spacing.sm},
  buttonPrimary:{backgroundColor:colors.primary,borderColor:colors.primary},
  buttonPrimaryPressed:{backgroundColor:colors.primaryPressed,borderColor:colors.primaryPressed,transform:[{scale:.99}]},
  buttonSecondary:{backgroundColor:colors.surface,borderColor:colors.borderStrong},
  buttonDanger:{backgroundColor:colors.negative,borderColor:colors.negative},
  buttonGhost:{backgroundColor:'transparent',borderColor:'transparent'},
  buttonPressed:{backgroundColor:colors.surfaceMuted,transform:[{scale:.99}]},
  disabled:{opacity:.45},
  buttonText:{fontSize:typography.body,fontWeight:'700',color:colors.primary,textAlign:'center'},
  buttonTextPrimary:{color:colors.onPrimary},
  buttonTextGhost:{fontWeight:'600'},
  field:{gap:spacing.xs},
  fieldLabel:{color:colors.textMuted,fontWeight:'700'},
  input:{minHeight:touch.comfortable,borderWidth:1,borderColor:colors.borderStrong,borderRadius:radius.md,borderCurve:'continuous',paddingHorizontal:spacing.md,backgroundColor:colors.surface,color:colors.text,fontSize:typography.body,fontWeight:'500'},
  search:{minHeight:54,borderRadius:radius.md,paddingHorizontal:spacing.md,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.borderStrong,color:colors.text,fontSize:typography.body,fontWeight:'500'},
  error:{color:colors.negative,fontSize:typography.caption,fontWeight:'600'},
  empty:{minHeight:176,alignItems:'center',justifyContent:'center',gap:spacing.sm,padding:spacing.lg},
  emptyMark:{width:42,height:42,borderRadius:radius.md,alignItems:'center',justifyContent:'center',backgroundColor:colors.surfaceMuted,borderWidth:1,borderColor:colors.border},
  emptyMarkText:{color:colors.textSoft,lineHeight:24},
  emptyDescription:{textAlign:'center',maxWidth:280,lineHeight:18},
  money:{fontSize:typography.amount,fontWeight:'800',color:colors.text,fontVariant:['tabular-nums']},
  moneyLarge:{fontSize:typography.amountLarge,letterSpacing:-.55},
  positive:{color:colors.positive},
  negative:{color:colors.negative},
  chip:{minHeight:touch.min,paddingHorizontal:spacing.md,borderRadius:radius.full,backgroundColor:colors.surface,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:colors.border},
  chipActive:{backgroundColor:colors.primarySoft,borderColor:colors.primary},
  chipPressed:{backgroundColor:colors.surfaceMuted},
  chipText:{color:colors.textMuted,fontWeight:'700',fontSize:typography.caption},
  chipTextActive:{color:colors.primary},
  row:{minHeight:66,alignItems:'center',gap:spacing.sm,paddingVertical:spacing.sm,paddingHorizontal:2,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border},
  rowBody:{flex:1,gap:spacing.xxs},
  rowPressed:{backgroundColor:colors.surfaceMuted,borderRadius:radius.sm},
  stat:{flex:1,minWidth:150},
  badge:{alignSelf:'flex-start',borderRadius:radius.sm,paddingHorizontal:spacing.xs,paddingVertical:4,backgroundColor:colors.surfaceMuted},
  badgePrimary:{backgroundColor:colors.primarySoft},
  badgePositive:{backgroundColor:colors.positiveSoft},
  badgeNegative:{backgroundColor:colors.negativeSoft},
  badgeWarning:{backgroundColor:colors.warningSoft},
  badgeText:{color:colors.textMuted,fontWeight:'700'},
  badgeTextPrimary:{color:colors.primary},
  badgeTextPositive:{color:colors.positive},
  badgeTextNegative:{color:colors.negative},
  badgeTextWarning:{color:colors.warning},
});
