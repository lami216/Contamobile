import type { SQLiteDatabase } from 'expo-sqlite';
import type { DashboardSummary, DocumentLine, DocumentRecord, Party, PaymentAccount, Product, Warehouse } from '@/domain/types';

const bool = (value: number) => value === 1;
type ProductRow = { id:string;sku:string;name:string;barcode:string;piece_cost:number|null;last_purchase_cost:number|null;last_purchase_at:string|null;piece_price:number|null;wholesale_price:number|null;expiry_date:string|null;note:string|null;is_archived:number;created_at:string;updated_at:string };
type WarehouseRow = {id:string;name:string;is_sales_default:number;is_archived:number;archived_at:string|null};
type PartyRow = {id:string;name:string;phone:string;party_type:'customer'|'supplier';receivable:number;payable:number;net:number;created_at:string};
type AccountRow = {id:string;code:string;name:string;color:string;icon:string;is_active:number;is_archived:number;opening_balance:number;balance:number};
type DocumentRow = {id:string;number:string;sequence:number|null;kind:DocumentRecord['kind'];status:DocumentRecord['status'];party_id:string|null;party_name:string|null;warehouse_id:string|null;warehouse_name:string|null;destination_warehouse_id:string|null;destination_warehouse_name:string|null;payment_method:string|null;title:string|null;total:number;due_total:number;paid_total:number;cash_amount:number;party_cash_direction:'receive'|'pay'|null;party_balance_before:number|null;party_balance_delta:number|null;party_balance_after:number|null;business_date:string|null;daily_sequence:number|null;pricing_mode:DocumentRecord['pricingMode'];occurred_at:string;updated_at:string|null;revision:number;voided_at:string|null};
type LineRow = {id:string;product_id:string|null;description:string;quantity:number;unit_price:number;line_total:number;cost_at_sale:number|null;gross_profit:number|null;balance_before:number|null;balance_after:number|null};

export async function listProducts(db: SQLiteDatabase, search = '', warehouseId?: string, includeArchived = false, limit = 100, offset = 0): Promise<Product[]> {
  const q = `%${search.trim()}%`;
  const rows = await db.getAllAsync<ProductRow>('SELECT * FROM products WHERE (?=1 OR is_archived=0) AND (name LIKE ? OR sku LIKE ? OR barcode LIKE ?) ORDER BY name LIMIT ? OFFSET ?',[includeArchived?1:0,q,q,q,limit,offset]);
  const result: Product[] = [];
  for (const row of rows) {
    const stocks = warehouseId
      ? await db.getAllAsync<{warehouse_id:string;quantity:number}>('SELECT warehouse_id,quantity FROM product_stocks WHERE product_id=? AND warehouse_id=?',[row.id,warehouseId])
      : await db.getAllAsync<{warehouse_id:string;quantity:number}>('SELECT warehouse_id,quantity FROM product_stocks WHERE product_id=?',[row.id]);
    result.push({id:row.id,sku:row.sku,name:row.name,barcode:row.barcode,pieceCost:row.piece_cost,lastPurchaseCost:row.last_purchase_cost,lastPurchaseAt:row.last_purchase_at,piecePrice:row.piece_price,wholesalePrice:row.wholesale_price,expiryDate:row.expiry_date,note:row.note,isArchived:bool(row.is_archived),createdAt:row.created_at,updatedAt:row.updated_at,stocks:Object.fromEntries(stocks.map(s=>[s.warehouse_id,s.quantity]))});
  }
  return result;
}

export async function listWarehouses(db: SQLiteDatabase, includeArchived=false): Promise<Warehouse[]> {
  const rows=await db.getAllAsync<WarehouseRow>('SELECT id,name,is_sales_default,is_archived,archived_at FROM warehouses WHERE (?=1 OR is_archived=0) ORDER BY is_sales_default DESC,name',[includeArchived?1:0]);
  return rows.map(r=>({id:r.id,name:r.name,isSalesDefault:bool(r.is_sales_default),isArchived:bool(r.is_archived),archivedAt:r.archived_at}));
}

export async function listParties(db:SQLiteDatabase,type:'customer'|'supplier',search='',limit=100):Promise<Party[]> {
  const q=`%${search.trim()}%`;
  const rows=await db.getAllAsync<PartyRow>('SELECT id,name,phone,party_type,receivable,payable,net,created_at FROM parties WHERE party_type=? AND (name LIKE ? OR phone LIKE ?) ORDER BY name LIMIT ?',[type,q,q,limit]);
  return rows.map(r=>({id:r.id,name:r.name,phone:r.phone,partyType:r.party_type,receivable:r.receivable,payable:r.payable,net:r.net,createdAt:r.created_at}));
}

export async function getParty(db:SQLiteDatabase,id:string):Promise<Party|null> {
  const r=await db.getFirstAsync<PartyRow>('SELECT id,name,phone,party_type,receivable,payable,net,created_at FROM parties WHERE id=?',[id]);
  return r?{id:r.id,name:r.name,phone:r.phone,partyType:r.party_type,receivable:r.receivable,payable:r.payable,net:r.net,createdAt:r.created_at}:null;
}

