import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useAuth } from '@/auth/provider';
import { exportAndShareBackup, chooseAndRestoreBackup } from '@/services/backup-service';
import { chooseDesktopBackup, importDesktopBackup } from '@/services/desktop-import-service';
import { getPrintSettings, printProfileLabel, printProfiles, savePrintSettings, type PrintProfile } from '@/services/print-settings-service';
import { AppText, Badge, Button, EmptyState, GroupedList, IconTile, PageHeader, Screen, SectionTitle, Surface } from '@/components/ui';
import { StitchIcon, stitch } from '@/components/stitch';
import { useI18n } from '@/i18n/provider';
import { colors, radius, spacing } from '@/theme';

const format=(template:string,values:Record<string,string|number>)=>Object.entries(values).reduce((output,[key,value])=>output.replaceAll('{'+key+'}',String(value)),template);

export function SettingsScreen(){
  const db=useSQLiteContext(),auth=useAuth(),{t,locale,setLocale,isRTL,errorMessage}=useI18n();
  const [busy,setBusy]=useState<string|null>(null),[printProfile,setPrintProfile]=useState<PrintProfile>('a4'),[printBusy,setPrintBusy]=useState(false);

  useFocusEffect(useCallback(()=>{
    let active=true;
    void getPrintSettings(db).then(settings=>{if(active)setPrintProfile(settings.profile)}).catch(()=>{});
    return()=>{active=false};
  },[db]));

  if(!auth.has('settings.view'))return <Screen><EmptyState title={t('settingsNoPermission')}/></Screen>;

  const restore=()=>Alert.alert(
    t('importBackup'),
    t('settingsRestoreWarning'),
    [{text:t('cancel'),style:'cancel'},{text:t('confirm'),style:'destructive',onPress:()=>void (async()=>{
      if(busy)return;
      setBusy('restore');
      try{
        if(!auth.has('settings.backup.manage'))throw new Error(t('settingsRestoreDenied'));
        const done=await chooseAndRestoreBackup(db);
        if(done)await auth.refresh();
      }catch(error){Alert.alert(t('error'),errorMessage(error))}
      finally{setBusy(null)}
    })()}],
  );

  const desktopImport=async()=>{
    if(busy)return;
    setBusy('desktop');
    try{
      if(!auth.has('settings.legacy.import'))throw new Error(t('settingsDesktopImportDenied'));
      const plan=await chooseDesktopBackup();
      if(!plan){setBusy(null);return}
      const s=plan.summary;
      const message=format(t('settingsDesktopImportSummary'),{
        products:s.products,
        warehouses:s.warehouses,
        parties:s.parties,
        documents:s.documents,
        movements:s.financialMovements,
        users:s.users,
      });
      setBusy(null);
      Alert.alert(
        t('settingsDesktopImportTitle'),
        message,
        [{text:t('cancel'),style:'cancel'},{text:t('confirm'),style:'destructive',onPress:()=>void (async()=>{
          setBusy('desktop-import');
          try{await importDesktopBackup(db,plan);await auth.refresh()}
          catch(error){Alert.alert(t('error'),errorMessage(error))}
          finally{setBusy(null)}
        })()}],
      );
    }catch(error){
      setBusy(null);
      Alert.alert(t('error'),errorMessage(error));
    }
  };

  const exportBackup=async()=>{
    if(busy)return;
    setBusy('export');
    try{
      if(!auth.has('settings.backup.manage'))throw new Error(t('settingsBackupDenied'));
      await exportAndShareBackup(db);
    }catch(error){Alert.alert(t('error'),errorMessage(error))}
    finally{setBusy(null)}
  };

  const updatePrintProfile=async(profile:PrintProfile)=>{
    if(printBusy||profile===printProfile)return;
    setPrintBusy(true);
    try{
      const saved=await savePrintSettings(db,{profile});
      setPrintProfile(saved.profile);
    }catch(error){Alert.alert(t('error'),errorMessage(error))}
    finally{setPrintBusy(false)}
  };

  return <Screen scroll>
    <View style={styles.header}>
      <PageHeader title={t('settings')} subtitle={t('settingsSubtitle')}/>
      <View style={[styles.status,{flexDirection:isRTL?'row-reverse':'row'}]}>
        <Badge label={t('settingsLocal')} tone="positive"/>
        <Badge label={t('settingsNoServer')} tone="primary"/>
        <Badge label="Android" tone="neutral"/>
      </View>
    </View>

    <View style={styles.section}>
      <SectionTitle title={t('language')} subtitle={t('settingsLanguageHint')}/>
      <View style={{flexDirection:isRTL?'row-reverse':'row',gap:12}}>{(['ar','fr'] as const).map(value=><Pressable key={value} accessibilityRole="radio" accessibilityState={{selected:locale===value}} onPress={()=>void setLocale(value)} style={{flex:1,minHeight:108,padding:16,gap:6,borderRadius:12,borderWidth:1,borderColor:locale===value?stitch.gold:colors.border,backgroundColor:locale===value?colors.accentSoft:colors.surface}}><View style={{flexDirection:isRTL?'row-reverse':'row',justifyContent:'space-between'}}><AppText variant="heading" style={{color:locale===value?stitch.gold:colors.text}}>{value==='ar'?'العربية':'Français'}</AppText>{locale===value?<StitchIcon name="check"/>:null}</View><AppText variant="caption" muted>{value==='ar'?'من اليمين إلى اليسار':'De gauche à droite'}</AppText></Pressable>)}</View>
    </View>

    <View style={styles.section}>
      <SectionTitle title={t('settingsInvoiceFormat')} subtitle={t('settingsInvoiceFormatHint')}/>
      <View style={styles.printPanel}>
        {printProfiles.map(profile=><PrintProfileCard key={profile} profile={profile} active={printProfile===profile} locale={locale} isRTL={isRTL} disabled={printBusy} onPress={()=>void updatePrintProfile(profile)}/>)}
      </View>
      <AppText variant="caption" muted style={styles.supportingText}>{t('settingsAndroidPrintHint')}</AppText>
    </View>

    {(auth.has('settings.branding.manage')||auth.has('settings.users.manage'))?<View style={styles.section}>
      <SectionTitle title={t('settingsBusinessManagement')}/>
      <GroupedList>
        {auth.has('settings.branding.manage')?<SettingsRow title={t('settingsBranding')} subtitle={t('settingsBrandingHint')} icon="business" onPress={()=>router.push('/more/branding')} last={!auth.has('settings.users.manage')}/>:null}
        {auth.has('settings.users.manage')?<SettingsRow title={t('settingsUsers')} subtitle={t('settingsUsersHint')} icon="users" onPress={()=>router.push('/more/users')} last/>:null}
      </GroupedList>
    </View>:null}

    {(auth.has('settings.backup.manage')||auth.has('settings.legacy.import'))?<View style={styles.section}>
      <SectionTitle title={t('settingsDataProtection')} subtitle={t('settingsDataProtectionHint')}/>
      <Surface tone="warning" style={styles.dataSurface}>
        <View style={[styles.dataIntro,{flexDirection:isRTL?'row-reverse':'row'}]}>
          <IconTile tone="warning"><DataGlyph/></IconTile>
          <View style={styles.flex}><Badge label={t('settingsLocalData')} tone="warning"/><AppText variant="caption" muted>{t('settingsBackupAdvice')}</AppText></View>
        </View>
        <View style={styles.dataActions}>
          {auth.has('settings.backup.manage')?<><Button title={t('exportBackup')} loading={busy==='export'} disabled={busy!==null&&busy!=='export'} onPress={()=>void exportBackup()}/><Button title={t('importBackup')} variant="secondary" loading={busy==='restore'} disabled={busy!==null&&busy!=='restore'} onPress={restore}/></>:null}
          {auth.has('settings.legacy.import')?<Button title={t('settingsDesktopImport')} variant="secondary" loading={busy==='desktop'||busy==='desktop-import'} disabled={busy!==null&&!['desktop','desktop-import'].includes(busy)} onPress={()=>void desktopImport()}/>:null}
        </View>
      </Surface>
    </View>:null}

    {auth.hasUsers?<View style={styles.section}>
      <SectionTitle title={t('settingsCurrentAccount')}/>
      <Surface style={styles.accountSurface}>
        <View style={[styles.accountRow,{flexDirection:isRTL?'row-reverse':'row'}]}>
          <IconTile tone="neutral"><UserGlyph/></IconTile>
          <View style={styles.flex}><AppText variant="subheading">{auth.principal?.name??''}</AppText><AppText variant="caption" muted>{t('settingsLocalSession')}</AppText></View>
          <Button compact title={t('settingsLogout')} variant="secondary" onPress={()=>void auth.logout()}/>
        </View>
      </Surface>
    </View>:null}

    <View style={styles.version}><AppText variant="caption" muted>{t('settingsVersion')}</AppText></View>
  </Screen>;
}

