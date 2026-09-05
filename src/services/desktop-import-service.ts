import * as Crypto from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import type { SQLiteDatabase } from 'expo-sqlite';
import { CAPABILITIES, normalizeUsername, sanitizePermissions } from '@/auth/permissions';
import { ensureAuthSchema } from '@/auth/service';
import { createSafetyBackup } from './backup-service';

type Obj=Record<string,unknown>;
type Collections={parties:Obj[];warehouses:Obj[];products:Obj[];documents:Obj[];stockMovements:Obj[];financialMovements:Obj[];paymentAccounts:Obj[];recurringExpenses:Obj[];accountTransfers:Obj[];counters:Obj[];auditEvents:Obj[];appSettings:Obj[];users:Obj[]};
export type DesktopImportSummary={createdAt:string;appVersion:string;products:number;warehouses:number;parties:number;documents:number;stockMovements:number;financialMovements:number;paymentAccounts:number;users:number;recurringExpenses:number};
export type DesktopImportPlan={summary:DesktopImportSummary;backup:{format:'conta-backup';schemaVersion:1;createdAt:string;appVersion:string;collections:Collections}};
const REQUIRED=['parties','warehouses','products','documents','stockMovements','financialMovements','paymentAccounts','recurringExpenses','accountTransfers','counters','auditEvents','appSettings','users'] as const;
const MAX_BYTES=50*1024*1024,MAX_ITEMS=500_000;
const now=()=>new Date().toISOString();
const text=(value:unknown)=>typeof value==='string'?value:String(value??'');
const optionalText=(value:unknown)=>value==null||value===''?null:text(value);
const num=(value:unknown,fallback=0)=>{const n=Number(value);return Number.isFinite(n)?n:fallback};
const integer=(value:unknown,fallback=0)=>Math.trunc(num(value,fallback));
const bool=(value:unknown,defaultValue=false)=>value===true||value===1||value==='1'?true:value===false||value===0||value==='0'?false:defaultValue;
const identifier=(row:Obj,fallback?:string)=>text(row.id??row._id??fallback??'').trim();
const iso=(value:unknown,fallback=now())=>{const candidate=typeof value==='string'?value:value instanceof Date?value.toISOString():'';return candidate&&Number.isFinite(Date.parse(candidate))?new Date(candidate).toISOString():fallback};
const rawDate=(value:unknown)=>value==null?null:iso(value);
const id=(prefix:string)=>`${prefix}-${Crypto.randomUUID()}`;

function unwrapExtended(value:unknown):unknown{
  if(Array.isArray(value))return value.map(unwrapExtended);
  if(!value||typeof value!=='object')return value;
  const source=value as Obj,keys=Object.keys(source);
  if(keys.length===1&&typeof source.$date==='string')return source.$date;
  if(keys.length===1&&('$numberInt'in source||'$numberLong'in source||'$numberDouble'in source)){const n=Number(source.$numberInt??source.$numberLong??source.$numberDouble);return Number.isFinite(n)?n:0}
  const out:Obj={};for(const [key,item] of Object.entries(source))out[key]=unwrapExtended(item);return out;
}

function parseDesktopBackup(input:string):DesktopImportPlan{
  if(new TextEncoder().encode(input).byteLength>MAX_BYTES)throw new Error('ملف نسخة الكمبيوتر أكبر من 50MB');
  let raw:unknown;try{raw=unwrapExtended(JSON.parse(input))}catch{throw new Error('ملف نسخة الكمبيوتر ليس JSON صالحًا')}
  const root=raw as Obj;if(root.format!=='conta-backup'||Number(root.schemaVersion)!==1)throw new Error('هذا الملف ليس نسخة رسمية مدعومة من نسخة الكمبيوتر');
  const collections=root.collections as Partial<Collections>|undefined;if(!collections||typeof collections!=='object')throw new Error('بنية collections غير صالحة');
  for(const name of REQUIRED)if(!Array.isArray(collections[name]))throw new Error(`collection مفقود: ${name}`);
  const typed=collections as Collections,total=REQUIRED.reduce((sum,name)=>sum+typed[name].length,0);if(total>MAX_ITEMS)throw new Error('عدد السجلات في النسخة أكبر من الحد المسموح');
  validateRelationships(typed);
  const createdAt=iso(root.createdAt),appVersion=text(root.appVersion||'unknown');
  return {backup:{format:'conta-backup',schemaVersion:1,createdAt,appVersion,collections:typed},summary:{createdAt,appVersion,products:typed.products.length,warehouses:typed.warehouses.length,parties:typed.parties.length,documents:typed.documents.length,stockMovements:typed.stockMovements.length,financialMovements:typed.financialMovements.length,paymentAccounts:typed.paymentAccounts.length,users:typed.users.length,recurringExpenses:typed.recurringExpenses.length}};
}

