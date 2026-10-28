set -euo pipefail
app=mr.alkarna.mobile.approved
runner=$app.test/androidx.test.runner.AndroidJUnitRunner
test "$(adb shell getprop ro.kernel.qemu | tr -d '\r')" = 1
mkdir -p candidate-proof
adb shell cmd connectivity airplane-mode enable
adb shell svc wifi disable
adb shell svc data disable
previous=baseline-v14/alkarna-approved.apk
candidate=candidate-output/alkarna-1.0.14-v15.apk
test_apk=approved-android/app/build/outputs/apk/androidTest/release/app-release-androidTest.apk
# Each pair is a real install-r of the SAME candidate, without clear/uninstall.
# Independent synthetic scenarios use fresh emulator state between pairs only.
for type in temporary perpetual; do
 if [ "$type" = perpetual ]; then adb uninstall "$app"; fi
 adb install -r "$previous"
 adb install -r "$test_apk"
 adb shell am instrument -w -e class mr.alkarna.mobile.approved.CandidateNetworkIsolationTest "$runner" | tee "candidate-proof/$type-network.txt"
 grep -Eq '^OK \(1 test\)' "candidate-proof/$type-network.txt"
 adb shell am instrument -w -e class mr.alkarna.mobile.approved.UpgradePersistenceTest#seedPreviousVersion -e expectedVersionCode 14 -e upgradeLicenseType "$type" "$runner" | tee "candidate-proof/$type-before.txt"
 grep -Eq '^OK \(1 test\)' "candidate-proof/$type-before.txt"
 adb shell am force-stop "$app"
 adb install -r "$candidate" | tee "candidate-proof/$type-install-r.txt"
 grep -q Success "candidate-proof/$type-install-r.txt"
 adb shell am instrument -w -e class mr.alkarna.mobile.approved.UpgradePersistenceTest#verifyAfterInPlaceUpdate -e expectedVersionCode 15 "$runner" | tee "candidate-proof/$type-after.txt"
 grep -Eq '^OK \(1 test\)' "candidate-proof/$type-after.txt"
done
# Fresh synthetic data for the existing independent accounting/activation suite.
adb shell pm clear "$app"
adb shell am instrument -w -e notClass mr.alkarna.mobile.approved.UpgradePersistenceTest,mr.alkarna.mobile.approved.ContatoolsRecoveryTest "$runner" | tee candidate-proof/offline-suites.txt
grep -Eq '^OK \([0-9]+ tests?\)' candidate-proof/offline-suites.txt
adb logcat -d -s AlKarna:E AlKarnaJS:E AndroidRuntime:E > candidate-proof/runtime-errors.txt
sha256sum "$candidate" > candidate-proof/after-test-sha256.txt
