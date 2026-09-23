# Contamobile parity ledger

Source of truth: `lami216/offline-conta` (`main`). Last source/command audit: 2026-09-23, covering desktop changes through 2026-09-20.

Legend:
- ✅ implemented and included in the mobile quality gate
- 🟡 implemented but still needs real-device / real-data acceptance testing
- ⬜ intentionally pending

## Feature parity

| Desktop capability | Mobile destination | Status | Notes |
|---|---|---:|---|
| Point of sale | Sales → New sale | ✅ | retail/wholesale, direct paid/credit sale, full-paid-or-full-credit settlement policy, stock guard, expiry guard, low-stock feedback |
| Sale edit / void | Records → Sale | ✅ | reverses prior stock/debt/payment effect atomically before applying the revision |
| Purchase invoices | Sales → Purchases | ✅ | stock increase, supplier debt, authoritative purchase cost and full-paid-or-full-credit settlement |
| Purchase edit / void | Records → Purchase | ✅ | safe reversal; blocks impossible reversal when purchased stock was already consumed |
| Expense invoices | Sales → Expenses | ✅ | payment-account outflow, edit and void reversal |
| Invoice / transaction history | Sales → Records | ✅ | search/type/date/all-time filters, exact source deep links, detail, lifecycle edit/void, print and PDF share |
| Products | Inventory → Products | ✅ | categories, SKU/barcode, prices, expiry, notes, authoritative opening-stock cost, archive/restore and read-only detail for view-only users |
| Product categories | Inventory → Products | ✅ | create/rename/delete, product assignment and sale/purchase/report filtering |
| Warehouse admin | Inventory → Warehouses | ✅ | create/rename/default/safe archive rules |
| Inventory view | Inventory → Stock | ✅ | per-warehouse quantity/value and search |
| Warehouse transfer lifecycle | Inventory → Transfer / Records | ✅ | atomic stock out/in plus historical-safe edit/void |
| Stock adjustment lifecycle | Inventory → Adjustment / Records | ✅ | counted quantity + reason + authoritative-cost guard plus historical-safe edit/void |
| Customers | Parties → Customers | ✅ | search, balances, metrics, create/edit, balance-safe archive and archived restore |
| Suppliers | Parties → Suppliers | ✅ | search, balances, metrics, create/edit, balance-safe archive and archived restore |
| Party cash operations | Party detail / Records | ✅ | receive/pay with payment-account movement, party-balance snapshot and lifecycle void |
| Party ledger | Party detail / Reports | ✅ | date filtering, party metrics, settlement/offset support and source-document drill-down |
| Payment accounts | More → Accounts | ✅ | seeded/custom accounts, edit/color/active state/archive/restore |
| Account movements | More → Accounts → Movements | ✅ | date/account/type filters and signed in/out display |
| Account transfer | More → Accounts → Transfers / Records | ✅ | reversible lifecycle document, historical references and atomic out/in |
| Deposit / withdraw | More → Accounts → Retrait / dépôt / Records | ✅ | reversible lifecycle document with date/account/type history filters |
| Opening balance correction | More → Accounts | ✅ | delta-only correction with required reason and before/after audit fields |
| Reports | More → Reports | ✅ | overview, sales, purchases, product sales, stock, debts, party ledger, finance and expenses with date/category/product/account filters and source drill-down |
| Users & permissions | More → Settings | ✅ | local users, password hashing, owner protection, dependency-normalized presets/custom permissions, lifecycle and archive capabilities |
| Permission-aware navigation | Tabs / hubs / dashboard | ✅ | unauthorized tabs/actions/metrics are hidden while route-level/action checks remain enforced |
| Branding | More → Settings → Business identity | ✅ | store logo, name, phones, address, registration/tax/footer and invoice-name styling |
| Invoice paper profiles | Settings → Format de facture | 🟡 | A4, thermal 80 mm and thermal 58 mm profiles ported; Android uses the native system printer chooser instead of desktop printer binding |
| PDF document output | Records → Share PDF | 🟡 | Arabic/French RTL/LTR output, branding logo and saved paper profile; final printer/device visual acceptance remains |
| Direct mobile printing | Records → Print | 🟡 | Expo/native Android print dialog with the selected A4/thermal profile; real thermal-printer acceptance remains |
| Backup / restore | More → Settings → Data | 🟡 | full local JSON export/restore plus pre-restore safety copy; archived/lifecycle/category/settings data are preserved |
| Official desktop backup import | More → Settings → Data | 🟡 | official backup converter, invariant validation, preview and safety backup; current import keeps newer archived/category/accounting state |
| Arabic / French | Settings → Language | 🟡 | RTL/LTR architecture and primary operational surfaces are bilingual; final full-app copy/device sweep remains |
| Android application identity | Expo config | ✅ | `mr.alkarna.mobile`, project icon, adaptive icon and Android-first configuration |
| Android build profiles | `eas.json` | ✅ | preview APK and production AAB profiles configured |
| Mobile activation / licensing | Settings / startup gate | ⬜ | intentionally deferred until core parity/release checks are closed; mobile licensing stays independent of desktop device licensing |

