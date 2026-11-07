# Customer phone replacement — mobile interaction plan

The reviewed v26 tree `6c98a95b2d1a4ae4789fc5ab22480d0d77058c1b` is the baseline. Accounting, users, original device-code calculation, package ID, database paths, signing certificate and service verification keys remain unchanged.

One customer has **one current phone**. A lost or broken phone is replaced by a newly connected phone after verified owner approval. Reinstalling on the same device code creates a new installation key requiring a reviewed rebind, while retaining the same customer, phone history and activation deadline. There is no standby mode or accounting synchronization.

The existing activation page retains its layout and controls. Arabic/French status explains a pending replacement, a received replacement offer, or that this phone was replaced. Receiving an offer is an explicit phone-owner action. A signed decision marking the old phone replaced returns it to activation, preserving all accounting and licence history. A disconnected old phone cannot be stopped instantly; its next authenticated connection obtains the signed decision. An ordinary authorized current phone remains usable offline.

Every newly assigned installation receives a separately signed, device-bound licence and a fixed server entitlement deadline. Installation, reinstall, delayed delivery, lost acknowledgement and retry cannot move that deadline. The claim intent is durably saved before sending it, and licence plus entitlement are saved atomically before a success response. Signed decisions are monotonic; unsigned flags, HTTP failures and network outages never revoke local activation.

The native clock seeds its trusted server sample with the full monotonic dispatch elapsed time, a conservative upper bound on response age. Transport delay therefore cannot become extra licence time. Offline passage continues from the authenticated sample using monotonic/wall elapsed time and backward-clock protection; a new sample cannot reduce elapsed time already observed.

The entitlement barrier is independent of business backups and manual legacy licence import. File import cannot remove a verified replacement barrier. Existing v23–v26 licences and pending restore/reset intents survive an in-place upgrade. No business database is cleared or migrated for this feature.

Uninstall/clear-data removes app-private state and keys. A fresh offline installation holding a valid original legacy file cannot be identified as previously replaced without server contact; legacy offline activation remains supported. The server still protects the canonical current binding and sends its signed replacement decision when contacted. This is not represented as an instant offline revocation guarantee.

The new current phone can separately preview and accept the latest administrator-approved cloud backup using the existing restore flow. Activation does not restore data or move the backup writer automatically. No populated phone is overwritten without the existing safety checks.

Use existing bilingual activation styles, touch targets and status regions. Preserve names on errors, prevent duplicate acceptance and show success only after durable storage. Test Arabic RTL, French LTR, narrow screens, long names, offline/reconnect and cold restart. Focused JVM and Android tests cover signatures/bindings, replay, fixed expiry, delayed acceptance, same-code/new-key reinstallation, lost ACK, replaced-phone notices and unchanged accounting. Physical-phone acceptance remains a separate gate.
