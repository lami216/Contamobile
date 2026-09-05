# Contamobile parity ledger

Source of truth: `lami216/offline-conta` (`main`). Last source/command audit: 2026-09-05.

Legend:
- ✅ implemented and included in the mobile quality gate
- 🟡 implemented but still needs real-device / real-data acceptance testing
- ⬜ intentionally pending

## Feature parity

| Desktop capability | Mobile destination | Status | Notes |
|---|---|---:|---|
| Point of sale | Sales → New sale | ✅ | retail/wholesale, direct/credit sale, partial cash/debt accounting, stock guard, expiry guard, below-cost warning |
| Sale edit / void | Records → Sale | ✅ | reverses prior stock/debt/payment effect atomically before applying the revision |
| Purchase invoices | Sales → Purchases | ✅ | stock increase, supplier debt, last-purchase cost |
| Purchase edit / void | Records → Purchase | ✅ | safe reversal; blocks impossible reversal when purchased stock was already consumed |
| Expense invoices | Sales → Expenses | ✅ | payment-account outflow, edit and void reversal |
| Invoice history | Sales → Records | ✅ | defaults to today's sales like desktop; search/type/date/all-time filters, detail, edit/void, PDF share |
| Products | Inventory → Products | ✅ | SKU, barcode, prices, wholesale price, expiry, note, opening stock, archive and restore |
| Warehouse admin | Inventory → Warehouses | ✅ | create/rename/default/safe archive rules |
| Inventory view | Inventory → Stock | ✅ | per-warehouse quantity/value and search |
| Warehouse transfer | Inventory → Transfer | ✅ | atomic stock out/in |
| Stock adjustment | Inventory → Adjustment | ✅ | actual quantity + reason + authoritative-cost guard |
| Customers | Parties → Customers | ✅ | search, balances, trade totals, cash totals, gross-profit metrics, create/edit |
| Suppliers | Parties → Suppliers | ✅ | search, balances, purchase totals, cash totals, invoice count, create/edit |
| Party cash operations | Party detail | ✅ | receive/pay with payment-account movement and party-balance snapshot |
| Party ledger | Party detail / Reports | ✅ | today/all-time date filtering, party metrics, settlement/offset support, party-specific report |
| Payment accounts | More → Accounts | ✅ | seeded and custom accounts, create/edit/color/active state/archive/restore |
| Account movements | More → Accounts → Movements | ✅ | date/account/type filters and signed in/out display |
| Account transfer | More → Accounts → Transfers | ✅ | atomic out/in plus transfer history and from/to/date filters |
| Deposit / withdraw | More → Accounts → Retrait / dépôt | ✅ | manual movement plus date/account/type history filters |
| Opening balance correction | More → Accounts | ✅ | delta-only correction with required reason and before/after audit fields |
| Reports | More → Reports | ✅ | overview, sales, purchases, product sales, stock movements, debts, party ledger, finance, expenses with desktop-equivalent core filters |
| Users & permissions | More → Settings | ✅ | local users, password hashing, owner protection, presets/custom permissions, direct-route guards and action rechecks |
| Permission-aware navigation | Tabs / hubs / dashboard | ✅ | unauthorized tabs/actions/metrics are hidden while route-level checks remain enforced |
| Branding | More → Settings → Business identity | ✅ | store name/phone/address/registration/tax/footer and invoice name styling boundary |
| PDF document output | Records → Share PDF | 🟡 | local Arabic/French RTL/LTR PDF generation implemented; final printer/device visual acceptance remains |
| Backup / restore | More → Settings → Data | 🟡 | full local JSON export/restore plus pre-restore safety copy; real-device destructive-restore acceptance remains |
| Official desktop backup import | More → Settings → Data | 🟡 | `conta-backup` converter, structural/invariant validation, preview and safety backup implemented; still needs acceptance with a representative production backup |
| Arabic / French | Settings → Language | 🟡 | RTL/LTR architecture and primary operational surfaces are bilingual; final full-app copy/device sweep remains |
| Android application identity | Expo config | ✅ | `mr.alkarna.mobile`, project icon, adaptive icon and Android-first configuration |
| Android build profiles | `eas.json` | ✅ | preview APK and production AAB profiles configured |
| Mobile activation / licensing | Settings / startup gate | ⬜ | intentionally deferred until all core parity/release checks are closed; mobile scheme will be independent of the desktop device-license implementation |

## Desktop command coverage audit

The current desktop command surface was re-audited against `offline-conta/app/api/command/route.ts`. Mobile user-facing flows cover the commands that are currently exposed by the desktop UI: products, warehouses, sales, purchases, stock transfer/adjustment, party cash, expense revisions, payment-account management, account transfer/adjustment/opening-balance correction and party creation.

`payment.post` remains present in the desktop backend but is not surfaced by the current desktop UI; mobile therefore does not add a second duplicate party-payment workflow. `party-cash.post` is the active desktop user flow and is implemented on mobile.

Legacy `return` records remain read-only historical data. They are not offered as a new-operation type on mobile, matching the desktop product direction.

## Non-negotiable source invariants preserved

- Party net is `receivable - payable`; receiving cash decreases net, paying cash increases it independent of customer/supplier role.
- Sales cannot create negative stock and cannot sell expired products.
- Sales preserve cost-at-sale and gross profit from authoritative purchase cost.
- Purchases increase stock and update last-purchase cost.
- Sale/purchase/expense edits and voids reverse their previous stock/debt/payment effects atomically.
- Warehouse deletion cannot remove a default warehouse, a warehouse with stock, or historical identity.
- Payment-account deletion requires zero balance; referenced accounts are archived instead of erasing financial history.
- Money is stored as integer MRU; quantity may be decimal.
- Historical documents, product identity and financial movements are retained instead of being cosmetically deleted.

## Release acceptance still required before activation

1. GitHub quality gate must remain green: typecheck, ESLint, tests and real Expo Android bundle export.
2. Install a preview APK on at least one Android device and execute a scripted smoke test covering sale, purchase, debt, stock transfer, expense, bank movement, backup/restore and language switching.
3. Import at least one representative official desktop backup and reconcile key totals (stock, receivable/payable, account balances, document counts and representative invoices).
4. Visually inspect Arabic and French PDF output on Android and one real share/print target.
5. Run the final Arabic/French copy and RTL/LTR sweep.
6. Only after the above, implement the mobile activation/licensing system and the offline HTML activation-file generator.
