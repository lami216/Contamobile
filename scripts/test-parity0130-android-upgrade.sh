#!/usr/bin/env bash
set -euo pipefail
app=mr.alkarna.mobile.approved
runner=$app.test/androidx.test.runner.AndroidJUnitRunner

proof_dir=android-parity0130-proof
mkdir -p "$proof_dir"
# Host-only bounded diagnostics: never print environment, process arguments or
# signing material. Preserve the test's original exit status if collection fails.
host_diagnostics() {
 local label=$1
 {
  date -u '+%Y-%m-%dT%H:%M:%SZ'
  timeout 5s free -m
  timeout 5s df -h . /tmp
  timeout 5s ps -eo pid,comm,rss --sort=-rss | sed -n '1,31p'
  if [ -r /sys/fs/cgroup/memory.events ]; then timeout 5s cat /sys/fs/cgroup/memory.events; fi
 } > "$proof_dir/host-$label.txt" 2>&1 || true
 {
  (timeout 5s dmesg --color=never --time-format iso 2>/dev/null || timeout 5s sudo -n dmesg --color=never --time-format iso 2>/dev/null) |
   grep -Ei '(qemu|emulator).*(oom|out of memory|killed process|segfault)|(oom|out of memory|killed process|segfault).*(qemu|emulator)' | tail -n 80
 } > "$proof_dir/host-$label-kernel.txt" 2>/dev/null || true
}
finish_candidate() {
 local status=$?
 trap - EXIT
 host_diagnostics after
 if [ "$status" -ne 0 ]; then
  printf 'Original test exit status: %s\n' "$status" > "$proof_dir/host-failure.txt"
  cat "$proof_dir/host-after.txt" >> "$proof_dir/host-failure.txt" 2>/dev/null || true
 fi
 exit "$status"
}
test "$(adb devices | awk 'NR>1 && $2=="device" {n++} END {print n+0}')" = 1
test "$(adb shell getprop ro.kernel.qemu | tr -d '\r')" = 1

preservation_progress() {
 printf 'PRESERVATION %s baseline=v%s activation=%s phase=%s candidate=v%s\n' "$1" "$baseline" "$type" "$2" "$CANDIDATE_VERSION_CODE" | tee -a "$proof_dir/preservation-progress.txt"
}
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
trap finish_candidate EXIT
host_diagnostics before
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

# Only immutable signed inputs produced once by this workflow may be installed.
: "${ANDROID_PARITY0130_MODE:?native or upgrade required}"
case "$ANDROID_PARITY0130_MODE" in native|upgrade) ;; *) exit 1;; esac
CANDIDATE_VERSION_CODE=40
export ANDROID_PARITY0130_MODE
inputs=build-parity0130
python3 - <<'PY'
import hashlib,json,os,subprocess
from pathlib import Path
root=Path('build-parity0130');m=json.loads((root/'inputs.json').read_text())
assert m['schema']=='alkarna-parity0130-signed-inputs-v1'
assert m['sourceHead']==os.environ['GITHUB_SHA'] and m['runId']==os.environ['GITHUB_RUN_ID']
assert subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()==m['sourceHead']
assert set(m['files'])=={'alkarna-1.0.39-v40.apk','app-release-androidTest.apk','baseline-v27.apk','baseline-v39.apk','jvm-summary.json'}
for name,digest in m['files'].items():
 assert '/' not in name and '\\' not in name and hashlib.sha256((root/name).read_bytes()).hexdigest()==digest,name
for name,digest in m['sourceFiles'].items():
 assert not name.startswith('/') and '..' not in Path(name).parts
 assert hashlib.sha256(Path(name).read_bytes()).hexdigest()==digest,name
