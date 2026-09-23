import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';
import type { DocumentRecord, Locale } from '@/domain/types';
import { getInvoiceBranding } from './branding-service';
import { getPrintSettings, printFileLayout, type PrintProfile } from './print-settings-service';

const escapeHtml=(value:unknown)=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const money=(value:number,locale:Locale)=>new Intl.NumberFormat(locale==='ar'?'ar-MR-u-nu-latn':'fr-MR-u-nu-latn',{maximumFractionDigits:0}).format(value);
const qty=(value:number,locale:Locale)=>new Intl.NumberFormat(locale==='ar'?'ar-MR-u-nu-latn':'fr-MR-u-nu-latn',{maximumFractionDigits:3}).format(value);
const kindLabel=(kind:DocumentRecord['kind'],locale:Locale)=>({sale:locale==='ar'?'فاتورة بيع':'Facture de vente',purchase:locale==='ar'?'فاتورة شراء':"Facture d'achat",expense:locale==='ar'?'مصروف':'Dépense',transfer:locale==='ar'?'تحويل مخزون':'Transfert de stock',adjustment:locale==='ar'?'تصحيح مخزون':'Correction de stock',payment:locale==='ar'?'دفع / تحصيل':'Paiement',offset:locale==='ar'?'مقاصة':'Compensation',settlement:locale==='ar'?'تسوية':'Règlement',return:locale==='ar'?'حركة تاريخية':'Mouvement historique','account-transfer':locale==='ar'?'تحويل بين الحسابات':'Transfert entre comptes','account-adjustment':locale==='ar'?'سحب / إيداع':'Retrait / dépôt'}[kind]);
const fontFamily=(font:string)=>font==='times-new-roman'?"'Times New Roman',serif":font==='arial'?'Arial,sans-serif':font==='segoe-ui'?"'Segoe UI',sans-serif":'Tahoma,Arial,sans-serif';

function profileCss(profile:PrintProfile,rtl:boolean){
  if(profile==='a4')return `
    @page{margin:28px}
    body{padding:0}
    .brand{padding-bottom:14px;margin-bottom:16px}
    .logo{width:56px;height:56px}
    .meta{grid-template-columns:1fr 1fr;gap:5px 18px;padding:10px;margin-bottom:14px}
    th,td{padding:8px 6px}
    .totals{margin-top:14px;margin-${rtl?'right':'left'}:auto;width:270px}
  `;
  const compact=profile==='thermal58';
  return `
    @page{margin:0}
    html,body{width:100%;margin:0;padding:0}
    body{font-size:${compact?'8px':'9px'};line-height:1.4;padding:${compact?'8px':'10px'}}
    .brand{padding-bottom:8px;margin-bottom:8px;border-bottom:1px dashed #777}
    .brand-row{gap:${compact?'6px':'8px'}}
    .brand h1{font-size:${compact?'14px':'16px'}!important;margin-bottom:2px}
    .brand .details{font-size:${compact?'7px':'8px'}}
    .logo{width:${compact?'34px':'42px'};height:${compact?'34px':'42px'};padding:2px;border-radius:4px}
    .doc-title{font-size:${compact?'12px':'14px'};margin:6px 0 8px}
    .meta{display:block;padding:0;margin:0 0 8px;background:transparent;border:0;border-radius:0}
    .meta div{padding:3px 0;border-bottom:1px dotted #aaa}
    table,tbody,tr{display:block;width:100%}
    thead{display:none}
    tr{padding:5px 0;border-bottom:1px dashed #888;break-inside:avoid}
    td{display:flex;justify-content:space-between;align-items:baseline;gap:8px;padding:2px 0;border:0!important;text-align:start!important;white-space:normal}
    td::before{content:attr(data-label);flex:0 0 ${compact?'39%':'34%'};font-weight:700;color:#555;text-align:start}
    .totals{display:block;width:100%;margin:8px 0 0;border-radius:5px}
    .totals div{padding:4px 6px}
    .footer{margin-top:10px;padding-top:6px;border-top:1px dashed #777;font-size:7px}
  `;
}

