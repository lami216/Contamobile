import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type { DashboardSummary } from '@/domain/types';
import { dashboardSummary } from '@/db/queries';
import { AppText, Screen, Stat } from '@/components/ui';
import { useI18n } from '@/i18n/provider';
import { spacing } from '@/theme';

const empty:DashboardSummary={todaySales:0,todayProfit:0,todayExpenses:0,receivable:0,payable:0,inventoryValue:0,lowStockCount:0};
export function HomeScreen(){const db=useSQLiteContext(),{t,isRTL,number}=useI18n();const [summary,setSummary]=useState(empty),[refreshing,setRefreshing]=useState(false);const load=useCallback(async()=>{setSummary(await dashboardSummary(db));setRefreshing(false)},[db]);useFocusEffect(useCallback(()=>{void load()},[load]));return <Screen padded={false}><ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);void load()}}/>} contentContainerStyle={styles.content}><View><AppText variant="title">{t('appName')}</AppText><AppText muted>{new Intl.DateTimeFormat(isRTL?'ar-MR':'fr-MR',{weekday:'long',day:'numeric',month:'long'}).format(new Date())}</AppText></View><View style={[styles.grid,{flexDirection:isRTL?'row-reverse':'row'}]}><Stat label={t('todaySales')} value={summary.todaySales}/><Stat label={t('todayProfit')} value={summary.todayProfit} tone="positive"/><Stat label={t('todayExpenses')} value={summary.todayExpenses} tone="negative"/><Stat label={t('receivable')} value={summary.receivable} tone="positive"/><Stat label={t('payable')} value={summary.payable} tone="negative"/><Stat label={t('inventoryValue')} value={summary.inventoryValue}/></View><View style={styles.low}><AppText variant="caption" muted>{t('lowStock')}</AppText><AppText variant="heading">{number(summary.lowStockCount)}</AppText></View></ScrollView></Screen>}
const styles=StyleSheet.create({content:{padding:spacing.md,gap:spacing.lg,paddingBottom:spacing.xl},grid:{flexWrap:'wrap',gap:spacing.sm},low:{gap:spacing.xxs}});
