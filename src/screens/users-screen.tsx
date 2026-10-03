import { useCallback, useMemo, useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { CAPABILITIES, expandPermissionDependencies, permissionPresets, removePermissionAndDependents, type Capability } from '@/auth/permissions';
import { useAuth } from '@/auth/provider';
import { createUser, deleteUser, listUsers, updateUser } from '@/auth/service';
import type { AppUser } from '@/auth/types';
import { AppText, Badge, Button, Chip, EmptyState, Field, PageHeader, Screen, SectionTitle, SegmentedControl } from '@/components/ui';
import { StitchPanel, StitchIcon, StitchText, stitch } from '@/components/stitch';
import { StickyActionBar } from '@/components/mobile-interactions';
import { useI18n } from '@/i18n/provider';
import { colors, radius, spacing } from '@/theme';

type Preset='manager'|'accountant'|'sales'|'custom';
const capabilityLabels:Record<Capability,{ar:string;fr:string}>={
  'pos.view':{ar:'عرض المبيعات',fr:'Voir les ventes'},'pos.create':{ar:'إنشاء بيع',fr:'Créer une vente'},'pos.edit':{ar:'تعديل المبيعات',fr:'Modifier les ventes'},'pos.delete':{ar:'إلغاء المبيعات',fr:'Annuler les ventes'},
  'purchases.view':{ar:'عرض المشتريات',fr:'Voir les achats'},'purchases.create':{ar:'إنشاء شراء',fr:'Créer un achat'},'purchases.edit':{ar:'تعديل المشتريات',fr:'Modifier les achats'},'purchases.delete':{ar:'إلغاء المشتريات',fr:'Annuler les achats'},'records.view':{ar:'عرض سجل المعاملات',fr:'Voir l’historique'},
  'products.view':{ar:'عرض المنتجات',fr:'Voir les produits'},'products.create':{ar:'إضافة المنتجات',fr:'Ajouter des produits'},'products.edit':{ar:'تعديل المنتجات',fr:'Modifier les produits'},'products.delete':{ar:'أرشفة المنتجات',fr:'Archiver les produits'},
  'customers.view':{ar:'عرض العملاء',fr:'Voir les clients'},'customers.create':{ar:'إضافة العملاء',fr:'Ajouter des clients'},'customers.edit':{ar:'تعديل العملاء والتسويات',fr:'Modifier clients et règlements'},'customers.delete':{ar:'أرشفة العملاء',fr:'Archiver les clients'},'customers.collect':{ar:'تحصيل من العملاء',fr:'Encaisser les clients'},'customers.collect.edit':{ar:'تعديل التحصيلات',fr:'Modifier les encaissements'},'customers.collect.delete':{ar:'إلغاء التحصيلات',fr:'Annuler les encaissements'},
  'suppliers.view':{ar:'عرض الموردين',fr:'Voir les fournisseurs'},'suppliers.create':{ar:'إضافة الموردين',fr:'Ajouter des fournisseurs'},'suppliers.edit':{ar:'تعديل الموردين والتسويات',fr:'Modifier fournisseurs et règlements'},'suppliers.delete':{ar:'أرشفة الموردين',fr:'Archiver les fournisseurs'},'suppliers.pay':{ar:'الدفع للموردين',fr:'Payer les fournisseurs'},'suppliers.pay.edit':{ar:'تعديل دفعات الموردين',fr:'Modifier les paiements fournisseurs'},'suppliers.pay.delete':{ar:'إلغاء دفعات الموردين',fr:'Annuler les paiements fournisseurs'},
  'warehouses.view':{ar:'عرض المخازن',fr:'Voir les dépôts'},'warehouses.create':{ar:'إضافة مخزن',fr:'Ajouter un dépôt'},'warehouses.edit':{ar:'تعديل المخازن',fr:'Modifier les dépôts'},'warehouses.delete':{ar:'أرشفة المخازن',fr:'Archiver les dépôts'},'warehouses.inventory.view':{ar:'عرض جرد المخزون',fr:'Voir l’inventaire'},'warehouses.transfer':{ar:'تحويل بين المخازن',fr:'Transférer entre dépôts'},'warehouses.transfer.edit':{ar:'تعديل التحويلات',fr:'Modifier les transferts'},'warehouses.transfer.delete':{ar:'إلغاء التحويلات',fr:'Annuler les transferts'},'warehouses.adjust':{ar:'تصحيح المخزون',fr:'Ajuster le stock'},'warehouses.adjust.edit':{ar:'تعديل التصحيحات',fr:'Modifier les ajustements'},'warehouses.adjust.delete':{ar:'إلغاء التصحيحات',fr:'Annuler les ajustements'},
  'banks.view':{ar:'عرض وسائل الدفع',fr:'Voir les moyens de paiement'},'banks.create':{ar:'إضافة وسيلة دفع',fr:'Ajouter un moyen de paiement'},'banks.edit':{ar:'تعديل وسائل الدفع',fr:'Modifier les moyens de paiement'},'banks.delete':{ar:'أرشفة وسائل الدفع',fr:'Archiver les moyens de paiement'},'banks.movements.view':{ar:'عرض حركات الحسابات',fr:'Voir les mouvements de comptes'},'banks.transfer':{ar:'تحويل بين الحسابات',fr:'Transférer entre comptes'},'banks.transfer.edit':{ar:'تعديل تحويلات الحسابات',fr:'Modifier les transferts comptes'},'banks.transfer.delete':{ar:'إلغاء تحويلات الحسابات',fr:'Annuler les transferts comptes'},'banks.deposit_withdraw':{ar:'السحب والإيداع',fr:'Retraits et dépôts'},'banks.deposit_withdraw.edit':{ar:'تعديل السحب والإيداع',fr:'Modifier retraits et dépôts'},'banks.deposit_withdraw.delete':{ar:'إلغاء السحب والإيداع',fr:'Annuler retraits et dépôts'},'banks.balance_correct':{ar:'تصحيح رصيد الحساب',fr:'Corriger le solde'},'banks.balance_correct.edit':{ar:'تعديل تصحيح رصيد البداية',fr:'Modifier correction du solde initial'},'banks.balance_correct.delete':{ar:'إلغاء تصحيح رصيد البداية',fr:'Annuler correction du solde initial'},
  'expenses.view':{ar:'عرض المصروفات',fr:'Voir les dépenses'},'expenses.create':{ar:'إضافة المصروفات',fr:'Ajouter des dépenses'},'expenses.edit':{ar:'تعديل المصروفات',fr:'Modifier les dépenses'},'expenses.delete':{ar:'إلغاء المصروفات',fr:'Annuler les dépenses'},'reports.view':{ar:'عرض التقارير',fr:'Voir les rapports'},'settings.view':{ar:'عرض الإعدادات',fr:'Voir les paramètres'},'settings.branding.manage':{ar:'إدارة هوية الفواتير',fr:'Gérer l’identité des factures'},'settings.backup.manage':{ar:'إدارة النسخ الاحتياطي',fr:'Gérer les sauvegardes'},'settings.legacy.import':{ar:'استيراد نسخة الكمبيوتر',fr:'Importer la sauvegarde ordinateur'},'settings.users.manage':{ar:'إدارة المستخدمين والصلاحيات',fr:'Gérer les utilisateurs et droits'},
};

const permissionGroups:{id:string;ar:string;fr:string;matches:(cap:Capability)=>boolean}[]=[
  {id:'sales',ar:'المبيعات والمشتريات',fr:'Ventes et achats',matches:cap=>cap.startsWith('pos.')||cap.startsWith('purchases.')||cap==='records.view'||cap.startsWith('expenses.')},
  {id:'inventory',ar:'المنتجات والمخزون',fr:'Produits et stock',matches:cap=>cap.startsWith('products.')||cap.startsWith('warehouses.')},
  {id:'parties',ar:'العملاء والموردون',fr:'Clients et fournisseurs',matches:cap=>cap.startsWith('customers.')||cap.startsWith('suppliers.')},
  {id:'finance',ar:'الحسابات والتقارير',fr:'Comptes et rapports',matches:cap=>cap.startsWith('banks.')||cap==='reports.view'},
  {id:'admin',ar:'الإعدادات والإدارة',fr:'Paramètres et administration',matches:cap=>cap.startsWith('settings.')},
];

export function UsersScreen(){
  const db=useSQLiteContext(),auth=useAuth(),{locale,t,isRTL,errorMessage}=useI18n();
  const [items,setItems]=useState<AppUser[]>([]),[editing,setEditing]=useState<AppUser|null|undefined>(undefined),[busy,setBusy]=useState(false);
  const load=useCallback(async()=>setItems(await listUsers(db)),[db]);
  useFocusEffect(useCallback(()=>{void load()},[load]));
  if(!auth.has('settings.users.manage'))return <Screen><EmptyState title={t('usersNoPermission')}/><Button title={t('cancel')} variant="ghost" onPress={()=>router.back()}/></Screen>;
  const save=async(input:{username:string;name:string;password:string;permissions:Capability[];isActive:boolean})=>{if(busy)return;setBusy(true);try{const first=!auth.hasUsers;if(editing)await updateUser(db,editing.id,input);else await createUser(db,input);if(first){const ok=await auth.login(input.username,input.password);if(!ok)throw new Error(t('usersFirstLoginFailed'))}else await auth.refresh();setEditing(undefined);await load()}catch(error){Alert.alert(t('error'),errorMessage(error))}finally{setBusy(false)}};
  const remove=(user:AppUser)=>Alert.alert(t('usersDeleteTitle'),user.name,[{text:t('cancel'),style:'cancel'},{text:t('confirm'),style:'destructive',onPress:()=>void (async()=>{if(busy)return;setBusy(true);try{await deleteUser(db,user.id);await auth.refresh();setEditing(undefined);await load()}catch(error){Alert.alert(t('error'),errorMessage(error))}finally{setBusy(false)}})()}]);
  return <Screen padded={false}>
    <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <PageHeader title={t('usersTitle')} subtitle={t('usersHint')} onBack={()=>router.back()} trailing={<Button compact title={t('add')} onPress={()=>setEditing(null)}/>}/>
        <StitchPanel><View style={{flexDirection:isRTL?'row-reverse':'row',gap:10,alignItems:'center'}}><StitchIcon name="shield"/><AppText variant="subheading">{t('usersAllRights')}</AppText></View><AppText variant="caption" muted>{t('usersOwner')}</AppText></StitchPanel>
        <View style={[styles.summary,{flexDirection:isRTL?'row-reverse':'row'}]}>
          <MiniStat label={t('usersCount')} value={String(items.length)}/>
          <MiniStat label={t('usersActiveCount')} value={String(items.filter(user=>user.isActive).length)}/>
          <MiniStat label={t('usersOwnersCount')} value={String(items.filter(user=>user.owner).length)} last/>
        </View>
      </View>
      {items.length?items.map(item=><StitchPanel key={item.id}><View style={{flexDirection:isRTL?'row-reverse':'row',alignItems:'center',gap:12}}><View style={{width:44,height:44,borderRadius:12,backgroundColor:'#272319',alignItems:'center',justifyContent:'center'}}><StitchText size={24} bold color={stitch.gold}>{item.name.slice(0,1)}</StitchText></View><View style={{flex:1}}><AppText variant="heading">{item.name}</AppText><AppText variant="caption" muted>@{item.username}</AppText></View><Badge label={item.owner?t('usersOwner'):!item.isActive?t('usersDisabled'):t('usersActive')} tone={item.owner?'primary':!item.isActive?'warning':'positive'}/></View><View style={{backgroundColor:'#080C14',padding:12,borderRadius:8,gap:4}}><AppText variant="caption" muted>{t('usersPermissions')}</AppText><AppText variant="caption">{item.owner?t('usersAllRights'):t('usersRightsCount').replace('{count}',String(item.permissions.length))}</AppText></View><Button compact title={t('edit')} variant="secondary" onPress={()=>setEditing(item)}/></StitchPanel>):<EmptyState title={t('usersEmpty')} description={t('usersEmptyHint')}/>}

    </ScrollView>
    {editing!==undefined?<UserEditor user={editing} locale={locale} busy={busy} onClose={()=>{if(!busy)setEditing(undefined)}} onSave={save} onDelete={editing&&!editing.owner?()=>remove(editing):undefined}/>:null}
  </Screen>;
}

function MiniStat({label,value,last=false}:{label:string;value:string;last?:boolean}){return <View style={[styles.miniStat,last&&styles.lastMini]}><View style={styles.miniRule}/><AppText variant="caption" muted>{label}</AppText><AppText variant="heading">{value}</AppText></View>}

function UserEditor({user,locale,busy,onClose,onSave,onDelete}:{user:AppUser|null;locale:'ar'|'fr';busy:boolean;onClose:()=>void;onSave:(input:{username:string;name:string;password:string;permissions:Capability[];isActive:boolean})=>Promise<void>;onDelete?:()=>void}){
  const {t,isRTL}=useI18n(),ar=locale==='ar';
  const initialPreset:Preset=useMemo(()=>{if(!user)return'manager';for(const key of ['manager','accountant','sales'] as const){const set=new Set(permissionPresets[key]);if(user.permissions.length===set.size&&user.permissions.every(permission=>set.has(permission)))return key}return'custom'},[user]);
  const [username,setUsername]=useState(user?.username??''),[name,setName]=useState(user?.name??''),[password,setPassword]=useState(''),[active,setActive]=useState(user?.isActive??true),[preset,setPreset]=useState<Preset>(initialPreset),[permissions,setPermissions]=useState<Capability[]>(user?.permissions??permissionPresets.manager);
  const choosePreset=(value:Exclude<Preset,'custom'>)=>{setPreset(value);setPermissions([...permissionPresets[value]])};
  const toggle=(cap:Capability)=>{setPreset('custom');setPermissions(current=>current.includes(cap)?removePermissionAndDependents(current,cap):expandPermissionDependencies([...current,cap]))};
  const presetLabel=(value:Exclude<Preset,'custom'>)=>value==='manager'?t('usersPresetManager'):value==='accountant'?t('usersPresetAccountant'):t('usersPresetSales');
  const valid=Boolean(username.trim()&&name.trim()&&(user||password.length>0));
  return <Modal animationType="slide" onRequestClose={onClose}><Screen padded={false}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modal}>
    <SectionTitle title={user?.name??(t('usersNew'))} subtitle={user?.owner?(t('usersOwnerHint')):(t('usersEditorHint'))}/>
    <View style={styles.editorPanel}><View style={styles.editorSection}><SectionTitle title={t('usersAccess')}/><Field label={t('usersUsername')} autoCapitalize="none" autoCorrect={false} value={username} onChangeText={setUsername}/><Field label={t('name')} value={name} onChangeText={setName}/><Field label={user?(t('usersNewPassword')):(t('usersPassword'))} secureTextEntry value={password} onChangeText={setPassword}/>{user&&!user.owner?<View style={styles.statusBlock}><AppText variant="caption" muted>{t('usersAccountStatus')}</AppText><SegmentedControl value={active?'active':'inactive'} options={[{value:'active',label:t('usersActive')},{value:'inactive',label:t('usersDisabled')}]} onChange={value=>setActive(value==='active')}/></View>:null}</View>
      {!user?.owner?<View style={[styles.editorSection,styles.lastEditorSection]}><SectionTitle title={t('usersPermissions')} subtitle={t('usersPermissionsHint')}/><SegmentedControl value={preset==='custom'?'manager':preset} options={(['manager','accountant','sales'] as const).map(key=>({value:key,label:presetLabel(key)}))} onChange={choosePreset}/>{preset==='custom'?<Badge label={t('usersCustom')} tone="warning"/>:null}{permissionGroups.map(group=>{const caps=CAPABILITIES.filter(group.matches);return <View key={group.id} style={styles.permissionGroup}><AppText variant="subheading">{ar?group.ar:group.fr}</AppText><View style={[styles.permissions,{flexDirection:isRTL?'row-reverse':'row'}]}>{caps.map(cap=><Chip key={cap} label={capabilityLabels[cap][locale]} active={permissions.includes(cap)} onPress={()=>toggle(cap)}/>)}</View></View>})}</View>:null}
    </View>
    {onDelete?<Button title={t('usersDeleteTitle')} variant="danger" disabled={busy} onPress={onDelete}/>:null}<Button title={t('cancel')} variant="ghost" disabled={busy} onPress={onClose}/>
  </ScrollView><StickyActionBar label={t('save')} summary={user?.owner?(t('usersOwnerAccount')):t('usersRightsCount').replace('{count}',String(permissions.length))} loading={busy} disabled={!valid} onPress={()=>void onSave({username:username.trim(),name:name.trim(),password,permissions,isActive:active})}/></Screen></Modal>;
}

