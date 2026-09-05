import type { Party, Product, PricingMode, SaleDraftLine } from './types';

export function partyNet(party: Pick<Party, 'receivable' | 'payable'>) {
  const receivable = Number(party.receivable ?? 0);
  const payable = Number(party.payable ?? 0);
  return (Number.isFinite(receivable) ? receivable : 0) - (Number.isFinite(payable) ? payable : 0);
}

export function normalizePartyNet(value: number) {
  if (!Number.isFinite(value)) throw new TypeError('Party net must be finite');
  const net = Object.is(value, -0) ? 0 : value;
  return { receivable: net > 0 ? net : 0, payable: net < 0 ? Math.abs(net) : 0, net };
}

export function partyCashDelta(direction: 'receive' | 'pay', amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) throw new TypeError('Amount must be positive and finite');
  return direction === 'receive' ? -amount : amount;
}

export function isProductExpired(product: Pick<Product, 'expiryDate'>, businessDate = new Date().toISOString().slice(0, 10)) {
  return Boolean(product.expiryDate && product.expiryDate < businessDate);
}

export function sellingPrice(product: Pick<Product, 'piecePrice' | 'wholesalePrice'>, mode: PricingMode) {
  const retail = Number(product.piecePrice ?? 0);
  const wholesale = Number(product.wholesalePrice ?? 0);
  return mode === 'wholesale' && wholesale > 0 ? wholesale : retail;
}

export type SaleValidationError =
  | { code: 'missingProduct'; productId: string }
  | { code: 'expiredProduct' | 'invalidQuantity' | 'invalidSalePrice'; productId: string; productName: string }
  | { code: 'insufficientQuantity'; productId: string; productName: string; requested: number; available: number };
export type BelowCostWarning = { productId: string; productName: string; salePrice: number; purchaseCost: number };

export function validateSaleDraft(lines: SaleDraftLine[], products: Product[], warehouseId: string, businessDate?: string) {
  const errors: SaleValidationError[] = [];
  const warnings: BelowCostWarning[] = [];
  const byId = new Map(products.map((p) => [p.id, p]));
  for (const line of lines) {
    const product = byId.get(line.productId);
    if (!product) { errors.push({ code: 'missingProduct', productId: line.productId }); continue; }
    if (isProductExpired(product, businessDate)) errors.push({ code: 'expiredProduct', productId: product.id, productName: product.name });
    const quantity = Number(line.quantity);
    const price = Number(line.piecePrice);
    const available = Number(product.stocks?.[warehouseId] ?? 0);
    if (!line.quantity.trim() || !Number.isFinite(quantity) || quantity <= 0) errors.push({ code: 'invalidQuantity', productId: product.id, productName: product.name });
    else if (quantity > available) errors.push({ code: 'insufficientQuantity', productId: product.id, productName: product.name, requested: quantity, available });
    if (!line.piecePrice.trim() || !Number.isFinite(price) || price <= 0) errors.push({ code: 'invalidSalePrice', productId: product.id, productName: product.name });
    else if (product.lastPurchaseCost != null && price < product.lastPurchaseCost) warnings.push({ productId: product.id, productName: product.name, salePrice: price, purchaseCost: product.lastPurchaseCost });
  }
  return { errors, warnings };
}

export function assertMoney(value: unknown, label = 'amount', allowZero = false) {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(number) || (allowZero ? number < 0 : number <= 0)) throw new Error(`${label} is invalid`);
  return number;
}

export function assertQuantity(value: unknown, label = 'quantity', allowZero = false) {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number) || (allowZero ? number < 0 : number <= 0)) throw new Error(`${label} is invalid`);
  return number;
}

export function roundLineTotal(quantity: number, unitPrice: number) { return Math.round(quantity * unitPrice); }
