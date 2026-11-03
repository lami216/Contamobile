# Targeted accounting parity — v24 / 1.0.23

Desktop reference: `lami216/offline-conta` commit
`1b4951947a82ca9da21337c757fe7afdd2329403`, specifically
`app/api/command/route.ts` and `lib/transaction-lifecycle.ts`.
Mobile baseline: the exact delivered v23 source tree
`b982cf00043de70e4f238ba230e501e110ef38d6`.

## Interaction plan and scope

Keep the approved navigation, sheets, fields, typography and every CSS file.
Paid purchase continues through the existing confirmation flow when cash is zero.
Current/opening account balance fields accept a leading minus; transaction amounts
and product prices remain positive. Historical correction editing displays its
original count, retains its original warehouse/products and applies only the net
quantity change. Existing account directories and metrics expose restored balances.
No additional setting, screen, printing, wholesale, netting or demo action is added.
Arabic/French layouts and permission checks remain on the existing paths.

## Migration records

| Capability | Desktop rule | Mobile implementation | Important checks |
| --- | --- | --- | --- |
| Signed payment balances | Financial movement increments the selected account without a zero floor; signed opening balances are valid | `engine.js`, `database.js`, `upgrade-state.js`, `feature-admin.js`, `app.js`: accept finite signed current/opening account values under the existing magnitude limit, including backup/import. Operation amounts remain nonnegative | Purchase at zero, edit/reversal, withdrawals/transfers/receipts, signed opening/current correction, reload and restore |
| Historical stock correction | Original balanceBefore is immutable; current stock changes by revised delta minus original delta; posted products/warehouse stay fixed | `stock-domain.js`, `feature-stock.js`, `engine.js`: persist baseline; recover legacy actualQuantity/newQty, imported desktop values or trustworthy earlier revisions. Ambiguous history refuses mutation. Exact zero-change is skipped | Later sales, repeated/note-only edits, historical revisions, multiple products/warehouses, fractional units, insufficient stock and complete rollback |
| Archived account visibility | Reversal/party change cannot hide a nonzero restored balance; historical edits may retain the original archived account | `accounting-lifecycle.js`, `features.js`, `engine.js`: affected entities reappear in the same save. Balanced archived parties remain archived. Reused original payment accounts reactivate | Supplier/customer both directions, custom payment account, balanced edit, unrelated archived selections excluded, failed persistence and cold reload |

## Persistence and compatibility

There is no destructive schema migration or financial balance recalculation.
New correction metadata is additive. Existing records, IDs, revisions, credentials,
license storage and origin stay intact. Existing archived nonzero accounts/parties
are unarchived on preparation; their amounts/history are unchanged. This repair is
idempotent and uses the existing pre-upgrade safety copy and durable save.
Ambiguous old corrections are not silently guessed or rewritten. Report quantity
accumulators retain unit precision; monetary totals still use existing rounding.

Permissions remain the same create/edit/delete/account-correction capabilities.
Archive visibility changes occur only with the authorized transaction or safe
startup repair; unrelated archived choices remain unavailable for new operations.
Any failed storage write rolls back invoice, balances, archive flags and UI state.

## Verification and release gates

Focused domain checks: signed accounts, stock correction parity and archive lifecycle.
Actual runtime browser checks: Arabic/French signed account forms/restore and archive,
correction, migration and failed-write cases. Existing accounting, import, source
navigation, reports, user recovery, backup and reset gates also run.

The candidate gate compiles native/JVM tests, installs the same permanent-signed APK
over the original v13–v23 APKs with temporary and perpetual licenses (22 scenarios,
66 preservation comparisons), runs a real WebView accounting lifecycle and checks
durability on cold restart. This is isolated synthetic testing; no customer phone
or production service testing is claimed. The release is ready only after actual
CI evidence succeeds. No backend deployment or main merge is part of this change.
