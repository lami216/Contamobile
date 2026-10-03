import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppText, Button, FormField, Screen } from '@/components/ui';
import { useAuth } from '@/auth/provider';
import { useI18n } from '@/i18n/provider';
import { StitchIcon, StitchPanel, StitchText, stitch } from '@/components/stitch';
import { colors, radius, spacing } from '@/theme';

export function LoginScreen(){
  const {login}=useAuth(),{locale}=useI18n(),ar=locale==='ar';
  const [showPassword,setShowPassword]=useState(false);
  const [username,setUsername]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const submit=async()=>{if(busy)return;setBusy(true);setError('');try{if(!await login(username.trim(),password))setError(ar?'اسم المستخدم أو كلمة المرور غير صحيحة':'Identifiant ou mot de passe incorrect.')}finally{setBusy(false)}};
  return <Screen padded={false}><KeyboardAvoidingView style={styles.flex} behavior={Platform.OS==='ios'?'padding':undefined}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.center}>
    <View style={styles.brand}><View style={styles.emblem}><StitchIcon name="bank" size={54}/></View><StitchText bold size={36} color={stitch.gold} style={{textAlign:'center'}}>{ar?'الكرنة':'Alkarna'}</StitchText><StitchText size={14} color={stitch.muted} style={{textAlign:'center'}}>{ar?'نظام إدارة التجارة والحسابات':'Gestion du commerce et des comptes'}</StitchText><View style={styles.trust}><StitchIcon name="shield" size={16}/><StitchText size={11} color={stitch.lightGold}>{ar?'وضع محلي • لا يحتاج إنترنت':'Mode local • hors ligne'}</StitchText></View></View>
    <StitchPanel style={styles.loginPanel}><View style={styles.formTitle}><StitchText size={21} bold>{ar?'تسجيل الدخول الآمن':'Connexion sécurisée'}</StitchText><StitchText size={12} color={stitch.muted}>{ar?'أدخل بيانات حسابك المحلي للمتابعة':'Utilisez votre compte local pour continuer'}</StitchText></View><FormField label={ar?'اسم المستخدم':'Identifiant'} leading={<StitchIcon name="person" size={20}/>} autoCapitalize="none" autoCorrect={false} value={username} onChangeText={setUsername} returnKeyType="next"/><FormField label={ar?'كلمة المرور':'Mot de passe'} leading={<StitchIcon name="shield" size={20}/>} secureTextEntry={!showPassword} trailing={<Pressable accessibilityRole="button" accessibilityLabel={ar?'إظهار أو إخفاء كلمة المرور':'Afficher ou masquer le mot de passe'} onPress={()=>setShowPassword(v=>!v)} style={styles.passwordToggle}><StitchText size={11} color={stitch.gold}>{showPassword?(ar?'إخفاء':'Masquer'):(ar?'إظهار':'Afficher')}</StitchText></Pressable>} value={password} onChangeText={setPassword} onSubmitEditing={()=>void submit()} returnKeyType="done"/>{error?<AppText variant="caption" style={styles.error}>{error}</AppText>:null}<Button loading={busy} disabled={!username.trim()||!password} title={ar?'فتح النظام وتسجيل الدخول':'Ouvrir le système'} onPress={()=>void submit()}/></StitchPanel>
    <View style={styles.trust}><StitchIcon name="backup" size={16} color={stitch.muted}/><StitchText size={11} color={stitch.muted}>{ar?'بيانات محفوظة على هذا الهاتف':'Données sur cet appareil'}</StitchText></View>
  </ScrollView></KeyboardAvoidingView></Screen>;

}

const styles=StyleSheet.create({
  flex:{flex:1},emblem:{width:96,height:96,borderRadius:20,borderWidth:1,borderColor:stitch.border,backgroundColor:'#181A1A',alignItems:'center',justifyContent:'center',marginBottom:12},trust:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6},
  center:{flexGrow:1,justifyContent:'center',padding:24,gap:28,backgroundColor:colors.background},
  hero:{position:'relative',overflow:'hidden',borderRadius:radius.xl,borderWidth:1,borderColor:colors.accent,backgroundColor:colors.surfaceRaised,padding:spacing.lg,gap:spacing.xl},
  heroAccent:{position:'absolute',top:0,left:0,right:0,height:3,backgroundColor:colors.accent},
  heroTop:{gap:spacing.xs,flexWrap:'wrap'},
  brand:{gap:8,alignItems:'center'},
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
