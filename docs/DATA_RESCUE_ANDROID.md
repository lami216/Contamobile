# Native Data Rescue review

This is a review implementation on `feat/live-contatools-light-sync-20261027`, based on
`7409123cdad7f8c0365ed30c1416400c8a043b48`. It is not a customer release or a production
deployment. The previously delivered customer reference is 1.0.12/code 13. Existing newer
distributed versions must be checked before choosing any candidate version.

## Inspection and interaction plan (before implementation)

`MainActivity.onCreate` previously constructed WebView immediately. The license is native
and independent: `activation-v2.json`, `activation-v2` preferences and
`alkarna.activation.state.v2` Keystore identity. Owner-reset uses a separate
`RecoveryJournal` (`contatools-v1.json`) and installation EC signing key. Accounting uses
`alkarna-site-v1` IndexedDB on `https://appassets.androidplatform.net`. None of these names,
the app ID, signing certificate, activation clock, users or accounting code is changed.

The plan is one native card before WebView, with the activation screen's palette, font,
border radii and spacing, Arabic RTL/French LTR, scrolling and safe-area padding. The user
first accepts local collection, then separately accepts network transfer. Refusal opens the
normal app without examining IndexedDB. No new card appears without a valid targeted grant.
Appearance and language use the existing native preference bridge. No UI library is added.

## Actual startup boundary

The optional client examines only its own consent/grant metadata at startup. With no cached
grant, MainActivity immediately creates the existing WebView. Eligibility is checked in a
background worker from native identity and original signed license only, independently of
the damaged shop/owner database. Registration for rescue never uploads shop state or users.
The fixed HTTPS endpoint and pinned public issuers remain the existing build metadata.

A grant received after WebView started is cached for the **next complete process start**.
A notification asks the user to close the app completely. The code never copies live
Chromium files: a process-level flag prevents collection after any WebView was created;
an Activity recreation during a copy waits for that copy to finish before WebView can start.

**Normal first-launch limitation:** a pre-Contatools APK has no cached targeted grant or
registered installation. Opening the ordinary app icon after upgrade may initialize
Chromium before enrollment and remote authorization are available. Ordinary startup must
not be described as a safe evidence-preservation procedure. Use the explicit native
support entry below; the actual same-signer upgrade and on-device entry tests still gate
customer use. Merely knowing a device code does not grant access to accounting data.

## Explicit native support entry for an unregistered damaged installation

`RecoverySupportActivity` accepts only an explicit VIEW of `contamobile://data-rescue`.
The secret-free fixed link has no paths, grant contents, file names, query parameters or
commands. All other action/URI combinations are rejected. Opening it never starts
MainActivity or creates a WebView. The existing native license and installation EC identity
are sufficient to enroll and poll without reading the damaged shop or owner database.

The safe support procedure after the candidate has passed its release gates is:

1. Preserve the installed app and its data. Install the verified same-signature higher-code
   update without pressing Open or launching the ordinary app icon.
2. Choose Android app-info **Force stop**, then open `contamobile://data-rescue` directly.
3. The native support screen displays public device and installation IDs. The customer
   shares those IDs with authorized support for human identity/ownership verification.
4. The customer presses the explicit refresh button. Native proof plus the existing signed
   license enroll the installation; there is no accounting read or shop/owner-login dependency.
5. Administration reviews the matching device/license and approves a short-lived case.
6. The customer refreshes again (minimum five seconds between explicit refresh attempts,
   while the normal automatic channel remains at five minutes and respects Retry-After).
   The pinned signed grant is verified, and the existing native consent gate appears.
7. Only explicit local consent permits capture. Export remains encrypted; upload requires
   a separate consent. Closing support returns to Android and does not open accounting.

If any MainActivity WebView has already been created in this process, the support screen
refuses capture and instructs Force stop and reopening the support link. The process-wide
capture/WebView interlock also covers multiple Activities and recreation during capture.
First enrollment requires internet; an absent offline authorization cannot be invented.

A previously received signed grant permits offline local collection until its signed expiry.
The device cannot observe a later server cancellation while offline; the screen discloses
this constraint. Expiry is bounded by a saved server-time/elapsed-realtime anchor and Android
boot count, so moving the wall clock backward does not extend a same-boot grant. After a
phone reboot or when the anchor cannot be verified, offline use is refused until a fresh
online response has been received; another complete process start is then required. This
may prevent a rescue attempt, and must not be described as first-launch evidence protection.
Upload always checks current server state. There is no arbitrary path,
repair, delete-database or remote shell operation.

## Copy and archive

After explicit local consent, `RecoverySnapshot` takes fixed, native-discovered
`app_webview*/Default/IndexedDB` and legacy `app_webview*/IndexedDB` roots inside
`Context.getDataDir()`. It rejects symbolic links below the private boundary, special files,
unsafe paths, excess files/directories, changing files, insufficient space and size limits.
Limits: 4096 entries, 256 MiB total, 64 MiB per file, source depth 20 and at least 16 MiB
reserve beyond twice the source byte count.
The source is opened only for reading. No LevelDB, SQLite or IndexedDB repair API is used.

