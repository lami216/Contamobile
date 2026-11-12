set -euo pipefail
app=mr.alkarna.mobile.approved
runner=$app.test/androidx.test.runner.AndroidJUnitRunner

test "$(adb shell getprop ro.kernel.qemu | tr -d '\r')" = 1
proof_dir=candidate-proof
mkdir -p "$proof_dir"
# Keep every synthetic fixture offline even if a guest service re-enables a link.
# This root/firewall setup is allowed only after proving this is an emulator.
# adbd restarts when root is requested; recent emulator images can close that
# first transport before returning a reply. Retry readiness only, never a test
# or business operation, and prove emulator/root identity before continuing.
root_ready=false
: > "$proof_dir/root-readiness.txt"
for attempt in 1 2 3; do
 echo "root readiness attempt $attempt" >> "$proof_dir/root-readiness.txt"
 if [ "$attempt" -gt 1 ]; then
  if ! timeout 30s adb wait-for-device >> "$proof_dir/root-readiness.txt" 2>&1; then continue; fi
  retry_emulator=''
  if retry_emulator=$(timeout 10s adb shell getprop ro.kernel.qemu 2>> "$proof_dir/root-readiness.txt" | tr -d '\r'); then :;else retry_emulator='';fi
  if [ "$retry_emulator" != 1 ]; then
   echo 'Emulator identity could not be reverified; refusing another root request' >> "$proof_dir/root-readiness.txt"
   cat "$proof_dir/root-readiness.txt" >&2
   exit 1
  fi
 fi
 if timeout 15s adb root >> "$proof_dir/root-readiness.txt" 2>&1; then :; else
  echo 'Root request transport closed or timed out; verifying actual device state' >> "$proof_dir/root-readiness.txt"
 fi
 if timeout 30s adb wait-for-device >> "$proof_dir/root-readiness.txt" 2>&1; then
  actual_uid='';actual_emulator=''
  if actual_uid=$(timeout 10s adb shell id -u 2>> "$proof_dir/root-readiness.txt" | tr -d '\r'); then :;else actual_uid='';fi
  if actual_emulator=$(timeout 10s adb shell getprop ro.kernel.qemu 2>> "$proof_dir/root-readiness.txt" | tr -d '\r'); then :;else actual_emulator='';fi
  echo "verified uid=$actual_uid emulator=$actual_emulator" >> "$proof_dir/root-readiness.txt"
  if [ "$actual_uid" = 0 ] && [ "$actual_emulator" = 1 ]; then root_ready=true;break;fi
  if [ -n "$actual_emulator" ] && [ "$actual_emulator" != 1 ]; then
   cat "$proof_dir/root-readiness.txt" >&2
   exit 1
  fi
 fi
 if [ "$attempt" -lt 3 ]; then sleep 1;fi
done
if [ "$root_ready" != true ]; then cat "$proof_dir/root-readiness.txt" >&2;exit 1;fi
cat "$proof_dir/root-readiness.txt"
: > "$proof_dir/network-egress-block.txt"
for firewall in iptables ip6tables; do
 if ! adb shell "$firewall" -w 5 -n -L ALKARNA_SYNTHETIC_OFFLINE >/dev/null 2>&1; then
  adb shell "$firewall" -w 5 -N ALKARNA_SYNTHETIC_OFFLINE
 fi
 if ! adb shell "$firewall" -w 5 -C ALKARNA_SYNTHETIC_OFFLINE '!' -o lo -j REJECT >/dev/null 2>&1; then
  adb shell "$firewall" -w 5 -A ALKARNA_SYNTHETIC_OFFLINE '!' -o lo -j REJECT
 fi
 if ! adb shell "$firewall" -w 5 -C OUTPUT -j ALKARNA_SYNTHETIC_OFFLINE >/dev/null 2>&1; then
  adb shell "$firewall" -w 5 -I OUTPUT 1 -j ALKARNA_SYNTHETIC_OFFLINE
 fi
 adb shell "$firewall" -w 5 -C OUTPUT -j ALKARNA_SYNTHETIC_OFFLINE
 adb shell "$firewall" -w 5 -S ALKARNA_SYNTHETIC_OFFLINE >> "$proof_dir/network-egress-block.txt"
