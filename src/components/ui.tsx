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
import { actionColors, colors, control, layout, radius, spacing, touch, type as typography } from '@/theme';
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
export function Surface({children,style,tone='default',padded=true}:{children:ReactNode;style?:StyleProp<ViewStyle>;tone?:'default'|'muted'|'primary'|'warning';padded?:boolean}){
  return <View style={[styles.surface,padded&&styles.surfacePadded,tone==='muted'&&styles.surfaceMuted,tone==='primary'&&styles.surfacePrimary,tone==='warning'&&styles.surfaceWarning,style]}>{children}</View>;
}

export function FramedSection({title,subtitle,action,children,style,tone='default',padded=true}:{title?:string;subtitle?:string;action?:ReactNode;children:ReactNode;style?:StyleProp<ViewStyle>;tone?:'default'|'muted'|'primary'|'warning';padded?:boolean}){
  const {isRTL}=useI18n();
  return <Surface style={style} tone={tone} padded={false}>
    {title||subtitle||action?<View style={[styles.framedHead,{flexDirection:isRTL?'row-reverse':'row'}]}><View style={styles.framedHeadCopy}>{title?<AppText variant="subheading">{title}</AppText>:null}{subtitle?<AppText variant="caption" muted>{subtitle}</AppText>:null}</View>{action}</View>:null}
    <View style={[styles.framedBody,padded&&styles.framedBodyPadded]}>{children}</View>
  </Surface>;
}

export function GroupedList({children,style}:{children:ReactNode;style?:StyleProp<ViewStyle>}){
  return <View style={[styles.groupedList,style]}>{children}</View>;
}

export function IconTile({children,tone='primary',size='md'}:{children:ReactNode;tone?:'primary'|'positive'|'negative'|'warning'|'neutral';size?:'sm'|'md'}){
  return <View style={[
    styles.iconTile,
    size==='sm'&&styles.iconTileSmall,
    tone==='positive'&&styles.iconTilePositive,
    tone==='negative'&&styles.iconTileNegative,
    tone==='warning'&&styles.iconTileWarning,
    tone==='neutral'&&styles.iconTileNeutral,
  ]}>{children}</View>;
}

export function PageHeader({title,subtitle,onBack,trailing}:{title:string;subtitle?:string;onBack?:()=>void;trailing?:ReactNode}){
  const {isRTL}=useI18n();
  return <View style={[styles.pageHeader,{flexDirection:isRTL?'row-reverse':'row'}]}>
    {onBack?<Pressable accessibilityRole="button" accessibilityLabel="back" onPress={onBack} style={({pressed})=>[styles.pageHeaderButton,pressed&&styles.pageHeaderButtonPressed]}><AppText variant="heading" style={styles.pageHeaderArrow}>{isRTL?'›':'‹'}</AppText></Pressable>:<View style={styles.pageHeaderSlot}/>}
    <View style={styles.pageHeaderCopy}><AppText variant="heading" numberOfLines={1}>{title}</AppText>{subtitle?<AppText variant="caption" muted numberOfLines={1}>{subtitle}</AppText>:null}</View>
    <View style={styles.pageHeaderSlot}>{trailing}</View>
  </View>;
}

export function FormSection({title,subtitle,children,style}:{title?:string;subtitle?:string;children:ReactNode;style?:StyleProp<ViewStyle>}){
  return <View style={[styles.formSection,style]}>{title?<View style={styles.formSectionHead}><AppText variant="subheading">{title}</AppText>{subtitle?<AppText variant="caption" muted>{subtitle}</AppText>:null}</View>:null}{children}</View>;
}

export function SelectRow({label,value,hint,onPress,leading,disabled=false}:{label:string;value?:string;hint?:string;onPress:()=>void;leading?:ReactNode;disabled?:boolean}){
  const {isRTL}=useI18n();
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({pressed})=>[styles.selectRow,{flexDirection:isRTL?'row-reverse':'row'},pressed&&styles.rowPressed,disabled&&styles.disabled]}>
    {leading}
    <View style={styles.selectRowCopy}><AppText variant="caption" muted>{label}</AppText>{value?<AppText variant="subheading" numberOfLines={1}>{value}</AppText>:null}{hint?<AppText variant="caption" muted numberOfLines={1}>{hint}</AppText>:null}</View>
    <AppText variant="heading" style={styles.selectRowArrow}>{isRTL?'‹':'›'}</AppText>
  </Pressable>;
}

