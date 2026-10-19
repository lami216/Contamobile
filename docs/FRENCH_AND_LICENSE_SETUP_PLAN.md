# Complete French edition and licensed first setup

Reference: offline-conta `app/i18n/messages.ts`, `formatting.ts`, `locale.ts`, and `app/locale-layout.css`. Reuse its Arabic/French terminology and direction rules, without copying desktop geometry.

- Remove the seller-facing sample transaction action and sample onboarding choice. New shops always start empty. Existing saved records are preserved. Demo fixtures remain available to development tests only.
- Keep Arabic and complete French in the same runtime. Expose the language choice before login and activation as well as Settings. French uses LTR structure, logical alignment, localized system messages, dates and output documents. User-entered names, notes and financial data are not rewritten or translated.
- Extend the shared text dictionary with the desktop catalogue and explicit mobile templates. Audit every reachable screen, sheet, validation state and output, in both appearances and narrow viewports.
- Read verified licence identity through the native bridge before first setup. Use the signed customer/store names for the first owner/store; ask only for local login credentials. Never import a password from a licence, overwrite an existing shop on renewal, or weaken signature/expiry checks.
- Authenticated support describes assistance and renewal, without telling an already activated user to request initial activation. The activation screen keeps its activation instructions.
- Verify empty setup, successful/invalid/renewed licences, existing accounts, language persistence, original user strings, source navigation, financial totals, exports, and Android offline startup. Publish only on `feat/approved-seller-app`.
