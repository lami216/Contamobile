export type Locale = 'ar' | 'fr';
export type PartyType = 'customer' | 'supplier';
export type PricingMode = 'retail' | 'wholesale';
export type DocumentKind = 'purchase' | 'sale' | 'return' | 'transfer' | 'adjustment' | 'expense' | 'payment' | 'offset' | 'settlement';
export type DocumentStatus = 'posted' | 'voided';

export interface Warehouse { id: string; name: string; isSalesDefault: boolean; isArchived: boolean; archivedAt: string | null; }
export interface Product { id: string; sku: string; name: string; barcode: string; pieceCost: number | null; lastPurchaseCost: number | null; lastPurchaseAt: string | null; piecePrice: number | null; wholesalePrice: number | null; expiryDate: string | null; note: string | null; isArchived: boolean; createdAt: string; updatedAt: string; stocks?: Record<string, number>; }
export interface Party { id: string; name: string; phone: string; partyType: PartyType; receivable: number; payable: number; net: number; createdAt: string; }
export interface PaymentAccount { id: string; code: string; name: string; color: string; icon: string; isActive: boolean; isArchived: boolean; openingBalance: number; balance: number; }
export interface DocumentLine { id: string; productId: string | null; description: string; quantity: number; unitPrice: number; lineTotal: number; costAtSale: number | null; grossProfit: number | null; balanceBefore?: number | null; balanceAfter?: number | null; }
export interface DocumentRecord { id: string; number: string; sequence: number | null; kind: DocumentKind; status: DocumentStatus; partyId: string | null; partyName: string | null; warehouseId: string | null; warehouseName: string | null; destinationWarehouseId: string | null; destinationWarehouseName: string | null; paymentMethod: string | null; title: string | null; total: number; dueTotal: number; paidTotal: number; cashAmount: number; partyCashDirection: 'receive' | 'pay' | null; partyBalanceBefore: number | null; partyBalanceDelta: number | null; partyBalanceAfter: number | null; businessDate: string | null; dailySequence: number | null; pricingMode: PricingMode | null; occurredAt: string; updatedAt: string | null; revision: number; voidedAt: string | null; lines: DocumentLine[]; }
export interface DashboardSummary { todaySales: number; todayProfit: number; todayExpenses: number; receivable: number; payable: number; inventoryValue: number; lowStockCount: number; }
export interface SaleDraftLine { productId: string; quantity: string; piecePrice: string; }
