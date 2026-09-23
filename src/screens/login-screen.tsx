import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { AppText, Button, Card, Field, Screen } from '@/components/ui';
import { useAuth } from '@/auth/provider';
import { useI18n } from '@/i18n/provider';
import { colors, radius, shadow, spacing } from '@/theme';

export function LoginScreen(){
  const {login}=useAuth(),{t,locale}=useI18n(),ar=locale==='ar';
  const [username,setUsername]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const submit=async()=>{setBusy(true);setError('');try{if(!await login(username,password))setError(ar?'اسم المستخدم أو كلمة المرور غير صحيحة':'Identifiant ou mot de passe incorrect.')}finally{setBusy(false)}};
  return <Screen padded={false}>
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS==='ios'?'padding':undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <View style={styles.brandMark}><View style={styles.brandMarkInner}/></View>
        <View style={styles.brand}>
          <AppText variant="caption" style={styles.eyebrow}>{ar?'نظام محاسبة محلي':'COMPTABILITÉ LOCALE'}</AppText>
          <AppText variant="title" style={styles.title}>{t('appName')}</AppText>
          <AppText muted>{ar?'إدارة المبيعات والمخزون والحسابات من هاتفك — حتى بدون إنترنت.':'Ventes, stock et comptes sur votre téléphone — même hors connexion.'}</AppText>
        </View>
        <Card elevated style={styles.loginCard}>
          <View style={styles.cardHead}>
            <AppText variant="heading">{ar?'تسجيل الدخول':'Connexion'}</AppText>
            <AppText variant="caption" muted>{ar?'تُحفظ بياناتك على هذا الجهاز.':'Vos données restent sur cet appareil.'}</AppText>
          </View>
          <Field label={ar?'اسم المستخدم':'Identifiant'} autoCapitalize="none" autoCorrect={false} value={username} onChangeText={setUsername} returnKeyType="next"/>
          <Field label={ar?'كلمة المرور':'Mot de passe'} secureTextEntry value={password} onChangeText={setPassword} onSubmitEditing={()=>void submit()} returnKeyType="done"/>
          {error?<View style={styles.errorBox}><AppText variant="caption" style={styles.error}>{error}</AppText></View>:null}
          <Button loading={busy} disabled={!username.trim()||!password} title={ar?'دخول':'Se connecter'} onPress={()=>void submit()}/>
        </Card>
        <View style={styles.offlineBadge}><View style={styles.dot}/><AppText variant="caption" muted>{ar?'يعمل محليًا دون اتصال بالخادم':'Fonctionnement local sans serveur'}</AppText></View>
      </ScrollView>
    </KeyboardAvoidingView>
  </Screen>;
}
const styles=StyleSheet.create({
  flex:{flex:1},
  content:{flexGrow:1,justifyContent:'center',padding:spacing.xl,gap:spacing.lg,backgroundColor:colors.background},
  brandMark:{width:58,height:58,borderRadius:radius.lg,backgroundColor:colors.primarySoft,alignItems:'center',justifyContent:'center',...shadow.card},
  brandMarkInner:{width:25,height:25,borderRadius:8,backgroundColor:colors.primary,transform:[{rotate:'45deg'}]},
  brand:{gap:spacing.xs},
  eyebrow:{fontWeight:'800',letterSpacing:1.1,color:colors.primary},
  title:{fontWeight:'900'},
  loginCard:{gap:spacing.md,padding:spacing.lg},
  cardHead:{gap:4},
  errorBox:{padding:spacing.sm,borderRadius:radius.md,backgroundColor:colors.negativeSoft},
  error:{color:colors.negative,fontWeight:'700'},
  offlineBadge:{flexDirection:'row',alignItems:'center',gap:spacing.xs,alignSelf:'center'},
  dot:{width:7,height:7,borderRadius:99,backgroundColor:colors.positive},
});