const styles=StyleSheet.create({
  list:{padding:spacing.md,paddingBottom:spacing.xxl,backgroundColor:colors.background,gap:12},
  header:{gap:spacing.md,marginBottom:spacing.sm},
  summary:{backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,overflow:'hidden'},
  miniStat:{flex:1,minWidth:100,padding:spacing.md,gap:spacing.xs,borderRightWidth:StyleSheet.hairlineWidth,borderRightColor:colors.border},
  lastMini:{borderRightWidth:0},
  miniRule:{width:24,height:2,borderRadius:2,backgroundColor:colors.accent},
  row:{minHeight:82,alignItems:'center',gap:spacing.md,paddingVertical:spacing.md,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border},
  body:{flex:1,gap:spacing.xs},
  nameRow:{alignItems:'center',gap:spacing.xs,flexWrap:'wrap'},
  trailing:{alignItems:'flex-end',gap:spacing.xs},
  arrow:{color:colors.textSoft,lineHeight:20},
  pressed:{backgroundColor:colors.surfaceMuted},
  modal:{padding:spacing.md,gap:spacing.md,paddingBottom:spacing.xxl,backgroundColor:colors.background},
  editorPanel:{backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,overflow:'hidden'},
  editorSection:{padding:spacing.md,gap:spacing.md,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border},
  lastEditorSection:{borderBottomWidth:0},
  statusBlock:{gap:spacing.sm},
  chips:{flexWrap:'wrap',gap:spacing.xs},
  permissionGroup:{gap:spacing.sm,paddingTop:spacing.xs},
  permissions:{flexWrap:'wrap',gap:spacing.xs},
});
