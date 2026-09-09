import type { SQLiteDatabase } from 'expo-sqlite';
import type { DocumentLine, DocumentRecord } from '@/domain/types';

type DocumentRow={id:string;number:string;sequence:number|null;kind:DocumentRecord['kind'];status:DocumentRecord['status'];party_id:string|null;party_name:string|null;warehouse_id:string|null;warehouse_name:string|null;destination_warehouse_id:string|null;destination_warehouse_name:string|null;payment_method:string|null;title:string|null;total:number;due_total:number;paid_total:number;cash_amount:number;party_cash_direction:'receive'|'pay'|null;party_balance_before:number|null;party_balance_delta:number|null;party_balance_after:number|null;business_date:string|null;daily_sequence:number|null;pricing_mode:DocumentRecord['pricingMode'];occurred_at:string;updated_at:string|null;revision:number;voided_at:string|null};
type LineRow={id:string;product_id:string|null;description:string;quantity:number;unit_price:number;line_total:number;cost_at_sale:number|null;gross_profit:number|null;balance_before:number|null;balance_after:number|null};

function mapDocument(row:DocumentRow,lines:DocumentLine[]=[]):DocumentRecord{return{id:row.id,number:row.number,sequence:row.sequence,kind:row.kind,status:row.status,partyId:row.party_id,partyName:row.party_name,warehouseId:row.warehouse_id,warehouseName:row.warehouse_name,destinationWarehouseId:row.destination_warehouse_id,destinationWarehouseName:row.destination_warehouse_name,paymentMethod:row.payment_method,title:row.title,total:row.total,dueTotal:row.due_total,paidTotal:row.paid_total,cashAmount:row.cash_amount,partyCashDirection:row.party_cash_direction,partyBalanceBefore:row.party_balance_before,partyBalanceDelta:row.party_balance_delta,partyBalanceAfter:row.party_balance_after,businessDate:row.business_date,dailySequence:row.daily_sequence,pricingMode:row.pricing_mode,occurredAt:row.occurred_at,updatedAt:row.updated_at,revision:row.revision,voidedAt:row.voided_at,lines}}

export async function getDocumentById(db:SQLiteDatabase,id:string):Promise<DocumentRecord|null>{
  const r=await db.getFirstAsync<DocumentRow>('SELECT * FROM documents WHERE id=?',[id]);
  if(!r)return null;
  const rows=await db.getAllAsync<LineRow>('SELECT id,product_id,description,quantity,unit_price,line_total,cost_at_sale,gross_profit,balance_before,balance_after FROM document_lines WHERE document_id=? ORDER BY rowid',[id]);
  const lines=rows.map((line):DocumentLine=>({id:line.id,productId:line.product_id,description:line.description,quantity:line.quantity,unitPrice:line.unit_price,lineTotal:line.line_total,costAtSale:line.cost_at_sale,grossProfit:line.gross_profit,balanceBefore:line.balance_before,balanceAfter:line.balance_after}));
  return mapDocument(r,lines);
}

export async function listDocumentHeaders(db:SQLiteDatabase,opts:{kind?:DocumentRecord['kind'];partyId?:string;search?:string;from?:string;to?:string;limit?:number;status?:DocumentRecord['status']}={}):Promise<DocumentRecord[]>{
  const clauses=['1=1'];
  const values:(string|number)[]=[];
  if(opts.status){clauses.push('status=?');values.push(opts.status)}
  if(opts.kind){clauses.push('kind=?');values.push(opts.kind)}
  if(opts.partyId){clauses.push('party_id=?');values.push(opts.partyId)}
  if(opts.search){clauses.push('(number LIKE ? OR party_name LIKE ? OR title LIKE ?)');const q=`%${opts.search.trim()}%`;values.push(q,q,q)}
  if(opts.from){clauses.push('substr(occurred_at,1,10)>=?');values.push(opts.from)}
  if(opts.to){clauses.push('substr(occurred_at,1,10)<=?');values.push(opts.to)}
  values.push(opts.limit??150);
  const rows=await db.getAllAsync<DocumentRow>(`SELECT * FROM documents WHERE ${clauses.join(' AND ')} ORDER BY occurred_at DESC LIMIT ?`,values);
  return rows.map(row=>mapDocument(row));
}