## 2026-09 source refresh

The desktop source was re-read after the original mobile baseline. Mobile now carries the material cross-platform changes added after that baseline:

- product categories and category-aware sale/purchase/report filtering;
- authoritative opening-stock and purchase-cost rules;
- full-paid-or-full-credit invoice settlement semantics;
- archived-party lifecycle and historical identity preservation;
- permission dependency normalization and lifecycle capabilities;
- reversible account transfers, account adjustments, stock transfers and stock adjustments;
- exact source navigation from report rows into records, products and parties;
- dedicated read-only product detail before editing;
- invoice logo/contact parity;
- A4 / thermal 80 / thermal 58 invoice formats adapted to Android printing.

Desktop-only implementation details such as Electron printer-device binding, Windows packaging, DOM lightboxes, hover behavior and desktop window lifecycle are intentionally not copied. Their user-facing capability is mapped to native Android equivalents instead.

## Desktop command coverage audit

The current desktop command surface was re-audited against the source behavior rather than copied route-for-route. Mobile user-facing flows cover products/categories, warehouses, sales, purchases, stock transfer/adjustment, party cash, expense revisions, payment-account management, account transfer/adjustment/opening-balance correction and party lifecycle operations.

`payment.post` remains a legacy backend path rather than a second mobile payment workflow. Mobile keeps the active party-cash flow to avoid duplicate accounting entry points.

Legacy `return` records remain read-only historical data. They are not offered as a new-operation type on mobile.

## Non-negotiable source invariants preserved

- Party net is `receivable - payable`; receiving cash decreases net and paying cash increases it independent of customer/supplier role.
- New sale/purchase invoices are either fully paid or fully credit; later settlement is recorded from the party account.
- Sales cannot create negative stock and cannot sell expired products.
- Sales preserve cost-at-sale and gross profit from authoritative purchase cost.
- Purchases increase stock and update authoritative last-purchase cost.
- Opening-stock provenance remains distinct from later stock adjustments.
- Edits and voids reverse prior stock/debt/payment effects atomically and retain revision/audit history.
- Archived parties/accounts remain valid historical identities and cannot be destructively removed while financially unsafe.
- Warehouse deletion cannot remove a default warehouse, a warehouse with stock, or historical identity.
- Payment-account deletion requires zero balance; referenced accounts are archived instead of erasing financial history.
- Money is stored as integer MRU; quantity may be decimal and is never formatted as money.
- Historical documents, product identity and financial movements are retained instead of being cosmetically deleted.

## Release acceptance still required before activation

1. GitHub quality gate must remain green: typecheck, ESLint, tests and real Expo Android bundle export.
2. Install a preview APK on at least one Android device and execute a scripted smoke test covering sale, purchase, debt, stock transfer/edit/void, expense, account movement, party archive/restore, backup/restore and language switching.
3. Import at least one representative official desktop backup and reconcile stock, receivable/payable, account balances, document counts and representative invoices.
4. Visually inspect Arabic and French A4, thermal 80 mm and thermal 58 mm output on Android, including logo and one real share/print target.
5. Run the final Arabic/French copy, RTL/LTR, small-screen and large-font sweep.
6. Only after the above, implement the mobile activation/licensing system and its offline activation-file workflow.
