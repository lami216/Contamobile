---
name: mobile-pos-product-ux
description: Design and review seller-first mobile workflows for Contamobile, especially POS, payment, cart, product selection, barcode/search, quick quantity changes, recent activity, and other high-frequency shop operations.
metadata:
  project: Contamobile
  version: "1.0"
---

# Seller-first Mobile POS/Product UX

## Core principle
The seller is operating the shop, not filling out a database form. Optimize for repeated daily completion speed while preserving accounting correctness.

## Priority order
When choices conflict, prioritize:
1. financial/data correctness;
2. clarity of current state and amount;
3. fastest safe path for the common case;
4. one-handed reachability;
5. recovery from mistakes;
6. visual polish.

## Interaction budget
For every common workflow, explicitly reduce:
- navigation depth;
- number of taps;
- keyboard openings;
- required scrolling;
- precision targets;
- repeated choices whose safe default is already known.

Do not optimize unusual edge cases at the expense of the daily path. Keep edge cases available through progressive disclosure.

## POS layout model
A strong phone POS should normally have:
- immediate search/scanner access;
- fast product results or frequent/recent products;
- direct add action;
- cart rows optimized for quantity and price scanning;
- stepper controls for common quantity changes;
- persistent cart summary and checkout action;
- focused payment surface (bottom sheet/modal/step) rather than a long tail of fields;
- obvious success/reset path for the next sale.

Do not require the seller to scroll to the bottom to find the total or checkout button.

## Product selection
- Tapping a product should have an obvious predictable result.
- Search must tolerate long catalogs and avoid loading the entire database without a bound.
- Show the minimum information required to distinguish products: name, SKU/barcode when useful, price, and availability when relevant.
- Frequently used products may receive a faster path if real app data can support it without inventing behavior.
- Barcode scanning may be added when supported by the project stack, but text/barcode search must remain usable without camera permission.

## Cart behavior
- Keep product name, quantity, unit price, and line total scannable.
- Use `- / quantity / +` controls for normal changes; allow direct numeric edit as a secondary path for large/decimal quantities.
- Removing an item must be quick but not easy to trigger accidentally.
- The cart total must update immediately from local draft state while durable accounting write still occurs only on final confirmation.
- Avoid full-screen editors for tiny cart changes.

## Payment behavior
- Treat the common paid sale as the default path when compatible with existing business rules.
- Show total before confirmation.
- Payment method choices must be clear and permission/data aware.
- Credit and partial payment paths must require the needed party/account context without cluttering the common path.
- Use a focused surface and keep the seller's cart context intact.
- Prevent double-submit while posting.

## Home/dashboard behavior
The home screen should answer:
- What should I do next?
- How is today going?
- Is anything urgent?
- What just happened?

Prefer an obvious `New sale` entry, compact essential metrics, attention items, and recent activity over a wall of generic statistic cards.

## High-frequency list behavior
For products, parties, records, and inventory:
- search is immediate and easy to reach;
- rows expose the 2–4 values needed to make a decision;
- common row actions are reachable without opening a full editor;
- editing remains available without making accidental mutation easy;
- large datasets remain virtualized/bounded.

## One-handed review
For each daily task, verify:
- main action is in the lower or otherwise thumb-reachable region when practical;
- no tiny icon is the only access path;
- controls remain usable with keyboard open;
- the flow survives small Android screens;
- the user does not need to alternate repeatedly between top and bottom of a long screen.

## Anti-patterns
Reject these unless there is a concrete reason:
- desktop-form field sequences copied to phone;
- scroll-to-submit for common operations;
- separate page for every small choice;
- keyboard entry for quantity `1 → 2 → 3`;
- generic cards used as the only information architecture;
- hiding totals for aesthetic minimalism;
- repeated confirmation dialogs for harmless reversible actions;
- animation that blocks or delays work.

## Done criteria
A workflow is not done until its common path has been walked tap-by-tap and avoidable friction has been removed. Feature parity alone is insufficient.
