// Accounting arithmetic ported from Desktop 862 app/invoice-line-amount.ts.
export const MAX_INVOICE_LINE_AMOUNT = Number.MAX_SAFE_INTEGER;
export function invoiceAmountNumber(value) {
    if (typeof value !== "number" && (typeof value !== "string" || !/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()))) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 && parsed <= MAX_INVOICE_LINE_AMOUNT ? parsed : null;
}
export function invoiceAmountText(value) {
    if (!Number.isFinite(value)) return "";
    const text = String(value);
    if (!/e/i.test(text)) return text;
    const [mantissa, exponent] = text.toLowerCase().split("e"), [whole, fraction = ""] = mantissa.split(".");
    const digits = whole + fraction, position = whole.length + Number(exponent);
    return position <= 0 ? "0." + "0".repeat(-position) + digits : position >= digits.length ? digits + "0".repeat(position - digits.length) : digits.slice(0, position) + "." + digits.slice(position);
}
function productValue(quantity, price) {
    const q = invoiceAmountNumber(quantity), p = invoiceAmountNumber(price);
    if (q === null || p === null) return null;
    if ([
        quantity,
        price
    ].every((value)=>value.length <= 350 && /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value))) {
        const decimals = (quantity.split(".")[1]?.length ?? 0) + (price.split(".")[1]?.length ?? 0);
        const digits = (BigInt(quantity.replace(".", "")) * BigInt(price.replace(".", ""))).toString().padStart(decimals + 1, "0");
        const value = Number(decimals ? digits.slice(0, -decimals) + "." + digits.slice(-decimals) : digits);
        return Number.isFinite(value) && value <= MAX_INVOICE_LINE_AMOUNT ? value : null;
    }
    const value = q * p;
    return Number.isFinite(value) && value <= MAX_INVOICE_LINE_AMOUNT ? value : null;
}
export class InvoiceLineAmountError extends Error {
    status = 400;
}
export function resolveInvoiceLineTotal(quantity, unitPrice, explicitTotal, hasExplicitTotal = false) {
    if (!hasExplicitTotal) return Math.round(quantity * unitPrice);
    const total = invoiceAmountNumber(explicitTotal), q = invoiceAmountNumber(quantity), p = invoiceAmountNumber(unitPrice);
    if (total === null || total <= 0 || q === null || q <= 0 || p === null || p <= 0) throw new InvoiceLineAmountError("مجموع السطر غير صالح");
    const product = q * p;
    if (!Number.isFinite(product) || product <= 0 || product > MAX_INVOICE_LINE_AMOUNT) throw new InvoiceLineAmountError("مجموع السطر غير صالح");
    const tolerance = Math.min(1e-7, Number.EPSILON * 8 * Math.max(product, total));
    if (Math.abs(product - total) > tolerance) throw new InvoiceLineAmountError("مجموع السطر لا يطابق الكمية وسعر الوحدة");
    return total;
}
export function sumInvoiceLineTotals(values, exact, allowEmpty = false) {
    let total = values.reduce((sum, value)=>sum + value, 0);
    if (exact) {
        if (values.some((value)=>invoiceAmountNumber(value) === null)) throw new InvoiceLineAmountError("إجمالي الفاتورة غير صالح");
        const texts = values.map(invoiceAmountText), decimals = Math.max(0, ...texts.map((text)=>text.split(".")[1]?.length ?? 0));
        const scaled = texts.reduce((sum, text)=>{
            const [whole, fraction = ""] = text.split(".");
            return sum + BigInt(whole + fraction.padEnd(decimals, "0"));
        }, BigInt(0));
        if (scaled > BigInt(MAX_INVOICE_LINE_AMOUNT) * BigInt(10) ** BigInt(decimals)) throw new InvoiceLineAmountError("إجمالي الفاتورة غير صالح");
        const digits = scaled.toString().padStart(decimals + 1, "0");
        total = Number(decimals ? digits.slice(0, -decimals) + "." + digits.slice(-decimals) : digits);
    }
    if (exact && (!Number.isFinite(total) || (allowEmpty ? total < 0 : total <= 0) || total > MAX_INVOICE_LINE_AMOUNT)) throw new InvoiceLineAmountError("إجمالي الفاتورة غير صالح");
    return total;
}
export function resetInvoiceLineAmount(line) {
    const copy = {
        ...line
    };
    delete copy.lineTotal;
    delete copy.lineTotalAwaitingQuantity;
    return copy;
}
export function updateInvoiceLineAmount(line, key, field, value) {
    const copy = {
        ...line
    };
    if (field === "total") {
        copy.lineTotal = value;
        copy.lineTotalMode = "exact";
        const quantity = invoiceAmountNumber(copy.quantity), total = invoiceAmountNumber(value);
        if (quantity !== null && quantity > 0 && total !== null) {
            if (key === "piecePrice") copy.piecePrice = invoiceAmountText(total / quantity);
            else copy.unitPrice = invoiceAmountText(total / quantity);
            delete copy.lineTotalAwaitingQuantity;
        } else copy.lineTotalAwaitingQuantity = quantity === null || quantity <= 0;
        return copy;
    }
    if (field === "quantity") {
        copy.quantity = value;
        const quantity = invoiceAmountNumber(value), total = invoiceAmountNumber(copy.lineTotal);
        if (copy.lineTotalAwaitingQuantity && quantity !== null && quantity > 0 && total !== null) {
            if (key === "piecePrice") copy.piecePrice = invoiceAmountText(total / quantity);
            else copy.unitPrice = invoiceAmountText(total / quantity);
            delete copy.lineTotalAwaitingQuantity;
            return copy;
        }
    } else if (key === "piecePrice") copy.piecePrice = value;
    else copy.unitPrice = value;
    delete copy.lineTotal;
    delete copy.lineTotalAwaitingQuantity;
    return copy;
}
export function invoiceDraftTotalText(line, key) {
    if (line.lineTotal !== undefined) return line.lineTotal;
    if (line.lineTotalMode !== "exact") {
        const quantity = invoiceAmountNumber(line.quantity), price = invoiceAmountNumber(line[key]);
        return quantity === null || price === null ? "" : invoiceAmountText(Math.round(quantity * price));
    }
    const value = productValue(line.quantity, line[key]);
    return value === null ? "" : invoiceAmountText(value);
}
export function invoiceDraftTotal(line, key) {
    return invoiceAmountNumber(invoiceDraftTotalText(line, key)) ?? 0;
}
export function invoiceDraftInvoiceTotal(lines, key) {
    try {
        return sumInvoiceLineTotals(lines.map((line)=>invoiceDraftTotal(line, key)), lines.some((line)=>line.lineTotalMode === "exact" || line.lineTotal !== undefined), true);
    } catch  {
        return 0;
    }
}
export function invoiceDraftAmountPayload(line, key) {
    if (line.lineTotalMode !== "exact" && line.lineTotal === undefined) return {};
    const total = invoiceDraftTotalText(line, key);
    return {
        lineTotal: resolveInvoiceLineTotal(Number(line.quantity), Number(line[key]), total, true)
    };
}
export function validateInvoiceDraftAmounts(lines, key) {
    for (const line of lines)invoiceDraftAmountPayload(line, key);
    if (lines.some((line)=>line.lineTotalMode === "exact" || line.lineTotal !== undefined)) sumInvoiceLineTotals(lines.map((line)=>invoiceDraftTotal(line, key)), true);
}
export function storedInvoiceAmountDraft(line) {
    return line.lineTotalMode === "exact" ? {
        lineTotalMode: "exact",
        lineTotal: invoiceAmountText(line.lineTotal)
    } : {};
}