function validateRelationships(c:Collections){
  const unique=(rows:Obj[],label:string,key:(row:Obj)=>string)=>{const set=new Set<string>();for(const row of rows){const value=key(row);if(!value||set.has(value))throw new Error(`${label} مكرر أو غير صالح`);set.add(value)}return set};
  const warehouses=unique(c.warehouses,'معرف المخزن',row=>identifier(row)),products=unique(c.products,'معرف المنتج',row=>identifier(row)),accounts=unique(c.paymentAccounts,'معرف الحساب',row=>identifier(row)),parties=unique(c.parties,'معرف الطرف',row=>identifier(row)),docs=unique(c.documents,'معرف المستند',row=>identifier(row));
  if(c.warehouses.filter(row=>bool(row.isSalesDefault)).length!==1)throw new Error('نسخة الكمبيوتر يجب أن تحتوي مخزن بيع افتراضيًا واحدًا');
  const accountCodes=new Set(c.paymentAccounts.map(row=>text(row.code)));
  const docNumbers=new Set<string>(),saleDaily=new Set<string>();
  for(const row of c.products){const stocks=(row.stocks??{}) as Obj;for(const warehouseId of Object.keys(stocks))if(!warehouses.has(warehouseId))throw new Error('مخزون يشير إلى مخزن غير موجود')}
  for(const row of c.documents){const number=text(row.number);if(!number||docNumbers.has(number))throw new Error('رقم مستند مكرر أو غير صالح');docNumbers.add(number);const warehouseId=optionalText(row.warehouseId),destinationId=optionalText(row.destinationWarehouseId),partyId=optionalText(row.partyId),payment=optionalText(row.paymentMethod);if(warehouseId&&!warehouses.has(warehouseId))throw new Error('مستند يشير إلى مخزن غير موجود');if(destinationId&&!warehouses.has(destinationId))throw new Error('تحويل يشير إلى مخزن غير موجود');if(partyId&&!parties.has(partyId))throw new Error('مستند يشير إلى طرف غير موجود');if(payment&&payment!=='note'&&!accounts.has(payment)&&!accountCodes.has(payment))throw new Error('مستند يشير إلى وسيلة دفع غير موجودة');if(row.kind==='sale'&&row.businessDate&&row.dailySequence!=null){const key=`${row.businessDate}:${row.dailySequence}`;if(saleDaily.has(key))throw new Error('تسلسل البيع اليومي مكرر');saleDaily.add(key)}for(const line of Array.isArray(row.lines)?row.lines as Obj[]:[])if(line.productId&&!products.has(text(line.productId)))throw new Error('مستند يشير إلى منتج غير موجود')}
  for(const movement of c.stockMovements){if(movement.productId&&!products.has(text(movement.productId)))throw new Error('حركة مخزون تشير إلى منتج غير موجود');if(movement.warehouseId&&!warehouses.has(text(movement.warehouseId)))throw new Error('حركة مخزون تشير إلى مخزن غير موجود');if(movement.documentId&&!docs.has(text(movement.documentId)))throw new Error('حركة مخزون تشير إلى مستند غير موجود')}
  const usernames=new Set<string>();for(const user of c.users){const username=normalizeUsername(text(user.username??user.name));if(!username||usernames.has(username))throw new Error('اسم مستخدم مكرر أو غير صالح في نسخة الكمبيوتر');usernames.add(username)}
}

export async function chooseDesktopBackup():Promise<DesktopImportPlan|null>{
  const picked=await DocumentPicker.getDocumentAsync({type:'application/json',copyToCacheDirectory:true,multiple:false});if(picked.canceled)return null;const asset=picked.assets[0];if(!asset)throw new Error('لم يتم اختيار ملف');if(asset.size&&asset.size>MAX_BYTES)throw new Error('ملف نسخة الكمبيوتر أكبر من 50MB');const input=await FileSystem.readAsStringAsync(asset.uri,{encoding:FileSystem.EncodingType.UTF8});return parseDesktopBackup(input);
}