function PrintProfileCard({profile,active,locale,isRTL,disabled,onPress}:{profile:PrintProfile;active:boolean;locale:'ar'|'fr';isRTL:boolean;disabled:boolean;onPress:()=>void}){
  const {t}=useI18n();
  const thermal=profile!=='a4',narrow=profile==='thermal58';
  return <Pressable accessibilityRole="button" accessibilityState={{selected:active,disabled}} disabled={disabled} onPress={onPress} style={({pressed})=>[styles.printCard,{flexDirection:isRTL?'row-reverse':'row'},active&&styles.printCardActive,pressed&&styles.pressed,disabled&&styles.disabled]}>
    <View style={[styles.paper,thermal&&styles.paperThermal,narrow&&styles.paperNarrow]}><View style={styles.paperBrand}/><View style={styles.paperLine}/><View style={styles.paperLineShort}/><View style={styles.paperTable}>{[0,1,2].map(index=><View key={index} style={styles.paperRow}/>)}</View><View style={styles.paperTotal}/></View>
    <View style={[styles.printCopy,{alignItems:isRTL?'flex-end':'flex-start'}]}><AppText variant="subheading" style={active?styles.printTitleActive:undefined}>{printProfileLabel(profile,locale)}</AppText><AppText variant="caption" muted>{profile==='a4'?t('settingsPrintA4Hint'):t('settingsPrintThermalHint')}</AppText></View>
    {active?<Badge label={t('settingsSelected')} tone="primary"/>:null}
  </Pressable>;
}

