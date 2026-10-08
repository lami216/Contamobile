# Approved seller application — Android

The functional local site approved on 2026-10-08 is the presentation and business-behavior reference for this build. `approved-runtime/reference-sha256.json` pins that version. Original Expo/SQLite sources remain available; this APK uses the approved local site's durable IndexedDB stores inside Android WebView. It is intentionally an embedded-web Android application, not a React Native recreation of every screen.

## Interaction plan
Preserve the approved Arabic RTL screens, compact numbered fixed-width tables, 50-row list pages, scroll chaining, semantic dark/light themes (dark default), tolerant Arabic search, invoice filters/details, direct numeric line editors, cash flows in all four directions, opening-stock rules, local users/permissions, backup/import, and full report export. Preserve all current desktop-preview files outside this repository while preparing the APK.

The Android adapter replaces only platform boundaries: external document picker/save dialog for JSON/XLSX/PDF, Android printing, Android back/keyboard/insets, and CameraX plus bundled ML Kit barcode decoding. No localhost process, development server, external site, permission bypass, analytics or runtime download is required. The merged Android manifest removes INTERNET permission. Camera permission is requested only when scanning; manual barcode entry always works.

## Storage and updates
Package `mr.alkarna.mobile.approved` installs alongside the old golden application and has separate local data. Start a new shop or use the website's JSON backup/import to transfer shop data; private records and password hashes are never packaged or committed. IndexedDB stores persist across cold launch and app updates with the same package/signature; uninstalling or clearing Android app storage removes them. Export regular backups through the system file picker. The internal-review release uses Gradle's review/debug signing identity but is not debuggable; it is an installable review APK, not a Play Store release credential.

## Build
Run `python3 scripts/prepare-approved-android.py`, then Gradle 8.13 with `gradle -p approved-android :app:assembleRelease`. The workflow `approved-site-apk.yml` builds and verifies the installer, then runs the approved seller workflow on an Android 35 emulator with Wi-Fi and mobile data disabled. It checks creation, opening stock, selling, invoice/register rendering, and cold-launch persistence, and publishes screenshots and test reports.

Physical-phone camera, keyboard and printer behavior still require acceptance on the user's device. Emulator tests are evidence of the tested workflows, not a guarantee for every device or every possible accounting sequence.