const deleteOrder=['document_lines','stock_movements','financial_movements','account_transfers','documents','product_stocks','products','parties','payment_accounts','warehouses','counters','app_settings','audit_events','users'] as const;
export async function importDesktopBackup(db:SQLiteDatabase,plan:DesktopImportPlan){
  await createSafetyBackup(db,'alkarna-before-desktop-import');
  const c=plan.backup.collections,accountByCode=new Map(c.paymentAccounts.map(row=>[text(row.code),identifier(row)]));
  await db.withExclusiveTransactionAsync(async tx=>{
    for(const table of deleteOrder)await tx.runAsync(`DELETE FROM ${table}`);
    for(const row of c.warehouses){const warehouseId=identifier(row);await tx.runAsync('INSERT INTO warehouses(id,name,is_sales_default,is_archived,archived_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',[warehouseId,text(row.name)||warehouseId,bool(row.isSalesDefault)?1:0,bool(row.isArchived)?1:0,rawDate(row.archivedAt),iso(row.createdAt),iso(row.updatedAt??row.createdAt)])}
    for(const row of c.products){const productId=identifier(row),created=iso(row.createdAt),updated=iso(row.updatedAt??row.createdAt);await tx.runAsync('INSERT INTO products(id,sku,name,barcode,piece_cost,last_purchase_cost,last_purchase_at,piece_price,wholesale_price,expiry_date,note,is_archived,archived_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[productId,text(row.sku),text(row.name)||productId,text(row.barcode),row.pieceCost==null?null:integer(row.pieceCost),row.lastPurchaseCost==null?null:integer(row.lastPurchaseCost),rawDate(row.lastPurchaseAt),row.piecePrice==null?null:integer(row.piecePrice),row.wholesalePrice==null?null:integer(row.wholesalePrice),optionalText(row.expiryDate),optionalText(row.note),bool(row.isArchived)?1:0,rawDate(row.archivedAt),created,updated]);const stocks=(row.stocks??{}) as Obj;for(const [warehouseId,quantity] of Object.entries(stocks))await tx.runAsync('INSERT INTO product_stocks(product_id,warehouse_id,quantity) VALUES(?,?,?)',[productId,warehouseId,num(quantity)])}
    for(const row of c.parties){const partyId=identifier(row),receivable=integer(row.receivable),payable=integer(row.payable),net=row.net==null?receivable-payable:integer(row.net),created=iso(row.createdAt);await tx.runAsync('INSERT INTO parties(id,name,phone,party_type,receivable,payable,net,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',[partyId,text(row.name)||partyId,text(row.phone),row.partyType==='customer'?'customer':'supplier',receivable,payable,net,created,iso(row.updatedAt??row.lastMovementAt??row.createdAt)])}
    for(const row of c.paymentAccounts){const accountId=identifier(row),created=iso(row.createdAt);await tx.runAsync('INSERT INTO payment_accounts(id,code,name,color,icon,is_active,is_archived,opening_balance,balance,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',[accountId,text(row.code)||accountId,text(row.name)||accountId,text(row.color)||'#1677c8',text(row.icon)||'wallet',bool(row.isActive,true)?1:0,bool(row.isArchived)?1:0,integer(row.openingBalance),integer(row.balance),created,iso(row.updatedAt??row.createdAt)])}
    for(const row of c.documents){const documentId=identifier(row),paymentRaw=optionalText(row.paymentMethod),payment=paymentRaw&&paymentRaw!=='note'?(accountByCode.get(paymentRaw)??paymentRaw):paymentRaw,occurred=iso(row.occurredAt),updated=row.updatedAt?iso(row.updatedAt):null;await tx.runAsync('INSERT INTO documents(id,number,sequence,kind,status,party_id,party_name,warehouse_id,warehouse_name,destination_warehouse_id,destination_warehouse_name,parent_document_id,payment_method,title,total,due_total,paid_total,cash_amount,party_cash_direction,party_balance_before,party_balance_delta,party_balance_after,business_date,daily_sequence,pricing_mode,occurred_at,updated_at,revision,voided_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[documentId,text(row.number),row.sequence==null?null:integer(row.sequence),text(row.kind),text(row.status)||'posted',optionalText(row.partyId),optionalText(row.partyName),optionalText(row.warehouseId),optionalText(row.warehouseName),optionalText(row.destinationWarehouseId),optionalText(row.destinationWarehouseName),optionalText(row.parentDocumentId),payment,optionalText(row.title),integer(row.total),integer(row.dueTotal),integer(row.paidTotal),integer(row.cashAmount??row.paidTotal),optionalText(row.partyCashDirection),row.partyBalanceBefore==null?null:integer(row.partyBalanceBefore),row.partyBalanceDelta==null?null:integer(row.partyBalanceDelta),row.partyBalanceAfter==null?null:integer(row.partyBalanceAfter),optionalText(row.businessDate),row.dailySequence==null?null:integer(row.dailySequence),optionalText(row.pricingMode),occurred,updated,integer(row.revision),row.voidedAt?iso(row.voidedAt):null]);const lines=Array.isArray(row.lines)?row.lines as Obj[]:[];for(let index=0;index<lines.length;index++){const line=lines[index]!,lineId=identifier(line,`line-${documentId}-${index+1}`);await tx.runAsync('INSERT INTO document_lines(id,document_id,product_id,description,quantity,unit_price,line_total,cost_at_sale,gross_profit,balance_before,balance_after) VALUES(?,?,?,?,?,?,?,?,?,?,?)',[lineId,documentId,optionalText(line.productId),text(line.description),num(line.quantity),integer(line.unitPrice),integer(line.lineTotal),line.costAtSale==null?null:integer(line.costAtSale),line.grossProfit==null?null:integer(line.grossProfit),line.balanceBefore==null?null:num(line.balanceBefore),line.balanceAfter==null?null:num(line.balanceAfter)])}}
    for(const row of c.stockMovements){await tx.runAsync('INSERT INTO stock_movements(id,document_id,document_number,warehouse_id,warehouse_name,product_id,product_name,type,quantity_delta,balance_before,balance_after,occurred_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',[identifier(row,id('mov')),text(row.documentId),text(row.documentNumber),text(row.warehouseId),text(row.warehouseName),text(row.productId),text(row.productName),text(row.type),num(row.quantityDelta),num(row.balanceBefore),num(row.balanceAfter),iso(row.occurredAt)])}
    for(const row of c.financialMovements){const raw=text(row.paymentMethod),accountId=accountByCode.get(raw)??raw;await tx.runAsync('INSERT INTO financial_movements(id,payment_method,direction,amount,document_id,document_number,party_id,party_name,type,transfer_id,note,delta,balance_before,balance_after,opening_balance_before,opening_balance_after,reason,occurred_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[identifier(row,id('fin')),accountId,row.direction==='out'?'out':'in',integer(row.amount),text(row.documentId),text(row.documentNumber),optionalText(row.partyId),optionalText(row.partyName),text(row.type),optionalText(row.transferId),optionalText(row.note),row.delta==null?null:integer(row.delta),row.balanceBefore==null?null:integer(row.balanceBefore),row.balanceAfter==null?null:integer(row.balanceAfter),row.openingBalanceBefore==null?null:integer(row.openingBalanceBefore),row.openingBalanceAfter==null?null:integer(row.openingBalanceAfter),optionalText(row.reason),iso(row.occurredAt)])}
    for(const row of c.accountTransfers){await tx.runAsync('INSERT INTO account_transfers(id,number,from_account_id,to_account_id,amount,note,occurred_at) VALUES(?,?,?,?,?,?,?)',[identifier(row,id('transfer')),text(row.number),accountByCode.get(text(row.fromAccountId))??text(row.fromAccountId),accountByCode.get(text(row.toAccountId))??text(row.toAccountId),integer(row.amount),optionalText(row.note),iso(row.occurredAt)])}
    const maxProduct=c.products.reduce((max,row)=>/^\d{1,9}$/.test(text(row.sku))?Math.max(max,Number(row.sku)):max,0);for(const [key,value] of [['product',maxProduct],['sale',maxSequence(c.documents,'sale')],['purchase',maxSequence(c.documents,'purchase')],['expense',maxSequence(c.documents,'expense')]] as const)await tx.runAsync('INSERT INTO counters(key,value) VALUES(?,?)',[key,value]);
    for(const row of c.appSettings){const key=identifier(row);if(!key)continue;await tx.runAsync('INSERT INTO app_settings(key,value,updated_at) VALUES(?,?,?)',[key,JSON.stringify(row),iso(row.updatedAt??plan.backup.createdAt)])}
    if(c.recurringExpenses.length)await tx.runAsync('INSERT INTO app_settings(key,value,updated_at) VALUES(?,?,?)',['desktop-recurring-expenses',JSON.stringify(c.recurringExpenses),plan.backup.createdAt]);
    for(const row of c.auditEvents){await tx.runAsync('INSERT OR IGNORE INTO audit_events(id,action,entity_id,status,created_at) VALUES(?,?,?,?,?)',[identifier(row,id('audit')),text(row.action)||'desktop.import',optionalText(row.entityId),text(row.status)||'committed',iso(row.createdAt)])}
    for(const row of c.users){const userId=identifier(row,id('user')),username=text(row.username??row.name).trim(),normalized=normalizeUsername(username),owner=bool(row.owner),permissions=owner?[...CAPABILITIES]:sanitizePermissions(Array.isArray(row.permissions)?row.permissions:[]);await tx.runAsync('INSERT INTO users(id,username,username_normalized,name,password_hash,permissions_json,is_owner,is_active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)',[userId,username,normalized,text(row.name)||username,optionalText(row.passwordHash),JSON.stringify(permissions),owner?1:0,bool(row.isActive,true)?1:0,iso(row.createdAt),iso(row.updatedAt??row.createdAt)])}
    await tx.runAsync('INSERT INTO audit_events(id,action,entity_id,status,created_at) VALUES(?,?,?,?,?)',[id('audit'),'desktop.backup.import',null,'committed',now()]);
  });
  await ensureAuthSchema(db);
  return plan.summary;
}

function maxSequence(rows:Obj[],kind:string){return rows.filter(row=>row.kind===kind).reduce((max,row)=>row.sequence==null?max:Math.max(max,integer(row.sequence)),0)}