export function AccountingRow({title,subtitle,meta,leading,value,trailing,onPress,last=false,disabled=false}:{title:string;subtitle?:string;meta?:string;leading?:ReactNode;value?:ReactNode;trailing?:ReactNode;onPress?:()=>void;last?:boolean;disabled?:boolean}){
  const {isRTL}=useI18n();
  const end=trailing??(onPress?<AppText variant="heading" style={styles.accountingArrow}>{isRTL?'‹':'›'}</AppText>:null);
  const body=<>{leading}<View style={styles.accountingCopy}><AppText variant="subheading" numberOfLines={2}>{title}</AppText>{subtitle?<AppText variant="caption" muted numberOfLines={1}>{subtitle}</AppText>:null}{meta?<AppText variant="caption" muted numberOfLines={1}>{meta}</AppText>:null}</View>{value?<View style={styles.accountingValue}>{value}</View>:null}{end}</>;
  return onPress?<Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({pressed})=>[styles.accountingRow,{flexDirection:isRTL?'row-reverse':'row'},last&&styles.accountingRowLast,pressed&&styles.rowPressed,disabled&&styles.disabled]}>{body}</Pressable>:<View style={[styles.accountingRow,{flexDirection:isRTL?'row-reverse':'row'},last&&styles.accountingRowLast,disabled&&styles.disabled]}>{body}</View>;
}

export function InvoiceLine({productName,context,status,quantityLabel,quantityControl,unitPriceLabel,unitPrice,lineTotalLabel,lineTotal,actions,last=false}:{productName:string;context?:string;status?:ReactNode;quantityLabel:string;quantityControl:ReactNode;unitPriceLabel:string;unitPrice:ReactNode;lineTotalLabel:string;lineTotal:ReactNode;actions?:ReactNode;last?:boolean}){
  const {isRTL}=useI18n();
  return <View style={[styles.invoiceLine,last&&styles.invoiceLineLast]}>
    <View style={[styles.invoiceLineHead,{flexDirection:isRTL?'row-reverse':'row'}]}><View style={styles.invoiceLineCopy}><View style={[styles.invoiceLineTitleRow,{flexDirection:isRTL?'row-reverse':'row'}]}><AppText variant="subheading" numberOfLines={2} style={styles.invoiceLineName}>{productName}</AppText>{status}</View>{context?<AppText variant="caption" muted numberOfLines={1}>{context}</AppText>:null}</View>{actions}</View>
    <View style={[styles.invoiceFinancialRow,{flexDirection:isRTL?'row-reverse':'row'}]}>
      <View style={[styles.invoiceValueCell,styles.invoiceQuantityCell]}><AppText variant="caption" muted>{quantityLabel}</AppText>{quantityControl}</View>
      <View style={styles.invoiceValueCell}><AppText variant="caption" muted>{unitPriceLabel}</AppText>{unitPrice}</View>
      <View style={[styles.invoiceValueCell,isRTL?styles.invoiceValueCellLeading:styles.invoiceValueCellTrailing]}><AppText variant="caption" muted>{lineTotalLabel}</AppText>{lineTotal}</View>
    </View>
  </View>;
}

export function FinancialSummary({items,style}:{items:Array<{label:string;value:number;format?:'money'|'number';tone?:'normal'|'positive'|'negative';emphasize?:boolean}>;style?:StyleProp<ViewStyle>}){
  const {number,isRTL}=useI18n();
  return <View style={[styles.financialSummary,style]}>{items.map((item,index)=><View key={item.label} style={[styles.financialSummaryRow,{flexDirection:isRTL?'row-reverse':'row'},index===items.length-1&&styles.financialSummaryRowLast,item.emphasize&&styles.financialSummaryEmphasis]}><AppText variant={item.emphasize?'subheading':'caption'} muted={!item.emphasize}>{item.label}</AppText>{item.format==='number'?<AppText variant={item.emphasize?'amount':'subheading'} style={[styles.tabular,item.tone==='positive'&&styles.positive,item.tone==='negative'&&styles.negative]}>{number(item.value)}</AppText>:<Money value={item.value} tone={item.tone} large={item.emphasize}/>}</View>)}</View>;
}

export function LoadingState({label}:{label?:string}){
  const {t}=useI18n();
  return <View style={styles.stateBlock}><ActivityIndicator color={colors.primary}/><AppText variant="caption" muted>{label??t('loading')}</AppText></View>;
}

export function ErrorState({title,description,action}:{title:string;description?:string;action?:ReactNode}){
  return <View style={[styles.stateBlock,styles.errorState]}><View style={styles.errorStateMark}/><AppText variant="subheading">{title}</AppText>{description?<AppText variant="caption" muted style={styles.emptyDescription}>{description}</AppText>:null}{action}</View>;
}


