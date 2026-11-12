# Local snapshot coalescing and cloud-copy scheduling

Local sales never await cloud backup. The backup payload and encrypted native
storage remain version 1; there is no compression, differential chain, local-data
migration, license change or replacement of existing consent/Wi-Fi/daily/weekly
choices. The shared online accounting ledger does not use this optional local
backup path.

Before cloning/validating/serializing a shop, automatic staging now reads only its
persisted backup revision. An unchanged revision skips the full snapshot. When
needed, `cloudSnapshot()` remains one coherent readonly IndexedDB transaction;
serialization/hashing/native transfer occur after that transaction, not inside
an accounting write. Failed sales cannot advance the revision.

The automatic snapshot window is explicit: 1.5 s (legacy default), 15 s, 60 s or
5 min. Existing settings without the field keep 1.5 s. A first-dirty deadline
prevents a continuous stream of sales from postponing a snapshot indefinitely.
The UI explains that local changes remain only on the device until a snapshot is
prepared and uploaded successfully. Pending counts are committed backup revisions,
not a claim about the number of invoices; last successful cloud acknowledgement
and the next/retry time remain visible. Manual “back up now” bypasses the window
and retains its separate explicit consent and existing subscription/network rules.

Do not defer fresh snapshot creation until a daily/weekly upload is due: a native
background job can upload an already staged encrypted snapshot but cannot read
WebView IndexedDB after the app closes. Such a shortcut would silently increase
the unsaved-to-cloud data window. This implementation deliberately avoids it.

Existing connected-mode start jitter (2–5 s) and retry backoff are retained. An
additional explicit opt-in spreads daily/weekly starts by at most 30 s, with the
chosen effective time persisted and displayed; repeated scheduling does not keep
pushing the time forward. Missing settings keep this extra spread disabled.
Manual operations bypass this spread. Android still may defer background jobs;
the UI makes no exact-alarm or closed-app push guarantee.

Native UI progress is checkpointed at the first/final chunk, every eight chunks
or at least every second. Pending upload identity, consent, staged snapshots,
cryptographic checks and final acknowledgements retain their durable writes.
Progress itself is not authority: restart resumes from the server's immutable
received-chunk receipt. For a fast 171-chunk transfer this changes progress-only
metadata checkpoints from 171 to 23; this is a policy count, not a measured Android
Keystore time saving. The new native test recreates storage with stale progress,
keeps two received chunks on the service and checks exact bytes without duplicates.

## Measurements and reproduction

Run `scripts/benchmark-local-backup.mjs` with Playwright and
`BACKUP_BASELINE_RUNTIME` set to a read-only checkout of the previous approved
runtime. Optional `PLAYWRIGHT_MODULE`/`PLAYWRIGHT_CHROMIUM_EXECUTABLE` select the
test-only browser. Reports are written under `benchmark-proof/` and are not runtime
assets. Small/medium/large synthetic shops contain 100/5000/20000 records, about
15 KB/763 KB/3.08 MB, with seven samples per path on the recorded host.

On Windows 10.0.26200, Node 24.22.1, Chromium 156, i7-10610U/8 logical CPUs/16 GiB,
ten unchanged automatic attempts performed ten full snapshots before and zero
after. For 3.08 MB, unchanged-revision read p95 changed from 102.5 ms to 1.6 ms;
at 763 KB, 34.2→0.7 ms. Dirty full-snapshot work still costs roughly 200 ms at
3 MB on this host; it is not claimed faster. Concurrent local-save p95 was about
619→602 ms and is noisy, so no sale-speed or capacity guarantee follows.
The benchmark measures actual IndexedDB, validation, JSON, SHA256 and concurrent
ShopDatabase.save. It does not measure Android Keystore/native staging, a real
invoice on a physical phone, radio/network costs, or production capacity.

The pure policy and browser regressions cover legacy defaults, bounded windows,
unchanged-revision fast paths, explicit timing/RPO text, opt-in spread, pending
revision counts, consent, restore invalidation, open forms and Arabic/French UI.
Native JVM/instrumentation tests are a separate execution gate. No real customer
data, backup upload, Rescue or reset was used, and no APK/server was published.
