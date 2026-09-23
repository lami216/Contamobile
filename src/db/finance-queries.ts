import type { SQLiteDatabase } from 'expo-sqlite';

export type FinancialMovement={id:string;paymentMethod:string;direction:'in'|'out';amount:number;documentId:string;documentNumber:string;partyName:string|null;type:string;note:string|null;balanceBefore:number|null;balanceAfter:number|null;occurredAt:string;revision:number;openingBalanceBefore:number|null;openingBalanceAfter:number|null;reason:string|null};
export type AccountTransfer={id:string;number:string;fromAccountId:string;toAccountId:string;fromName:string;toName:string;amount:number;note:string|null;occurredAt:string;revision:number};

export async function listFinancialMovements(db:SQLiteDatabase,accountId?:string,limit=100):Promise<FinancialMovement[]>{
  const clauses=["status<>'reversed'","is_reversal=0"],args:(string|number)[]=[];
  if(accountId){clauses.push('payment_method=?');args.push(accountId)}
  args.push(limit);
  const rows=await db.getAllAsync<{id:string;payment_method:string;direction:'in'|'out';amount:number;document_id:string;document_number:string;party_name:string|null;type:string;note:string|null;balance_before:number|null;balance_after:number|null;occurred_at:string;revision:number;opening_balance_before:number|null;opening_balance_after:number|null;reason:string|null}>(`SELECT id,payment_method,direction,amount,document_id,document_number,party_name,type,note,balance_before,balance_after,occurred_at,revision,opening_balance_before,opening_balance_after,reason FROM financial_movements WHERE ${clauses.join(' AND ')} ORDER BY occurred_at DESC,rowid DESC LIMIT ?`,args);
  return rows.map(r=>({id:r.id,paymentMethod:r.payment_method,direction:r.direction,amount:r.amount,documentId:r.document_id,documentNumber:r.document_number,partyName:r.party_name,type:r.type,note:r.note,balanceBefore:r.balance_before,balanceAfter:r.balance_after,occurredAt:r.occurred_at,revision:r.revision,openingBalanceBefore:r.opening_balance_before,openingBalanceAfter:r.opening_balance_after,reason:r.reason}));
}

export async function listAccountTransfers(db:SQLiteDatabase,limit=100):Promise<AccountTransfer[]>{
  const rows=await db.getAllAsync<{id:string;number:string;from_account_id:string;to_account_id:string;from_name:string;to_name:string;amount:number;note:string|null;occurred_at:string;revision:number}>(`SELECT t.id,t.number,t.from_account_id,t.to_account_id,COALESCE(f.name,t.from_account_id) from_name,COALESCE(dst.name,t.to_account_id) to_name,t.amount,t.note,t.occurred_at,t.revision FROM account_transfers t LEFT JOIN payment_accounts f ON f.id=t.from_account_id LEFT JOIN payment_accounts dst ON dst.id=t.to_account_id WHERE t.status<>'voided' ORDER BY t.occurred_at DESC,t.rowid DESC LIMIT ?`,[limit]);
  return rows.map(r=>({id:r.id,number:r.number,fromAccountId:r.from_account_id,toAccountId:r.to_account_id,fromName:r.from_name,toName:r.to_name,amount:r.amount,note:r.note,occurredAt:r.occurred_at,revision:r.revision}));
}
