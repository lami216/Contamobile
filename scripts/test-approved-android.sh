set -euo pipefail
mkdir -p approved-output
cleanup() {
  adb pull /sdcard/Android/data/mr.alkarna.mobile.approved/files approved-output/screenshots || true
  adb logcat -d -s AlKarna:E AlKarnaJS:E AndroidRuntime:E > approved-output/runtime-errors.txt || true
  find approved-android/app/build/outputs/androidTest-results -name '*.xml' -exec cat {} \; || true
}
trap cleanup EXIT
adb shell svc wifi disable
adb shell svc data disable
gradle -p approved-android :app:connectedReleaseAndroidTest --no-daemon --stacktrace