done
adb shell ip link set dev eth0 down
adb shell cmd connectivity airplane-mode enable
adb shell svc wifi disable
adb shell svc data disable
adb shell ip -o link show > "$proof_dir/network-interfaces.txt"
assert_offline() {
 local label=$1 wait_for_teardown=${2:-false} attempts=1 required=1 passed=0 attempt
 if [ "$wait_for_teardown" = true ]; then attempts=20; required=2; fi
 for ((attempt=1; attempt<=attempts; attempt++)); do
  adb shell am instrument -w -e class mr.alkarna.mobile.approved.CandidateNetworkIsolationTest "$runner" > "$proof_dir/$label-attempt-$attempt.txt"
  if grep -Eq '^OK \(1 test\)' "$proof_dir/$label-attempt-$attempt.txt"; then
   passed=$((passed+1))
   if [ "$passed" -ge "$required" ]; then
    cat "$proof_dir/$label-attempt-$attempt.txt" | tee "$proof_dir/$label.txt"
    return 0
   fi
  else passed=0; fi
  if [ "$attempt" -lt "$attempts" ]; then sleep 1; fi
 done
 cat "$proof_dir/$label-attempt-$attempts.txt"
 adb shell dumpsys connectivity > "$proof_dir/$label-connectivity.txt"
 return 1
}
: "${CANDIDATE_VERSION_CODE:?Set the verified candidate versionCode}"
: "${CANDIDATE_APK:?Set the exact signed candidate APK path}"
: "${BASELINE_VERSION_CODES:?Set the verified published baseline versionCodes}"
[[ "$CANDIDATE_VERSION_CODE" =~ ^[0-9]+$ ]]
test "$CANDIDATE_VERSION_CODE" = 30
candidate=$CANDIDATE_APK
test_apk=approved-android/app/build/outputs/apk/androidTest/release/app-release-androidTest.apk
test -s "$candidate"
test -s "$test_apk"
sha256sum --check candidate-output/SHA256SUMS.txt
read -r -a baselines <<< "$BASELINE_VERSION_CODES"
test "${#baselines[@]}" -gt 0
# All sixteen originally distributed versions are mandatory for this candidate.
# A shortened matrix must fail rather than silently drop preservation checks.
test "${baselines[*]}" = '13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29'
for baseline in "${baselines[@]}"; do
 [[ "$baseline" =~ ^[0-9]+$ ]]
 test "$baseline" -lt "$CANDIDATE_VERSION_CODE"
 test -s "baseline-v$baseline/alkarna-approved.apk"
