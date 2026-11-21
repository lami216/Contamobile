# Desktop 862 Android in-place upgrade gate

This gate uses the original distributed APK34 (1.0.33), not a reconstruction of
its assets or an imported backup. It creates records through that APK's native
WebView, replaces only the application APK using `adb install -r`, then verifies
the candidate. The installed package and permanent APK signing certificate must
match. No uninstall, data clear, database replacement or backup restore is allowed
between seed and verification.

Original artifact: `ContaMobile-1.0.33-v34.apk`.

SHA-256: `d5f53c6d2dcf3f4735ae4889cdb742e99d31cba34884939b93ee0127845b1572`.

## Explicit instrumentation phases

Use a fresh isolated Android emulator, disable networking before the seed, and
install the dedicated instrumentation APK. Each command below is the value of
the instrumentation `class` argument in package
`mr.alkarna.mobile.approved.test/androidx.test.runner.AndroidJUnitRunner`.

1. On original APK34:
   `mr.alkarna.mobile.approved.Desktop862UpgradeTest#seedDesktop862PreviousVersion`
   with `expectedVersionCode=34` and `upgradeLicenseType=temporary` or `perpetual`.
2. Force-stop the application, wait at least two seconds, then install the
   same-certificate candidate APK using `adb install -r`.
3. On the candidate:
   `mr.alkarna.mobile.approved.Desktop862UpgradeTest#verifyDesktop862AfterInPlaceUpdate`
   with the actual candidate `expectedVersionCode`, `expectedFeatureSchema=3`,
   and `requireOfflineElapsed=true`.
4. Force-stop, then run:
   `mr.alkarna.mobile.approved.Desktop862UpgradeTest#verifyAfterOfflineColdRestart`
   with the same candidate version argument.
5. Force-stop, install that identical candidate again using `adb install -r`,
   then run:
   `mr.alkarna.mobile.approved.Desktop862UpgradeTest#verifyAfterRepeatedInPlaceUpdate`.

The existing `UpgradePersistenceTest` supplies the separate original APK27
regression path using `seedPreviousVersion`, `verifyAfterInPlaceUpdate`, and the
two cold/repeat methods. Exclude both upgrade classes from the ordinary native
suite: their tests are ordered phases, not independently runnable unit tests.

## Evidence captured

- All old IndexedDB stores, original product opening stock, sale/purchase,
  receipts/payments, customer/supplier balances, both real password hashes,
  local preferences and actual old-app POS/expense drafts survive.
- The old 0.149 unit-price invoice keeps its original 0.15 total. Historical
  money is never recomputed using the new exact-total rule.
- Schema2 becomes schema3 through exactly one durable revision. Only the
  declared additive schema/cache fields are permitted. The pre-862 migration
  snapshot must equal the old state in both directions; all old field values
  and metadata are checked.
- Both original owner/worker passwords actually log in. French/light
  preferences, original device code, APK certificate, license ID/type/countdown,
  consumed activation, installation ID and installation key fingerprint survive.
- The original Android Keystore private identity must sign a fresh challenge
  verifiable with its old public key. Comparing an identifier string alone is
  insufficient.
- An actual encrypted locally staged cloud-backup blob decrypts after APK
  replacement. Backup consent, weekly schedule, owner/shop attachment, signed
  remote-control generation/fence and a consumed lifecycle authorization persist.
- After preservation checks pass, the real candidate WebView posts a salary500,
  withdrawal200 and reserve300, an opening debt100 without a cash movement, a
  classified expense30, and an explicit invoice total100/quantity3. The source
  action locates the invoice without opening the editor.
- The final checkpoint includes those new records. Offline cold restart and a
  second identical APK replacement compare every store in both directions,
  rejecting duplicate accruals, migration commits or other unexpected writes.

The native cloud fixture is offline staged state, not a claimed successful live
server upload. Its signing issuer is test-only material inside the separate
instrumentation environment; it does not modify production issuer keys or the
permanent APK signing key. Emulator guards prevent seeding a customer's phone.

## Local validation and limit

Both test classes passed Java17 syntax/type compilation against the installed
Android36 SDK and production native classes. AndroidX lifecycle/runner entry
points used compile-only shells in this local check. This is not an APK build
or an executed instrumentation result. Only the dedicated emulator workflow
output can establish the actual in-place upgrade outcome.