assert m['files']['baseline-v27.apk']=='174da0f4e076250cda7aa436f9b776d1b6bebd5c60a6cd543d5702b9ac4a55e3'
assert m['files']['baseline-v39.apk']=='bca79ebb844ac18c65ea8ece27dc4cc3ee1aee8e5e60bae025143fb11bbe2b4d'
PY
candidate=$inputs/alkarna-1.0.39-v40.apk
test_apk=$inputs/app-release-androidTest.apk
python3 scripts/verify-approved-signature.py "$inputs/baseline-v27.apk" "$inputs/baseline-v39.apk" "$candidate" "$test_apk"
adb install -r "$candidate" | tee "$proof_dir/initial-candidate-install.txt"
grep -q Success "$proof_dir/initial-candidate-install.txt"
adb install -r "$test_apk"
adb shell pm clear "$app"
assert_offline initial-network true
if [ "$ANDROID_PARITY0130_MODE" = native ]; then
assert_offline standalone-control-network-before true
adb shell am instrument -w -e class mr.alkarna.mobile.approved.StandaloneControlTest -e standaloneControlIsolation true "$runner" | tee "$proof_dir/StandaloneControlTest.txt"
assert_offline standalone-control-network-after
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
proof=Path('android-parity0130-proof');suites=[]
for suite,prefix in [('StandaloneControlTest','STANDALONE CONTROL CASE PASS'),('CloudBackupTest','CLOUD BACKUP CASE PASS'),('AccountingResetTest','ACCOUNTING RESET CASE PASS'),('OwnerUsernameRecoveryTest','OWNER USERNAME RECOVERY CASE PASS'),('AccountingParityTest','ACCOUNTING PARITY CASE PASS'),('DeviceCloudLifecycleTest','DEVICE CLOUD LIFECYCLE CASE PASS'),('BootstrapSupportOutcomeTest','BOOTSTRAP SUPPORT OUTCOME CASE PASS'),('PhoneReplacementTest','PHONE REPLACEMENT CASE PASS')]:
 source=(sources/f'{suite}.java').read_text(encoding='utf-8')
 expected=re.findall(r'@Test\b(?:\([^)]*\))?\s+public\s+void\s+(\w+)\s*\(',source)
 assert len(expected)>=(1 if suite=='AccountingParityTest' else 6) and len(expected)==len(set(expected)),f'Incomplete source scenario manifest: {suite}'
 if suite=='PhoneReplacementTest':assert len(expected)==8,'All eight customer phone replacement cases are required'
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
# Fresh synthetic data for the independent accounting/activation/support-entry suite.
for group in ActivationConcurrencyTest BusyBackNavigationTest; do
 adb shell pm clear "$app"
 adb shell am instrument -w -e class "mr.alkarna.mobile.approved.$group" "$runner" | tee "android-parity0130-proof/$group.txt"
 case "$group" in
  ActivationConcurrencyTest) expected_tests=5 ;;
  BusyBackNavigationTest) expected_tests=2 ;;
 esac
 grep -Eq "^OK \($expected_tests tests\)" "android-parity0130-proof/$group.txt"
done
adb shell pm clear "$app"
adb shell am force-stop "$app"
adb shell am instrument -w -e class mr.alkarna.mobile.approved.RecoverySupportEntryTest -e rescueRequireColdEntry true "$runner" | tee android-parity0130-proof/native-support-cold-entry.txt
grep -Eq '^OK \(1 test\)' android-parity0130-proof/native-support-cold-entry.txt
adb shell pm clear "$app"
adb shell am instrument -w -e class mr.alkarna.mobile.approved.RecoveryCaptureDeviceTest "$runner" | tee android-parity0130-proof/real-capture-device.txt
grep -Eq '^OK \(1 test\)' android-parity0130-proof/real-capture-device.txt
adb shell pm clear "$app"
assert_offline offline-suites-network-before
adb shell am instrument -w -e notClass mr.alkarna.mobile.approved.StandaloneControlTest,mr.alkarna.mobile.approved.UpgradePersistenceTest,mr.alkarna.mobile.approved.Desktop862UpgradeTest,mr.alkarna.mobile.approved.Desktop870UpgradeTest,mr.alkarna.mobile.approved.Desktop879UpgradeTest,mr.alkarna.mobile.approved.Desktop882UpgradeTest,mr.alkarna.mobile.approved.Recovery39UpgradeTest,mr.alkarna.mobile.approved.Desktop0130UpgradeTest,mr.alkarna.mobile.approved.ContatoolsRecoveryTest,mr.alkarna.mobile.approved.AccountingParityTest,mr.alkarna.mobile.approved.DeviceCloudLifecycleTest,mr.alkarna.mobile.approved.BootstrapSupportOutcomeTest,mr.alkarna.mobile.approved.PhoneReplacementTest,mr.alkarna.mobile.approved.OwnerUsernameRecoveryTest,mr.alkarna.mobile.approved.ActivationConcurrencyTest,mr.alkarna.mobile.approved.BusyBackNavigationTest,mr.alkarna.mobile.approved.CloudBackupTest,mr.alkarna.mobile.approved.AccountingResetTest,mr.alkarna.mobile.approved.RecoverySupportEntryTest,mr.alkarna.mobile.approved.RecoveryCaptureDeviceTest "$runner" | tee android-parity0130-proof/offline-suites.txt
# Preserve bounded diagnostics from this synthetic emulator before the strict
# success gate exits. Collection never retries a test or changes its outcome.
if ! grep -Eq '^OK \([0-9]+ tests?\)' android-parity0130-proof/offline-suites.txt; then
 mkdir -p "$proof_dir/native-failure-diagnostics"
 for diagnostic in qa-failure-export.json qa-failure-ui.xml qa-failure-screen.png; do
  timeout 10s adb pull "/sdcard/Android/data/$app/files/$diagnostic" "$proof_dir/native-failure-diagnostics/$diagnostic" >> "$proof_dir/native-failure-diagnostics/collection.txt" 2>&1 || true
 done
 timeout 10s adb logcat -d -t 250 -s AlKarna:E AlKarnaJS:E AndroidRuntime:E > "$proof_dir/native-failure-diagnostics/logcat.txt" 2>&1 || true
