import { useCallback, useState, type ReactNode } from 'react';
import { Alert, Image, ScrollView, StyleSheet, View } from 'react-native';
import { File } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { getInvoiceBranding, invoiceFonts, saveInvoiceBranding, type InvoiceBranding, type InvoiceFont } from '@/services/branding-service';
import { AppText, Button, Chip, EmptyState, Field, Screen, SectionTitle } from '@/components/ui';
import { StickyActionBar } from '@/components/mobile-interactions';
import { useAuth } from '@/auth/provider';
import { useI18n } from '@/i18n/provider';
import { colors, radius, spacing } from '@/theme';

export function BrandingScreen(){
  const db=useSQLiteContext(),auth=useAuth(),{t,locale,isRTL,errorMessage}=useI18n();
  const allowed=auth.has('settings.branding.manage'),ar=locale==='ar';
  const [form,setForm]=useState<InvoiceBranding|null>(null),[busy,setBusy]=useState(false);
  const load=useCallback(async()=>{if(allowed)setForm(await getInvoiceBranding(db))},[allowed,db]);
  useFocusEffect(useCallback(()=>{void load()},[load]));
  if(!allowed)return <Screen><EmptyState title={ar?'ليس لديك صلاحية تعديل هوية النشاط.':'Vous n’avez pas accès à l’identité du commerce.'}/><Button title={t('cancel')} variant="ghost" onPress={()=>router.back()}/></Screen>;
  if(!form)return <Screen><EmptyState title={t('loading')}/></Screen>;
  const set=(key:keyof InvoiceBranding)=>(value:string|number)=>setForm(current=>current?{...current,[key]:value}:current);
  const fontLabel=(font:InvoiceFont)=>font==='segoe-ui'?'Segoe UI':font==='times-new-roman'?'Times New Roman':font==='arial'?'Arial':'Tahoma';
  const save=async()=>{if(busy)return;setBusy(true);try{await saveInvoiceBranding(db,form);router.back()}catch(error){Alert.alert(t('error'),errorMessage(error))}finally{setBusy(false)}};
  const pickLogo=async()=>{
    if(busy)return;
    try{
      const result=await DocumentPicker.getDocumentAsync({type:['image/png','image/jpeg','image/webp'],copyToCacheDirectory:true,multiple:false});
      if(result.canceled)return;
      const asset=result.assets[0];
      if(!asset)return;
      if(asset.size&&asset.size>350000)throw new Error(ar?'حجم الشعار كبير. اختر صورة أصغر من 350KB.':'Le logo est trop volumineux. Choisissez une image de moins de 350 Ko.');
      const lower=asset.name.toLowerCase();
      const mime=asset.mimeType==='image/png'||asset.mimeType==='image/jpeg'||asset.mimeType==='image/webp'?asset.mimeType:lower.endsWith('.png')?'image/png':lower.endsWith('.webp')?'image/webp':'image/jpeg';
      const base64=await new File(asset.uri).base64();
      const dataUrl=`data:${mime};base64,${base64}`;
      if(dataUrl.length>500000)throw new Error(ar?'حجم الشعار كبير بعد المعالجة. اختر صورة أصغر.':'Le logo reste trop volumineux après lecture. Choisissez une image plus petite.');
      set('storeLogoDataUrl')(dataUrl);
    }catch(error){Alert.alert(t('error'),errorMessage(error))}
  };
  return <Screen padded={false}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
    <SectionTitle title={ar?'هوية النشاط والفواتير':'Identité du commerce et factures'} subtitle={ar?'هذه البيانات تظهر في الفواتير؛ أبقها مختصرة وواضحة للعملاء.':'Ces informations apparaissent sur les factures ; gardez-les claires et concises.'}/>
    <View style={styles.preview}><View style={styles.previewRule}/><AppText variant="caption" muted>{ar?'معاينة هوية الرأس':'Aperçu de l’en-tête'}</AppText><View style={[styles.previewBrand,{flexDirection:isRTL?'row-reverse':'row'}]}>{form.storeLogoDataUrl?<Image accessibilityLabel={ar?'شعار النشاط':'Logo du commerce'} source={{uri:form.storeLogoDataUrl}} resizeMode="contain" style={styles.previewLogo}/>:null}<View style={styles.previewCopy}><AppText variant="title" style={styles.previewName}>{form.storeName.trim()||t('appName')}</AppText>{form.storePhone?<AppText variant="caption" muted>{form.storePhone}</AppText>:null}{form.storeAddress?<AppText variant="caption" muted>{form.storeAddress}</AppText>:null}</View></View></View>
    <View style={styles.formPanel}>
      <FormSection title={ar?'بيانات النشاط':'Informations du commerce'}>
        <Field label={ar?'اسم المحل':'Nom du commerce'} value={form.storeName} onChangeText={set('storeName')}/>
        <View style={[styles.logoRow,{flexDirection:isRTL?'row-reverse':'row'}]}><View style={styles.logoSwatch}>{form.storeLogoDataUrl?<Image source={{uri:form.storeLogoDataUrl}} resizeMode="contain" style={styles.logoImage}/>:<AppText variant="caption" muted style={styles.logoEmpty}>{ar?'بدون شعار':'Sans logo'}</AppText>}</View><View style={styles.logoActions}><AppText variant="caption" style={styles.logoTitle}>{ar?'شعار الفاتورة':'Logo de facture'}</AppText><AppText variant="caption" muted>{ar?'PNG أو JPG أو WebP، بحجم صغير ليبقى النسخ الاحتياطي خفيفًا.':'PNG, JPG ou WebP. Gardez une petite image pour des sauvegardes légères.'}</AppText><View style={[styles.logoButtons,{flexDirection:isRTL?'row-reverse':'row'}]}><Button compact title={form.storeLogoDataUrl?(ar?'تغيير':'Changer'):(ar?'اختيار':'Choisir')} variant="secondary" onPress={()=>void pickLogo()}/>{form.storeLogoDataUrl?<Button compact title={ar?'إزالة':'Retirer'} variant="ghost" onPress={()=>set('storeLogoDataUrl')('')}/>:null}</View></View></View>
        <Field label={t('phone')} value={form.storePhone} onChangeText={set('storePhone')} keyboardType="phone-pad"/>
        <Field label={ar?'العنوان':'Adresse'} value={form.storeAddress} onChangeText={set('storeAddress')} multiline/>
      </FormSection>
      <FormSection title={ar?'البيانات الرسمية':'Informations légales'}><Field label={ar?'رقم السجل التجاري':'N° registre'} value={form.registrationNumber} onChangeText={set('registrationNumber')}/><Field label={ar?'الرقم الضريبي':'N° fiscal'} value={form.taxNumber} onChangeText={set('taxNumber')}/></FormSection>
      <FormSection title={ar?'أسفل الفاتورة':'Bas de facture'}><Field label={ar?'ملاحظة أسفل الفاتورة':'Note en bas de facture'} value={form.footerNote} onChangeText={set('footerNote')} multiline numberOfLines={3}/></FormSection>
      <FormSection title={ar?'شكل اسم المحل':'Style du nom'} last><AppText variant="caption" muted>{ar?'الخط':'Police'}</AppText><View style={[styles.chips,{flexDirection:isRTL?'row-reverse':'row'}]}>{invoiceFonts.map(font=><Chip key={font} label={fontLabel(font)} active={form.nameFont===font} onPress={()=>set('nameFont')(font)}/>)}</View><AppText variant="caption" muted>{ar?'الحجم':'Taille'}</AppText><View style={[styles.chips,{flexDirection:isRTL?'row-reverse':'row'}]}>{[18,20,24,28,32].map(size=><Chip key={size} label={String(size)} active={form.nameFontSize===size} onPress={()=>set('nameFontSize')(size)}/>)}</View><AppText variant="caption" muted>{ar?'السماكة':'Graisse'}</AppText><View style={[styles.chips,{flexDirection:isRTL?'row-reverse':'row'}]}>{([400,600,800] as const).map(weight=><Chip key={weight} label={weight===400?(ar?'عادي':'Normal'):weight===600?(ar?'متوسط':'Moyen'):(ar?'عريض':'Gras')} active={form.nameFontWeight===weight} onPress={()=>set('nameFontWeight')(weight)}/>)}</View></FormSection>
    </View>
    <Button title={t('cancel')} variant="ghost" disabled={busy} onPress={()=>router.back()}/>
  </ScrollView><StickyActionBar label={t('save')} summary={form.storeName.trim()||(ar?'هوية الفاتورة':'Identité facture')} loading={busy} disabled={!form.storeName.trim()} onPress={()=>void save()}/></Screen>;
}

