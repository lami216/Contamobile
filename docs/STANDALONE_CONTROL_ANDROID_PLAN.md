# Standalone Android control: interaction and preservation plan

This candidate starts from the verified local v27 source, without institution accounts or shared accounting. It must also preserve installed v33 local data and all existing activation, recovery, backup and receipt journals.

## Interaction

- Keep one activation screen: device code, copy, a clear service disclosure/consent, remote registration/check and explicit receipt of an administrator-approved activation. There is no institution or cloud-account login. A never-enrolled phone sends its installation public key only after the user requests this remote path; after enrollment, bounded foreground/network checks also work on the blocked screen.
- Existing local users continue using their existing usernames and passwords. Accounting and backups remain local and unchanged.
- Retain manual import as a secondary path. Every new document now needs a fresh, signed online admission before installation; no clock starts and no consumed ID is written until admission succeeds.
- Show Arabic RTL and French LTR states for checking, offline, approval pending, activated, revoked and banned. Preserve entered material after a recoverable network failure, and do not expose signing keys or protocol details in the interface.
- Revocation locks access but retains accounting. Ban additionally prevents new activations. Removing a ban does not reactivate an old document; only a separately approved new activation may restore access.
- Deleting administrative metadata has no effect on the installed activation or deadline.

## Authority and storage

Only a verified, scope-bound signed control decision may change native admission. Reject wrong app/device/install/key/document/nonce, malformed fields, invalid signatures, stale generations and conflicting equal-generation decisions. Persist deny state before reporting it, and enforce it in native licence installation and status checks, not only in the screen.

The existing `activation-v2` authenticated replicas, consumed licence IDs, fixed entitlement deadline, legacy licence clock, installation key and independent lifecycle/recovery/backup receipts remain authoritative. No business database migration or destructive storage reset is part of this change. A signed control policy introduces no accounting authority and no additional licence clock.

Foreground and network events share a bounded native reconciliation request, including while the activation screen is blocked. Missing, invalid or unavailable service replies never revoke an existing valid offline licence. A verified denial blocks new actions; an already accepted local transaction may finish before navigation changes.

## Verification

Exercise signed scope/nonce/replay rejection; revoke and ban persistence across restart and replica repair; admission of a newly approved document only; unban without resurrection; concurrent installs; failed durable writes; offline original-term preservation; v27 and v33 upgrade preservation; existing cloud backup and restore receipts; Arabic/French narrow-screen states. The permanent application identity and signing certificate must remain unchanged.

## Practical limits

An offline phone learns a new administrative denial on its next successful signed reconciliation; an already saved term still expires normally. The service cannot erase accounting or control an unconnected phone immediately. Android application data, Keystore and OS integrity are the trust boundary: factory reset, changed Android device identity, rooted/tampered software or compromised owner signing keys cannot be represented as an absolute hardware-level ban guarantee.
