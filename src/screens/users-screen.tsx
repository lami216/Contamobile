import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { CAPABILITIES, permissionPresets, type Capability } from '@/auth/permissions';
import { useAuth } from '@/auth/provider';
import { createUser, deleteUser, listUsers, updateUser } from '@/auth/service';
import type { AppUser } from '@/auth/types';
import { AppText, Badge, Button, Chip, EmptyState, Field, Screen, SectionTitle } from '@/components/ui';
import { StickyActionBar } from '@/components/mobile-interactions';
import { useI18n } from '@/i18n/provider';
import { colors, radius, spacing } from '@/theme';

type Preset='manager'|'accountant'|'sales'|'custom';
const capabilityLabels:Record<Capability,{ar:string;fr:string}>={
  'pos.view':{ar:'عرض المبيعات',fr:'Voir les ventes'},'pos.create':{ar:'إنشاء بيع',fr:'Créer une vente'},'pos.edit':{ar:'تعديل المبيعات',fr:'Modifier les ventes'},'pos.delete':{ar:'إلغاء المبيعات',fr:'Annuler les ventes'},
  'purchases.view':{ar:'عرض المشتريات',fr:'Voir les achats'},'purchases.create':{ar:'إنشاء شراء',fr:'Créer un achat'},'purchases.edit':{ar:'تعديل المشتريات',fr:'Modifier les achats'},'purchases.delete':{ar:'إلغاء المشتريات',fr:'Annuler les achats'},'records.view':{ar:'عرض سجل المعاملات',fr:'Voir l’historique'},
  'products.view':{ar:'عرض المنتجات',fr:'Voir les produits'},'products.create':{ar:'إضافة المنتجات',fr:'Ajouter des produits'},'products.edit':{ar:'تعديل المنتجات',fr:'Modifier les produits'},'products.delete':{ar:'أرشفة المنتجات',fr:'Archiver les produits'},
  'customers.view':{ar:'عرض العملاء',fr:'Voir les clients'},'customers.create':{ar:'إضافة العملاء',fr:'Ajouter des clients'},'customers.edit':{ar:'تعديل العملاء والتسويات',fr:'Modifier clients et règlements'},'customers.collect':{ar:'تحصيل من العملاء',fr:'Encaisser les clients'},
  'suppliers.view':{ar:'عرض الموردين',fr:'Voir les fournisseurs'},'suppliers.create':{ar:'إضافة الموردين',fr:'Ajouter des fournisseurs'},'suppliers.edit':{ar:'تعديل الموردين والتسويات',fr:'Modifier fournisseurs et règlements'},'suppliers.pay':{ar:'الدفع للموردين',fr:'Payer les fournisseurs'},
  'warehouses.view':{ar:'عرض المخازن',fr:'Voir les dépôts'},'warehouses.create':{ar:'إضافة مخزن',fr:'Ajouter un dépôt'},'warehouses.edit':{ar:'تعديل المخازن',fr:'Modifier les dépôts'},'warehouses.delete':{ar:'أرشفة المخازن',fr:'Archiver les dépôts'},'warehouses.inventory.view':{ar:'عرض جرد المخزون',fr:'Voir l’inventaire'},'warehouses.transfer':{ar:'تحويل بين المخازن',fr:'Transférer entre dépôts'},'warehouses.adjust':{ar:'تصحيح المخزون',fr:'Ajuster le stock'},
  'banks.view':{ar:'عرض وسائل الدفع',fr:'Voir les moyens de paiement'},'banks.create':{ar:'إضافة وسيلة دفع',fr:'Ajouter un moyen de paiement'},'banks.edit':{ar:'تعديل وسائل الدفع',fr:'Modifier les moyens de paiement'},'banks.delete':{ar:'أرشفة وسائل الدفع',fr:'Archiver les moyens de paiement'},'banks.movements.view':{ar:'عرض حركات الحسابات',fr:'Voir les mouvements de comptes'},'banks.transfer':{ar:'تحويل بين الحسابات',fr:'Transférer entre comptes'},'banks.deposit_withdraw':{ar:'السحب والإيداع',fr:'Retraits et dépôts'},'banks.balance_correct':{ar:'تصحيح رصيد الحساب',fr:'Corriger le solde'},
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
  const db=useSQLiteContext(),auth=useAuth(),{locale,t,isRTL,errorMessage}=useI18n(),ar=locale==='ar';
  const [items,setItems]=useState<AppUser[]>([]),[editing,setEditing]=useState<AppUser|null|undefined>(undefined),[busy,setBusy]=useState(false);
  const load=useCallback(async()=>setItems(await listUsers(db)),[db]);
  useFocusEffect(useCallback(()=>{void load()},[load]));
  if(!auth.has('settings.users.manage'))return <Screen><EmptyState title={ar?'ليس لديك صلاحية إدارة المستخدمين.':'Vous n’avez pas accès aux utilisateurs.'}/><Button title={t('cancel')} variant="ghost" onPress={()=>router.back()}/></Screen>;
  const save=async(input:{username:string;name:string;password:string;permissions:Capability[];isActive:boolean})=>{if(busy)return;setBusy(true);try{const first=!auth.hasUsers;if(editing)await updateUser(db,editing.id,input);else await createUser(db,input);if(first){const ok=await auth.login(input.username,input.password);if(!ok)throw new Error(ar?'تعذر بدء جلسة المستخدم الأول':'Impossible d’ouvrir la session du premier utilisateur.')}else await auth.refresh();setEditing(undefined);await load()}catch(error){Alert.alert(t('error'),errorMessage(error))}finally{setBusy(false)}};
  const remove=(user:AppUser)=>Alert.alert(ar?'حذف المستخدم':'Supprimer l’utilisateur',user.name,[{text:t('cancel'),style:'cancel'},{text:t('confirm'),style:'destructive',onPress:()=>void (async()=>{if(busy)return;setBusy(true);try{await deleteUser(db,user.id);await auth.refresh();setEditing(undefined);await load()}catch(error){Alert.alert(t('error'),errorMessage(error))}finally{setBusy(false)}})()}]);
  return <Screen padded={false}><FlatList data={items} keyExtractor={user=>user.id} contentContainerStyle={styles.list} ListHeaderComponent={<View style={styles.header}><SectionTitle title={ar?'المستخدمون والصلاحيات':'Utilisateurs et droits'} subtitle={ar?'استخدم المجموعات الجاهزة أولًا، ثم خصّص الصلاحيات فقط عند الحاجة.':'Commencez par un profil, puis personnalisez uniquement si nécessaire.'} action={<Button compact title={t('add')} onPress={()=>setEditing(null)}/>}><View/></SectionTitle><View style={[styles.summary,{flexDirection:isRTL?'row-reverse':'row'}]}><MiniStat label={ar?'المستخدمون':'Utilisateurs'} value={String(items.length)}/><MiniStat label={ar?'النشطون':'Actifs'} value={String(items.filter(user=>user.isActive).length)}/><MiniStat label={ar?'المالكون':'Propriétaires'} value={String(items.filter(user=>user.owner).length)} last/></View></View>} ListEmptyComponent={<EmptyState title={ar?'لا يوجد مستخدمون بعد.':'Aucun utilisateur.'} description={ar?'أنشئ المستخدم الأول وحدد له الصلاحيات المناسبة.':'Créez le premier utilisateur et choisissez ses droits.'}/>} renderItem={({item})=><Pressable accessibilityRole="button" onPress={()=>setEditing(item)} style={({pressed})=>[styles.row,{flexDirection:isRTL?'row-reverse':'row'},pressed&&styles.pressed]}><View style={styles.body}><View style={[styles.nameRow,{flexDirection:isRTL?'row-reverse':'row'}]}><AppText variant="subheading">{item.name}</AppText>{item.owner?<Badge label={ar?'المالك':'Propriétaire'} tone="primary"/>:!item.isActive?<Badge label={ar?'معطل':'Désactivé'} tone="warning"/>:<Badge label={ar?'نشط':'Actif'} tone="positive"/>}</View><AppText variant="caption" muted>@{item.username}</AppText></View><View style={styles.trailing}><AppText variant="caption" muted>{item.owner?(ar?'كامل الصلاحيات':'Tous les droits'):(ar?`${item.permissions.length} صلاحية`:`${item.permissions.length} droits`)}</AppText><AppText variant="heading" style={styles.arrow}>{isRTL?'‹':'›'}</AppText></View></Pressable>}/>{editing!==undefined?<UserEditor user={editing} locale={locale} busy={busy} onClose={()=>{if(!busy)setEditing(undefined)}} onSave={save} onDelete={editing&&!editing.owner?()=>remove(editing):undefined}/>:null}</Screen>;
}