function FormSection({title,children,last=false}:{title:string;children:ReactNode;last?:boolean}){return <View style={[styles.formSection,last&&styles.lastSection]}><SectionTitle title={title}/>{children}</View>}

const styles=StyleSheet.create({
  content:{padding:spacing.md,gap:spacing.md,paddingBottom:spacing.xxl,backgroundColor:colors.background},
  preview:{gap:spacing.sm,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,padding:spacing.md},
  previewRule:{width:34,height:3,borderRadius:2,backgroundColor:colors.accent},
  previewBrand:{alignItems:'center',gap:spacing.md},
  previewLogo:{width:58,height:58,borderRadius:radius.md,backgroundColor:colors.surfaceMuted},
  previewCopy:{flex:1,gap:spacing.xs},
  previewName:{color:colors.primary},
  formPanel:{backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,overflow:'hidden'},
  formSection:{padding:spacing.md,gap:spacing.md,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border},
  lastSection:{borderBottomWidth:0,backgroundColor:colors.primaryFaint},
  chips:{flexWrap:'wrap',gap:spacing.xs},
  logoRow:{alignItems:'center',gap:spacing.md,padding:spacing.sm,borderRadius:radius.md,backgroundColor:colors.surfaceMuted},
  logoSwatch:{width:74,height:74,borderRadius:radius.md,borderWidth:1,borderColor:colors.borderStrong,backgroundColor:colors.surface,alignItems:'center',justifyContent:'center',overflow:'hidden'},
  logoImage:{width:'100%',height:'100%'},
  logoEmpty:{textAlign:'center',paddingHorizontal:spacing.xs},
  logoActions:{flex:1,gap:spacing.xs},
  logoTitle:{fontWeight:'700',color:colors.text},
  logoButtons:{gap:spacing.xs,flexWrap:'wrap'},
});