Transient copies live only in the app's private `no_backup/data-rescue/<case>/snapshot-<id>`.
Every copied file is hashed, its source checked again, and its copied bytes verified again
during archive writing. An encrypted archive is committed before the transient directory is
removed. A crash may leave private transient evidence; the next consented capture of that
same case cleans only the strictly named snapshot directory. Cleanup cannot target WebView.
The local package stays available if export or upload fails. No complete app directory,
activation state, preferences or Keystore key is included.

The manifest has `schema`, `version`, `caseId`, `installationId`, `capturedAt`, `complete`
and `files` entries with `path`, `size`, `modifiedAt`, `sha256`, `status`, `error`. Status is
`copied`, `missing`, `empty` or `failed` (safe error code, never an absolute path). A raw file
is evidence, not proof that an accounting state is recoverable. Native logical decoding and
advanced Chromium LevelDB/V8 decoding are not implemented here.

The package is `CTRESC1\n` (8 bytes), big-endian 32-bit header length, canonical UTF-8 JSON
header, and AES-256-GCM ciphertext/tag. Header fields are `schema:contatools-rescue-package`,
`version:1`, `caseId`, `installationId`, `encryptionKeyId`, base64url `iv` and `wrappedKey`.
The header bytes are authenticated as GCM AAD. The plaintext is a ZIP containing
`manifest.json` and `files/<manifest path>`. The fresh AES key is wrapped to the signed
grant's dedicated RSA public key using OAEP SHA-256 with MGF1 SHA-256. No private key is
exported. SAF exports only this encrypted `.ctrescue` package to the user's chosen place.

## Separate resumable transfer

`DataRescueClient` uses `/api/android/rescue/challenge`, `/dispatch` and `/chunk` with the
existing canonical `contatools-device-proof` domain, hash binding and installation EC proof.
Operations: `enroll`, `poll`, `consent`, `begin`, `status`, `chunk`, `complete`.
The normal dispatch request limit stays unchanged. Only the dedicated rescue routes allow
the 192 KiB binary chunk as base64url within a 300 KiB JSON request. TLS validation and
redirect refusal are unchanged. Begin identifies the immutable package by total size and
SHA-256; the server returns already received indices. Retries skip those chunks and resend
the same package. Every chunk has a SHA-256, completion checks the whole archive, and the
server enforces expiry/revocation/device binding. Stop prevents subsequent chunks; a request
already in transit may finish. Failure never changes original accounting files.

## Verification status

The raw snapshot self-test and the protocol/package checks use synthetic files and ephemeral
keys only. The six existing approved-runtime checks cover navigation, reports, party totals,
French locale, feature domains and imports. Exact commands/results are recorded in the final
handoff; source inspection does not substitute for runtime execution.

Executed locally with an official Temurin 17 JRE and Eclipse ECJ Java 17 compiler:

- `RecoverySnapshotSelfTest`: 19 passed, 1 skipped because this Windows host cannot create
  symbolic links, 0 failed. Includes byte-identical binary/blob copies, missing/empty roots,
  source-preservation hashes, size/count/free-space limits, changed files, interruption and
  cleanup boundary tests. Linux CI runs the actual symbolic-link refusal check.
- `RecoveryProtocolChecks`: 33 passed, 0 failed, including the fixed support entry policy,
  wrong installation/key/license,
  issuer/signature/tampering/expiry, monotonic clock and reboot rejection, authenticated
  RSA-OAEP/AES-GCM package round-trip, archive hash/content, and unchanged original bytes.
- All six existing approved-runtime scripts passed. The feature-domain script reports 15
  checks and the import script 20 checks. The ignored pinned SQLite asset was verified by
  SHA-256 before the import test; the initial missing-asset failure was resolved before rerun.
- `git diff --check` passed. Full Android compilation and on-device results remain pending
  until the new CI workflow or a prepared Android environment executes them.

`verify-data-rescue-entry.mjs` passed the explicit-entry architecture assertions. The added
device instrumentation `RecoverySupportEntryTest` verifies no WebView is present, no
WebView-created flag change, no new capture directory or encrypted/partial evidence file,
and unchanged SHA-256 hashes of an existing synthetic IndexedDB sentinel. The dedicated
invocation uses `rescueRequireColdEntry=true` to require a fresh process and removes only its
own synthetic sentinel/directories afterward. Its execution result must be recorded
separately; merely adding the test is not device verification. Protocol checks also exercise
the fixed action/URI policy and reject path/query/fragment/credential/port payloads.

Remaining release gates: compile the entire Android app with the actual SDK, UI checks on
small screens in Arabic/French and both themes, actual on-device process restart and
network/power interruption, independently tested server interoperability, and the real
1.0.12/code13 → higher candidate in-place upgrade with the permanent signing certificate,
seeded synthetic accounting and activation preserved. No signing key, version assertion or
prior APK hash is guessed, and no test result is claimed until it has actually run.

`data-rescue-safety.yml` runs the independent Java safety suites, existing accounting/locale
regressions and whole-app debug Java compilation/unit tests on the exact development branch.
It has read-only repository permissions and uses no release signing secrets. It does not
replace the same-signer upgrade or physical-device UI gates and produces no customer APK.
