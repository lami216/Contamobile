set -euo pipefail
app=mr.alkarna.mobile.approved
runner=$app.test/androidx.test.runner.AndroidJUnitRunner

test "$(adb shell getprop ro.kernel.qemu | tr -d '\r')" = 1
mkdir -p candidate-proof
adb shell cmd connectivity airplane-mode enable
adb shell svc wifi disable
adb shell svc data disable
candidate=candidate-output/alkarna-1.0.15-v16.apk
test_apk=approved-android/app/build/outputs/apk/androidTest/release/app-release-androidTest.apk
# Six synthetic scenarios. Each baseline -> candidate pair uses install-r, without data clear.
# Reset only BETWEEN separate scenarios, never during an in-place upgrade.
first=true
for baseline in 13 14 15; do
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
  adb install -r "$candidate" | tee "candidate-proof/$label-install-r.txt"
  grep -q Success "candidate-proof/$label-install-r.txt"
  adb shell am instrument -w -e class mr.alkarna.mobile.approved.UpgradePersistenceTest#verifyAfterInPlaceUpdate -e expectedVersionCode 16 "$runner" | tee "candidate-proof/$label-after.txt"
  grep -Eq '^OK \(1 test\)' "candidate-proof/$label-after.txt"
 done
done
# Fresh synthetic data for the independent accounting/activation/support-entry suite.
adb shell pm clear "$app"
adb shell am force-stop "$app"
adb shell am instrument -w -e class mr.alkarna.mobile.approved.RecoverySupportEntryTest -e rescueRequireColdEntry true "$runner" | tee candidate-proof/native-support-cold-entry.txt
grep -Eq '^OK \(1 test\)' candidate-proof/native-support-cold-entry.txt
adb shell am force-stop "$app"
adb shell am instrument -w -e class mr.alkarna.mobile.approved.RecoveryCaptureDeviceTest "$runner" | tee candidate-proof/real-capture-device.txt
grep -Eq '^OK \(1 test\)' candidate-proof/real-capture-device.txt
adb shell am force-stop "$app"
adb shell am instrument -w -e notClass mr.alkarna.mobile.approved.UpgradePersistenceTest,mr.alkarna.mobile.approved.ContatoolsRecoveryTest,mr.alkarna.mobile.approved.RecoverySupportEntryTest,mr.alkarna.mobile.approved.RecoveryCaptureDeviceTest "$runner" | tee candidate-proof/offline-suites.txt
grep -Eq '^OK \([0-9]+ tests?\)' candidate-proof/offline-suites.txt
adb logcat -d -s AlKarna:E AlKarnaJS:E AndroidRuntime:E > candidate-proof/runtime-errors.txt
sha256sum "$candidate" > candidate-proof/after-test-sha256.txt
