# Shared accounting domain provenance

The Android institution client reuses these pure modules from the inspected iOS institution implementation under `rescue-work/Contamobile-iOS/platform/shared`. They contain no native bridge, credentials, transport, cached access rights or iOS offline queue. The Android runtime imports the copies inside `approved-runtime/platform/shared` so the asset hash allowlist includes everything it executes.

| Module | SHA-256 of imported source |
| --- | --- |
| `accounting-domain.mjs` | `c36793f59cbd682487c74a450024f8de4fd6f8e2eb76a36b497c9587501f4cd7` |
| `local-identities.mjs` | `ae00c78b7310179ea364c6c1952c54c27456f0e4753a566292ba29c4fa493678` |

`online-command-encoder.mjs` adapts the explicit action-to-command mapping from the inspected `approved-runtime/ios-accounting.js`: it captures record posts/edits/voids, entity changes, opening stock and supported settings as semantic operations. It never converts a snapshot balance difference into an accounting command. Unexplained financial changes fail closed.

Android intentionally has a different access and persistence contract. Institution snapshots are RAM-only and require fresh server admission; no iOS offline entitlement, SQLite RPC or local outbox is copied. The native Android layer owns signing keys, tokens and the encrypted journal of uncertain `sync.push` requests. The UI verifies operation IDs and command hashes on receipts, keeps known conflicts blocked for administrator review, and explicitly reconciles an uncertain original payload before allowing another write. Local licensed shops continue to use `alkarna-site-v1` without changing their existing owner verifier, identity or license clock.
