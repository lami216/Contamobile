set -euo pipefail
mkdir -p approved-output
cleanup() {
  adb pull /sdcard/Android/data/mr.alkarna.mobile.approved/files approved-output/screenshots || true
  adb logcat -d -s AlKarna:E AlKarnaJS:E AndroidRuntime:E > approved-output/runtime-errors.txt || true
}
trap cleanup EXIT
adb shell svc wifi disable
adb shell svc data disable
adb install -r approved-output/alkarna-approved.apk
adb install -r approved-android/app/build/outputs/apk/androidTest/release/app-release-androidTest.apk
adb shell am instrument -w mr.alkarna.mobile.approved.test/androidx.test.runner.AndroidJUnitRunner | tee approved-output/android-tests.txt
grep -Eq '^OK \([0-9]+ tests?\)' approved-output/android-tests.txt
