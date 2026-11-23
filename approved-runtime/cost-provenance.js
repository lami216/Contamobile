// Exact ordinary count-stock proof replay from Desktop 862.
import { stockBalanceAfter, stockNumber, reportCostNumber } from "./accounting-numbers.js";
import { mobileLineTotal } from './invoice-amount.js';
import { sha256Hex } from './accounting-hash.js';
const eventTypes = {
    purchase: [
        "purchase",
        "post"
    ],
    "purchase-edit": [
        "purchase",
        "edit"
    ],
    "purchase-void": [
        "purchase",
        "void"
    ],
    sale: [
        "sale",
        "post"
    ],
    "sale-edit": [
        "sale",
        "edit"
    ],
    "sale-void": [
        "sale",
        "void"
    ],
    opening: [
        "opening",
        "post"
    ],
    "opening-void": [
        "opening",
        "void"
    ],
    "opening-correction": [
        "opening-correction",
        "post"
    ],
    "opening-correction-void": [
        "opening-correction",
        "void"
    ],
    adjustment: [
        "adjustment",
        "post"
    ],
    "adjustment-edit": [
        "adjustment",
        "edit"
    ],
    "adjustment-void": [
        "adjustment",
        "void"
    ]
};
const object = (value)=>value !== null && typeof value === "object" && !Array.isArray(value);
const identifier = (value)=>typeof value === "string" && value.length > 0 && value.trim() === value;
const number = (value)=>typeof value === "number" && Number.isFinite(value);
const revision = (value)=>number(value) && Number.isSafeInteger(value) && value >= 0;
const date = (value)=>typeof value === "string" && Number.isFinite(Date.parse(value));
const imported = (document)=>Boolean(document.legacyKey || document.legacy || document.importRunId || document.importedFrom || document.sourceType || document.parentDocumentId);
const sameQuantity = (left, right)=>left === right || stockBalanceAfter(left, -right) === 0;
const isOpening = (family)=>family === "opening" || family === "opening-correction";
function parseMovement(row) {
    if (!identifier(row.type) || !Object.hasOwn(eventTypes, row.type)) return null;
    if (!identifier(row.id) || !identifier(row.documentId) || !identifier(row.documentNumber) || !date(row.occurredAt) || !revision(row.documentRevision)) return null;
    const before = row.balanceBefore, delta = row.quantityDelta, after = row.balanceAfter;
    if (!number(before) || !number(delta) || !number(after) || before < 0 || after < 0 || delta === 0) return null;
    if (before + delta !== after && stockBalanceAfter(before, delta) !== after) return null;
    const [family, phase] = eventTypes[row.type];
    return {
        id: row.id,
        documentId: row.documentId,
        number: row.documentNumber,
        occurredAt: row.occurredAt,
        family,
        phase,
        revision: row.documentRevision,
        before,
        delta,
        after
    };
}
function sourceMatchesWarehouse(document, family, warehouseId) {
    if (family !== "opening-correction") return document.warehouseId === warehouseId;
    return document.warehouseId === warehouseId || document.destinationWarehouseId === warehouseId;
}
function sourceKindMatches(document, family) {
    if (family === "purchase" || family === "sale") return document.kind === family;
    if (document.kind !== "adjustment" || document.productArchiveStockClearance === true) return false;
    if (family === "opening-correction") return document.openingCorrection === true;
    if (document.openingCorrection === true) return false;
    return family === "opening" ? /^OPEN-(?!COR)/.test(String(document.number)) : String(document.number).startsWith("ADJ-");
}
function validateSource(document, rows, productId, warehouseId) {
    const first = rows[0], last = rows.at(-1);
    const family = first.family, documentRevision = document.revision === undefined ? 0 : document.revision;
    if (imported(document) || !identifier(document.number) || !date(document.occurredAt) || !revision(documentRevision)) return null;
    if (!sourceKindMatches(document, family) || !sourceMatchesWarehouse(document, family, warehouseId)) return null;
    if (document.status !== "posted" && document.status !== "voided") return null;
    if (!Array.isArray(document.lines) || document.lines.some((line)=>!object(line))) return null;
    const matches = document.lines.filter((line)=>line.productId === productId);
    if (matches.length > 1) return null;
    const line = matches[0];
    const commerce = family === "purchase" || family === "sale";
    if (!line && (!commerce || documentRevision === 0)) return null;
    if (line?.warehouseId != null && line.warehouseId !== warehouseId) return null;
    const savedQuantity = line ? stockNumber(line.quantity) : 0;
    if (savedQuantity === null || line && commerce && savedQuantity <= 0) return null;
    if (first.phase !== "post" && (!commerce || first.phase !== "edit" || first.revision === 0)) return null;
    if (first.phase === "post" && (first.revision !== 0 || first.occurredAt !== document.occurredAt)) return null;
    if (last.revision > documentRevision) return null;
    if (last.phase === "void" && (document.status !== "voided" || last.revision !== documentRevision)) return null;
    if (document.status === "voided" && line && last.phase !== "void") return null;
    let effect = 0, previousRevision = -1;
    let stableCountSnapshot = family === "adjustment" && first.delta > 0;
    for (const row of rows){
        if (row.family !== family || row.number !== document.number || row.revision <= previousRevision) return null;
        if (row.phase === "post" && row !== first) return null;
        if (row.phase === "void" && (row !== last || !sameQuantity(row.delta, -effect))) return null;
        effect = stockBalanceAfter(effect, row.delta);
        if (!Number.isFinite(effect)) return null;
        if (effect <= 0) stableCountSnapshot = false;
        if ((family === "purchase" || family === "opening") && effect < 0) return null;
        if (family === "sale" && effect > 0) return null;
        previousRevision = row.revision;
    }
    const expected = document.status === "voided" ? 0 : family === "sale" ? -savedQuantity : savedQuantity;
    if (!sameQuantity(effect, expected)) return null;
    if (last.phase === "void" && !sameQuantity(last.delta, family === "sale" ? savedQuantity : -savedQuantity)) return null;
    if (family === "opening") {
        if (savedQuantity <= 0 || first.before !== 0 || !sameQuantity(first.delta, savedQuantity)) return null;
        if (document.openingStockAfter !== undefined && stockNumber(document.openingStockAfter) !== savedQuantity) return null;
    }
    if (family === "opening-correction") {
        const before = stockNumber(document.openingStockBefore), after = stockNumber(document.openingStockAfter);
        if (before === null || after === null || before < 0 || after < 0 || !sameQuantity(after - before, savedQuantity)) return null;
    }
    if (family === "adjustment" && line) {
        const before = stockNumber(line.balanceBefore), after = stockNumber(line.balanceAfter);
        if (before !== first.before || after === null || after < 0 || !sameQuantity(stockBalanceAfter(before, savedQuantity), after)) return null;
    }
    return {
        document,
        line,
        family,
        stableCountSnapshot,
        simpleVoid: rows.length === 2 && first.phase === "post" && last.phase === "void" && last.revision === 1
    };
}
const total = (lots)=>[
        ...lots.values()
    ].reduce((sum, part)=>sum + part.quantity, 0);
