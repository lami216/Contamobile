import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useAuth } from '@/auth/provider';
import { exportAndShareBackup, chooseAndRestoreBackup } from '@/services/backup-service';
import { chooseDesktopBackup, importDesktopBackup } from '@/services/desktop-import-service';
import { getPrintSettings, printProfileLabel, printProfiles, savePrintSettings, type PrintProfile } from '@/services/print-settings-service';
import { AppText, Badge, Button, Chip, EmptyState, Screen, SectionTitle } from '@/components/ui';
import { useI18n } from '@/i18n/provider';
import { colors, radius, spacing } from '@/theme';

export function SettingsScreen(){
  const db=useSQLiteContext(),auth=useAuth(),{t,locale,setLocale,isRTL,errorMessage}=useI18n(),ar=locale==='ar';
  const [busy,setBusy]=useState<string|null>(null),[printProfile,setPrintProfile]=useState<PrintProfile>('a4'),[printBusy,setPrintBusy]=useState(false);
  useFocusEffect(useCallback(()=>{let active=true;void getPrintSettings(db).then(settings=>{if(active)setPrintProfile(settings.profile)}).catch(()=>{});return()=>{active=false}},[db]));
  if(!auth.has('settings.view'))return <Screen><EmptyState title={ar?'ليس لديك صلاحية عرض الإعدادات':'Vous n’avez pas accès aux paramètres.'}/></Screen>;
  const restore=()=>Alert.alert(t('importBackup'),ar?'سيتم استبدال البيانات الحالية، مع إنشاء نسخة أمان للهاتف أولًا.':'Les données actuelles seront remplacées après création automatique d’une sauvegarde de sécurité.',[{text:t('cancel'),style:'cancel'},{text:t('confirm'),style:'destructive',onPress:()=>void (async()=>{if(busy)return;setBusy('restore');try{if(!auth.has('settings.backup.manage'))throw new Error(ar?'ليس لديك صلاحية الاستعادة.':'Accès refusé.');const done=await chooseAndRestoreBackup(db);if(done)await auth.refresh()}catch(error){Alert.alert(t('error'),errorMessage(error))}finally{setBusy(null)}})()}]);
  const desktopImport=async()=>{if(busy)return;setBusy('desktop');try{if(!auth.has('settings.legacy.import'))throw new Error(ar?'ليس لديك صلاحية استيراد بيانات الكمبيوتر.':'Accès refusé.');const plan=await chooseDesktopBackup();if(!plan)return;const s=plan.summary,message=ar?`سيتم استبدال بيانات الهاتف ببيانات نسخة الكمبيوتر.\n\nالمنتجات: ${s.products}\nالمخازن: ${s.warehouses}\nالأطراف: ${s.parties}\nالمستندات: ${s.documents}\nالحركات المالية: ${s.financialMovements}\nالمستخدمون: ${s.users}\n\nسيتم إنشاء نسخة أمان تلقائيًا قبل الاستيراد.`:`Les données mobiles seront remplacées.\n\nProduits : ${s.products}\nDépôts : ${s.warehouses}\nComptes tiers : ${s.parties}\nDocuments : ${s.documents}\nMouvements financiers : ${s.financialMovements}\nUtilisateurs : ${s.users}\n\nUne sauvegarde de sécurité sera créée avant l’import.`;Alert.alert(ar?'استيراد نسخة الكمبيوتر':'Importer la sauvegarde ordinateur',message,[{text:t('cancel'),style:'cancel'},{text:t('confirm'),style:'destructive',onPress:()=>void (async()=>{setBusy('desktop-import');try{await importDesktopBackup(db,plan);await auth.refresh()}catch(error){Alert.alert(t('error'),errorMessage(error))}finally{setBusy(null)}})()}])}catch(error){Alert.alert(t('error'),errorMessage(error))}finally{if(busy!=='desktop-import')setBusy(null)}};
  const exportBackup=async()=>{if(busy)return;setBusy('export');try{if(!auth.has('settings.backup.manage'))throw new Error(ar?'ليس لديك صلاحية النسخ الاحتياطي.':'Accès refusé.');await exportAndShareBackup(db)}catch(error){Alert.alert(t('error'),errorMessage(error))}finally{setBusy(null)}};
  return <Screen scroll><View style={styles.header}><SectionTitle title={t('settings')} subtitle={ar?'الإعدادات الأقل استخدامًا مجمعة هنا بعيدًا عن العمل اليومي.':'Les réglages moins fréquents restent séparés du travail quotidien.'}/><View style={[styles.status,{flexDirection:isRTL?'row-reverse':'row'}]}><Badge label={ar?'محلي':'Local'} tone="positive"/><Badge label={ar?'بدون خادم':'Sans serveur'} tone="primary"/><Badge label="Android" tone="neutral"/></View></View>
    <View style={styles.languagePanel}><View style={styles.panelRule}/><SectionTitle title={t('language')} subtitle={ar?'يتغير اتجاه الواجهة تلقائيًا مع اللغة.':'Le sens de l’interface suit automatiquement la langue.'}/><View style={[styles.chips,{flexDirection:isRTL?'row-reverse':'row'}]}><Chip label={t('arabic')} active={locale==='ar'} onPress={()=>void setLocale('ar')}/><Chip label={t('french')} active={locale==='fr'} onPress={()=>void setLocale('fr')}/></View></View>
    <View style={styles.section}><SectionTitle title={ar?'تنسيق الفاتورة':'Format de facture'} subtitle={ar?'اختر المقاس الذي سيستخدم عند الطباعة أو إنشاء PDF.':'Choisissez le format utilisé pour l’impression et les PDF.'}/><View style={styles.printPanel}>{printProfiles.map(profile=><PrintProfileCard key={profile} profile={profile} active={printProfile===profile} locale={locale} isRTL={isRTL} disabled={printBusy} onPress={()=>void (async()=>{if(printBusy||profile===printProfile)return;setPrintBusy(true);try{const saved=await savePrintSettings(db,{profile});setPrintProfile(saved.profile)}catch(error){Alert.alert(t('error'),errorMessage(error))}finally{setPrintBusy(false)}})()}/>)}</View><AppText variant="caption" muted>{ar?'في أندرويد تظهر نافذة الطباعة الخاصة بالنظام لاختيار الطابعة؛ مقاس الفاتورة يبقى محفوظًا داخل التطبيق.':'Sur Android, la fenêtre système choisit l’imprimante ; le format de facture reste mémorisé dans l’application.'}</AppText></View>
    {(auth.has('settings.branding.manage')||auth.has('settings.users.manage'))?<View style={styles.section}><SectionTitle title={ar?'إدارة النشاط':'Gestion du commerce'}/><View style={styles.menuPanel}>{auth.has('settings.branding.manage')?<SettingsRow title={ar?'هوية النشاط والفواتير':'Identité du commerce'} subtitle={ar?'الشعار واسم المحل والهاتف والعنوان وبيانات الفاتورة.':'Logo, nom, téléphone, adresse et identité des factures.'} onPress={()=>router.push('/more/branding')} isRTL={isRTL}/>:null}{auth.has('settings.users.manage')?<SettingsRow title={ar?'المستخدمون والصلاحيات':'Utilisateurs et droits'} subtitle={ar?'من يستطيع البيع أو التعديل أو رؤية التقارير.':'Qui peut vendre, modifier ou voir les rapports.'} onPress={()=>router.push('/more/users')} isRTL={isRTL} last/>:null}</View></View>:null}
    {(auth.has('settings.backup.manage')||auth.has('settings.legacy.import'))?<View style={styles.section}><SectionTitle title={ar?'حماية البيانات':'Protection des données'} subtitle={ar?'العمليات هنا تؤثر على نسخة البيانات كاملة.':'Ces actions concernent l’ensemble des données.'}/><View style={styles.dataPanel}><View style={styles.dataIntro}><View style={styles.warningRule}/><Badge label={ar?'بيانات محلية':'Données locales'} tone="warning"/><AppText variant="caption" muted>{ar?'احتفظ بنسخة احتياطية قبل تغيير الهاتف أو تنفيذ استعادة كبيرة.':'Gardez une sauvegarde avant un changement de téléphone ou une restauration.'}</AppText></View>{auth.has('settings.backup.manage')?<><Button title={t('exportBackup')} loading={busy==='export'} disabled={busy!==null&&busy!=='export'} onPress={()=>void exportBackup()}/><Button title={t('importBackup')} variant="secondary" loading={busy==='restore'} disabled={busy!==null&&busy!=='restore'} onPress={restore}/></>:null}{auth.has('settings.legacy.import')?<Button title={ar?'نقل بيانات نسخة الكمبيوتر':'Importer les données ordinateur'} variant="secondary" loading={busy==='desktop'||busy==='desktop-import'} disabled={busy!==null&&!['desktop','desktop-import'].includes(busy)} onPress={()=>void desktopImport()}/>:null}</View></View>:null}
    {auth.hasUsers?<View style={styles.section}><SectionTitle title={ar?'الحساب الحالي':'Compte actuel'}/><View style={[styles.accountPanel,{flexDirection:isRTL?'row-reverse':'row'}]}><View style={styles.flex}><AppText variant="subheading">{auth.principal?.name??''}</AppText><AppText variant="caption" muted>{ar?'جلسة محلية على هذا الجهاز':'Session locale sur cet appareil'}</AppText></View><Button compact title={ar?'خروج':'Déconnexion'} variant="secondary" onPress={()=>void auth.logout()}/></View></View>:null}
    <View style={styles.version}><AppText variant="caption" muted>{ar?'الكرنه للهاتف • يعمل دون إنترنت • v0.1.0':'Alkarna mobile • hors ligne • v0.1.0'}</AppText></View>
  </Screen>;
}