done
# Fail fast on the isolated backup fixture before the full preservation matrix.
# This fixture is removed completely before the first original-version scenario.
adb install -r "$candidate" | tee "$proof_dir/cloud-backup-install.txt"
grep -q Success "$proof_dir/cloud-backup-install.txt"
adb install -r "$test_apk"
adb shell pm clear "$app"
assert_offline account-access-network-before true
adb shell am instrument -w -e class mr.alkarna.mobile.approved.AccountAccessTest -e accountAccessIsolation true "$runner" | tee "$proof_dir/AccountAccessTest.txt"
grep -Eq '^OK \(9 tests\)' "$proof_dir/AccountAccessTest.txt"
assert_offline account-access-network-after
adb shell pm clear "$app"
assert_offline offline-account-control-network-before true
adb shell am instrument -w -e class mr.alkarna.mobile.approved.OfflineAccountControlTest -e offlineAccountIsolation true "$runner" | tee "$proof_dir/OfflineAccountControlTest.txt"
assert_offline offline-account-control-network-after
adb shell pm clear "$app"
assert_offline cloud-backup-network-before true
adb shell am instrument -w -e class mr.alkarna.mobile.approved.CloudBackupTest -e cloudBackupIsolation true "$runner" | tee "$proof_dir/CloudBackupTest.txt"
assert_offline cloud-backup-network-after
adb shell pm clear "$app"
assert_offline accounting-reset-network-before true
adb shell am instrument -w -e class mr.alkarna.mobile.approved.AccountingResetTest -e accountingResetIsolation true "$runner" | tee "$proof_dir/AccountingResetTest.txt"
assert_offline accounting-reset-network-after
adb shell pm clear "$app"
assert_offline owner-username-recovery-network-before true
adb shell am instrument -w -e class mr.alkarna.mobile.approved.OwnerUsernameRecoveryTest -e ownerUsernameRecoveryIsolation true "$runner" | tee "$proof_dir/OwnerUsernameRecoveryTest.txt"
assert_offline owner-username-recovery-network-after
adb shell pm clear "$app"
assert_offline accounting-parity-network-before true
adb shell am instrument -w -e class mr.alkarna.mobile.approved.AccountingParityTest -e accountingParityIsolation true "$runner" | tee "$proof_dir/AccountingParityTest.txt"
assert_offline accounting-parity-network-after
adb shell pm clear "$app"
assert_offline device-cloud-lifecycle-network-before true
adb shell am instrument -w -e class mr.alkarna.mobile.approved.DeviceCloudLifecycleTest -e deviceCloudLifecycleIsolation true "$runner" | tee "$proof_dir/DeviceCloudLifecycleTest.txt"
assert_offline device-cloud-lifecycle-network-after
adb shell pm clear "$app"
assert_offline bootstrap-support-outcome-network-before true
adb shell am instrument -w -e class mr.alkarna.mobile.approved.BootstrapSupportOutcomeTest -e bootstrapSupportOutcomeIsolation true "$runner" | tee "$proof_dir/BootstrapSupportOutcomeTest.txt"
assert_offline bootstrap-support-outcome-network-after
adb shell pm clear "$app"
assert_offline phone-replacement-network-before true
adb shell am instrument -w -e class mr.alkarna.mobile.approved.PhoneReplacementTest -e phoneReplacementIsolation true "$runner" | tee "$proof_dir/PhoneReplacementTest.txt"
assert_offline phone-replacement-network-after
python3 - <<'PY'
import json,re
from pathlib import Path
sources=Path('approved-android/app/src/androidTest/java/mr/alkarna/mobile/approved')
proof=Path('candidate-proof');suites=[]
for suite,prefix in [('AccountAccessTest','ACCOUNT ACCESS CASE PASS'),('OfflineAccountControlTest','OFFLINE ACCOUNT CONTROL CASE PASS'),('CloudBackupTest','CLOUD BACKUP CASE PASS'),('AccountingResetTest','ACCOUNTING RESET CASE PASS'),('OwnerUsernameRecoveryTest','OWNER USERNAME RECOVERY CASE PASS'),('AccountingParityTest','ACCOUNTING PARITY CASE PASS'),('DeviceCloudLifecycleTest','DEVICE CLOUD LIFECYCLE CASE PASS'),('BootstrapSupportOutcomeTest','BOOTSTRAP SUPPORT OUTCOME CASE PASS'),('PhoneReplacementTest','PHONE REPLACEMENT CASE PASS')]:
 source=(sources/f'{suite}.java').read_text(encoding='utf-8')
 expected=re.findall(r'@Test\b(?:\([^)]*\))?\s+public\s+void\s+(\w+)\s*\(',source)
 assert len(expected)>=(1 if suite=='AccountingParityTest' else 6) and len(expected)==len(set(expected)),f'Incomplete source scenario manifest: {suite}'
 if suite=='PhoneReplacementTest':assert len(expected)==8,'All eight customer phone replacement cases are required'
 if suite=='AccountAccessTest':assert len(expected)==8,'All eight durable online account access cases are required'
 if suite=='OfflineAccountControlTest':assert len(expected)==15,'All fifteen direct activation, renewal and persistent-control cases are required'
 if suite=='AccountingResetTest':
  required={'resetExitRequiresConsumedScopedReceiptAndIsOneShot','ownerConsentExitsTaskBeforeAckAndLauncherReopensFreshSetupWithoutClosingAgain'}
  assert required<=set(expected),'Native owner-consent exit and one-shot receipt scenarios are mandatory'
 text=(proof/f'{suite}.txt').read_text(encoding='utf-8')
 assert not re.search(r'AssumptionFailed|SKIPPED|INSTRUMENTATION_FAILED|FAILURES!!!|INSTRUMENTATION_RESULT: shortMsg=',text,re.I),f'Incomplete execution: {suite}'
 executed=re.findall(r'^'+re.escape(prefix)+r' (\w+)\s*$',text,re.M)
 assert len(executed)==len(set(executed)) and set(executed)==set(expected),f'Missing, duplicate or unexpected executed {suite} cases: {executed}; expected {expected}'
 assert re.search(r'^OK \('+str(len(expected))+r' tests?\)',text,re.M),f'Executed JUnit count differs from scenario manifest: {suite}'
 suites.append({'suite':suite,'executed':len(executed),'cases':sorted(executed),'passed':True})
