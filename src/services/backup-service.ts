import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';

type Scalar=string|number|null;
type BackupRow=Record<string,Scalar>;
type BackupFile={magic:'alkarna-mobile-backup';version:1;createdAt:string;tables:Record<string,BackupRow[]>};
const TABLES:Record<string,readonly string[]>={
  warehouses:['id','name','is_sales_default','is_archived','archived_at','created_at','updated_at'],
  products:['id','sku','name','barcode','piece_cost','last_purchase_cost','last_purchase_at','piece_price','wholesale_price','expiry_date','note','is_archived','archived_at','created_at','updated_at'],
  product_stocks:['product_id','warehouse_id','quantity'],parties:['id','name','phone','party_type','receivable','payable','net','created_at','updated_at'],
  payment_accounts:['id','code','name','color','icon','is_active','is_archived','opening_balance','balance','created_at','updated_at'],
  documents:['id','number','sequence','kind','status','party_id','party_name','warehouse_id','warehouse_name','destination_warehouse_id','destination_warehouse_name','parent_document_id','payment_method','title','total','due_total','paid_total','cash_amount','party_cash_direction','party_balance_before','party_balance_delta','party_balance_after','business_date','daily_sequence','pricing_mode','occurred_at','updated_at','revision','voided_at'],
  document_lines:['id','document_id','product_id','description','quantity','unit_price','line_total','cost_at_sale','gross_profit','balance_before','balance_after'],
  stock_movements:['id','document_id','document_number','warehouse_id','warehouse_name','product_id','product_name','type','quantity_delta','balance_before','balance_after','occurred_at'],
  financial_movements:['id','payment_method','direction','amount','document_id','document_number','party_id','party_name','type','transfer_id','note','delta','balance_before','balance_after','opening_balance_before','opening_balance_after','reason','occurred_at'],
  account_transfers:['id','number','from_account_id','to_account_id','amount','note','occurred_at'],counters:['key','value'],app_settings:['key','value','updated_at'],audit_events:['id','action','entity_id','status','created_at'],users:['id','name','password_hash','permissions_json','is_owner','is_active','created_at','updated_at'],
};
const restoreOrder=['document_lines','stock_movements','financial_movements','account_transfers','documents','product_stocks','products','parties','payment_accounts','warehouses','counters','app_settings','audit_events','users'];

async function buildBackup(db:SQLiteDatabase):Promise<BackupFile>{const tables:Record<string,BackupRow[]>={};for(const table of Object.keys(TABLES))tables[table]=await db.getAllAsync<BackupRow>(`SELECT * FROM ${table}`);return{magic:'alkarna-mobile-backup',version:1,createdAt:new Date().toISOString(),tables}}
async function writeBackupFile(data:BackupFile,prefix='alkarna-backup'){if(!FileSystem.documentDirectory)throw new Error('Document directory unavailable');const name=`${prefix}-${data.createdAt.replace(/[:.]/g,'-')}.json`;const uri=`${FileSystem.documentDirectory}${name}`;await FileSystem.writeAsStringAsync(uri,JSON.stringify(data),{encoding:FileSystem.EncodingType.UTF8});return uri}
export async function exportAndShareBackup(db:SQLiteDatabase){const uri=await writeBackupFile(await buildBackup(db));if(await Sharing.isAvailableAsync())await Sharing.shareAsync(uri,{mimeType:'application/json',dialogTitle:'Al Karna backup'});return uri}
export async function chooseAndRestoreBackup(db:SQLiteDatabase){const picked=await DocumentPicker.getDocumentAsync({type:'application/json',copyToCacheDirectory:true,multiple:false});if(picked.canceled)return false;const asset=picked.assets[0];if(!asset)throw new Error('No backup selected');const text=await FileSystem.readAsStringAsync(asset.uri,{encoding:FileSystem.EncodingType.UTF8});const parsed=JSON.parse(text) as Partial<BackupFile>;validateBackup(parsed);await writeBackupFile(await buildBackup(db),'alkarna-before-restore');await restore(db,parsed as BackupFile);return true}
function validateBackup(value:Partial<BackupFile>){if(value.magic!=='alkarna-mobile-backup'||value.version!==1||!value.tables)throw new Error('ملف النسخة الاحتياطية غير صالح أو غير مدعوم');for(const table of Object.keys(TABLES)){if(!Array.isArray(value.tables[table]))throw new Error(`النسخة لا تحتوي جدول ${table}`);for(const row of value.tables[table]??[]){for(const key of Object.keys(row))if(!TABLES[table]?.includes(key))throw new Error(`حقل غير متوقع في ${table}`)}}}
async function restore(db:SQLiteDatabase,backup:BackupFile){await db.withExclusiveTransactionAsync(async tx=>{for(const table of restoreOrder)await tx.runAsync(`DELETE FROM ${table}`);for(const table of Object.keys(TABLES)){const allowed=TABLES[table];if(!allowed)continue;for(const row of backup.tables[table]??[]){const columns=allowed.filter(column=>Object.prototype.hasOwnProperty.call(row,column));if(!columns.length)continue;const placeholders=columns.map(()=>'?').join(',');const values=columns.map(column=>row[column]??null);await tx.runAsync(`INSERT INTO ${table}(${columns.join(',')}) VALUES(${placeholders})`,values)}}});}