function PrintProfileCard({profile,active,locale,isRTL,disabled,onPress}:{profile:PrintProfile;active:boolean;locale:'ar'|'fr';isRTL:boolean;disabled:boolean;onPress:()=>void}){
  const thermal=profile!=='a4',narrow=profile==='thermal58';
  return <Pressable accessibilityRole="button" accessibilityState={{selected:active,disabled}} disabled={disabled} onPress={onPress} style={({pressed})=>[styles.printCard,{flexDirection:isRTL?'row-reverse':'row'},active&&styles.printCardActive,pressed&&styles.pressed,disabled&&styles.disabled]}><View style={[styles.paper,thermal&&styles.paperThermal,narrow&&styles.paperNarrow]}><View style={styles.paperBrand}/><View style={styles.paperLine}/><View style={styles.paperLineShort}/><View style={styles.paperTable}>{[0,1,2].map(index=><View key={index} style={styles.paperRow}/>)}</View><View style={styles.paperTotal}/></View><View style={[styles.printCopy,{alignItems:isRTL?'flex-end':'flex-start'}]}><AppText variant="subheading" style={active?styles.printTitleActive:undefined}>{printProfileLabel(profile,locale)}</AppText><AppText variant="caption" muted>{profile==='a4'?(locale==='ar'?'تفاصيل كاملة وتقارير رسمية':'Détails complets et impression classique'):locale==='ar'?'إيصال مدمج لنقاط البيع':'Ticket compact pour comptoir'}</AppText></View>{active?<Badge label={locale==='ar'?'محدد':'Actif'} tone="primary"/>:null}</Pressable>;
}