function deposit(lots, parts) {
    for (const part of parts){
        const existing = lots.get(part.origin.id);
        lots.set(part.origin.id, {
            origin: part.origin,
            quantity: (existing?.quantity ?? 0) + part.quantity
        });
    }
}
function withdraw(lots, quantity, eligible = ()=>true) {
    if (quantity === 0) return [];
    const parts = [
        ...lots.values()
    ].filter(eligible);
    const available = parts.reduce((sum, part)=>sum + part.quantity, 0);
    if (!parts.length || !Number.isFinite(available)) return null;
    if (sameQuantity(available, quantity)) {
        for (const part of parts)lots.delete(part.origin.id);
        return parts;
    }
    if (quantity > available || parts.length !== 1) return null;
    const part = parts[0], remaining = stockBalanceAfter(part.quantity, -quantity);
    if (remaining <= 0) return null;
    lots.set(part.origin.id, {
        ...part,
        quantity: remaining
    });
    return [
        {
            origin: part.origin,
            quantity
        }
    ];
}
function makeCountEvidence(source, movement, warehouseId) {
    const line = source.line;
    const unitCost = stockNumber(line?.unitPrice);
    if (!source.stableCountSnapshot || source.document.status !== "posted" || !line || !identifier(line.id) || unitCost === null || unitCost <= 0) return undefined;
    return {
        unitCost,
        documentId: movement.documentId,
        number: movement.number,
        lineId: line.id,
        movementId: movement.id,
        occurredAt: movement.occurredAt,
        kind: "adjustment",
        warehouseId,
        revision: movement.revision
    };
}
function substituteCanceledPurchase(replay, row, source) {
    const { lots, operations, sources, substitutions } = replay;
    if (row.family !== "purchase" || row.phase !== "void" || !source.simpleVoid || lots.has(row.documentId) || lots.size !== 1 || substitutions.has(row.documentId)) return false;
    const replacement = lots.values().next().value;
    const rate = stockNumber(source.line?.unitPrice);
    if (!replacement?.origin.evidence || rate === null || rate <= 0 || replacement.origin.evidence.unitCost !== rate || !sameQuantity(replacement.quantity, -row.delta)) return false;
    const holders = [
        ...operations
    ].filter(([, operation])=>operation.withdrawn.has(row.documentId));
    if (holders.length !== 1) return false;
    const [holderId, operation] = holders[0];
    const holder = sources.get(holderId);
    const part = operation.withdrawn.get(row.documentId);
    if (!holder?.simpleVoid || !part || operation.withdrawn.size !== 1 || !sameQuantity(operation.effect, row.delta) || !sameQuantity(part.quantity, -row.delta)) return false;
    if (holder.family !== "sale" && holder.family !== "adjustment") return false;
    const heldRate = stockNumber(holder.family === "sale" ? holder.line?.costAtSale : holder.line?.unitPrice);
    if (heldRate !== rate) return false;
    lots.delete(replacement.origin.id);
    substitutions.set(row.documentId, {
        holderId,
        replacement
    });
    return true;
}
function depositReturned(replay, row, parts) {
    for (const part of parts){
        const substitution = replay.substitutions.get(part.origin.id);
        if (!substitution) {
            deposit(replay.lots, [
                part
            ]);
            continue;
        }
        if (row.phase !== "void" || row.documentId !== substitution.holderId || !sameQuantity(part.quantity, substitution.replacement.quantity)) return false;
        deposit(replay.lots, [
            substitution.replacement
        ]);
        replay.substitutions.delete(part.origin.id);
    }
    return true;
}
function applyMovement(replay, row, source) {
    const { lots, operations, origins, warehouseId } = replay;
    const operation = operations.get(row.documentId) ?? {
        effect: 0,
        withdrawn: new Map()
    };
    operations.set(row.documentId, operation);
    const own = (part)=>part.origin.id === row.documentId;
    const affected = row.family === "opening-correction" ? (part)=>isOpening(part.origin.family) : undefined;
    if (row.delta > 0) {
        const returned = Math.min(row.delta, Math.max(0, -operation.effect));
        const restored = withdraw(operation.withdrawn, returned);
        if (!restored || !depositReturned(replay, row, restored)) return false;
        const gained = stockBalanceAfter(row.delta, -returned);
        if (gained > 0) {
            if (row.family === "sale") return false;
            const origin = origins.get(row.documentId) ?? {
                id: row.documentId,
                family: row.family,
                evidence: row.family === "adjustment" ? makeCountEvidence(source, row, warehouseId) : undefined
            };
            origins.set(row.documentId, origin);
            deposit(lots, [
                {
                    origin,
                    quantity: gained
                }
            ]);
        }
    } else {
        const owned = row.family === "purchase" || row.family === "opening" ? -row.delta : row.family === "sale" ? 0 : Math.min(-row.delta, Math.max(0, operation.effect));
        if (!withdraw(lots, owned, own) && !substituteCanceledPurchase(replay, row, source)) return false;
        const other = stockBalanceAfter(-row.delta, -owned);
        const taken = withdraw(lots, other, affected);
        if (!taken) return false;
        deposit(operation.withdrawn, taken);
    }
    operation.effect = stockBalanceAfter(operation.effect, row.delta);
    return Number.isFinite(operation.effect) && sameQuantity(total(lots), row.after);
}
function countBasis(lots, quantity) {
    if (lots.size !== 1 || quantity <= 0) return null;
    const part = lots.values().next().value;
    return part?.origin.evidence && sameQuantity(part.quantity, quantity) ? {
        ...part.origin.evidence,
        quantity
    } : null;
}
export function resolveAdjustmentStockCost(input) {
    const { productId, warehouseId, debitMovementId } = input;
    if (!identifier(productId) || !identifier(warehouseId)) return null;
    const productRows = input.movements.filter((row)=>row.productId === productId);
    const cell = productRows.filter((row)=>row.warehouseId === warehouseId);
    const target = debitMovementId === undefined ? -1 : cell.findIndex((row)=>row.id === debitMovementId);
    if (debitMovementId !== undefined && target === -1) return null;
    const prefix = target === -1 ? cell : cell.slice(0, target + 1);
    if (!prefix.length) return null;
    const sourceIds = new Set(prefix.map((row)=>row.documentId));
    const documents = new Map();
    for (const document of input.documents){
        if (!sourceIds.has(document.id)) continue;
        if (documents.has(document.id)) return null;
        documents.set(document.id, document);
    }
    const histories = new Map(), movements = new Map();
    const movementIds = new Map();
    for (const row of productRows)movementIds.set(row.id, (movementIds.get(row.id) ?? 0) + 1);
    for (const row of productRows){
        if (!sourceIds.has(row.documentId)) continue;
        if (row.warehouseId !== warehouseId) return null;
        const movement = parseMovement(row);
        if (!movement || movementIds.get(movement.id) !== 1) return null;
        const history = histories.get(movement.documentId) ?? [];
        history.push(movement);
        histories.set(movement.documentId, history);
        movements.set(movement.id, movement);
    }
    const sources = new Map();
    for (const [id, rows] of histories){
        const document = documents.get(id);
        const source = document ? validateSource(document, rows, productId, warehouseId) : null;
        if (!source) return null;
        sources.set(id, source);
    }
    const lots = new Map();
    const replay = {
        lots,
        operations: new Map(),
        origins: new Map(),
        substitutions: new Map(),
        sources,
        warehouseId
    };
    let previous = 0;
    for (const raw of prefix){
        const row = movements.get(String(raw.id));
        if (!row || previous !== row.before || !sameQuantity(total(lots), row.before)) return null;
        const source = sources.get(row.documentId);
        if (!source) return null;
        if (row.id === debitMovementId) {
            if (row.family !== "sale" || row.delta >= 0 || source.document.status !== "posted") return null;
            return countBasis(lots, row.before);
        }
        if (!applyMovement(replay, row, source)) return null;
        previous = row.after;
    }
    const current = stockNumber(input.currentStock);
    return current === previous ? countBasis(lots, previous) : null;
}

