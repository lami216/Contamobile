// Stock arithmetic and numeric parsing ported from Desktop 862.
export class StockQuantityError extends Error {
    status = 409;
}
export function stockNumber(value) {
    if (typeof value !== "number" && (typeof value !== "string" || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim()))) return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}
export function stockBalanceAfter(before, delta) {
    const sum = before + delta;
    if (Number.isFinite(sum) && (before > 0 && delta < 0 || before < 0 && delta > 0)) {
        const tolerance = Math.min(1e-12, Number.EPSILON * (Math.abs(before) + Math.abs(delta)));
        if (Math.abs(sum) <= tolerance) return 0;
    }
    return sum;
}
export function planStockChange(product, warehouseId, inputDelta, document, normalizeAfter) {
    const productId = String(product.id ?? ""), documentId = String(document.id ?? ""), stocks = product.stocks;
    const badStock = ()=>new StockQuantityError(`رصيد المخزون المسجل للمنتج ${productId} في المخزن ${warehouseId} غير صالح؛ راجع بيانات المخزون`);
    if (stocks !== undefined && (stocks === null || typeof stocks !== "object" || Array.isArray(stocks))) throw badStock();
    const entries = stocks, exists = entries !== undefined && Object.hasOwn(entries, warehouseId), raw = exists ? entries[warehouseId] : undefined;
    const before = exists ? stockNumber(raw) : 0, delta = stockNumber(inputDelta);
    if (before === null) throw badStock();
    if (delta === null) throw new StockQuantityError(`كمية حركة المخزون في المستند ${documentId} غير صالحة؛ راجع بيانات المستند`);
    const sum = stockBalanceAfter(before, delta), after = normalizeAfter ? normalizeAfter(sum) : sum;
    if (!Number.isFinite(sum) || !Number.isFinite(after)) throw new StockQuantityError(`ناتج حركة المخزون في المستند ${documentId} غير صالح؛ راجع بيانات المستند`);
    const stockPath = `stocks.${warehouseId}`;
    return {
        before,
        after,
        delta,
        stockPath,
        stockMatch: exists ? {
            [stockPath]: raw
        } : {
            [stockPath]: {
                $exists: false
            }
        }
    };
}
export function historicalInvoiceStockLines(document) {
    const lines = document.lines, documentId = String(document.id ?? ""), number = String(document.number ?? "");
    const invalid = (index)=>new StockQuantityError(`لا يمكن إلغاء المستند ${documentId} (${number}): كمية السطر ${index + 1} غير صالحة؛ راجع بيانات السند الأصلي`);
    if (!Array.isArray(lines) || lines.length === 0) throw invalid(0);
    return lines.map((line, index)=>{
        if (line === null || typeof line !== "object" || Array.isArray(line)) throw invalid(index);
        const row = line, quantity = stockNumber(row.qty ?? row.quantity);
        if (quantity === null || quantity <= 0 || !(typeof (row.productId ?? row.product) === "string" || typeof row.product === "number") || !String(row.productId ?? row.product).trim()) throw invalid(index);
        return {
            ...row,
            productId: String(row.productId ?? row.product),
            qty: quantity,
            quantity
        };
    });
}

export function reportCostNumber(value) {
    if (typeof value !== "number" && (typeof value !== "string" || value.trim() === "")) return null;
    if (typeof value === "string" && !/^[+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}
export function reportNetLines(document) {
    const lines = document.lines ?? [], values = lines.map((line)=>reportCostNumber(line.lineTotal));
    if (values.some((value)=>value === null)) return lines;
    const gross = values.reduce((sum, value)=>sum + (value ?? 0), 0), total = reportCostNumber(document.total);
    if (total === null || gross <= 0 || total >= gross) return lines;
    const last = values.findLastIndex((value)=>(value ?? 0) > 0);
    let allocated = 0;
    return lines.map((line, index)=>{
        const weight = values[index] ?? 0;
        const amount = weight === 0 ? 0 : index === last ? total - allocated : Math.min(total - allocated, Math.round(total * weight / gross * 1e6) / 1e6);
        allocated += amount;
        return {
            ...line,
            lineTotal: amount
        };
    });
}
export function latestReportCost(rows, at) {
    const eligible = rows.filter((row)=>row.at <= at).sort((a, b)=>a.at.localeCompare(b.at) || a.sequence - b.sequence);
    const latest = eligible.at(-1);
    if (!latest) return {
        present: false,
        cost: null
    };
    const tied = eligible.filter((row)=>row.at === latest.at && row.sequence === latest.sequence);
    const values = tied.map((row)=>reportCostNumber(row.value));
    const cost = values[0];
    return {
        present: true,
        cost: cost !== null && cost > 0 && values.every((value)=>value === cost) ? cost : null
    };
}