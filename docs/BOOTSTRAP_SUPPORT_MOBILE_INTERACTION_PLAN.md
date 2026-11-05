# Exceptional cloud restore support — v26 interaction plan

## Verified starting point and scope

Mobile remote `6dd9c848f6358eeb8c280350e734d8c055292ac8` and local `2c43390460530c65542a9e900a6a40f6c3e3d617` share tree `75d115dd515ee1f930e3e7d9053c596c31b47778`. Service remote `ead779eeea1966407722ebb952da5ad7e5db2759` and local `e58a90da8b939e3256fbe9134219e8522f081463` share tree `dd217db931ef92255126be9ef924a233cbf43587`. Both are clean starting points for `feat/bootstrap-support-replacement-20261105`; neither main nor the published server is changed by this work.

Existing v25 evidence: signed exact APK, isolated Android instrumentation with injected transport (six lifecycle cases), separate service HTTP tests, and v13–24 update preservation. This is not a physical-phone test or a claim of Android-to-production acceptance. The published commit and v17 URL supplied by Hermes are reported deployment references, subject to read-only artifact verification.

## User jobs and safe paths

- Ordinary interruption with the phone still available: resume the identical local intent and receipt; no new support action.
- Lost replacement after claiming: tool owner reviews the recorded unknown outcome, the exact client/stream/old intent/current writer, and a separately activated new phone. Explicit confirmations explain that old downloaded data cannot be erased remotely. Administrative authorization alone does not transfer the writer or create a license/subscription.
- New phone: existing blank-phone preview and explicit confirmation stay in place. No silent overwrite, and the accounting backup never imports activation.
- Returning old phone: a verified signed terminal outcome preserves its intent, claim, encrypted pending bytes and any local DB receipt. Stop old prepare/finish retries. Clearly distinguish a matching local commit receipt from an unknown result; never infer “not restored” from a missing server ACK. Accounting and activation remain usable under their existing rules.

## Interface and localization

Reuse the existing recovery overlay and admin dialog/list styles. The exceptional support path is a secondary, owner-only action on a bounded searchable attempt history. Support accounts can inspect history only. New support UI has Arabic/RTL and French/LTR labels, state names and confirmations. Reasons/names are text nodes, not HTML.

Keep the normal restore task unchanged. Terminal phone UI has a clear status and close action, no action to repeat the old import/finish, and no endless polling. An empty phone may explicitly check a different new approval, then preview and accept it; native archives the original terminal attempt without removing its evidence. If a durable matching accounting receipt exists and account state has not loaded, reload those existing accounts. Do not log out an already loaded account merely because its terminal receipt is cached. Otherwise leave local data untouched. Preserve form inputs, selected backup/phone and request ID during lookup or a recoverable error.

## Verification and limits

Exercise small widths, both languages, long names, keyboard-height changes, canceled dialogs, lost replies, stale state and repeat requests. Add browser state tests separately from actual Android instrumentation. Upgrade gates must include exact v17 and v25 APKs with both license types and stable data/activation/device identity. Service tests must prove a real two-connection race using a synchronization barrier, independent-journal split failure, old-DB rollback, retention and reset interlocks.

A real phone is not available here. Deliver a short Arabic physical-phone acceptance sheet marked **not executed**, and preserve the exact previous v25 artifact. No deployment, main merge, credential rotation or production customer operation is authorized.
