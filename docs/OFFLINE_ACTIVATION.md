# Shared desktop / Android activation contract

## Source and migration record

Reference: `lami216/offline-conta` commit `1b4951947a82ca9da21337c757fe7afdd2329403`, `lib/license.ts`, `lib/license-public-key.ts`, `tests/license.test.mjs`, and `app/api/license/{device,status,install}/route.ts`.

User goal: copy the phone device code into the existing desktop issuer and install its signed license file. No second issuer or signing key is created or included in the phone app.

Inputs: a UTF-8 `.alkarna-license` JSON document, at most 64 KiB. Accept exactly the desktop envelope, `ECDSA_P256_SHA256`, `alkarna-license-v1` or `alkarna-license-v2`, and the original public keys. The signed `edition: desktop` identifier is deliberately retained for issuer compatibility; it is a wire identifier rather than the UI platform label. Device ID, payload schema, key ID, strict unpadded base64url P1363 signature, canonical JSON ordering and signature are checked natively before any protected runtime asset is served.

V1: perpetual licenses retain the original issued-at field. V2: perpetual and temporary licenses retain `activationMode: single-install`; temporary duration begins on installation, counts elapsed time while closed, and locks on expiry or a clock rollback exceeding two minutes. Reinstalling a consumed V2 license ID does not restart the duration. A newly issued license ID can replace an expired/invalid license. The runtime checks activation before actions, native exports/camera/printing, on resume, and every second while open.

Storage: `noBackupFilesDir/activation-v2.json` plus private `activation-v2` preferences, authenticated by a non-exportable Android Keystore HMAC key. Merge replicas toward minimum remaining time / maximum observed clock / persistent terminal flags and the union of consumed IDs. Write the complete signed document and countdown state as one atomic file before acknowledging success. A failed write locks until the app is reopened and durable state is verified. License state and device identity never enter the shop backup, importer, account database or financial calculations. No business-data schema change or reset is involved.

Phone identity: Android `Settings.Secure.ANDROID_ID`, namespaced as `android|<id>`, passed into the desktop formatter unchanged (`mr.alkarna.desktop|device-v1|`, SHA-256, first 20 uppercase hex characters, `AKD-XXXX-XXXX-XXXX-XXXX-XXXX`). This requires no phone/IMEI permission. Android scopes this identifier to the signing identity, device and user; changing the app signing certificate, user/profile, or resetting the device can require a new activation. Keep one release signing key for upgrades. Complete app-data removal/uninstall can erase the offline consumed-ID ledger; no offline Android implementation can promise survival across device resets without external state. Authenticated storage protects ordinary edits, not a rooted device or a modified APK.

Mobile destination: a dedicated compact activation screen before login/setup, with device-code copy, system file selection, optional paste, explicit validation feedback, license owner/store/type, and continue. Settings → Device license reopens it. Arabic RTL, French LTR, dark default and the remembered light appearance are supported. Existing web/standalone previews remain available and preserve their existing data; hardware activation is enforced by the installed Android host.

Permissions: activation is installation-level, before shop accounts exist. User roles and invoice permissions remain unchanged. Activation has no filter, accounting, print or business-export side effect. No external communication or network access is required.

## Verification and remaining acceptance

`prepare-license-fixtures.mjs` generates independent signed fixtures using an ephemeral test key that is never written or packaged in the customer APK. Android instrumentation verifies canonical bytes with Arabic, quotes, slashes, emoji, control characters and lone surrogates; V1/V2 acceptance; exact production public keys; tampering/wrong-device/key/signature/duration/oversize rejection; countdown/closed-time/rollback/expiry; durable activation and consumed IDs; and the startup gate followed by the existing seller workflow. The customer APK is also inspected for the native gate/public keys and the absence of all test issuer code, test fixtures and bypass markers. Strict JSON parsing rejects comments, unquoted keys and trailing content.

The desktop repository contains the verifier and public keys, but no issuer implementation or downloadable issuer release, including the activation feature branches inspected. Wire compatibility can therefore be verified; an end-to-end run of the user's actual existing issuer executable remains pending until that executable or a license it issues for a phone code is available. Do not claim that executable was tested. Do not create a replacement issuer as a workaround.
