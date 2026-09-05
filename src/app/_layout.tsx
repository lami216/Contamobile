import 'react-native-gesture-handler';
import { Redirect, Stack, useSegments } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { AuthProvider, useAuth } from '@/auth/provider';
import { I18nProvider } from '@/i18n/provider';
import { initializeDatabase } from '@/db/initialize';
import { colors } from '@/theme';

function Navigator(){const {ready,principal,hasUsers}=useAuth();const segments=useSegments();if(!ready)return <View style={{flex:1,alignItems:'center',justifyContent:'center',backgroundColor:colors.background}}><ActivityIndicator color={colors.primary}/></View>;const inLogin=segments[0]==='login';if(hasUsers&&!principal&&!inLogin)return <Redirect href="/login"/>;if(principal&&inLogin)return <Redirect href="/"/>;return <><StatusBar style="dark"/><Stack screenOptions={{headerShown:false,contentStyle:{backgroundColor:colors.background}}}/></>}
export default function RootLayout(){return <SQLiteProvider databaseName="alkarna-mobile.db" onInit={initializeDatabase}><I18nProvider><AuthProvider><Navigator/></AuthProvider></I18nProvider></SQLiteProvider>}
