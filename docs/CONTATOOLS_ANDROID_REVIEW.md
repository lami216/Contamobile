# Android review branch — Contatools

Base: `feat/approved-seller-app` at `1efb01fc1cd7bc62670510e57c6158734ad4bf05` (delivered 1.0.12, code 13). Trial: 1.0.13-trial, code 14. No source/main merge or customer distribution.

## Interaction and scope

The existing local login gains one focused “forgot owner password” action, Arabic RTL and French LTR. It explicitly selects an active local owner, submits an administration approval request, shows its state and accepts a new confirmed password only after approval. The sheet has a fixed header, bounded body, visible feedback and standard password keyboard behavior. It does not redesign accounting, introduce service login, restore deleted features, or reset workers.

The server origin and public recovery issuer map are fixed public build metadata. The default trial is deliberately **unconfigured** until a separate HTTPS deployment has been approved and its public issuer pinned. Existing licensed offline operation continues. There is no pre-login editable server/key field and no admin or private review password in an APK. The local protected review runner is not a production endpoint.

## Storage and protocol

Application ID, permanent certificate, WebView asset origin, IndexedDB name/version and native activation state remain unchanged. INTERNET is added only for the native fixed HTTPS channel; WebView remote requests remain blocked and cleartext remains disabled. New storage consists of separate non-exportable installation signing and authenticated reset-journal keys, and a no-backup encrypted atomic journal. None replaces the activation key/document/counters.

Registration transmits the original signed alkarna-license v1/v2 document, Keystore public key/proof, app version, stable shop and owner identifiers/names, and **client-reported** status/remaining time. It never transmits user digests/passwords or accounting data, installs a web permit, starts a new period or imposes remote revocation on a legacy license.

Recovery uses an MFA-owner decision after external claimant verification. The signed short-lived grant is bound to installation, public-key fingerprint, original license hash/ID, device code, local shop, owner and request. A server-claimed single-use intent must be authorized before expiry. Only its signed receipt permits local commit. Pending PBKDF2-SHA256/210000 data is encrypted locally, never uploaded.

Users/password, consumed receipt and owner session invalidation commit in one IndexedDB transaction. No snapshot/business row is written. Reopening replays the same saved intent; a receipt makes duplicate commits idempotent. A separate native consumed ledger survives a business backup restore. A lost server completion response only leaves an acknowledgement retry. Password replacement opens no session.

## Acceptance gates

Run the existing accounting/source/locale/import checks; package verification rejects test issuers in the customer APK. The public Android workflow verifies the actual delivered 1.0.12 → trial install-r with the permanent release certificate, seeded accounting data, owner and worker credentials, original consumed activation and remaining time. Integration tests live in the separate test APK and run against the private Contatools service fixture; its test-only raw loopback transport and issuer injection are never customer assets.

No claim of production readiness is made by this document. Record actual CI runs, signer/version evidence and any untested physical-device/deployment points in the final handoff. Stop if a distributed code higher than 13 or a different installed certificate is discovered.

## Rollback

Keep the original application installed and preserve its data. Do not uninstall, clear app storage or downgrade versionCode. A rollback build must use the same permanent key and a **higher** versionCode, retain additive recovery receipts/keys and restore only the changed channel/UI implementation. Server rollback must preserve SQLite and its WAL, audit, consumed challenges/grants and signing key; never restore an older live database over consumed reset records.
