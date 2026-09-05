import type { SQLiteDatabase } from 'expo-sqlite';

const SCHEMA_VERSION = 1;
const now = () => new Date().toISOString();

export async function migrateDatabase(db: SQLiteDatabase) {
  await db.execAsync('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const version = Number(row?.user_version ?? 0);
  if (version > SCHEMA_VERSION) throw new Error(`Database version ${version} is newer than this app supports.`);
  if (version < 1) {
    await db.withExclusiveTransactionAsync(async (tx) => {
      await tx.execAsync(`
        CREATE TABLE IF NOT EXISTS warehouses(id TEXT PRIMARY KEY,name TEXT NOT NULL,is_sales_default INTEGER NOT NULL DEFAULT 0,is_archived INTEGER NOT NULL DEFAULT 0,archived_at TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS products(id TEXT PRIMARY KEY,sku TEXT NOT NULL UNIQUE,name TEXT NOT NULL,barcode TEXT NOT NULL DEFAULT '',piece_cost INTEGER,last_purchase_cost INTEGER,last_purchase_at TEXT,piece_price INTEGER,wholesale_price INTEGER,expiry_date TEXT,note TEXT,is_archived INTEGER NOT NULL DEFAULT 0,archived_at TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
        CREATE UNIQUE INDEX IF NOT EXISTS products_barcode_nonempty ON products(barcode) WHERE barcode<>'';
        CREATE TABLE IF NOT EXISTS product_stocks(product_id TEXT NOT NULL,warehouse_id TEXT NOT NULL,quantity REAL NOT NULL DEFAULT 0,PRIMARY KEY(product_id,warehouse_id));
        CREATE TABLE IF NOT EXISTS parties(id TEXT PRIMARY KEY,name TEXT NOT NULL,phone TEXT NOT NULL DEFAULT '',party_type TEXT NOT NULL CHECK(party_type IN ('customer','supplier')),receivable INTEGER NOT NULL DEFAULT 0,payable INTEGER NOT NULL DEFAULT 0,net INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS parties_role_name ON parties(party_type,name);
        CREATE TABLE IF NOT EXISTS payment_accounts(id TEXT PRIMARY KEY,code TEXT NOT NULL UNIQUE,name TEXT NOT NULL,color TEXT NOT NULL DEFAULT '#1677c8',icon TEXT NOT NULL DEFAULT 'wallet',is_active INTEGER NOT NULL DEFAULT 1,is_archived INTEGER NOT NULL DEFAULT 0,opening_balance INTEGER NOT NULL DEFAULT 0,balance INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY,number TEXT NOT NULL UNIQUE,sequence INTEGER,kind TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'posted',party_id TEXT,party_name TEXT,warehouse_id TEXT,warehouse_name TEXT,destination_warehouse_id TEXT,destination_warehouse_name TEXT,parent_document_id TEXT,payment_method TEXT,title TEXT,total INTEGER NOT NULL DEFAULT 0,due_total INTEGER NOT NULL DEFAULT 0,paid_total INTEGER NOT NULL DEFAULT 0,cash_amount INTEGER NOT NULL DEFAULT 0,party_cash_direction TEXT,party_balance_before INTEGER,party_balance_delta INTEGER,party_balance_after INTEGER,business_date TEXT,daily_sequence INTEGER,pricing_mode TEXT,occurred_at TEXT NOT NULL,updated_at TEXT,revision INTEGER NOT NULL DEFAULT 0,voided_at TEXT);
        CREATE UNIQUE INDEX IF NOT EXISTS documents_kind_sequence ON documents(kind,sequence) WHERE sequence IS NOT NULL AND kind IN ('sale','purchase','expense');
        CREATE UNIQUE INDEX IF NOT EXISTS documents_sale_day_sequence ON documents(business_date,daily_sequence) WHERE kind='sale' AND daily_sequence IS NOT NULL;
        CREATE INDEX IF NOT EXISTS documents_kind_date ON documents(kind,occurred_at DESC);
        CREATE INDEX IF NOT EXISTS documents_party_date ON documents(party_id,occurred_at DESC);
        CREATE TABLE IF NOT EXISTS document_lines(id TEXT PRIMARY KEY,document_id TEXT NOT NULL,product_id TEXT,description TEXT NOT NULL,quantity REAL NOT NULL,unit_price INTEGER NOT NULL,line_total INTEGER NOT NULL,cost_at_sale INTEGER,gross_profit INTEGER,balance_before REAL,balance_after REAL);
        CREATE INDEX IF NOT EXISTS document_lines_document ON document_lines(document_id);
        CREATE INDEX IF NOT EXISTS document_lines_product ON document_lines(product_id);
        CREATE TABLE IF NOT EXISTS stock_movements(id TEXT PRIMARY KEY,document_id TEXT NOT NULL,document_number TEXT NOT NULL,warehouse_id TEXT NOT NULL,warehouse_name TEXT NOT NULL,product_id TEXT NOT NULL,product_name TEXT NOT NULL,type TEXT NOT NULL,quantity_delta REAL NOT NULL,balance_before REAL NOT NULL,balance_after REAL NOT NULL,occurred_at TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS stock_movements_product_date ON stock_movements(product_id,occurred_at DESC);
        CREATE TABLE IF NOT EXISTS financial_movements(id TEXT PRIMARY KEY,payment_method TEXT NOT NULL,direction TEXT NOT NULL,amount INTEGER NOT NULL,document_id TEXT NOT NULL,document_number TEXT NOT NULL,party_id TEXT,party_name TEXT,type TEXT NOT NULL,transfer_id TEXT,note TEXT,delta INTEGER,balance_before INTEGER,balance_after INTEGER,opening_balance_before INTEGER,opening_balance_after INTEGER,reason TEXT,occurred_at TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS financial_account_date ON financial_movements(payment_method,occurred_at DESC);
        CREATE TABLE IF NOT EXISTS account_transfers(id TEXT PRIMARY KEY,number TEXT NOT NULL,from_account_id TEXT NOT NULL,to_account_id TEXT NOT NULL,amount INTEGER NOT NULL,note TEXT,occurred_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS counters(key TEXT PRIMARY KEY,value INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS app_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS audit_events(id TEXT PRIMARY KEY,action TEXT NOT NULL,entity_id TEXT,status TEXT NOT NULL,created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL,password_hash TEXT,permissions_json TEXT NOT NULL DEFAULT '[]',is_owner INTEGER NOT NULL DEFAULT 0,is_active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
      `);
      const stamp = now();
      await tx.runAsync('INSERT OR IGNORE INTO warehouses(id,name,is_sales_default,created_at,updated_at) VALUES(?,?,?,?,?)', ['warehouse-main','المخزن الرئيسي',1,stamp,stamp]);
      const accounts = [
        ['account-cash','cash','نقدي','#178454'],['account-bankily','bankily','بنكيلي','#1b66b3'],['account-masrvi','masrvi','مصرفي','#7a4bb7'],['account-sedad','sedad','السداد','#9a6b19'],['account-bim','bimbank','بيم','#8d3f64'],
      ] as const;
      for (const [id,code,name,color] of accounts) await tx.runAsync('INSERT OR IGNORE INTO payment_accounts(id,code,name,color,created_at,updated_at) VALUES(?,?,?,?,?,?)',[id,code,name,color,stamp,stamp]);
      for (const key of ['product','sale','purchase','expense']) await tx.runAsync('INSERT OR IGNORE INTO counters(key,value) VALUES(?,0)', [key]);
      await tx.runAsync('PRAGMA user_version = 1');
    });
  }
}

export async function nextCounter(tx: SQLiteDatabase, key: 'product'|'sale'|'purchase'|'expense') {
  await tx.runAsync('UPDATE counters SET value=value+1 WHERE key=?', [key]);
  const row = await tx.getFirstAsync<{ value: number }>('SELECT value FROM counters WHERE key=?', [key]);
  if (!row) throw new Error(`Missing counter ${key}`);
  return row.value;
}

export function newId(prefix: string) { return `${prefix}-${crypto.randomUUID()}`; }