function MiniStat({label,value,last=false}:{label:string;value:string;last?:boolean}){return <View style={[styles.miniStat,last&&styles.lastMini]}><View style={styles.miniRule}/><AppText variant="caption" muted>{label}</AppText><AppText variant="heading">{value}</AppText></View>}

function UserEditor({user,locale,busy,onClose,onSave,onDelete}:{user:AppUser|null;locale:'ar'|'fr';busy:boolean;onClose:()=>void;onSave:(input:{username:string;name:string;password:string;permissions:Capability[];isActive:boolean})=>Promise<void>;onDelete?:()=>void}){
  const {t,isRTL}=useI18n(),ar=locale==='ar';
  const initialPreset:Preset=useMemo(()=>{if(!user)return'manager';for(const key of ['manager','accountant','sales'] as const){const set=new Set(permissionPresets[key]);if(user.permissions.length===set.size&&user.permissions.every(permission=>set.has(permission)))return key}return'custom'},[user]);
  const [username,setUsername]=useState(user?.username??''),[name,setName]=useState(user?.name??''),[password,setPassword]=useState(''),[active,setActive]=useState(user?.isActive??true),[preset,setPreset]=useState<Preset>(initialPreset),[permissions,setPermissions]=useState<Capability[]>(user?.permissions??permissionPresets.manager);
  const choosePreset=(value:Exclude<Preset,'custom'>)=>{setPreset(value);setPermissions([...permissionPresets[value]])};
  const toggle=(cap:Capability)=>{setPreset('custom');setPermissions(current=>current.includes(cap)?current.filter(item=>item!==cap):[...current,cap])};
  const presetLabel=(value:Exclude<Preset,'custom'>)=>value==='manager'?(ar?'مدير':'Gestionnaire'):value==='accountant'?(ar?'محاسب':'Comptable'):(ar?'مبيعات':'Ventes');
  const valid=username.trim()&&name.trim()&&(user||password.length>0);
  return <Modal animationType="slide" onRequestClose={onClose}><Screen padded={false}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modal}>
    <SectionTitle title={user?.name??(ar?'مستخدم جديد':'Nouvel utilisateur')} subtitle={user?.owner?(ar?'حساب المالك يحتفظ بالصلاحيات الكاملة.':'Le propriétaire conserve tous les droits.'):(ar?'اختر أقل صلاحيات يحتاجها المستخدم لعمله اليومي.':'Accordez uniquement les droits nécessaires au travail quotidien.')}/>
    <View style={styles.editorPanel}><View style={styles.editorSection}><SectionTitle title={ar?'بيانات الدخول':'Accès'}/><Field label={ar?'اسم المستخدم':'Identifiant'} autoCapitalize="none" autoCorrect={false} value={username} onChangeText={setUsername}/><Field label={t('name')} value={name} onChangeText={setName}/><Field label={user?(ar?'كلمة مرور جديدة (اختياري)':'Nouveau mot de passe (optionnel)'):(ar?'كلمة المرور':'Mot de passe')} secureTextEntry value={password} onChangeText={setPassword}/>{user&&!user.owner?<View style={styles.statusBlock}><AppText variant="caption" muted>{ar?'حالة الحساب':'État du compte'}</AppText><View style={[styles.chips,{flexDirection:isRTL?'row-reverse':'row'}]}><Chip label={ar?'نشط':'Actif'} active={active} onPress={()=>setActive(true)}/><Chip label={ar?'معطل':'Désactivé'} active={!active} onPress={()=>setActive(false)}/></View></View>:null}</View>
      {!user?.owner?<View style={[styles.editorSection,styles.lastEditorSection]}><SectionTitle title={ar?'الصلاحيات':'Droits'} subtitle={ar?'المجموعة تختصر الإعداد؛ التخصيص متاح أسفلها.':'Le profil accélère le réglage ; personnalisez ensuite si besoin.'}/><View style={[styles.chips,{flexDirection:isRTL?'row-reverse':'row'}]}>{(['manager','accountant','sales'] as const).map(key=><Chip key={key} label={presetLabel(key)} active={preset===key} onPress={()=>choosePreset(key)}/>)}</View>{preset==='custom'?<Badge label={ar?'تخصيص يدوي':'Personnalisé'} tone="warning"/>:null}{permissionGroups.map(group=>{const caps=CAPABILITIES.filter(group.matches);return <View key={group.id} style={styles.permissionGroup}><AppText variant="subheading">{ar?group.ar:group.fr}</AppText><View style={[styles.permissions,{flexDirection:isRTL?'row-reverse':'row'}]}>{caps.map(cap=><Chip key={cap} label={capabilityLabels[cap][locale]} active={permissions.includes(cap)} onPress={()=>toggle(cap)}/>)}</View></View>})}</View>:null}
    </View>
    {onDelete?<Button title={ar?'حذف المستخدم':'Supprimer l’utilisateur'} variant="danger" disabled={busy} onPress={onDelete}/>:null}<Button title={t('cancel')} variant="ghost" disabled={busy} onPress={onClose}/>
  </ScrollView><StickyActionBar label={t('save')} summary={user?.owner?(ar?'حساب المالك':'Compte propriétaire'):(ar?`${permissions.length} صلاحية`:`${permissions.length} droits`)} loading={busy} disabled={!valid} onPress={()=>void onSave({username:username.trim(),name:name.trim(),password,permissions,isActive:active})}/></Screen></Modal>;
}

const styles=StyleSheet.create({
  list:{padding:spacing.md,paddingBottom:spacing.xxl,backgroundColor:colors.background},
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
