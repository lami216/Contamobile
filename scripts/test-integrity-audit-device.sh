set -euo pipefail
app=mr.alkarna.mobile.approved
runner=$app.test/androidx.test.runner.AndroidJUnitRunner
test "$(adb shell getprop ro.kernel.qemu | tr -d '\r')" = 1
proof_dir=audit-proof
mkdir -p "$proof_dir"
# Airplane mode does not disable the AOSP emulator's Ethernet transport. Block
# egress in the disposable guest before any synthetic activation/account exists.
adb root
timeout 30s adb wait-for-device
test "$(adb shell id -u | tr -d '\r')" = 0
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
test_apk=approved-android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
# The baseline is an unchanged source build in a disposable emulator, not a customer APK.
adb install -r audit-baseline/approved-android/app/build/outputs/apk/debug/app-debug.apk
adb install -r "$test_apk"
assert_offline network-isolation true
adb shell am instrument -w -e class mr.alkarna.mobile.approved.ActivationConcurrencyTest#staleCheckpointCannotRevertRenewalOrForgetItsConsumedId "$runner" | tee audit-proof/baseline-expected-failure.txt
grep -q 'Stale Activity checkpoint replaced the newly installed document' audit-proof/baseline-expected-failure.txt
grep -q 'FAILURES' audit-proof/baseline-expected-failure.txt
# Wipe ONLY the disposable synthetic baseline between independent scenarios.
adb uninstall "$app"
adb install -r approved-android/app/build/outputs/apk/debug/app-debug.apk
adb install -r "$test_apk"
for group in ActivationConcurrencyTest BusyBackNavigationTest; do
 adb shell pm clear "$app"
 adb shell am instrument -w -e class "mr.alkarna.mobile.approved.$group" "$runner" | tee "audit-proof/$group.txt"
 grep -Eq '^OK \([0-9]+ tests?\)' "audit-proof/$group.txt"
done
adb shell pm clear "$app"
adb shell am instrument -w -e class mr.alkarna.mobile.approved.RecoverySupportEntryTest -e rescueRequireColdEntry true "$runner" | tee audit-proof/cold-support-entry.txt
grep -Eq '^OK \(1 test\)' audit-proof/cold-support-entry.txt
adb shell pm clear "$app"
adb shell am instrument -w -e class mr.alkarna.mobile.approved.RecoveryCaptureDeviceTest "$runner" | tee audit-proof/real-capture-device.txt
grep -Eq '^OK \(1 test\)' audit-proof/real-capture-device.txt
adb shell pm clear "$app"
assert_offline existing-offline-suites-network-before
adb shell am instrument -w -e notClass mr.alkarna.mobile.approved.UpgradePersistenceTest,mr.alkarna.mobile.approved.ContatoolsRecoveryTest,mr.alkarna.mobile.approved.ActivationConcurrencyTest,mr.alkarna.mobile.approved.BusyBackNavigationTest,mr.alkarna.mobile.approved.RecoverySupportEntryTest,mr.alkarna.mobile.approved.RecoveryCaptureDeviceTest "$runner" | tee audit-proof/existing-offline-suites.txt
grep -Eq '^OK \([0-9]+ tests?\)' audit-proof/existing-offline-suites.txt
assert_offline existing-offline-suites-network-after
adb logcat -d -s AlKarna:E AlKarnaJS:E AndroidRuntime:E > audit-proof/runtime-errors.txt
