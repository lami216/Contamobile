set -euo pipefail
mkdir -p approved-output
cleanup() {
  adb pull /sdcard/Android/data/mr.alkarna.mobile.approved/files approved-output/screenshots || true
  adb logcat -d -s AlKarna:E AlKarnaJS:E AndroidRuntime:E > approved-output/runtime-errors.txt || true
}
trap cleanup EXIT
adb shell svc wifi disable
adb shell svc data disable
# This script clears the isolated emulator between suites, never a connected phone.
test "$(adb shell getprop ro.kernel.qemu | tr -d '\r')" = '1'
version_code() { "$ANDROID_HOME/build-tools/35.0.0/aapt" dump badging "$1" | awk -F"'" '/^package: / {print $4}'; }
previous_code=$(version_code approved-upgrade/previous.apk)
current_code=$(version_code approved-output/alkarna-approved.apk)
test "$current_code" -gt "$previous_code"
adb install -r approved-upgrade/previous.apk
adb install -r approved-android/app/build/outputs/apk/androidTest/release/app-release-androidTest.apk
adb shell am instrument -w -e class mr.alkarna.mobile.approved.UpgradePersistenceTest#seedPreviousVersion -e expectedVersionCode "$previous_code" mr.alkarna.mobile.approved.test/androidx.test.runner.AndroidJUnitRunner | tee approved-output/upgrade-before.txt
grep -Eq '^OK \(1 test\)' approved-output/upgrade-before.txt
adb shell am force-stop mr.alkarna.mobile.approved
# No uninstall, clear, restore or activation import between these phases.
adb install -r approved-output/alkarna-approved.apk | tee approved-output/upgrade-install.txt
grep -q 'Success' approved-output/upgrade-install.txt
adb shell am instrument -w -e class mr.alkarna.mobile.approved.UpgradePersistenceTest#verifyAfterInPlaceUpdate -e expectedVersionCode "$current_code" mr.alkarna.mobile.approved.test/androidx.test.runner.AndroidJUnitRunner | tee approved-output/upgrade-after.txt
grep -Eq '^OK \(1 test\)' approved-output/upgrade-after.txt
# Reset only disposable emulator test data before the independent seller/activation suite.
adb shell pm clear mr.alkarna.mobile.approved
adb shell am instrument -w -e notClass mr.alkarna.mobile.approved.UpgradePersistenceTest,mr.alkarna.mobile.approved.ContatoolsRecoveryTest mr.alkarna.mobile.approved.test/androidx.test.runner.AndroidJUnitRunner | tee approved-output/android-tests.txt
grep -Eq '^OK \([0-9]+ tests?\)' approved-output/android-tests.txt
