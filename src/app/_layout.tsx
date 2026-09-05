import 'react-native-gesture-handler';
import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { I18nProvider } from '@/i18n/provider';
import { migrateDatabase } from '@/db/database';
import { colors } from '@/theme';

export default function RootLayout(){
  return <SQLiteProvider databaseName="alkarna-mobile.db" onInit={migrateDatabase}>
    <I18nProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{headerShown:false,contentStyle:{backgroundColor:colors.background}}}/>
    </I18nProvider>
  </SQLiteProvider>;
}