fi
grep -Eq '^OK \([0-9]+ tests?\)' android-parity0130-proof/offline-suites.txt
assert_offline offline-suites-network-after

else
 : "${UPGRADE_BASELINE:?27 or 39 required}"
 case "$UPGRADE_BASELINE" in 27|39) ;; *) echo 'Unexpected original baseline' >&2;exit 1;;esac
 baseline=$UPGRADE_BASELINE
 if [ "$baseline" = 39 ]; then
  suite=Desktop0130UpgradeTest
  seed=seedDesktop0130PreviousVersion
  verify=verifyDesktop0130AfterInPlaceUpdate
 else
  suite=UpgradePersistenceTest
  seed=seedPreviousVersion
  verify=verifyAfterInPlaceUpdate
 fi
 adb shell am force-stop "$app"
 adb uninstall "$app"
 first=true
 for type in temporary perpetual; do
  if [ "$first" = false ]; then adb uninstall "$app";fi
  first=false
  label=v$baseline-$type
  adb install -r "$inputs/baseline-v$baseline.apk"
  adb install -r "$test_apk"
  assert_offline "$label-network-before" true
  preservation_progress BEGIN seed-before
  adb shell am instrument -w -e class "$app.$suite#$seed" -e expectedVersionCode "$baseline" -e upgradeLicenseType "$type" "$runner" | tee "$proof_dir/$label-before.txt"
  grep -Eq '^OK \(1 test\)' "$proof_dir/$label-before.txt"
  adb shell am force-stop "$app"
  sleep 2
  # These are real package replacements. No clear, uninstall, restore or
  # activation import is permitted from here until this scenario finishes.
  adb install -r "$candidate" | tee "$proof_dir/$label-install-r.txt"
  grep -q Success "$proof_dir/$label-install-r.txt"
  adb shell am instrument -w -e class "$app.$suite#$verify" -e expectedVersionCode 40 -e expectedFeatureSchema 4 -e requireOfflineElapsed true "$runner" | tee "$proof_dir/$label-after.txt"
  grep -Eq '^OK \(1 test\)' "$proof_dir/$label-after.txt"
  adb shell am force-stop "$app"
  adb shell am instrument -w -e class "$app.$suite#verifyAfterOfflineColdRestart" -e expectedVersionCode 40 -e expectedFeatureSchema 4 "$runner" | tee "$proof_dir/$label-cold-restart.txt"
  grep -Eq '^OK \(1 test\)' "$proof_dir/$label-cold-restart.txt"
  adb shell am force-stop "$app"
  adb install -r "$candidate" | tee "$proof_dir/$label-repeat-install-r.txt"
  grep -q Success "$proof_dir/$label-repeat-install-r.txt"
  adb shell am instrument -w -e class "$app.$suite#verifyAfterRepeatedInPlaceUpdate" -e expectedVersionCode 40 -e expectedFeatureSchema 4 "$runner" | tee "$proof_dir/$label-repeat-after.txt"
  grep -Eq '^OK \(1 test\)' "$proof_dir/$label-repeat-after.txt"
  preservation_progress PASS repeat-after
  assert_offline "$label-network-after"
 done
