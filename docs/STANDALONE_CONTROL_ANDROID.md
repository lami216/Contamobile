# Standalone device control in the local Android candidate

The application remains the local accounting product. It contains no institution login, shared online database, institution session store or multi-device accounting workspace. It retains the existing application ID, licence issuers, local user/password storage, accounting schema, backup settings and independent security journals. Release version/API/signing and actual APK admission are separately verified by the release pipeline.

## Activation and control

The existing device activation screen shows the AKD code and an explicit service disclosure/consent. A new phone enrolls its installation public key through the existing signed challenge/dispatch protocol. Its public code alone is not proof of possession. An administrator can then approve a device-bound activation, received on the phone without transferring a licence file. Receiving a new offer remains explicit; background reconciliation only refreshes decisions and completes receipts for an already installed exact issuance.

Manual file/paste import remains an advanced compatibility path. Every new manual or remote installation requests `control.admit` with a fresh native UUID nonce and the exact verified document hash before consuming an ID or starting its native clock. No response, invalid signature/scope/nonce, old policy, or a response whose total monotonic request age exceeds thirty seconds can authorize installation. The native request age includes the challenge exchange, and the observation marker must be native, present and within the request interval.

The signed `contatools-android-standalone-control` payload binds purpose, app ID, installation, installation key fingerprint, AKD, request nonce, queried document hash, monotonic control generation, activation fence, ban state, document verdict and explicit authorization/sequence. It contains no accounting or clock authority. The existing recursively sorted canonical signature format and pinned public issuer keys remain in use.

## Separate administrative decisions

- Deleting the administrative record changes visibility only. It does not change the native licence, fixed deadline or local accounting.
- Revocation rejects the current activation and older documents covered by the activation fence. It retains administrative history.
- A ban additionally rejects every new document for the stable device code, including a new installation key when it reconnects and proves possession.
- Unban removes only the ban. It never restores an old document or starts a clock. A new exact post-fence owner authorization is required. Reactivation uses the existing entitlement offer/claim/finish pipeline with a new document/sequence and the original fixed term; it is not renewal.

The native licence status and every native installation implementation enforce the cached control barrier. Ban and revoked-hash/fence evidence is stored inside the existing authenticated activation replicas, separate from business imports/exports. Replica repair unions revocations and keeps the stronger monotonic policy. A new higher-generation policy cannot silently erase revoked document history. Persistence failure does not acknowledge or expose a half-installed licence.

## Existing customers and clock reconciliation

An already installed signed licence remains usable offline according to its original term when a service reply is unavailable or untrusted. Existing v27 and v33 local data, password records, licence IDs, clock/rollback flags, entitlement deadlines, original backup configuration, recovery journals and pending receipts are preserved. This change does not clear or migrate the business database.

Enrollment reports the original signed installed document and its existing remaining time without reinstalling it. A successful admitted manual import immediately attempts that same original-document report; a failed report leaves the saved local licence and a pending-report hint. Until the exact pre-decision report or registration is known and reconciled, administration must not reset a prior activation through an `initial` fallback. Reactivation preserves the established term; an unknown server clock requires explicit review instead of inventing a new deadline.

Native foreground/connectivity reconciliation runs on both normal and blocked screens after enrollment/consent or an existing installed licence. It reads signed control before the optional legacy status, so a failed or incompatible legacy status cannot hide a verified denial. Requests are serialized and bounded; unavailable replies use backoff. The existing native permission gate rejects new actions immediately after durable denial. Navigation to activation waits for an already accepted local write and draft flush; it does not force-exit, clear data or abort a committed transaction.

## Verification and practical limits

The source includes exact production-callsite assertions for all three installation paths, strict signed-policy JVM tests, separate emulator-only Keystore/native integration cases, and Arabic/French browser cases with no external requests. Browser fixtures simulate the native bridge and do not prove APK execution. The complete signed APK, all original upgrade baselines and full instrumentation are independent release gates; local targeted SDK compilation is not a substitute for them.

The existing package-private licence installer is retained for historical compatibility and the separate test APK's old-version seed fixtures. It is not exposed as a JavaScript/Intent import endpoint: the production bridge goes only through fresh admission. Test signing material and injected transports remain in the independent test APK and are not release switches.

An offline device receives a new server denial only after a successful signed reconnection; the saved term still expires normally. A server cannot erase local bookkeeping or instantly stop an unconnected phone. Protection depends on the Android application/Keystore/OS trust boundary. Factory reset or changed Android identity, rooting/tampering, application-data destruction and compromised issuer keys are not covered by an absolute hardware-level ban guarantee. No production request, deployment, physical-phone installation or issuer rotation is part of this source change.
