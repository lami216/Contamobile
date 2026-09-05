import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { AppText, Button, Card, Field, Screen } from '@/components/ui';
import { useAuth } from '@/auth/provider';
import { useI18n } from '@/i18n/provider';
import { colors, spacing } from '@/theme';

export function LoginScreen(){const {login}=useAuth(),{t}=useI18n();const [username,setUsername]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');const submit=async()=>{setBusy(true);setError('');try{if(!await login(username,password))setError('اسم المستخدم أو كلمة المرور غير صحيحة')}finally{setBusy(false)}};return <Screen padded={false}><KeyboardAvoidingView style={styles.flex} behavior={Platform.OS==='ios'?'padding':undefined}><View style={styles.center}><View style={styles.brand}><AppText variant="title">{t('appName')}</AppText><AppText muted>المحاسبة المحلية — Offline</AppText></View><Card><Field label="اسم المستخدم" autoCapitalize="none" autoCorrect={false} value={username} onChangeText={setUsername}/><Field label="كلمة المرور" secureTextEntry value={password} onChangeText={setPassword} onSubmitEditing={()=>void submit()}/>{error?<AppText style={styles.error}>{error}</AppText>:null}<Button loading={busy} disabled={!username.trim()||!password} title="دخول" onPress={()=>void submit()}/></Card></View></KeyboardAvoidingView></Screen>}
const styles=StyleSheet.create({flex:{flex:1},center:{flex:1,justifyContent:'center',padding:spacing.lg,gap:spacing.lg,backgroundColor:colors.background},brand:{gap:spacing.xs},error:{color:colors.negative}});