fi
assert_offline final-network
adb logcat -d -s AlKarna:E AlKarnaJS:E AndroidRuntime:E > "$proof_dir/runtime-errors.txt"
if grep -q 'FATAL EXCEPTION' "$proof_dir/runtime-errors.txt";then cat "$proof_dir/runtime-errors.txt";exit 1;fi
python3 - <<'PY'
import hashlib,json,os,re
from pathlib import Path
proof=Path('android-parity0130-proof');root=Path('build-parity0130');inputs=json.loads((root/'inputs.json').read_text())
for name,digest in inputs['files'].items():assert hashlib.sha256((root/name).read_bytes()).hexdigest()==digest
mode=os.environ['ANDROID_PARITY0130_MODE'];checks=[]
if mode=='upgrade':
 baseline=int(os.environ['UPGRADE_BASELINE']);assert baseline in (27,39)
 for activation in ('temporary','perpetual'):
  for phase in ('before','after','cold-restart','repeat-after'):
   text=(proof/f'v{baseline}-{activation}-{phase}.txt').read_text()
   assert re.search(r'^OK \(1 test\)',text,re.M),phase
   assert not re.search(r'AssumptionFailed|SKIPPED|INSTRUMENTATION_FAILED|FAILURES!!!|INSTRUMENTATION_RESULT: shortMsg=',text,re.I),phase
   checks.append({'baseline':baseline,'activation':activation,'phase':phase,'passed':True})
else:
 source=Path('approved-android/app/src/androidTest/java/mr/alkarna/mobile/approved')
 exclude={'StandaloneControlTest','UpgradePersistenceTest','Desktop862UpgradeTest','Desktop870UpgradeTest','Desktop879UpgradeTest','Desktop882UpgradeTest','Recovery39UpgradeTest','Desktop0130UpgradeTest','ContatoolsRecoveryTest','AccountingParityTest','DeviceCloudLifecycleTest','BootstrapSupportOutcomeTest','PhoneReplacementTest','OwnerUsernameRecoveryTest','ActivationConcurrencyTest','BusyBackNavigationTest','CloudBackupTest','AccountingResetTest','RecoverySupportEntryTest','RecoveryCaptureDeviceTest'}
 expected=sum(len(re.findall(r'@Test\b(?:\([^)]*\))?\s+public\s+void\s+(\w+)\s*\(',p.read_text())) for p in source.glob('*.java') if p.stem not in exclude)
 text=(proof/'offline-suites.txt').read_text();assert re.search(r'^OK \('+str(expected)+r' tests?\)',text,re.M),(expected,text[-1000:])
 for file in proof.glob('*.txt'):
  assert not re.search(r'AssumptionFailed|SKIPPED|INSTRUMENTATION_FAILED|FAILURES!!!|INSTRUMENTATION_RESULT: shortMsg=',file.read_text(errors='replace'),re.I),str(file)
 checks=json.loads((proof/'native-scenario-summary.json').read_text())['suites']
 native_count=sum(suite['executed'] for suite in checks)+5+2+1+1+expected
 assert native_count==75,('All75 existing native scenarios must execute, without upgrade fixture leakage',native_count)
result={'schema':'alkarna-parity0130-android-result-v1','sourceHead':inputs['sourceHead'],'runId':inputs['runId'],'candidateSha256':inputs['files']['alkarna-1.0.39-v40.apk'],'testApkSha256':inputs['files']['app-release-androidTest.apk'],'mode':mode,'baseline':os.environ.get('UPGRADE_BASELINE'),'passed':True,'checks':checks,'excludedProductionIntegrationClass':'ContatoolsRecoveryTest requires a separately signed mock-service build; production APK never contacts that fake backend.'}
result['nativeTestCount']=native_count if mode=='native' else None
(proof/'result.json').write_text(json.dumps(result,indent=2)+'\n')
PY