(proof/'native-scenario-summary.json').write_text(json.dumps({'suites':suites},indent=2)+'\n',encoding='utf-8')
PY
adb shell am force-stop "$app"
adb uninstall "$app"
# Each independent synthetic scenario keeps one installation throughout the first
# upgrade, a force-stopped offline cold start and a second install-r of the same APK.
# Reset only BETWEEN scenarios, never between these preservation checks.
first=true
network_teardown_pending=true
for baseline in "${baselines[@]}"; do
 previous=baseline-v$baseline/alkarna-approved.apk
 for type in temporary perpetual; do
  if [ "$first" = false ]; then adb uninstall "$app"; fi
  first=false
  label=v$baseline-$type
  adb install -r "$previous"
  adb install -r "$test_apk"
  assert_offline "$label-network" "$network_teardown_pending"
  network_teardown_pending=false
  adb shell am instrument -w -e class mr.alkarna.mobile.approved.UpgradePersistenceTest#seedPreviousVersion -e expectedVersionCode "$baseline" -e upgradeLicenseType "$type" "$runner" | tee "candidate-proof/$label-before.txt"
  grep -Eq '^OK \(1 test\)' "candidate-proof/$label-before.txt"
  adb shell am force-stop "$app"
  # An observable offline interval must be charged to temporary activation.
  sleep 2
  adb install -r "$candidate" | tee "candidate-proof/$label-install-r.txt"
  grep -q Success "candidate-proof/$label-install-r.txt"
  adb shell am instrument -w -e class mr.alkarna.mobile.approved.UpgradePersistenceTest#verifyAfterInPlaceUpdate -e expectedVersionCode "$CANDIDATE_VERSION_CODE" -e requireOfflineElapsed true "$runner" | tee "candidate-proof/$label-after.txt"
  grep -Eq '^OK \(1 test\)' "candidate-proof/$label-after.txt"
  adb shell am force-stop "$app"
  adb shell am instrument -w -e class mr.alkarna.mobile.approved.UpgradePersistenceTest#verifyAfterOfflineColdRestart -e expectedVersionCode "$CANDIDATE_VERSION_CODE" "$runner" | tee "candidate-proof/$label-cold-restart.txt"
  grep -Eq '^OK \(1 test\)' "candidate-proof/$label-cold-restart.txt"
  adb shell am force-stop "$app"
  adb install -r "$candidate" | tee "candidate-proof/$label-repeat-install-r.txt"
  grep -q Success "candidate-proof/$label-repeat-install-r.txt"
  adb shell am instrument -w -e class mr.alkarna.mobile.approved.UpgradePersistenceTest#verifyAfterRepeatedInPlaceUpdate -e expectedVersionCode "$CANDIDATE_VERSION_CODE" "$runner" | tee "candidate-proof/$label-repeat-after.txt"
  grep -Eq '^OK \(1 test\)' "candidate-proof/$label-repeat-after.txt"
  assert_offline "$label-network-after"
 done
