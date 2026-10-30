set -euo pipefail
app=mr.alkarna.mobile.approved
runner=$app.test/androidx.test.runner.AndroidJUnitRunner

test "$(adb shell getprop ro.kernel.qemu | tr -d '\r')" = 1
proof_dir=candidate-proof
mkdir -p "$proof_dir"
# Keep every synthetic fixture offline even if a guest service re-enables a link.
# This root/firewall setup is allowed only after proving this is an emulator.
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
: "${CANDIDATE_VERSION_CODE:?Set the verified candidate versionCode}"
: "${CANDIDATE_APK:?Set the exact signed candidate APK path}"
: "${BASELINE_VERSION_CODES:?Set the verified published baseline versionCodes}"
[[ "$CANDIDATE_VERSION_CODE" =~ ^[0-9]+$ ]]
candidate=$CANDIDATE_APK
test_apk=approved-android/app/build/outputs/apk/androidTest/release/app-release-androidTest.apk
test -s "$candidate"
test -s "$test_apk"
read -r -a baselines <<< "$BASELINE_VERSION_CODES"
test "${#baselines[@]}" -gt 0
for baseline in "${baselines[@]}"; do
 [[ "$baseline" =~ ^[0-9]+$ ]]
 test "$baseline" -lt "$CANDIDATE_VERSION_CODE"
 test -s "baseline-v$baseline/alkarna-approved.apk"
done
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
 if [ "$group" = ActivationConcurrencyTest ]; then expected_tests=5; else expected_tests=2; fi
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
adb shell am instrument -w -e notClass mr.alkarna.mobile.approved.UpgradePersistenceTest,mr.alkarna.mobile.approved.ContatoolsRecoveryTest,mr.alkarna.mobile.approved.ActivationConcurrencyTest,mr.alkarna.mobile.approved.BusyBackNavigationTest,mr.alkarna.mobile.approved.RecoverySupportEntryTest,mr.alkarna.mobile.approved.RecoveryCaptureDeviceTest "$runner" | tee candidate-proof/offline-suites.txt
grep -Eq '^OK \([0-9]+ tests?\)' candidate-proof/offline-suites.txt
assert_offline offline-suites-network-after
adb logcat -d -s AlKarna:E AlKarnaJS:E AndroidRuntime:E > candidate-proof/runtime-errors.txt
sha256sum "$candidate" > candidate-proof/after-test-sha256.txt
