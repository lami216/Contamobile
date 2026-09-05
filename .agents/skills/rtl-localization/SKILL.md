---
name: rtl-localization
description: Implement and review Arabic RTL and French/LTR localization in Contamobile. Use for layouts, text, icons, navigation, forms, dates, currencies, number formatting, direction switching, translations, or any bilingual UI work.
metadata:
  project: Contamobile
  version: "1.0"
---

# Arabic RTL + French LTR

## Principle
Localization changes layout behavior, not just strings. Arabic and French must each look like the app was designed for that language.

## Direction
- Use React Native/Expo direction facilities; do not fake RTL by reversing arrays or globally setting `textAlign: right`.
- Prefer logical concepts: start/end rather than hardcoded left/right when meaning follows reading direction.
- Mirror directional navigation icons (back/forward/chevrons) when semantics require it; do not mirror universal symbols such as play, search, check, plus, or brand marks without reason.
- Test both directions on device/emulator after navigation/layout changes.

## Layout
- Flex row ordering must make sense in both directions.
- Leading/trailing icons should be semantic, not visually hardcoded.
- Avoid absolute left/right positioning for important UI when a logical layout works.
- Charts and timelines require explicit review: data direction and language direction are not always the same concept.

## Text
- Keep translations in structured locale files; no user-facing strings scattered through components.
- Use simple, clear French suitable for everyday shop users rather than formal accounting jargon when a plain term exists.
- Keep Arabic clear and practical.
- Allow text to wrap. Do not design buttons/cards around one language's string length.
- Avoid fixed text heights unless truncation is a deliberate product decision.

## Numbers, dates, and money
- Format for the selected locale consistently.
- Preserve numeric precision and business meaning regardless of display locale.
- Never parse a localized formatted money string as the source of truth for calculations.
- Date storage and date display are separate concerns; store unambiguous values and format at the UI boundary.

## Input
- Names/notes must accept Arabic and Latin text.
- Numeric fields should use appropriate keyboards without assuming Latin text direction for surrounding labels.
- Search should handle the application's real Arabic/French naming patterns and whitespace safely.

## Language switching
If in-app language switching is implemented:
- persist the preference locally;
- apply both translation and layout direction;
- reload/re-render only as required by the platform implementation;
- do not leave mixed-language stale screen titles;
- test switching while nested in navigation and after a cold restart.

## QA matrix
For every major screen test:
- Arabic RTL;
- French LTR;
- long Arabic label;
- long French label;
- large amount/quantity;
- empty state;
- keyboard-open form;
- small Android width.

## Source note
Expo SDK localization support follows React Native `I18nManager`; modern Expo supports RTL and documents using start/end semantics so layouts adapt naturally. Follow the current Expo version in the repository when implementation begins.