/** Read saved historical revenue without recomputing an invoice agreement. */
export function mobileLineTotal(line) {
 const saved=invoiceAmountNumber(line.lineTotal);
 return saved!==null?saved:Number(line.qty??line.quantity)*Number(line.price??line.unitPrice??line.piecePrice);
}
export function mobileInvoiceTotal(lines){return sumInvoiceLineTotals(lines.map(mobileLineTotal),lines.some(l=>l.lineTotalMode==='exact'||Object.hasOwn(l,'lineTotal')),true);}
export function invoiceLineDraft(line){return {...line,quantity:String(line.qty??line.quantity??''),piecePrice:String(line.price??line.piecePrice??line.unitPrice??''),unitPrice:String(line.price??line.unitPrice??line.piecePrice??''),...storedInvoiceAmountDraft(line)};}
export function updateMobileInvoiceLine(line,field,value){
 const draft=updateInvoiceLineAmount(invoiceLineDraft(line),'piecePrice',field==='qty'?'quantity':field,String(value));
 draft.lineTotalMode='exact';
 const next={...line,qty:invoiceAmountNumber(draft.quantity)??draft.quantity,price:invoiceAmountNumber(draft.piecePrice)??draft.piecePrice};
 for(const key of ['lineTotal','lineTotalMode','lineTotalAwaitingQuantity']){if(Object.hasOwn(draft,key))next[key]=draft[key];else delete next[key];}
 return next;
}
/** New posting uses the desktop policy; a saved line total is never a discount. */
export function invoiceAmountFields(line,oldLine){
 const quantity=Number(line.qty??line.quantity),price=Number(line.price??line.unitPrice??line.piecePrice);
 const supplied=Object.hasOwn(line,'lineTotal'),unchanged=oldLine&&Number(oldLine.qty??oldLine.quantity)===quantity&&Number(oldLine.price??oldLine.unitPrice??oldLine.piecePrice)===price;
 // Approved mobile rounded to cents; desktop unmarked rows rounded to units.
 // The importing/edit adapter identifies that historical policy. Retain its
 // saved agreement only while quantity, price and the proposed total agree.
 const legacyMode=['mobile-legacy','desktop-legacy'].includes(line.lineTotalMode)?line.lineTotalMode:null;
 if(unchanged&&legacyMode&&oldLine.lineTotalMode!=='exact'){
  const saved=invoiceAmountNumber(oldLine.lineTotal)??(legacyMode==='desktop-legacy'?Math.round(quantity*price):Math.round((quantity*price+Number.EPSILON)*100)/100);
  if(!supplied||invoiceAmountNumber(line.lineTotal)===saved)return {lineTotal:saved,lineTotalMode:legacyMode};
 }
 const exact=supplied||line.lineTotalMode==='exact'||oldLine?.lineTotalMode==='exact';
 const proposed=supplied?line.lineTotal:unchanged&&oldLine?.lineTotalMode==='exact'?oldLine.lineTotal:quantity*price;
 return {lineTotal:resolveInvoiceLineTotal(quantity,price,proposed,exact),...(exact?{lineTotalMode:'exact'}:{})};
}
