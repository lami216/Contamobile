# Contamobile parity ledger

Source of truth: `lami216/offline-conta` (`main`, audited 2026-09-05).

Legend: ✅ implemented in native shell/domain, 🟡 implemented foundation/UI still being verified, ⬜ pending verification.

| Desktop capability | Mobile destination | Status | Notes |
|---|---|---:|---|
| Point of sale | Sales → New sale | 🟡 | retail/wholesale, debt, stock guard, expiry, below-cost warning |
| Purchase invoices | Sales → Purchases | 🟡 | stock increase, supplier debt, last-purchase cost |
| Expense invoices | Sales → Expenses | 🟡 | payment account movement |
| Invoice history | Sales → Records | 🟡 | bounded history with detail drill-down |
| Products | Inventory → Products | 🟡 | SKU, barcode, prices, expiry, opening stock, archive |
| Warehouse admin | Inventory → Warehouses | 🟡 | default warehouse, safe archive rules |
| Inventory view | Inventory → Stock | 🟡 | per-warehouse stock, search |
| Warehouse transfer | Inventory → Transfer | 🟡 | atomic stock out/in |
| Stock adjustment | Inventory → Adjustment | 🟡 | actual quantity + reason + cost guard |
| Customers | Parties → Customers | 🟡 | balances and cash collection |
| Suppliers | Parties → Suppliers | 🟡 | balances and payments |
| Party ledger | Party detail / Reports | 🟡 | document/financial history |
| Payment accounts | More → Accounts | 🟡 | cash + Bankily/Masrvi/Sedad/BIM + custom |
| Account movements | More → Accounts | 🟡 | bounded history |
| Account transfer | More → Accounts → Transfer | 🟡 | atomic out/in |
| Deposit/withdraw | More → Accounts → Adjustment | 🟡 | manual movement |
| Opening balance correction | More → Accounts | 🟡 | delta-only correction with reason |
| Reports | More → Reports | 🟡 | overview, sales, purchases, stock, debts, finance, expenses |
| Users & permissions | More → Settings | ⬜ | schema retained; UI parity follows core transaction verification |
| Branding | More → Settings | ⬜ | retained as setting boundary |
| Backup / restore | More → Settings → Data | 🟡 | local export/import with explicit replacement confirmation |
| Legacy desktop import | More → Settings → Data | ⬜ | source backup compatibility needs fixture verification |
| License | More → Settings | ⬜ | desktop device-license code is platform-specific; do not fake parity |
| Arabic/French | Settings → Language | 🟡 | Arabic RTL / French LTR architecture included |

## Non-negotiable source invariants

- Party net is `receivable - payable`; receiving cash decreases net, paying cash increases it independent of customer/supplier role.
- Sales cannot create negative stock and cannot sell expired products.
- Sales preserve cost-at-sale and gross profit from authoritative purchase cost.
- Purchases increase stock and update last purchase cost.
- Sale/purchase/expense edits and voids reverse their previous stock/debt/payment effects atomically.
- Warehouse deletion cannot remove a default warehouse, a warehouse with stock, or historical identity.
- Payment account deletion requires zero balance; referenced accounts are archived, not erased.
- Money is stored as integer MRU; quantity may be decimal.
