set -euo pipefail
app=mr.alkarna.mobile.approved
runner=$app.test/androidx.test.runner.AndroidJUnitRunner

test "$(adb shell getprop ro.kernel.qemu | tr -d '\r')" = 1
mkdir -p candidate-proof
adb shell cmd connectivity airplane-mode enable
adb shell svc wifi disable
adb shell svc data disable
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
for baseline in "${baselines[@]}"; do
 previous=baseline-v$baseline/alkarna-approved.apk
 for type in temporary perpetual; do
  if [ "$first" = false ]; then adb uninstall "$app"; fi
  first=false
  label=v$baseline-$type
  adb install -r "$previous"
  adb install -r "$test_apk"
  adb shell am instrument -w -e class mr.alkarna.mobile.approved.CandidateNetworkIsolationTest "$runner" | tee "candidate-proof/$label-network.txt"
  grep -Eq '^OK \(1 test\)' "candidate-proof/$label-network.txt"
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
adb shell am instrument -w -e notClass mr.alkarna.mobile.approved.UpgradePersistenceTest,mr.alkarna.mobile.approved.ContatoolsRecoveryTest,mr.alkarna.mobile.approved.ActivationConcurrencyTest,mr.alkarna.mobile.approved.BusyBackNavigationTest,mr.alkarna.mobile.approved.RecoverySupportEntryTest,mr.alkarna.mobile.approved.RecoveryCaptureDeviceTest "$runner" | tee candidate-proof/offline-suites.txt
grep -Eq '^OK \([0-9]+ tests?\)' candidate-proof/offline-suites.txt
adb logcat -d -s AlKarna:E AlKarnaJS:E AndroidRuntime:E > candidate-proof/runtime-errors.txt
sha256sum "$candidate" > candidate-proof/after-test-sha256.txt
