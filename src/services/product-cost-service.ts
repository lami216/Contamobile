import type { SQLiteDatabase } from 'expo-sqlite';

type Tx = SQLiteDatabase;
export type ProductCostSource = 'purchase' | 'opening';
export type AuthoritativeProductCost = { cost: number; source: ProductCostSource; occurredAt: string | null };

function positiveCost(value: unknown) {
  const cost = Number(value);
  return Number.isSafeInteger(cost) && cost > 0 ? cost : null;
}

/**
 * Accounting cost is owned by posted stock-origin documents, not by the editable
 * product card. A product can acquire sellable stock from either an opening
 * balance or a purchase invoice. Purchase wins when one exists at the requested
 * point in time; otherwise the opening-stock cost is used.
 */
export async function resolveAuthoritativeProductCost(tx: Tx, productId: string, at: string | null = null): Promise<AuthoritativeProductCost | null> {
  const purchase = await tx.getFirstAsync<{ unit_price: number; occurred_at: string }>(`
    SELECT dl.unit_price, d.occurred_at
    FROM documents d
    JOIN document_lines dl ON dl.document_id = d.id
    WHERE d.kind = 'purchase'
      AND d.status = 'posted'
      AND dl.product_id = ?
      AND (? IS NULL OR d.occurred_at <= ?)
    ORDER BY d.occurred_at DESC, COALESCE(d.sequence, 0) DESC, d.rowid DESC
    LIMIT 1
  `, [productId, at, at]);
  const purchaseCost = positiveCost(purchase?.unit_price);
  if (purchaseCost !== null) return { cost: purchaseCost, source: 'purchase', occurredAt: purchase!.occurred_at };

  const opening = await tx.getFirstAsync<{ unit_price: number; occurred_at: string }>(`
    SELECT dl.unit_price, d.occurred_at
    FROM stock_movements sm
    JOIN documents d ON d.id = sm.document_id
    JOIN document_lines dl ON dl.document_id = d.id AND dl.product_id = sm.product_id
    WHERE sm.product_id = ?
      AND sm.type = 'opening'
      AND d.status = 'posted'
      AND (? IS NULL OR d.occurred_at <= ?)
    ORDER BY d.occurred_at DESC, sm.rowid DESC
    LIMIT 1
  `, [productId, at, at]);
  const openingCost = positiveCost(opening?.unit_price);
  return openingCost !== null ? { cost: openingCost, source: 'opening', occurredAt: opening!.occurred_at } : null;
}

export async function syncAuthoritativeProductCost(tx: Tx, productId: string) {
  const result = await resolveAuthoritativeProductCost(tx, productId);
  const stamp = new Date().toISOString();
  await tx.runAsync(
    'UPDATE products SET last_purchase_cost=?,last_purchase_at=?,updated_at=? WHERE id=?',
    [result?.cost ?? null, result?.occurredAt ?? null, stamp, productId],
  );
  return result;
}

export async function syncAuthoritativeProductCosts(tx: Tx, productIds: string[]) {
  for (const productId of new Set(productIds)) await syncAuthoritativeProductCost(tx, productId);
}