function SettingsRow({title,subtitle,icon,onPress,last=false}:{title:string;subtitle:string;icon:'business'|'users';onPress:()=>void;last?:boolean}){
  const {isRTL}=useI18n();
  return <Pressable accessibilityRole="button" onPress={onPress} style={({pressed})=>[styles.row,{flexDirection:isRTL?'row-reverse':'row'},last&&styles.lastRow,pressed&&styles.pressed]}>
    <IconTile tone="neutral" size="sm">{icon==='business'?<BusinessGlyph/>:<UsersGlyph/>}</IconTile>
    <View style={styles.flex}><AppText variant="subheading">{title}</AppText><AppText variant="caption" muted>{subtitle}</AppText></View>
    <AppText variant="heading" style={styles.arrow}>{isRTL?'‹':'›'}</AppText>
  </Pressable>;
}

function DataGlyph(){return <View style={styles.dataGlyph}><View style={styles.dataBody}/><View style={styles.dataTop}/><View style={styles.dataArrow}/></View>}
function UserGlyph(){return <View style={styles.userGlyph}><View style={styles.userHead}/><View style={styles.userBody}/></View>}
function UsersGlyph(){return <View style={styles.usersGlyph}><View style={styles.usersHeadOne}/><View style={styles.usersHeadTwo}/><View style={styles.usersBody}/></View>}
function BusinessGlyph(){return <View style={styles.businessGlyph}><View style={styles.businessRoof}/><View style={styles.businessBody}/><View style={styles.businessDoor}/></View>}

