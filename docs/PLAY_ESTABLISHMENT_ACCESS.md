# Establishment access and Play submission contract

The owner agrees the commercial terms with a shop independently, outside Google
Play and outside the app. The app provides access and device authorization. It
does not collect payment, a transfer receipt, payment credentials, or a purchase
instruction. Administrative approval is not proof of a payment transaction.

## Customer experience

- Use **حساب منشأة / Compte d’établissement** for both operating modes. A local
  installation keeps its ledger on one phone; a shared institution needs a live
  connection. Keep the actual storage and connectivity disclosure accurate.
- A phone identifier contains exactly eight digits beginning 2, 3 or 4. Submitting
  an identifier and secret creates an administrative device request. The owner
  must verify it against the customer contacted independently before approval.
  A phone-shaped identifier is not proof of ownership of that number.
- Contatools records the customer's details, shop and term and issues a signed
  activation for that installation. The app receives and accepts that authority
  directly. No separate activation-file creation tool is needed for this path.
- Preserve importing an already-owned license file for compatibility. Remove
  activation/renewal sales invitations and their WhatsApp links from that page.
  Technical support must not function as an in-app purchase funnel.
- A valid existing local installation opens its usual local sign-in flow. It
  does not have to register a phone account, upload its ledger, change its owner,
  or convert to online accounting. Explicit account switching remains available.

## Term and administration

A fixed signed term expires locally without an internet connection. A fresh
signed suspension received during a service check persists across restart and
legacy/manual entry; loss of network alone does not suspend a working local
license. An offline phone cannot learn a new remote decision until it contacts
the service, and remains limited by its existing fixed deadline. Suspending or
resuming access must not alter that deadline or erase accounting data.

An approved renewal must use the same customer, installation, owner and shop
scope, durable monotonic authority and a recoverable license/binding handoff.
Logging in again, receiving an old response or retrying delivery must not start
another term. The phone must not enter the owner account without the required
credential merely because a renewal was approved.

## Submission tasks

Before submitting the app, deploy and verify the reviewed companion service,
publish a working privacy URL, complete accurate Data safety/deletion answers,
and supply reusable reviewer access to every restricted workflow. Reviewers must
not wait for the owner to identify and approve their physical phone manually.
Reviewer credentials belong only in the appropriate private Play Console fields,
not in the source repository or customer APK. No production deployment or Play
submission is implied by preparing a signed test APK.

Saved-data upgrade tests are distinct from preserving an open session or an
unsaved form. Finish and save current work before an in-place update; do not
uninstall or clear app data. Test a representative phone before wider rollout.

## Policy basis, checked 2026-11-11

- [Google's Payments FAQ](https://support.google.com/googleplay/android-developer/answer/10281818?hl=en)
  allows any app to be consumption-only. This is not a company-name exemption.
  The FAQ permits some purchasing information without direct links; choosing
  neutral access/support copy here is a conservative product decision, not a
  claim that every mention of a price or renewal is categorically prohibited.
- [Payments policy](https://support.google.com/googleplay/android-developer/answer/9858738?hl=en)
  includes registration/sign-up flows that lead to prohibited outside payment.
  Free registration and technical license import are not themselves payments.
- [Review access](https://support.google.com/googleplay/android-developer/answer/15748846?hl=en)
  must remain usable and permit review of all app functionality.
- [Account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en)
  must be assessed against the actual service-account creation flow, rather than
  assuming that naming an account an establishment makes it exempt.

These implementation controls do not constitute a guarantee of Google approval.