export async function listPaymentAccounts(db:SQLiteDatabase,includeArchived=false):Promise<PaymentAccount[]> {
  const rows=await db.getAllAsync<AccountRow>('SELECT id,code,name,color,icon,is_active,is_archived,opening_balance,balance FROM payment_accounts WHERE (?=1 OR is_archived=0) ORDER BY code="cash" DESC,name',[includeArchived?1:0]);
  return rows.map(r=>({id:r.id,code:r.code,name:r.name,color:r.color,icon:r.icon,isActive:bool(r.is_active),isArchived:bool(r.is_archived),openingBalance:r.opening_balance,balance:r.balance}));
}

export async function listDocuments(db:SQLiteDatabase,opts:{kind?:DocumentRecord['kind'];partyId?:string;search?:string;limit?:number}={}):Promise<DocumentRecord[]> {
  const clauses=['1=1'];
  const values:(string|number)[]=[];
  if(opts.kind){clauses.push('kind=?');values.push(opts.kind)}
  if(opts.partyId){clauses.push('party_id=?');values.push(opts.partyId)}
  if(opts.search){clauses.push('(number LIKE ? OR party_name LIKE ? OR title LIKE ?)');const q=`%${opts.search}%`;values.push(q,q,q)}
  values.push(opts.limit??100);
  const rows=await db.getAllAsync<DocumentRow>(`SELECT * FROM documents WHERE ${clauses.join(' AND ')} ORDER BY occurred_at DESC LIMIT ?`,values);
  const result:DocumentRecord[]=[];
  for(const r of rows){
    const lines=await db.getAllAsync<LineRow>('SELECT id,product_id,description,quantity,unit_price,line_total,cost_at_sale,gross_profit,balance_before,balance_after FROM document_lines WHERE document_id=? ORDER BY rowid',[r.id]);
    result.push({id:r.id,number:r.number,sequence:r.sequence,kind:r.kind,status:r.status,partyId:r.party_id,partyName:r.party_name,warehouseId:r.warehouse_id,warehouseName:r.warehouse_name,destinationWarehouseId:r.destination_warehouse_id,destinationWarehouseName:r.destination_warehouse_name,paymentMethod:r.payment_method,title:r.title,total:r.total,dueTotal:r.due_total,paidTotal:r.paid_total,cashAmount:r.cash_amount,partyCashDirection:r.party_cash_direction,partyBalanceBefore:r.party_balance_before,partyBalanceDelta:r.party_balance_delta,partyBalanceAfter:r.party_balance_after,businessDate:r.business_date,dailySequence:r.daily_sequence,pricingMode:r.pricing_mode,occurredAt:r.occurred_at,updatedAt:r.updated_at,revision:r.revision,voidedAt:r.voided_at,lines:lines.map((l):DocumentLine=>({id:l.id,productId:l.product_id,description:l.description,quantity:l.quantity,unitPrice:l.unit_price,lineTotal:l.line_total,costAtSale:l.cost_at_sale,grossProfit:l.gross_profit,balanceBefore:l.balance_before,balanceAfter:l.balance_after}))});
  }
  return result;
}

export async function dashboardSummary(db:SQLiteDatabase):Promise<DashboardSummary> {
  const day=new Date().toISOString().slice(0,10);
  const sale=await db.getFirstAsync<{total:number|null}>("SELECT SUM(total) total FROM documents WHERE kind='sale' AND status='posted' AND business_date=?",[day]);
  const profit=await db.getFirstAsync<{total:number|null}>("SELECT SUM(l.gross_profit) total FROM document_lines l JOIN documents d ON d.id=l.document_id WHERE d.kind='sale' AND d.status='posted' AND d.business_date=?",[day]);
  const expense=await db.getFirstAsync<{total:number|null}>("SELECT SUM(total) total FROM documents WHERE kind='expense' AND status='posted' AND substr(occurred_at,1,10)=?",[day]);
  const debt=await db.getFirstAsync<{receivable:number|null;payable:number|null}>('SELECT SUM(receivable) receivable,SUM(payable) payable FROM parties');
  const inventory=await db.getFirstAsync<{value:number|null}>('SELECT SUM(s.quantity*COALESCE(p.last_purchase_cost,p.piece_cost,0)) value FROM product_stocks s JOIN products p ON p.id=s.product_id WHERE p.is_archived=0');
  const low=await db.getFirstAsync<{count:number}>('SELECT COUNT(*) count FROM (SELECT product_id,SUM(quantity) q FROM product_stocks GROUP BY product_id HAVING q<=5)');
  return{todaySales:sale?.total??0,todayProfit:profit?.total??0,todayExpenses:expense?.total??0,receivable:debt?.receivable??0,payable:debt?.payable??0,inventoryValue:inventory?.value??0,lowStockCount:low?.count??0};
}
