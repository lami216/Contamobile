import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { getInvoiceBranding, invoiceFonts, saveInvoiceBranding, type InvoiceBranding, type InvoiceFont } from '@/services/branding-service';
import { AppText, Button, Card, Chip, EmptyState, Field, Screen, SectionTitle } from '@/components/ui';
import { useAuth } from '@/auth/provider';
import { useI18n } from '@/i18n/provider';
import { colors, spacing } from '@/theme';

export function BrandingScreen(){
  const db=useSQLiteContext(),auth=useAuth(),{t,locale,errorMessage}=useI18n();
  const allowed=auth.has('settings.branding.manage'),ar=locale==='ar';
  const [form,setForm]=useState<InvoiceBranding|null>(null),[busy,setBusy]=useState(false);
  const load=useCallback(async()=>{if(allowed)setForm(await getInvoiceBranding(db))},[allowed,db]);
  useFocusEffect(useCallback(()=>{void load()},[load]));
  if(!allowed)return <Screen><EmptyState title={ar?'ليس لديك صلاحية تعديل هوية النشاط.':'Vous n’avez pas accès à l’identité du commerce.'}/><Button title={t('cancel')} variant="ghost" onPress={()=>router.back()}/></Screen>;
  if(!form)return <Screen><EmptyState title={t('loading')}/></Screen>;
  const set=(key:keyof InvoiceBranding)=>(value:string|number)=>setForm(current=>current?{...current,[key]:value}:current);
  const fontLabel=(font:InvoiceFont)=>font==='segoe-ui'?'Segoe UI':font==='times-new-roman'?'Times New Roman':font==='arial'?'Arial':'Tahoma';
  const save=async()=>{setBusy(true);try{await saveInvoiceBranding(db,form);Alert.alert(t('success'));router.back()}catch(error){Alert.alert(t('error'),errorMessage(error))}finally{setBusy(false)}};
  return <Screen padded={false}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}><SectionTitle title={ar?'هوية النشاط والفواتير':'Identité du commerce et factures'}/><Card><Field label={ar?'اسم المحل':'Nom du commerce'} value={form.storeName} onChangeText={set('storeName')}/><Field label={t('phone')} value={form.storePhone} onChangeText={set('storePhone')} keyboardType="phone-pad"/><Field label={ar?'العنوان':'Adresse'} value={form.storeAddress} onChangeText={set('storeAddress')} multiline/><Field label={ar?'رقم السجل التجاري':'N° registre'} value={form.registrationNumber} onChangeText={set('registrationNumber')}/><Field label={ar?'الرقم الضريبي':'N° fiscal'} value={form.taxNumber} onChangeText={set('taxNumber')}/><Field label={ar?'ملاحظة أسفل الفاتورة':'Note en bas de facture'} value={form.footerNote} onChangeText={set('footerNote')} multiline/></Card><Card><AppText variant="subheading">{ar?'شكل اسم المحل في الفاتورة':'Style du nom sur la facture'}</AppText><View style={styles.chips}>{invoiceFonts.map(font=><Chip key={font} label={fontLabel(font)} active={form.nameFont===font} onPress={()=>set('nameFont')(font)}/>)}</View><AppText variant="caption" muted>{ar?'الحجم':'Taille'}</AppText><View style={styles.chips}>{[18,20,24,28,32].map(size=><Chip key={size} label={String(size)} active={form.nameFontSize===size} onPress={()=>set('nameFontSize')(size)}/>)}</View><AppText variant="caption" muted>{ar?'السماكة':'Graisse'}</AppText><View style={styles.chips}>{([400,600,800] as const).map(weight=><Chip key={weight} label={String(weight)} active={form.nameFontWeight===weight} onPress={()=>set('nameFontWeight')(weight)}/>)}</View></Card><Button title={t('save')} loading={busy} onPress={()=>void save()}/><Button title={t('cancel')} variant="ghost" onPress={()=>router.back()}/></ScrollView></Screen>;
}
const styles=StyleSheet.create({content:{padding:spacing.md,gap:spacing.md,paddingBottom:spacing.xxl,backgroundColor:colors.background},chips:{flexDirection:'row',flexWrap:'wrap',gap:spacing.xs}});
