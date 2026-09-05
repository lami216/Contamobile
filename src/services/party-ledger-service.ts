import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';
import { assertMoney } from '@/domain/accounting';
import { AccountingError } from './accounting-service';

type PartyRow={id:string;name:string;receivable:number;payable:number;net:number};
const id=(prefix:string)=>`${prefix}-${Crypto.randomUUID()}`;
const now=()=>new Date().toISOString();

async function transactionResult<T>(db:SQLiteDatabase,work:(tx:SQLiteDatabase)=>Promise<T>):Promise<T>{let result:T|undefined;await db.withExclusiveTransactionAsync(async tx=>{result=await work(tx)});if(result===undefined)throw new Error('Transaction produced no result');return result}
async function party(tx:SQLiteDatabase,partyId:string){const row=await tx.getFirstAsync<PartyRow>('SELECT id,name,receivable,payable,net FROM parties WHERE id=?',[partyId]);if(!row)throw new AccountingError('الطرف غير موجود','party_missing');return row}
async function audit(tx:SQLiteDatabase,action:string,entityId:string){await tx.runAsync('INSERT INTO audit_events(id,action,entity_id,status,created_at) VALUES(?,?,?,?,?)',[id('audit'),action,entityId,'committed',now()])}

export async function postSettlement(db:SQLiteDatabase,input:{partyId:string;side:'receivable'|'payable';amount:number;note?:string}){
  return transactionResult(db,async tx=>{
    const p=await party(tx,input.partyId),amount=assertMoney(input.amount);
    let receivable=Number(p.receivable),payable=Number(p.payable);
    if(input.side==='receivable'){if(amount>receivable)throw new AccountingError('المبلغ يتجاوز المستحق');receivable-=amount}else{if(amount>payable)throw new AccountingError('المبلغ يتجاوز المستحق');payable-=amount}
    const docId=id('settlement'),number=`SET-${Date.now()}-${Crypto.randomUUID().slice(0,6)}`,occurredAt=now(),title=input.side==='receivable'?'تسوية مبلغ لنا':'تسوية مبلغ علينا';
    await tx.runAsync('UPDATE parties SET receivable=?,payable=?,net=?,updated_at=? WHERE id=?',[receivable,payable,receivable-payable,occurredAt,p.id]);
    await tx.runAsync("INSERT INTO documents(id,number,kind,status,party_id,party_name,title,total,due_total,paid_total,cash_amount,occurred_at,revision) VALUES(?,?,'settlement','posted',?,?,?, ?,0,?,0,?,0)",[docId,number,p.id,p.name,input.note?.trim()||title,amount,amount,occurredAt]);
    await audit(tx,'settlement.post',docId);return docId;
  });
}

export async function postOffset(db:SQLiteDatabase,input:{partyId:string;amount:number;note?:string}){
  return transactionResult(db,async tx=>{
    const p=await party(tx,input.partyId),amount=assertMoney(input.amount),available=Math.min(Number(p.receivable),Number(p.payable));
    if(amount>available||available<=0)throw new AccountingError('المقاصة تتجاوز الرصيد المشترك');
    const receivable=Number(p.receivable)-amount,payable=Number(p.payable)-amount,docId=id('offset'),number=`OFF-${Date.now()}-${Crypto.randomUUID().slice(0,6)}`,occurredAt=now();
    await tx.runAsync('UPDATE parties SET receivable=?,payable=?,net=?,updated_at=? WHERE id=?',[receivable,payable,receivable-payable,occurredAt,p.id]);
    await tx.runAsync("INSERT INTO documents(id,number,kind,status,party_id,party_name,title,total,due_total,paid_total,cash_amount,occurred_at,revision) VALUES(?,?,'offset','posted',?,?,?, ?,0,?,0,?,0)",[docId,number,p.id,p.name,input.note?.trim()||'مقاصة بين المبالغ لنا وعلينا',amount,amount,occurredAt]);
    await audit(tx,'offset.post',docId);return docId;
  });
}