done
# Fresh synthetic data for the independent accounting/activation/support-entry suite.
for group in ActivationConcurrencyTest BusyBackNavigationTest; do
 adb shell pm clear "$app"
 adb shell am instrument -w -e class "mr.alkarna.mobile.approved.$group" "$runner" | tee "candidate-proof/$group.txt"
 case "$group" in
  ActivationConcurrencyTest) expected_tests=5 ;;
  BusyBackNavigationTest) expected_tests=2 ;;
 esac
 grep -Eq "^OK \($expected_tests tests\)" "candidate-proof/$group.txt"
done
adb shell pm clear "$app"
adb shell am force-stop "$app"
adb shell am instrument -w -e class mr.alkarna.mobile.approved.RecoverySupportEntryTest -e rescueRequireColdEntry true "$runner" | tee candidate-proof/native-support-cold-entry.txt
grep -Eq '^OK \(1 test\)' candidate-proof/native-support-cold-entry.txt
adb shell pm clear "$app"
adb shell am instrument -w -e class mr.alkarna.mobile.approved.RecoveryCaptureDeviceTest "$runner" | tee candidate-proof/real-capture-device.txt
grep -Eq '^OK \(1 test\)' candidate-proof/real-capture-device.txt
adb shell pm clear "$app"
assert_offline offline-suites-network-before
adb shell am instrument -w -e notClass mr.alkarna.mobile.approved.AccountAccessTest,mr.alkarna.mobile.approved.OfflineAccountControlTest,mr.alkarna.mobile.approved.UpgradePersistenceTest,mr.alkarna.mobile.approved.ContatoolsRecoveryTest,mr.alkarna.mobile.approved.AccountingParityTest,mr.alkarna.mobile.approved.DeviceCloudLifecycleTest,mr.alkarna.mobile.approved.BootstrapSupportOutcomeTest,mr.alkarna.mobile.approved.PhoneReplacementTest,mr.alkarna.mobile.approved.OwnerUsernameRecoveryTest,mr.alkarna.mobile.approved.ActivationConcurrencyTest,mr.alkarna.mobile.approved.BusyBackNavigationTest,mr.alkarna.mobile.approved.CloudBackupTest,mr.alkarna.mobile.approved.AccountingResetTest,mr.alkarna.mobile.approved.RecoverySupportEntryTest,mr.alkarna.mobile.approved.RecoveryCaptureDeviceTest "$runner" | tee candidate-proof/offline-suites.txt
grep -Eq '^OK \([0-9]+ tests?\)' candidate-proof/offline-suites.txt
assert_offline offline-suites-network-after
adb logcat -d -s AlKarna:E AlKarnaJS:E AndroidRuntime:E > candidate-proof/runtime-errors.txt
if grep -q 'FATAL EXCEPTION' candidate-proof/runtime-errors.txt; then
 cat candidate-proof/runtime-errors.txt
 exit 1
fi
python3 - <<'PY'
import json,re
from pathlib import Path
root=Path('candidate-proof')
checks=[]
for baseline in range(13,30):
 for activation in ('temporary','perpetual'):
  for phase in ('after','cold-restart','repeat-after'):
   filename=root/f'v{baseline}-{activation}-{phase}.txt'
   text=filename.read_text(encoding='utf-8')
   assert re.search(r'^OK \(1 test\)',text,re.M),f'Missing executed preservation check: {filename}'
   assert not re.search(r'AssumptionFailed|SKIPPED|INSTRUMENTATION_FAILED|FAILURES!!!',text,re.I),f'Incomplete preservation check: {filename}'
   checks.append({'baseline':baseline,'activation':activation,'phase':phase,'passed':True})
assert len(checks)==102
(root/'preservation-summary.json').write_text(json.dumps({'candidateVersionCode':30,'upgradeScenarios':34,'preservationChecks':102,'checks':checks},indent=2)+'\n',encoding='utf-8')
PY
sha256sum --check candidate-output/SHA256SUMS.txt
sha256sum "$candidate" > candidate-proof/after-test-sha256.txt