const styles=StyleSheet.create({
  header:{gap:spacing.sm},
  status:{gap:spacing.xs,flexWrap:'wrap'},
  section:{gap:spacing.sm},
  languageSurface:{padding:spacing.sm},
  printPanel:{gap:spacing.xs},
  printCard:{minHeight:96,alignItems:'center',gap:spacing.md,padding:spacing.sm,borderRadius:radius.md,borderWidth:1,borderColor:colors.border,backgroundColor:colors.surface},
  printCardActive:{borderColor:colors.primary,backgroundColor:colors.primaryFaint},
  paper:{width:50,height:64,borderRadius:4,borderWidth:1,borderColor:colors.borderStrong,backgroundColor:colors.surface,padding:5,gap:4,justifyContent:'flex-start'},
  paperThermal:{width:36,height:68},
  paperNarrow:{width:28},
  paperBrand:{width:'58%',height:3,borderRadius:2,backgroundColor:colors.primary,alignSelf:'center'},
  paperLine:{height:2,borderRadius:1,backgroundColor:colors.borderStrong},
  paperLineShort:{width:'62%',height:2,borderRadius:1,backgroundColor:colors.border,alignSelf:'center'},
  paperTable:{gap:3,marginTop:2},
  paperRow:{height:2,borderRadius:1,backgroundColor:colors.border},
  paperTotal:{width:'48%',height:3,borderRadius:2,backgroundColor:colors.accent,alignSelf:'flex-end',marginTop:'auto'},
  printCopy:{flex:1,minWidth:0,gap:spacing.xs},
  printTitleActive:{color:colors.primary},
  supportingText:{lineHeight:18},
  row:{minHeight:72,alignItems:'center',gap:spacing.sm,paddingHorizontal:spacing.md,paddingVertical:spacing.sm,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border},
  lastRow:{borderBottomWidth:0},
  flex:{flex:1,minWidth:0,gap:spacing.xs},
  arrow:{color:colors.textSoft,lineHeight:20},
  pressed:{backgroundColor:colors.surfaceMuted},
  disabled:{opacity:.5},
  dataSurface:{gap:spacing.md},
  dataIntro:{alignItems:'center',gap:spacing.sm},
  dataActions:{gap:spacing.sm},
  accountSurface:{padding:spacing.sm},
  accountRow:{alignItems:'center',gap:spacing.sm},
  version:{alignItems:'center',paddingVertical:spacing.sm},
  dataGlyph:{width:24,height:24,position:'relative'},
  dataBody:{position:'absolute',left:3,right:3,bottom:2,height:15,borderWidth:2,borderColor:colors.warning,borderRadius:4},
  dataTop:{position:'absolute',left:6,right:6,top:3,height:5,borderWidth:2,borderColor:colors.warning,borderRadius:3,backgroundColor:colors.warningSoft},
  dataArrow:{position:'absolute',left:10,top:9,width:5,height:7,borderLeftWidth:2,borderBottomWidth:2,borderColor:colors.warning,transform:[{rotate:'-45deg'}]},
  userGlyph:{width:24,height:24,alignItems:'center',justifyContent:'flex-end'},
  userHead:{position:'absolute',top:1,width:8,height:8,borderRadius:4,borderWidth:2,borderColor:colors.textMuted},
  userBody:{width:18,height:10,borderWidth:2,borderBottomWidth:0,borderColor:colors.textMuted,borderTopLeftRadius:9,borderTopRightRadius:9},
  usersGlyph:{width:24,height:24,position:'relative'},
  usersHeadOne:{position:'absolute',left:3,top:2,width:7,height:7,borderRadius:4,borderWidth:2,borderColor:colors.textMuted},
  usersHeadTwo:{position:'absolute',right:3,top:5,width:6,height:6,borderRadius:3,borderWidth:2,borderColor:colors.textMuted},
  usersBody:{position:'absolute',left:2,right:2,bottom:2,height:9,borderWidth:2,borderBottomWidth:0,borderColor:colors.textMuted,borderTopLeftRadius:9,borderTopRightRadius:9},
  businessGlyph:{width:24,height:24,position:'relative'},
  businessRoof:{position:'absolute',left:2,right:2,top:3,height:6,borderWidth:2,borderColor:colors.textMuted,borderBottomWidth:0,borderTopLeftRadius:3,borderTopRightRadius:3},
  businessBody:{position:'absolute',left:4,right:4,top:8,bottom:2,borderWidth:2,borderColor:colors.textMuted,borderRadius:3},
  businessDoor:{position:'absolute',width:5,height:8,left:10,bottom:3,borderWidth:1.5,borderColor:colors.textMuted,borderBottomWidth:0},
});
