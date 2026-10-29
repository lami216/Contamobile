set -euo pipefail
app=mr.alkarna.mobile.approved
runner=$app.test/androidx.test.runner.AndroidJUnitRunner
test "$(adb shell getprop ro.kernel.qemu | tr -d '\r')" = 1
mkdir -p audit-proof
adb shell cmd connectivity airplane-mode enable
adb shell svc wifi disable
adb shell svc data disable
test_apk=approved-android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
# The baseline is an unchanged source build in a disposable emulator, not a customer APK.
adb install -r audit-baseline/approved-android/app/build/outputs/apk/debug/app-debug.apk
adb install -r "$test_apk"
adb shell am instrument -w -e class mr.alkarna.mobile.approved.CandidateNetworkIsolationTest "$runner" | tee audit-proof/network-isolation.txt
grep -Eq '^OK \(1 test\)' audit-proof/network-isolation.txt
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
adb shell am instrument -w -e notClass mr.alkarna.mobile.approved.UpgradePersistenceTest,mr.alkarna.mobile.approved.ContatoolsRecoveryTest,mr.alkarna.mobile.approved.ActivationConcurrencyTest,mr.alkarna.mobile.approved.BusyBackNavigationTest,mr.alkarna.mobile.approved.RecoverySupportEntryTest,mr.alkarna.mobile.approved.RecoveryCaptureDeviceTest "$runner" | tee audit-proof/existing-offline-suites.txt
grep -Eq '^OK \([0-9]+ tests?\)' audit-proof/existing-offline-suites.txt
adb logcat -d -s AlKarna:E AlKarnaJS:E AndroidRuntime:E > audit-proof/runtime-errors.txt