export async function invoiceHtml(db:SQLiteDatabase,document:DocumentRecord,locale:Locale,profile?:PrintProfile){
  const [brand,settings]=await Promise.all([getInvoiceBranding(db),profile?Promise.resolve({profile}):getPrintSettings(db)]);
  const activeProfile=profile??settings.profile,rtl=locale==='ar';
  const labels=rtl?{number:'رقم المستند',date:'التاريخ',party:'الطرف',warehouse:'المخزن',item:'البيان',quantity:'الكمية',price:'السعر',total:'الإجمالي',paid:'المدفوع',due:'المتبقي',status:'الحالة',posted:'معتمد',voided:'ملغى',registration:'السجل',tax:'الرقم الضريبي'}:{number:'N°',date:'Date',party:'Client / Fournisseur',warehouse:'Dépôt',item:'Désignation',quantity:'Qté',price:'Prix',total:'Total',paid:'Payé',due:'Reste',status:'Statut',posted:'Validé',voided:'Annulé',registration:'Registre',tax:'N° fiscal'};
  const details=[brand.storePhone,brand.storeAddress,brand.registrationNumber?`${labels.registration}: ${brand.registrationNumber}`:'',brand.taxNumber?`${labels.tax}: ${brand.taxNumber}`:''].filter(Boolean).map(value=>`<div>${escapeHtml(value)}</div>`).join('');
  const logo=brand.storeLogoDataUrl?`<img class="logo" alt="" src="${escapeHtml(brand.storeLogoDataUrl)}"/>`:'';
  const rows=document.lines.map(line=>`<tr><td data-label="${escapeHtml(labels.item)}">${escapeHtml(line.description)}</td><td data-label="${escapeHtml(labels.quantity)}">${qty(line.quantity,locale)}</td><td data-label="${escapeHtml(labels.price)}">${money(line.unitPrice,locale)}</td><td data-label="${escapeHtml(labels.total)}">${money(line.lineTotal,locale)} MRU</td></tr>`).join('');
  const meta=[`${labels.number}: ${document.number}`,`${labels.date}: ${new Intl.DateTimeFormat(rtl?'ar-MR-u-nu-latn':'fr-MR-u-nu-latn',{dateStyle:'medium'}).format(new Date(document.occurredAt))}`,document.partyName?`${labels.party}: ${document.partyName}`:'',document.warehouseName?`${labels.warehouse}: ${document.warehouseName}`:'',`${labels.status}: ${document.status==='voided'?labels.voided:labels.posted}`].filter(Boolean).map(value=>`<div>${escapeHtml(value)}</div>`).join('');
  return `<!doctype html><html dir="${rtl?'rtl':'ltr'}" data-profile="${activeProfile}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
    *{box-sizing:border-box}
    html,body{background:#fff}
    body{font-family:Arial,Tahoma,sans-serif;color:#171717;font-size:12px;line-height:1.55;margin:0}
    .brand{text-align:center;border-bottom:2px solid #222}
    .brand-row{display:flex;align-items:center;justify-content:center;gap:10px}
    .brand-copy{min-width:0}
    .brand h1{font-family:${fontFamily(brand.nameFont)};font-size:${brand.nameFontSize}px;font-weight:${brand.nameFontWeight};margin:0 0 6px}
    .brand .details{color:#555}
    .logo{display:block;object-fit:contain;padding:3px;border:1px solid #bbb;border-radius:6px;background:#fff}
    .doc-title{text-align:center;font-size:18px;font-weight:800;margin:8px 0 14px}
    .meta{display:grid;background:#f7f7f7;border:1px solid #ddd;border-radius:8px}
    table{width:100%;border-collapse:collapse}
    th,td{border-bottom:1px solid #ddd;text-align:${rtl?'right':'left'};vertical-align:top}
    th{background:#f0f0f0;font-weight:800}
    .totals{border:1px solid #ddd;border-radius:8px;overflow:hidden}
    .totals div{display:flex;justify-content:space-between;gap:10px;padding:7px 10px;border-bottom:1px solid #eee}
    .totals div:last-child{border-bottom:0;font-weight:800;font-size:1.12em}
    .void{color:#a11;font-weight:800}
    .footer{text-align:center;margin-top:22px;padding-top:12px;border-top:1px solid #ddd;color:#555;white-space:pre-wrap}
    ${profileCss(activeProfile,rtl)}
  </style></head><body>
    <section class="brand"><div class="brand-row">${logo}<div class="brand-copy"><h1>${escapeHtml(brand.storeName)}</h1><div class="details">${details}</div></div></div></section>
    <div class="doc-title ${document.status==='voided'?'void':''}">${escapeHtml(kindLabel(document.kind,locale))}${document.status==='voided'?` — ${labels.voided}`:''}</div>
    <section class="meta">${meta}</section>
    <table><thead><tr><th>${labels.item}</th><th>${labels.quantity}</th><th>${labels.price}</th><th>${labels.total}</th></tr></thead><tbody>${rows||`<tr><td data-label="${labels.item}">—</td></tr>`}</tbody></table>
    <section class="totals"><div><span>${labels.paid}</span><strong>${money(document.paidTotal,locale)} MRU</strong></div><div><span>${labels.due}</span><strong>${money(document.dueTotal,locale)} MRU</strong></div><div><span>${labels.total}</span><strong>${money(document.total,locale)} MRU</strong></div></section>
    ${brand.footerNote?`<div class="footer">${escapeHtml(brand.footerNote)}</div>`:''}
  </body></html>`;
}

async function preparedDocument(db:SQLiteDatabase,document:DocumentRecord,locale:Locale){
  const settings=await getPrintSettings(db),html=await invoiceHtml(db,document,locale,settings.profile),layout=printFileLayout(settings.profile,document.lines.length);
  return {settings,html,layout};
}

export async function printDocument(db:SQLiteDatabase,document:DocumentRecord,locale:Locale){
  const {html,layout}=await preparedDocument(db,document,locale);
  await Print.printAsync({html,...layout});
}

export async function shareDocumentPdf(db:SQLiteDatabase,document:DocumentRecord,locale:Locale){
  const {html,layout}=await preparedDocument(db,document,locale),result=await Print.printToFileAsync({html,...layout});
  if(!(await Sharing.isAvailableAsync()))throw new Error(locale==='ar'?'المشاركة غير متاحة على هذا الجهاز.':'Le partage n’est pas disponible sur cet appareil.');
  await Sharing.shareAsync(result.uri,{mimeType:'application/pdf',dialogTitle:locale==='ar'?`مشاركة ${document.number}`:`Partager ${document.number}`,UTI:'com.adobe.pdf'});
  return result.uri;
}