export function SectionTitle({title,action,subtitle}:{title:string;action?:ReactNode;subtitle?:string}){
  const {isRTL}=useI18n();
  return <View style={styles.sectionWrap}><View style={[styles.sectionHead,{flexDirection:isRTL?'row-reverse':'row'}]}><AppText variant="heading">{title}</AppText>{action}</View>{subtitle?<AppText variant="caption" muted>{subtitle}</AppText>:null}</View>;
}

export function Button({title,onPress,variant='primary',disabled=false,loading=false,compact=false}:{title:string;onPress:()=>void;variant?:'primary'|'secondary'|'danger'|'success'|'warning'|'ghost';disabled?:boolean;loading?:boolean;compact?:boolean}){
  const spinner=['primary','success','danger','warning'].includes(variant)?colors.onPrimary:colors.accent;
  return <Pressable accessibilityRole="button" disabled={disabled||loading} onPress={onPress} style={({pressed})=>[
    styles.button,
    compact&&styles.buttonCompact,
    variant==='primary'&&styles.buttonPrimary,
    variant==='secondary'&&styles.buttonSecondary,
    variant==='danger'&&styles.buttonDanger,
    variant==='success'&&styles.buttonSuccess,
    variant==='warning'&&styles.buttonWarning,
    variant==='ghost'&&styles.buttonGhost,
    pressed&&variant==='primary'&&styles.buttonPrimaryPressed,
    pressed&&variant==='success'&&styles.buttonSuccessPressed,
    pressed&&variant!=='primary'&&variant!=='success'&&styles.buttonPressed,
    (disabled||loading)&&styles.disabled,
  ]}>{loading?<ActivityIndicator color={spinner}/>:<Text style={[styles.buttonText,variant==='primary'&&styles.buttonTextPrimary,variant==='success'&&styles.buttonTextPrimary,variant==='danger'&&styles.buttonTextPrimary,variant==='warning'&&styles.buttonTextPrimary,variant==='ghost'&&styles.buttonTextGhost]}>{title}</Text>}</Pressable>;
}

export const Field=forwardRef<TextInput,TextInputProps & {label:string;error?:string;containerStyle?:StyleProp<ViewStyle>}>(({label,error,style,containerStyle,...props},ref)=>{
  const {isRTL}=useI18n();
  return <View style={[styles.field,containerStyle]}><AppText variant="caption" style={styles.fieldLabel}>{label}</AppText><TextInput ref={ref} placeholderTextColor={colors.textSoft} selectionColor={colors.primary} style={[styles.input,{textAlign:isRTL?'right':'left'},style]} {...props}/>{error?<Text style={[styles.error,{textAlign:isRTL?'right':'left'}]}>{error}</Text>:null}</View>;
});
Field.displayName='Field';

export const FormField=forwardRef<TextInput,TextInputProps & {label:string;error?:string;containerStyle?:StyleProp<ViewStyle>;leading?:ReactNode;trailing?:ReactNode}>(({label,error,style,containerStyle,leading,trailing,...props},ref)=>{
  const {isRTL}=useI18n();
  return <View style={[styles.field,containerStyle]}><AppText variant="caption" style={styles.fieldLabel}>{label}</AppText><View style={[styles.formInputShell,{flexDirection:isRTL?'row-reverse':'row'}]}>{leading?<View style={styles.formAdornment}>{leading}</View>:null}<TextInput ref={ref} placeholderTextColor={colors.textSoft} selectionColor={colors.primary} style={[styles.formInput,{textAlign:isRTL?'right':'left'},style]} {...props}/>{trailing?<View style={styles.formAdornment}>{trailing}</View>:null}</View>{error?<Text style={[styles.error,{textAlign:isRTL?'right':'left'}]}>{error}</Text>:null}</View>;
});
FormField.displayName='FormField';