function SettingsRow({title,subtitle,onPress,isRTL,last=false}:{title:string;subtitle:string;onPress:()=>void;isRTL:boolean;last?:boolean}){return <Pressable accessibilityRole="button" onPress={onPress} style={({pressed})=>[styles.row,{flexDirection:isRTL?'row-reverse':'row'},last&&styles.lastRow,pressed&&styles.pressed]}><View style={styles.flex}><AppText variant="subheading">{title}</AppText><AppText variant="caption" muted>{subtitle}</AppText></View><AppText variant="heading" style={styles.arrow}>{isRTL?'‹':'›'}</AppText></Pressable>}

const styles=StyleSheet.create({
  header:{gap:spacing.sm},
  status:{gap:spacing.xs,flexWrap:'wrap'},
  chips:{flexWrap:'wrap',gap:spacing.xs},
  section:{gap:spacing.sm},
  languagePanel:{gap:spacing.md,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,padding:spacing.md},
  printPanel:{gap:spacing.xs},
  printCard:{minHeight:102,alignItems:'center',gap:spacing.md,padding:spacing.sm,borderRadius:radius.md,borderWidth:1,borderColor:colors.border,backgroundColor:colors.surface},
  printCardActive:{borderColor:colors.primary,backgroundColor:colors.primaryFaint},
  paper:{width:52,height:68,borderRadius:4,borderWidth:1,borderColor:colors.borderStrong,backgroundColor:'#FFFFFF',padding:5,gap:4,justifyContent:'flex-start'},
  paperThermal:{width:38,height:72},
  paperNarrow:{width:30},
  paperBrand:{width:'58%',height:3,borderRadius:2,backgroundColor:colors.primary,alignSelf:'center'},
  paperLine:{height:2,borderRadius:1,backgroundColor:colors.borderStrong},
  paperLineShort:{width:'62%',height:2,borderRadius:1,backgroundColor:colors.border,alignSelf:'center'},
  paperTable:{gap:3,marginTop:2},
  paperRow:{height:2,borderRadius:1,backgroundColor:colors.border},
  paperTotal:{width:'48%',height:3,borderRadius:2,backgroundColor:colors.accent,alignSelf:'flex-end',marginTop:'auto'},
  printCopy:{flex:1,gap:spacing.xs},
  printTitleActive:{color:colors.primary},
  panelRule:{width:34,height:3,borderRadius:2,backgroundColor:colors.accent},
  menuPanel:{backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,overflow:'hidden'},
  row:{minHeight:76,alignItems:'center',gap:spacing.md,paddingHorizontal:spacing.md,paddingVertical:spacing.sm,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border},
  lastRow:{borderBottomWidth:0},
  flex:{flex:1,gap:spacing.xs},
  arrow:{color:colors.textSoft,lineHeight:20},
  pressed:{backgroundColor:colors.surfaceMuted},
  disabled:{opacity:.5},
  dataPanel:{gap:spacing.sm,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,padding:spacing.md},
  dataIntro:{gap:spacing.sm},
  warningRule:{width:34,height:3,borderRadius:2,backgroundColor:colors.warning},
  accountPanel:{alignItems:'center',gap:spacing.md,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,padding:spacing.md},
  version:{alignItems:'center',paddingVertical:spacing.sm},
});
