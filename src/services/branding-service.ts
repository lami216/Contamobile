import type { SQLiteDatabase } from 'expo-sqlite';

export const INVOICE_BRANDING_KEY='invoice-branding';
export const invoiceFonts=['tahoma','arial','segoe-ui','times-new-roman'] as const;
export type InvoiceFont=typeof invoiceFonts[number];
export type InvoiceBranding={storeName:string;storePhone:string;storeAddress:string;registrationNumber:string;taxNumber:string;footerNote:string;nameFont:InvoiceFont;nameFontSize:number;nameFontWeight:400|600|800};
export const DEFAULT_INVOICE_BRANDING:InvoiceBranding={storeName:'الكرنه',storePhone:'',storeAddress:'',registrationNumber:'',taxNumber:'',footerNote:'',nameFont:'tahoma',nameFontSize:24,nameFontWeight:800};

export function validateInvoiceBranding(value:unknown):InvoiceBranding{
  const body=value as Partial<Record<keyof InvoiceBranding,unknown>>|null,storeName=String(body?.storeName??'').trim();
  if(!storeName||storeName.length>80)throw new Error('اسم المحل مطلوب ويجب ألا يتجاوز 80 حرفًا');
  const font=body?.nameFont as InvoiceFont;if(!invoiceFonts.includes(font))throw new Error('نوع الخط غير صالح');
  const nameFontSize=Number(body?.nameFontSize);if(!Number.isFinite(nameFontSize)||nameFontSize<16||nameFontSize>32)throw new Error('حجم اسم المحل يجب أن يكون بين 16 و32');
  const weight=Number(body?.nameFontWeight);if(![400,600,800].includes(weight))throw new Error('سماكة الخط غير صالحة');
  const optional=(key:keyof InvoiceBranding,max:number)=>{const text=String(body?.[key]??'').trim();if(text.length>max)throw new Error('إحدى معلومات النشاط أطول من الحد المسموح');return text};
  return {storeName,storePhone:optional('storePhone',40),storeAddress:optional('storeAddress',160),registrationNumber:optional('registrationNumber',60),taxNumber:optional('taxNumber',60),footerNote:optional('footerNote',160),nameFont:font,nameFontSize,nameFontWeight:weight as 400|600|800};
}

export async function getInvoiceBranding(db:SQLiteDatabase):Promise<InvoiceBranding>{
  const row=await db.getFirstAsync<{value:string}>('SELECT value FROM app_settings WHERE key=?',[INVOICE_BRANDING_KEY]);
  if(!row)return DEFAULT_INVOICE_BRANDING;
  try{return validateInvoiceBranding(JSON.parse(row.value))}catch{return DEFAULT_INVOICE_BRANDING}
}

export async function saveInvoiceBranding(db:SQLiteDatabase,value:unknown):Promise<InvoiceBranding>{
  const branding=validateInvoiceBranding(value),updatedAt=new Date().toISOString();
  await db.runAsync('INSERT INTO app_settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at',[INVOICE_BRANDING_KEY,JSON.stringify(branding),updatedAt]);
  return branding;
}