export function SearchField({style,placeholder,...props}:TextInputProps){
  const {t,isRTL}=useI18n();
  return <View style={[styles.search,{flexDirection:isRTL?'row-reverse':'row'}]}><View style={styles.searchGlyph}><View style={styles.searchCircle}/><View style={styles.searchHandle}/></View><TextInput accessibilityLabel={t('search')} placeholder={placeholder??t('search')} placeholderTextColor={colors.textSoft} selectionColor={colors.primary} style={[styles.searchInput,{textAlign:isRTL?'right':'left'},style]} {...props}/></View>;
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

export const StatusBadge=Badge;


export function AppHeader({title,subtitle,eyebrow,trailing}:{title:string;subtitle?:string;eyebrow?:string;trailing?:ReactNode}){
  const {isRTL}=useI18n();
  return <View style={styles.appHeader}>{eyebrow?<AppText variant="caption" style={styles.appHeaderEyebrow}>{eyebrow}</AppText>:null}<View style={[styles.appHeaderRow,{flexDirection:isRTL?'row-reverse':'row'}]}><View style={styles.appHeaderCopy}><AppText variant="title">{title}</AppText>{subtitle?<AppText variant="caption" muted style={styles.appHeaderSubtitle}>{subtitle}</AppText>:null}</View>{trailing}</View></View>;
}

export function HeroMetricCard({label,value,secondary,footer,tone='primary'}:{label:string;value:number;secondary?:string;footer?:ReactNode;tone?:'primary'|'positive'|'neutral'}){
  const {money}=useI18n();
  return <View style={[styles.heroMetric,tone==='positive'&&styles.heroMetricPositive,tone==='neutral'&&styles.heroMetricNeutral]}><View style={styles.heroMetricGlow}/><AppText variant="caption" style={tone==='neutral'?styles.heroMetricLabelNeutral:styles.heroMetricLabel}>{label}</AppText><Text style={[styles.heroMetricAmount,tone==='positive'&&styles.heroMetricAmountPositive,tone==='neutral'&&styles.heroMetricAmountNeutral]}>{money(value)}</Text>{secondary?<AppText variant="caption" style={tone==='neutral'?styles.heroMetricSecondaryNeutral:styles.heroMetricSecondary}>{secondary}</AppText>:null}{footer?<View style={styles.heroMetricFooter}>{footer}</View>:null}</View>;
}

export function MetricCard({label,value,tone='normal',hint,format='money'}:{label:string;value:number;tone?:'normal'|'positive'|'negative';hint?:string;format?:'money'|'number'}){
  const {number}=useI18n();
  return <View style={styles.metricCard}><View style={[styles.metricCardRule,tone==='positive'&&styles.metricCardRulePositive,tone==='negative'&&styles.metricCardRuleNegative]}/><AppText variant="caption" muted>{label}</AppText>{format==='number'?<AppText variant="amount" style={tone==='positive'?styles.positive:tone==='negative'?styles.negative:undefined}>{number(value)}</AppText>:<Money value={value} tone={tone}/>} {hint?<AppText variant="caption" muted>{hint}</AppText>:null}</View>;
}

export function QuickAction({label,caption,onPress,tone='primary',disabled=false}:{label:string;caption?:string;onPress:()=>void;tone?:'primary'|'neutral'|'warning';disabled?:boolean}){
  const {isRTL}=useI18n();
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({pressed})=>[styles.quickAction,tone==='warning'&&styles.quickActionWarning,pressed&&styles.quickActionPressed,disabled&&styles.disabled]}><View style={[styles.quickActionTop,{flexDirection:isRTL?'row-reverse':'row'}]}><View style={[styles.quickActionMark,tone==='neutral'&&styles.quickActionMarkNeutral,tone==='warning'&&styles.quickActionMarkWarning]}/><AppText variant="subheading" style={styles.quickActionArrow}>{isRTL?'←':'→'}</AppText></View><AppText variant="subheading">{label}</AppText>{caption?<AppText variant="caption" muted numberOfLines={2}>{caption}</AppText>:null}</Pressable>;
}

export function SegmentedControl<T extends string>({value,options,onChange}:{value:T;options:{value:T;label:string}[];onChange:(value:T)=>void}){
  const {isRTL}=useI18n();
  return <View style={[styles.segmented,{flexDirection:isRTL?'row-reverse':'row'}]}>{options.map(option=><Pressable key={option.value} accessibilityRole="button" accessibilityState={{selected:value===option.value}} onPress={()=>onChange(option.value)} style={({pressed})=>[styles.segment,value===option.value&&styles.segmentActive,pressed&&styles.segmentPressed]}><Text style={[styles.segmentText,value===option.value&&styles.segmentTextActive]}>{option.label}</Text></Pressable>)}</View>;
}

export function PaymentMethodCard({label,subtitle,icon,selected,onPress,disabled=false,style}:{label:string;subtitle?:string;icon?:ReactNode;selected:boolean;onPress:()=>void;disabled?:boolean;style?:StyleProp<ViewStyle>}){
  return <Pressable accessibilityRole="button" accessibilityState={{selected,disabled}} disabled={disabled} onPress={onPress} style={({pressed})=>[styles.paymentMethodCard,selected&&styles.paymentMethodCardSelected,pressed&&styles.paymentMethodCardPressed,disabled&&styles.disabled,style]}>{icon?<View style={[styles.paymentMethodIcon,selected&&styles.paymentMethodIconSelected]}>{icon}</View>:null}<AppText variant="subheading" numberOfLines={2} style={selected?styles.paymentMethodTextSelected:undefined}>{label}</AppText>{subtitle?<AppText variant="caption" muted numberOfLines={1}>{subtitle}</AppText>:null}</Pressable>;
}

