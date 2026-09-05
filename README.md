# الكرنه — Contamobile

Android-first, offline-first mobile edition of the desktop **الكرنه** accounting and shop-management application.

The mobile application is a React Native / Expo rewrite of the desktop behavior. It does **not** embed the Next.js/Electron UI and does not require the desktop server at runtime.

## Stack

- Expo SDK 57
- React Native 0.86
- React 19
- TypeScript 6 in strict mode
- Expo Router
- `expo-sqlite` with WAL + explicit migrations
- `expo-secure-store` for the local session
- `expo-print` + `expo-sharing` for local PDF documents
- Arabic RTL and French LTR from one codebase

## Requirements

- Node.js 22.13 or newer
- npm 10+
- Android Studio / Android SDK for local native testing, or Expo Go where supported
- EAS CLI for cloud APK/AAB builds

## Install

```bash
npm install
```

## Quality gate

```bash
npm run check
```

GitHub Actions also runs a real Android Metro export:

```bash
npx expo export --platform android --output-dir dist-check
```

A change is not release-ready if TypeScript, ESLint, tests, or the Android export fails.

## Run on Android

```bash
npm run android
```

or:

```bash
npx expo start
```

## Build installable Android packages

The repository contains `eas.json` with two Android profiles.

Preview APK for direct installation/testing:

```bash
npx eas-cli build --platform android --profile preview
```

Production Play Store AAB:

```bash
npx eas-cli build --platform android --profile production
```

The first EAS build may ask the repository owner to link/create the Expo project and Android signing credentials. Signing secrets are intentionally not committed to Git.

## Offline data model

The app stores operational data in the local SQLite database `alkarna-mobile.db` and does not require an internet connection for accounting work.

Core data includes:

- products and per-warehouse quantities;
- warehouses and stock movements;
- sales, purchases, expenses and accounting documents;
- customers and suppliers with receivable/payable balances;
- payment accounts and financial movements;
- account transfers and opening-balance corrections;
- local users and permission assignments;
- invoice/business branding;
- audit events and local settings.

Multi-entity accounting operations use exclusive SQLite transactions so stock, debt, documents and money movements commit or roll back together.

## Desktop data migration

Settings includes a guarded **desktop backup import** flow for the official `conta-backup` JSON produced by the desktop application.

Before import the app:

1. validates the backup format and relationships;
2. shows a record-count preview;
3. creates a safety backup of the existing mobile database;
4. imports products, stocks, warehouses, parties, documents, financial movements, accounts and compatible desktop users in one transaction;
5. rebuilds mobile counters and validates the authentication schema.

Desktop recurring-expense definitions that are present in historical backups are preserved as legacy metadata instead of silently discarded.

## Backup and restore

Mobile backups are local JSON snapshots. Restore validates the schema and creates a safety backup before replacing data. Usernames and authentication metadata are included so enabling local users does not make a restored backup unusable.

## Users and permissions

If no user exists, the application starts in the desktop-compatible local-owner mode. After users are configured, sign-in uses local username/password accounts.

Passwords use a desktop-compatible scrypt contract. A local session is stored in SecureStore and expires after 12 hours.

Permissions are enforced both in navigation and inside protected screens/actions. Deep-linking to a hidden route does not bypass the capability check.

## Documents

Posted documents remain part of the accounting history. Supported sale/purchase/expense edit and void flows reverse their previous stock, debt and financial effects before applying the new state inside an exclusive transaction.

Branded documents can be rendered and shared as PDF fully offline.

## Localization

- Arabic: RTL
- French: LTR

Formatting and navigation adapt to the selected locale without maintaining two independent applications.

## Architecture and migration notes

Read these before changing accounting behavior:

- `AGENTS.md`
- `docs/SOURCE_AUDIT.md`
- `docs/MOBILE_PARITY.md`
- `.agents/skills/`

The source desktop repository is treated as the behavioral reference. Desktop-only implementation details such as Electron, Node HTTP routes and `better-sqlite3` are intentionally not copied into the mobile runtime.

## Branch / release policy

Active migration work is developed and verified on `mobile-v1`. Merge to `main` only after the mobile quality workflow is green on the final release candidate.
