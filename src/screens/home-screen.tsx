import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type { DashboardSummary } from '@/domain/types';
import { dashboardSummary } from '@/db/queries';
import { AppText, Card, Money, Screen, Stat } from '@/components/ui';
import { useI18n } from '@/i18n/provider';
import { useAuth } from '@/auth/provider';
import { colors, radius, shadow, spacing } from '@/theme';

const empty:DashboardSummary={todaySales:0,todayProfit:0,todayExpenses:0,receivable:0,payable:0,inventoryValue:0,lowStockCount:0};

export function HomeScreen(){
  const db=useSQLiteContext(),{t,isRTL,number}=useI18n(),auth=useAuth();
  const [summary,setSummary]=useState(empty),[refreshing,setRefreshing]=useState(false);
  const load=useCallback(async()=>{setSummary(await dashboardSummary(db));setRefreshing(false)},[db]);
  useFocusEffect(useCallback(()=>{void load()},[load]));
  const canSales=auth.has('pos.view')||auth.has('records.view'),canReports=auth.has('reports.view'),canExpenses=auth.has('expenses.view'),canCustomers=auth.has('customers.view'),canSuppliers=auth.has('suppliers.view'),canInventory=auth.has('warehouses.inventory.view')||auth.has('reports.view');
  const todayLabel=new Intl.DateTimeFormat(isRTL?'ar-MR':'fr-MR',{weekday:'long',day:'numeric',month:'long'}).format(new Date());

  return <Screen padded={false}>
    <ScrollView showsVerticalScrollIndicator={false} refreshControl={<RefreshControl tintColor={colors.primary} refreshing={refreshing} onRefresh={()=>{setRefreshing(true);void load()}}/>} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <View style={[styles.heroTop,{flexDirection:isRTL?'row-reverse':'row'}]}>
          <View style={styles.brandMark}><View style={styles.brandMarkInner}/></View>
          <View style={styles.heroTitle}><AppText variant="caption" style={styles.kicker}>{t('appName')}</AppText><AppText variant="title" style={styles.welcome}>{todayLabel}</AppText></View>
        </View>
        {canSales?<View style={styles.heroAmount}><AppText variant="caption" style={styles.heroLabel}>{t('todaySales')}</AppText><Money value={summary.todaySales} large/></View>:null}
        <View style={styles.heroDivider}/>
        <View style={[styles.heroMiniRow,{flexDirection:isRTL?'row-reverse':'row'}]}>
          {canReports?<View style={styles.heroMini}><AppText variant="caption" style={styles.heroMiniLabel}>{t('todayProfit')}</AppText><Money value={summary.todayProfit} tone="positive"/></View>:null}
          {canExpenses?<View style={styles.heroMini}><AppText variant="caption" style={styles.heroMiniLabel}>{t('todayExpenses')}</AppText><Money value={summary.todayExpenses} tone="negative"/></View>:null}
        </View>
      </View>

      <View style={styles.section}>
        <AppText variant="heading" style={styles.sectionTitle}>{isRTL?'نظرة مالية':'Aperçu financier'}</AppText>
        <View style={[styles.grid,{flexDirection:isRTL?'row-reverse':'row'}]}>
          {canCustomers?<Stat label={t('receivable')} value={summary.receivable} tone="positive"/>:null}
          {canSuppliers?<Stat label={t('payable')} value={summary.payable} tone="negative"/>:null}
          {canInventory?<Stat label={t('inventoryValue')} value={summary.inventoryValue}/>:null}
        </View>
      </View>

      {canInventory?<Card elevated style={styles.stockCard}>
        <View style={[styles.stockRow,{flexDirection:isRTL?'row-reverse':'row'}]}>
          <View style={styles.stockIcon}><AppText style={styles.stockIconText}>!</AppText></View>
          <View style={styles.stockBody}><AppText variant="subheading" style={styles.stockTitle}>{t('lowStock')}</AppText><AppText variant="caption" muted>{isRTL?'منتجات تحتاج مراجعة المخزون':'Produits à vérifier en stock'}</AppText></View>
          <View style={styles.stockCount}><AppText variant="heading" style={styles.stockCountText}>{number(summary.lowStockCount)}</AppText></View>
        </View>
      </Card>:null}
    </ScrollView>
  </Screen>;
}

const styles=StyleSheet.create({
  content:{padding:spacing.md,gap:spacing.xl,paddingBottom:spacing.xxl},
  hero:{backgroundColor:colors.surface,borderRadius:radius.xl,borderWidth:1,borderColor:colors.border,padding:spacing.lg,gap:spacing.md,...shadow.floating},
  heroTop:{alignItems:'center',gap:spacing.sm},
  brandMark:{width:42,height:42,borderRadius:14,backgroundColor:colors.primarySoft,alignItems:'center',justifyContent:'center'},
  brandMarkInner:{width:18,height:18,borderRadius:6,backgroundColor:colors.primary,transform:[{rotate:'45deg'}]},
  heroTitle:{flex:1,gap:2},
  kicker:{textTransform:'uppercase',letterSpacing:1.1,fontWeight:'800',color:colors.primary},
  welcome:{fontSize:22,fontWeight:'800'},
  heroAmount:{gap:4,paddingVertical:spacing.xs},
  heroLabel:{fontWeight:'700',color:colors.textMuted},
  heroDivider:{height:1,backgroundColor:colors.border},
  heroMiniRow:{gap:spacing.sm},
  heroMini:{flex:1,gap:4},
  heroMiniLabel:{fontWeight:'700',color:colors.textMuted},
  section:{gap:spacing.sm},
  sectionTitle:{fontWeight:'800'},
  grid:{flexWrap:'wrap',gap:spacing.sm},
  stockCard:{padding:spacing.md},
  stockRow:{alignItems:'center',gap:spacing.sm},
  stockIcon:{width:40,height:40,borderRadius:14,backgroundColor:colors.warningSoft,alignItems:'center',justifyContent:'center'},
  stockIconText:{fontWeight:'900',color:colors.warning},
  stockBody:{flex:1,gap:2},
  stockTitle:{fontWeight:'800'},
  stockCount:{minWidth:44,height:36,paddingHorizontal:spacing.sm,borderRadius:18,backgroundColor:colors.surfaceStrong,alignItems:'center',justifyContent:'center'},
  stockCountText:{fontSize:18,color:colors.text},
});
