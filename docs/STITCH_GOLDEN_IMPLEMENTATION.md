# Stitch golden native Android review

Base branch: `ui-redesign-v2` at `4759e8e70a956a75ae6963608a46e97274743135`.
New branch: `feat/stitch-golden-android`.

## Base selection
The base is the newest mobile development branch (2026-10-01), contains
`ux-rebuild-v2` (260 commits ahead, zero behind), and contains
`agent/ux-parity-refresh-20260923` (198 ahead, zero behind).
The separate `feat/mobile-ui-parity-20260923` branch diverges by 467/104
commits; it is not silently merged into this visual change. The base already
contains the mobile workflows, accounting logic, native design primitives,
and Android release build infrastructure.

## Mobile interaction plan
Preserve routes, bounded lists, native sheets, quantity steppers, persistent
checkout totals/actions, local SQLite services, permissions, history, and
transactional writes. Apply the extracted Stitch navy/gold design through
shared tokens and native surfaces/controls; adapt hubs, dashboard, login,
financial actions, and navigation. No WebView, fake balances, generated demo
transactions, or network-dependent screen rendering. Arabic RTL and French
LTR continue to use the existing locale provider. The HTML exports are
reference artifacts, not part of the APK runtime.

## Android review build
A separate package `mr.alkarna.mobile.golden` allows installation beside the
existing app and isolates its local data. It starts with an empty database.
There is no development client, Metro connection, or debuggable release
manifest. The workflow embeds the JavaScript/Hermes bundle, signs with an
isolated RSA review certificate, verifies signature/manifest/bundle, and
cold-launches on an Android 35 emulator with Wi-Fi and mobile data disabled.
The signing key stays outside Git and the published artifacts. This review
certificate is created per build; later builds may require uninstalling the
previous review APK. It is not a Play Store production signing credential.

## Validation and limits
Local TypeScript/lint and Android JavaScript export passed. Local tests were
blocked by a Windows runtime `os.userInfo` error before execution; the GitHub
Linux quality gate runs the real accounting/print-settings tests. The release
workflow records the actual signature, manifest, cold-launch screenshot, and
runtime logs. Emulator cold launch is a smoke check, not a substitute for
seller workflow testing on the user's physical phone, large catalogs, font
scaling, and French/Arabic switching. This is a native adaptation of the
Stitch visual language; it is not a pixel-for-pixel HTML renderer.