export const effectiveAccountingRecord = record => !record.voided && record.status !== 'voided' && !record.reversedBy && !record.reversalOf;
export const importedAccountingRecord = record => Boolean(record.desktopId || record.importKey || record.legacyKey || record.legacy || record.importRunId || record.importedFrom || record.sourceType);
export function accountingTimestamp(record) {
 if (typeof record.occurredAt === 'string') return record.occurredAt;
 if (typeof record.desktop?.occurredAt === 'string') return record.desktop.occurredAt;
 return /^\d{4}-\d{2}-\d{2}$/.test(record.date || '') ? record.date + 'T' + (/^\d{2}:\d{2}(?::\d{2})?$/.test(record.time || '') ? record.time.length === 5 ? record.time + ':00' : record.time : '00:00:00') + '.000Z' : '';
}
/** Adapt identities only; opaque imported history never becomes native proof. */
export function accountingDocuments(state) {
 const productsById=new Map(state.products.map(p=>[String(p.id),p]));
 const identities=new Map();for(const record of state.records){identities.set(String(record.id),String(record.id));if(record.desktopId)identities.set(String(record.desktopId),String(record.id));}
 const documentId=value=>value==null?'':identities.get(String(value))??String(value);
 return state.records.map(record => {const sourceByProduct=new Map((record.desktop?.lines||[]).map(line=>[String(line.productId),line])),sourceById=new Map((record.desktop?.lines||[]).filter(line=>line.id).map(line=>[String(line.id),line]));return ({
  ...record, id:String(record.id), kind:record.kind==='stocktransfer'?'transfer':record.kind,
  status:effectiveAccountingRecord(record)?'posted':'voided', occurredAt:accountingTimestamp(record),
  sequence:Number(record.postingOrder??record.sequence??record.desktop?.sequence??0), revision:Number(record.revision??0),
  warehouseId:record.warehouse??record.from, destinationWarehouseId:record.toWarehouse,
  parentDocumentId:documentId(record.parentDocumentId??record.desktop?.parentDocumentId),
  ...(importedAccountingRecord(record)?{importedFrom:record.importedFrom||'preserved-import'}:{}),
  lines:(record.lines||[]).map(line=>{
   const desktopProduct=productsById.get(String(line.product))?.desktopId,raw=sourceById.get(String(line.id))??(desktopProduct==null?undefined:sourceByProduct.get(String(desktopProduct))), result={...line,id:String(line.id??raw?.id??''),productId:String(line.product??line.productId),quantity:line.qty??line.quantity,unitPrice:line.price??line.unitPrice,lineTotal:mobileLineTotal(line)};
   if(!Object.hasOwn(line,'costAtSale')&&raw&&Number(record.revision??0)===Number(record.desktop?.revision??0)&&Object.hasOwn(raw,'costAtSale'))result.costAtSale=raw.costAtSale;
   return result;
  }),
  ...(record.openingStock?{number:String(record.number||'OPEN-'+record.id),openingStockAfter:record.openingTotalAfter??record.newQty}:{}),
  ...(record.openingCorrection?{openingStockBefore:record.openingTotalBefore,openingStockAfter:record.openingTotalAfter}:{}),
 });});
}
export function accountingMovements(state) {
 const documents=new Map(),products=new Map();for(const r of state.records){documents.set(String(r.id),String(r.id));if(r.desktopId)documents.set(String(r.desktopId),String(r.id));}for(const p of state.products){products.set(String(p.id),String(p.id));if(p.desktopId)products.set(String(p.desktopId),String(p.id));}
 return (state.stockEvents||[]).map(row=>({...row,documentId:documents.get(String(row.documentId))??String(row.documentId??''),productId:products.get(String(row.productId))??String(row.productId??''),occurredAt:row.occurredAt??row.at}));
}
export function accountingProduct(product){return {...product,id:String(product.id),pieceCost:product.cost,openingStock:product.openingTotal??product.openingStock};}
const positiveCost=value=>{const parsed=reportCostNumber(value);return parsed!==null&&parsed>0?parsed:null;};
/** Exact Desktop 0.1.30 acquisition basis; callers supply canonical identities. */
export function canonicalMobileCostBasisSignature(productId,documents){
 const rows=documents.filter(document=>document.status==='posted'&&
  (document.kind==='purchase'||document.openingCorrection===true||String(document.number??'').startsWith('OPEN-'))&&
  Array.isArray(document.lines)&&document.lines.some(line=>line.productId===productId))
  .map(document=>({id:String(document.id),kind:String(document.kind),at:String(document.occurredAt),sequence:Number(document.sequence??0),
   unit:reportCostNumber(document.openingCostAfter??document.lines.find(line=>line.productId===productId)?.unitPrice),
   quantity:reportCostNumber(document.lines.find(line=>line.productId===productId)?.quantity),opening:document.openingStockAfter??null}))
  .sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
 return sha256Hex(JSON.stringify(rows));
}
export {canonicalMobileCostBasisSignature as mobileCostBasisSignature};
// Numeric phone references select the lines, but never replace an imported
// acquisition's canonical identity in its original history-bound cost basis.
const accountingCostBasis=(product,documents)=>canonicalMobileCostBasisSignature(String(product.id),documents.map(document=>
 ({...document,id:document.desktopId??document.canonicalId??document.id})));