export function AlertCard({title,description,tone='warning',action}:{title:string;description?:string;tone?:'warning'|'primary'|'negative';action?:ReactNode}){
  const {isRTL}=useI18n();
  return <View style={[styles.alertCard,tone==='primary'&&styles.alertCardPrimary,tone==='negative'&&styles.alertCardNegative]}><View style={[styles.alertRow,{flexDirection:isRTL?'row-reverse':'row'}]}><View style={[styles.alertMark,tone==='primary'&&styles.alertMarkPrimary,tone==='negative'&&styles.alertMarkNegative]}/><View style={styles.alertCopy}><AppText variant="subheading">{title}</AppText>{description?<AppText variant="caption" muted>{description}</AppText>:null}</View>{action}</View></View>;
}

const styles=StyleSheet.create({
  safe:{flex:1,backgroundColor:colors.background},
  screenContent:{flex:1,gap:control.sectionGap},
  padded:{paddingHorizontal:layout.pageGutter},
  scroll:{flexGrow:1,paddingBottom:spacing.xl},
  text:{color:colors.text,fontWeight:'400'},
  display:{fontWeight:'800',letterSpacing:-.65},
  title:{fontWeight:'800',letterSpacing:-.35},
  heading:{fontWeight:'700'},
  subheading:{fontWeight:'700'},
  amountWeight:{fontWeight:'800'},
  amountLargeWeight:{fontWeight:'800',letterSpacing:-.55},
  muted:{color:colors.textMuted},
  card:{backgroundColor:colors.surface,borderRadius:radius.lg,borderCurve:'continuous',borderWidth:1,borderColor:colors.borderStrong,padding:layout.panelPadding,gap:spacing.sm},
  cardMuted:{backgroundColor:colors.surfaceMuted,borderColor:colors.surfaceMuted},
  cardPrimary:{backgroundColor:colors.primaryFaint,borderColor:colors.primarySoft},
  cardWarning:{backgroundColor:colors.warningSoft,borderColor:colors.warningSoft},
  surface:{backgroundColor:colors.surface,borderRadius:radius.lg,borderCurve:'continuous',borderWidth:1,borderColor:colors.borderStrong},
  surfacePadded:{padding:layout.panelPadding},
  surfaceMuted:{backgroundColor:colors.surfaceMuted},
  surfacePrimary:{backgroundColor:colors.primaryFaint,borderColor:colors.primarySoft},
  surfaceWarning:{backgroundColor:colors.warningSoft,borderColor:colors.warning},
  framedHead:{minHeight:control.compactHeight,alignItems:'center',justifyContent:'space-between',gap:spacing.sm,paddingHorizontal:layout.panelPadding,paddingVertical:spacing.xs,borderBottomWidth:1,borderBottomColor:colors.border},
  framedHeadCopy:{flex:1,minWidth:0,gap:2},
  framedBody:{gap:spacing.sm},
  framedBodyPadded:{padding:layout.panelPadding},
  groupedList:{overflow:'hidden',backgroundColor:colors.surface,borderRadius:radius.lg,borderCurve:'continuous',borderWidth:1,borderColor:colors.borderStrong},
  iconTile:{width:44,height:44,borderRadius:radius.md,alignItems:'center',justifyContent:'center',backgroundColor:colors.primarySoft,flexShrink:0},
  iconTileSmall:{width:36,height:36,borderRadius:radius.sm},
  iconTilePositive:{backgroundColor:colors.positiveSoft},
  iconTileNegative:{backgroundColor:colors.negativeSoft},
  iconTileWarning:{backgroundColor:colors.warningSoft},
  iconTileNeutral:{backgroundColor:colors.surfaceStrong},
  pageHeader:{minHeight:64,alignItems:'center',gap:spacing.sm,paddingVertical:spacing.xs,borderBottomWidth:1,borderBottomColor:colors.border,marginBottom:spacing.xs},
  pageHeaderButton:{width:touch.min,height:touch.min,borderRadius:radius.md,alignItems:'center',justifyContent:'center'},
  pageHeaderButtonPressed:{backgroundColor:colors.surfaceMuted},
  pageHeaderArrow:{fontSize:27,lineHeight:28,color:colors.accent},
  pageHeaderCopy:{flex:1,minWidth:0,alignItems:'center',gap:2},
  pageHeaderSlot:{width:touch.min,minHeight:touch.min,alignItems:'center',justifyContent:'center'},
  formSection:{gap:spacing.sm},
  formSectionHead:{gap:spacing.xxs},
  selectRow:{minHeight:control.rowMinHeight,alignItems:'center',gap:spacing.sm,paddingHorizontal:layout.densePadding,paddingVertical:spacing.xs,borderBottomWidth:1,borderBottomColor:colors.border},
  selectRowCopy:{flex:1,minWidth:0,gap:2},
  selectRowArrow:{color:colors.textSoft,fontSize:22,lineHeight:24},
  accountingRow:{minHeight:control.rowMinHeight,alignItems:'center',gap:spacing.sm,paddingHorizontal:layout.densePadding,paddingVertical:spacing.xs,borderBottomWidth:1,borderBottomColor:colors.border},
  accountingRowLast:{borderBottomWidth:0},
  accountingCopy:{flex:1,minWidth:0,gap:2},
  accountingValue:{alignItems:'flex-end',justifyContent:'center',minWidth:72},
  accountingArrow:{color:colors.textSoft,fontSize:21,lineHeight:22},
  invoiceLine:{gap:spacing.xs,paddingHorizontal:layout.densePadding,paddingVertical:spacing.xs,borderBottomWidth:1,borderBottomColor:colors.border},
  invoiceLineLast:{borderBottomWidth:0},
  invoiceLineHead:{alignItems:'center',gap:spacing.xs},
  invoiceLineCopy:{flex:1,minWidth:0,gap:2},
  invoiceLineTitleRow:{alignItems:'center',gap:spacing.xs},
  invoiceLineName:{flex:1,minWidth:0},
  invoiceFinancialRow:{alignItems:'center',gap:spacing.xs},
  invoiceValueCell:{flex:1,minWidth:0,minHeight:48,gap:2,paddingHorizontal:spacing.xs,paddingVertical:4,borderRadius:radius.sm,backgroundColor:colors.surfaceMuted,borderWidth:1,borderColor:colors.border,justifyContent:'center'},
  invoiceQuantityCell:{flex:1.35},
  invoiceValueCellLeading:{alignItems:'flex-start'},
  invoiceValueCellTrailing:{alignItems:'flex-end'},
  financialSummary:{overflow:'hidden',borderRadius:radius.md,borderWidth:1,borderColor:colors.borderStrong,backgroundColor:colors.surface},
  financialSummaryRow:{minHeight:control.compactHeight,alignItems:'center',justifyContent:'space-between',gap:spacing.md,paddingHorizontal:layout.densePadding,paddingVertical:spacing.xs,borderBottomWidth:1,borderBottomColor:colors.border},
  financialSummaryRowLast:{borderBottomWidth:0},
  financialSummaryEmphasis:{minHeight:touch.comfortable,backgroundColor:colors.primaryFaint,borderTopWidth:1,borderTopColor:colors.primarySoft},
  tabular:{fontVariant:['tabular-nums']},
  stateBlock:{minHeight:132,alignItems:'center',justifyContent:'center',gap:spacing.sm,padding:spacing.lg},
  errorState:{backgroundColor:colors.negativeSoft,borderRadius:radius.lg,borderWidth:1,borderColor:colors.negative},
  errorStateMark:{width:9,height:9,borderRadius:5,backgroundColor:colors.negative},
  sectionWrap:{gap:spacing.xxs},
  sectionHead:{minHeight:touch.min,justifyContent:'space-between',alignItems:'center',gap:spacing.sm},
  button:{minHeight:control.height,borderRadius:radius.md,borderCurve:'continuous',paddingHorizontal:spacing.md,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:'transparent'},
  buttonCompact:{minHeight:control.compactHeight,paddingHorizontal:spacing.sm},
  buttonPrimary:{backgroundColor:actionColors.sale,borderColor:colors.accent},
  buttonPrimaryPressed:{backgroundColor:colors.primaryPressed,borderColor:colors.primaryPressed,transform:[{scale:.99}]},
  buttonSecondary:{backgroundColor:colors.accentSoft,borderColor:colors.accent},
  buttonDanger:{backgroundColor:actionColors.spend,borderColor:colors.accent},
  buttonSuccess:{backgroundColor:actionColors.receive,borderColor:colors.accent},
  buttonWarning:{backgroundColor:actionColors.purchase,borderColor:colors.accent},
  buttonSuccessPressed:{backgroundColor:'#047857',borderColor:colors.accent,transform:[{scale:.99}]},
  buttonGhost:{backgroundColor:'transparent',borderColor:'transparent'},
  buttonPressed:{backgroundColor:colors.surfaceMuted,transform:[{scale:.99}]},
  disabled:{opacity:.45},
  buttonText:{fontSize:typography.body,fontWeight:'700',color:colors.accent,textAlign:'center'},
  buttonTextPrimary:{color:colors.onPrimary},
  buttonTextDanger:{color:colors.negative},
  buttonTextGhost:{fontWeight:'600'},
  field:{gap:spacing.xs},
  fieldLabel:{color:colors.textMuted,fontWeight:'700'},
  input:{minHeight:control.height,borderWidth:1,borderColor:colors.borderStrong,borderRadius:radius.md,borderCurve:'continuous',paddingHorizontal:layout.densePadding,backgroundColor:colors.surface,color:colors.text,fontSize:typography.body,fontWeight:'500'},
  formInputShell:{minHeight:control.height,alignItems:'center',gap:spacing.xs,borderWidth:1,borderColor:colors.borderStrong,borderRadius:radius.md,borderCurve:'continuous',paddingHorizontal:layout.densePadding,backgroundColor:colors.surface},
  formInput:{flex:1,minWidth:0,minHeight:control.height,color:colors.text,fontSize:typography.body,fontWeight:'500',paddingVertical:0},
  formAdornment:{minHeight:control.compactHeight,alignItems:'center',justifyContent:'center'},
  search:{minHeight:control.height,alignItems:'center',gap:spacing.sm,borderRadius:radius.md,paddingHorizontal:layout.densePadding,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.borderStrong},
  searchInput:{flex:1,minWidth:0,minHeight:control.height,color:colors.text,fontSize:typography.body,fontWeight:'500',paddingVertical:0},
  searchGlyph:{width:20,height:20,position:'relative',flexShrink:0},
  searchCircle:{position:'absolute',left:2,top:2,width:12,height:12,borderRadius:6,borderWidth:2,borderColor:colors.textMuted},
  searchHandle:{position:'absolute',right:1,bottom:3,width:7,height:2,borderRadius:1,backgroundColor:colors.textMuted,transform:[{rotate:'45deg'}]},
  error:{color:colors.negative,fontSize:typography.caption,fontWeight:'600'},
  empty:{minHeight:176,alignItems:'center',justifyContent:'center',gap:spacing.sm,padding:spacing.lg},
  emptyMark:{width:42,height:42,borderRadius:radius.md,alignItems:'center',justifyContent:'center',backgroundColor:colors.surfaceMuted,borderWidth:1,borderColor:colors.border},
  emptyMarkText:{color:colors.textSoft,lineHeight:24},
  emptyDescription:{textAlign:'center',maxWidth:280,lineHeight:18},
  money:{fontSize:typography.amount,fontWeight:'800',color:colors.text,fontVariant:['tabular-nums']},
  moneyLarge:{fontSize:typography.amountLarge,letterSpacing:-.55},
  positive:{color:colors.positive},
  negative:{color:colors.negative},
  chip:{minHeight:control.compactHeight,paddingHorizontal:spacing.sm,borderRadius:radius.md,backgroundColor:colors.surface,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:colors.borderStrong},
  chipActive:{backgroundColor:colors.accentSoft,borderColor:colors.accent},
  chipPressed:{backgroundColor:colors.surfaceMuted},
  chipText:{color:colors.textMuted,fontWeight:'700',fontSize:typography.caption},
  chipTextActive:{color:colors.accent},
  row:{minHeight:control.rowMinHeight,alignItems:'center',gap:spacing.sm,paddingVertical:spacing.xs,paddingHorizontal:2,borderBottomWidth:1,borderBottomColor:colors.border},
  rowBody:{flex:1,gap:spacing.xxs},
  rowPressed:{backgroundColor:colors.surfaceMuted,borderRadius:radius.sm},
  stat:{flex:1,minWidth:150},
  badge:{alignSelf:'flex-start',borderRadius:radius.sm,paddingHorizontal:spacing.xs,paddingVertical:4,backgroundColor:colors.surfaceStrong,borderWidth:1,borderColor:colors.border},
  badgePrimary:{backgroundColor:colors.primarySoft},
  badgePositive:{backgroundColor:colors.positiveSoft},
  badgeNegative:{backgroundColor:colors.negativeSoft},
  badgeWarning:{backgroundColor:colors.warningSoft},
  badgeText:{color:colors.textMuted,fontWeight:'700'},
  badgeTextPrimary:{color:colors.primary},
  badgeTextPositive:{color:colors.positive},
  badgeTextNegative:{color:colors.negative},
  badgeTextWarning:{color:colors.warning},
  appHeader:{gap:spacing.xs,paddingTop:spacing.xs},
  appHeaderRow:{alignItems:'flex-start',justifyContent:'space-between',gap:spacing.md},
  appHeaderCopy:{flex:1,gap:spacing.xs},
  appHeaderEyebrow:{color:colors.primary,fontWeight:'800',letterSpacing:.35},
  appHeaderSubtitle:{maxWidth:440,lineHeight:18},
  heroMetric:{position:'relative',overflow:'hidden',backgroundColor:colors.surfaceRaised,borderWidth:1,borderColor:colors.accent,borderRadius:radius.xl,borderCurve:'continuous',padding:spacing.lg,gap:spacing.xs,minHeight:150},
  heroMetricPositive:{backgroundColor:colors.surface,borderWidth:1,borderColor:colors.positiveSoft},
  heroMetricNeutral:{backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border},
  heroMetricGlow:{position:'absolute',width:150,height:150,borderRadius:75,right:-56,top:-64,backgroundColor:'rgba(255,255,255,.09)'},
  heroMetricLabel:{color:colors.onPrimarySoft,fontWeight:'800'},
  heroMetricAmount:{fontSize:typography.amountLarge,fontWeight:'800',letterSpacing:-.55,color:colors.onPrimary,fontVariant:['tabular-nums']},
  heroMetricAmountPositive:{color:colors.positive},
  heroMetricAmountNeutral:{color:colors.text},
  heroMetricLabelNeutral:{color:colors.textMuted,fontWeight:'800'},
  heroMetricSecondary:{color:colors.onPrimaryMuted,lineHeight:18},
  heroMetricSecondaryNeutral:{color:colors.textMuted,lineHeight:18},
  heroMetricFooter:{marginTop:spacing.sm},
  metricCard:{flex:1,minWidth:145,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,borderCurve:'continuous',padding:spacing.md,gap:spacing.xs},
  metricCardRule:{width:28,height:3,borderRadius:2,backgroundColor:colors.primary},
  metricCardRulePositive:{backgroundColor:colors.positive},
  metricCardRuleNegative:{backgroundColor:colors.negative},
  quickAction:{flexGrow:1,flexBasis:145,minHeight:112,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,borderCurve:'continuous',padding:spacing.md,gap:spacing.xs},
  quickActionWarning:{backgroundColor:colors.warningSoft,borderColor:colors.warningSoft},
  quickActionPressed:{backgroundColor:colors.primaryFaint,transform:[{scale:.99}]},
  quickActionTop:{alignItems:'center',justifyContent:'space-between'},
  quickActionMark:{width:28,height:7,borderRadius:4,backgroundColor:colors.primary},
  quickActionMarkNeutral:{backgroundColor:colors.textSoft},
  quickActionMarkWarning:{backgroundColor:colors.warning},
  quickActionArrow:{color:colors.primary,lineHeight:20},
  segmented:{backgroundColor:colors.surfaceStrong,borderRadius:radius.md,padding:3,gap:3,borderWidth:1,borderColor:colors.borderStrong},
  segment:{flex:1,minHeight:control.compactHeight,borderRadius:radius.sm,alignItems:'center',justifyContent:'center',paddingHorizontal:spacing.sm},
  segmentActive:{backgroundColor:colors.primary,borderWidth:1,borderColor:colors.primary},
  segmentPressed:{opacity:.72},
  segmentText:{color:colors.textMuted,fontSize:typography.caption,fontWeight:'700',textAlign:'center'},
  segmentTextActive:{color:colors.onPrimary,fontWeight:'800'},
  paymentMethodCard:{flexGrow:1,flexBasis:104,minWidth:96,minHeight:84,alignItems:'center',justifyContent:'center',gap:4,padding:spacing.xs,borderRadius:radius.md,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.borderStrong},
  paymentMethodCardSelected:{backgroundColor:colors.primaryFaint,borderColor:colors.accent,borderWidth:2},
  paymentMethodCardPressed:{backgroundColor:colors.surfaceMuted,transform:[{scale:.99}]},
  paymentMethodIcon:{width:34,height:30,alignItems:'center',justifyContent:'center'},
  paymentMethodIconSelected:{},
  paymentMethodTextSelected:{color:colors.primary},
  alertCard:{backgroundColor:colors.warningSoft,borderRadius:radius.lg,borderWidth:1,borderColor:colors.warning,padding:spacing.md},
  alertCardPrimary:{backgroundColor:colors.primaryFaint,borderColor:colors.primarySoft},
  alertCardNegative:{backgroundColor:colors.negativeSoft,borderColor:colors.negative},
  alertRow:{alignItems:'flex-start',gap:spacing.sm},
  alertMark:{width:8,height:8,borderRadius:4,backgroundColor:colors.warning,marginTop:7},
  alertMarkPrimary:{backgroundColor:colors.primary},
  alertMarkNegative:{backgroundColor:colors.negative},
  alertCopy:{flex:1,gap:spacing.xxs},
});
