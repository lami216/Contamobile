import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppText, Badge, Button, Field, FormField, Screen } from '@/components/ui';
import { useAuth } from '@/auth/provider';
import { useI18n } from '@/i18n/provider';
import { colors, radius, spacing } from '@/theme';

export function LoginScreen(){
  const {login}=useAuth(),{t,locale,isRTL}=useI18n(),ar=locale==='ar';
  const [showPassword,setShowPassword]=useState(false);
  const [username,setUsername]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const submit=async()=>{if(busy)return;setBusy(true);setError('');try{if(!await login(username.trim(),password))setError(ar?'اسم المستخدم أو كلمة المرور غير صحيحة':'Identifiant ou mot de passe incorrect.')}finally{setBusy(false)}};
  return <Screen padded={false}><KeyboardAvoidingView style={styles.flex} behavior={Platform.OS==='ios'?'padding':undefined}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.center}><View style={styles.hero}><View style={styles.heroAccent}/><View style={[styles.heroTop,{flexDirection:isRTL?'row-reverse':'row'}]}><Badge label={ar?'يعمل دون إنترنت':'Hors ligne'} tone="positive"/><Badge label={ar?'بيانات محلية':'Données locales'} tone="primary"/></View><View style={styles.brand}><AppText variant="display" style={styles.brandName}>{t('appName')}</AppText><AppText variant="subheading" style={styles.brandSubtitle}>{ar?'حسابات المحل، أسرع وأوضح من أول عملية.':'Les comptes du magasin, plus rapides et plus clairs dès la première opération.'}</AppText></View></View><View style={styles.loginPanel}><View style={styles.formTitle}><AppText variant="heading">{ar?'تسجيل الدخول':'Connexion'}</AppText><AppText variant="caption" muted>{ar?'أدخل حسابك المحلي للمتابعة.':'Utilisez votre compte local pour continuer.'}</AppText></View><Field label={ar?'اسم المستخدم':'Identifiant'} autoCapitalize="none" autoCorrect={false} value={username} onChangeText={setUsername} returnKeyType="next"/><FormField label={ar?'كلمة المرور':'Mot de passe'} secureTextEntry={!showPassword} trailing={<Pressable accessibilityRole="button" accessibilityLabel={showPassword?(ar?'إخفاء كلمة المرور':'Masquer le mot de passe'):(ar?'إظهار كلمة المرور':'Afficher le mot de passe')} onPress={()=>setShowPassword(value=>!value)} style={styles.passwordToggle}><AppText variant="caption" style={styles.passwordToggleText}>{showPassword?(ar?'إخفاء':'Masquer'):(ar?'إظهار':'Afficher')}</AppText></Pressable>} value={password} onChangeText={setPassword} onSubmitEditing={()=>void submit()} returnKeyType="done"/>{error?<View style={styles.errorNote}><View style={styles.errorRule}/><AppText variant="caption" style={styles.error}>{error}</AppText></View>:null}<Button loading={busy} disabled={!username.trim()||!password} title={ar?'دخول إلى الكرنه':'Entrer dans Alkarna'} onPress={()=>void submit()}/></View><AppText variant="caption" muted style={styles.footer}>{ar?'لا يحتاج تسجيل الدخول إلى اتصال بالإنترنت.':'La connexion ne nécessite pas Internet.'}</AppText></ScrollView></KeyboardAvoidingView></Screen>;
}

const styles=StyleSheet.create({
  flex:{flex:1},
  center:{flexGrow:1,justifyContent:'center',padding:spacing.lg,gap:spacing.lg,backgroundColor:colors.background},
  hero:{position:'relative',overflow:'hidden',borderRadius:radius.xl,borderWidth:1,borderColor:colors.accent,backgroundColor:colors.surfaceRaised,padding:spacing.lg,gap:spacing.xl},
  heroAccent:{position:'absolute',top:0,left:0,right:0,height:3,backgroundColor:colors.accent},
  heroTop:{gap:spacing.xs,flexWrap:'wrap'},
  brand:{gap:spacing.sm},
  brandName:{color:colors.accent},
  brandSubtitle:{color:colors.onPrimaryMuted,lineHeight:23},
  loginPanel:{gap:spacing.md,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,padding:spacing.md},
  formTitle:{gap:spacing.xxs},
  errorNote:{gap:spacing.xs,backgroundColor:colors.warningSoft,borderRadius:radius.md,padding:spacing.sm},
  errorRule:{width:28,height:2,borderRadius:2,backgroundColor:colors.warning},
  error:{color:colors.warning,fontWeight:'700'},
  footer:{textAlign:'center'},
  passwordToggle:{minWidth:44,minHeight:44,alignItems:'center',justifyContent:'center'},
  passwordToggleText:{color:colors.accent,fontWeight:'700'},
});