const hasImportedCurrentCost=(product,documents)=>product.mobileSource?.format==='alkarna-web-backup'&&
 reportCostNumber(product.mobileImportedCurrentCost)!==null&&product.mobileImportedCostBasis===accountingCostBasis(product,documents);
export function resolveProductCost(product,documents) {
 const relevant=documents.filter(document=>document.status==='posted'&&Array.isArray(document.lines)&&document.lines.some(line=>line.productId===String(product.id)));
 if(hasImportedCurrentCost(product,relevant))return {cost:reportCostNumber(product.mobileImportedCurrentCost),source:'legacy-opening',at:null,sourceDocumentId:null};
 const latest=relevant.filter(document=>document.kind==='purchase').sort((a,b)=>String(a.occurredAt).localeCompare(String(b.occurredAt))||Number(a.sequence??0)-Number(b.sequence??0)).at(-1);
 const purchaseCost=positiveCost(latest?.lines.find(line=>line.productId===String(product.id))?.unitPrice);
 if(purchaseCost!==null)return {cost:purchaseCost,source:'purchase',at:latest.occurredAt,sourceDocumentId:latest.id};
 if(latest)return {cost:null,source:null,at:null,sourceDocumentId:latest.id};
 const opening=relevant.filter(document=>document.openingCorrection===true||String(document.number??'').startsWith('OPEN-')).at(-1);
 let openingCost=positiveCost(product.openingCost);
 if(!Object.hasOwn(product,'openingCost')&&opening&&(!Object.hasOwn(opening,'openingStockAfter')||positiveCost(opening.openingStockAfter)!==null))openingCost=positiveCost(Object.hasOwn(opening,'openingCostAfter')?opening.openingCostAfter:opening.lines.find(line=>line.productId===String(product.id))?.unitPrice);
 if(openingCost!==null)return {cost:openingCost,source:'opening',at:null,sourceDocumentId:opening?.id??null};
 const legacyCost=positiveCost(product.legacyOpeningCost);
 return legacyCost!==null?{cost:legacyCost,source:'legacy-opening',at:null,sourceDocumentId:null}:{cost:null,source:null,at:null,sourceDocumentId:null};
}
export function resolveCurrentProductCost(state,product,warehouse) {
 const documents=accountingDocuments(state),result=resolveProductCost(accountingProduct(product),documents);
 // A zero source valuation remains zero in inventory/cache, but cannot assert a
 // free acquisition cost for a new sale or permit fallback to count evidence.
 if(result.cost===0&&product.mobileImportedCurrentCost===0&&hasImportedCurrentCost(accountingProduct(product),documents))return {...result,cost:null};
 if(result.cost!==null||!warehouse||!(stockNumber(product.stocks?.[warehouse])>0))return result;
 const evidence=resolveAdjustmentStockCost({productId:String(product.id),warehouseId:warehouse,movements:accountingMovements(state),documents,currentStock:product.stocks[warehouse]});
 return evidence?{cost:evidence.unitCost,source:'adjustment',at:evidence.occurredAt,sourceDocumentId:evidence.documentId,proof:evidence}:result;
}
/** Refresh accounting caches without overwriting the seller's editable suggestion. */
export function currentProductCosts(state) {
 const documents=accountingDocuments(state),byProduct=new Map();
 for(const document of documents)for(const productId of new Set(document.lines.map(line=>line.productId))){const list=byProduct.get(productId)||[];list.push(document);byProduct.set(productId,list);}
 return new Map(state.products.map(product=>[product.id,resolveProductCost(accountingProduct(product),byProduct.get(String(product.id))||[])]));
}
export function refreshCurrentProductCosts(state,ids) {
 const selected=ids?new Set([...ids].map(String)):null,costs=currentProductCosts(state);
 for(const product of state.products)if(!selected||selected.has(String(product.id))){const result=costs.get(product.id);Object.assign(product,{lastPurchaseCost:result.cost,lastPurchaseCostSource:result.source,lastPurchaseAt:result.at});}
 return state;
}
export function saleLineCost(state,product,oldLine,warehouse) {
 return oldLine ? reportCostNumber(oldLine.costAtSale) : resolveCurrentProductCost(state,product,warehouse).cost;
}
export const suggestedPurchasePrice=product=>product.lastPurchaseCost??product.cost??0;
export const inventoryUnitCost=product=>product.lastPurchaseCost??product.openingCost??product.legacyOpeningCost??0;
export function inventoryValue(state,product,warehouses=state.warehouses) {
 const quantity=warehouses.reduce((sum,w)=>sum+(stockNumber(product.stocks?.[w])??0),0);
 return quantity*inventoryUnitCost(product);
}
