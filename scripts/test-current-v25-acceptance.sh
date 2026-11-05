set -euo pipefail
app=mr.alkarna.mobile.approved
runner=$app.test/androidx.test.runner.AndroidJUnitRunner
proof=v25-acceptance-proof
candidate=existing-v25/alkarna-1.0.24-v25.apk
test_apk=existing-v25-evidence/candidate-proof/app-release-androidTest.apk
mkdir -p "$proof"
echo 'ceca18d43dceb2dd952923410b8c6c4e3c93157b2a56f338d0c64c311cce8cd4  existing-v25/alkarna-1.0.24-v25.apk' | sha256sum --check
echo '181ed0837e0e080c1dae9c19c5e5ba3c5508d7a1f98c54aa5a756bf5b4ab2580  existing-v25-evidence/candidate-proof/app-release-androidTest.apk' | sha256sum --check
test "$(adb shell getprop ro.kernel.qemu | tr -d '\r')" = 1
adb root
timeout 30s adb wait-for-device
test "$(adb shell id -u | tr -d '\r')" = 0
: > "$proof/network-egress-block.txt"
for firewall in iptables ip6tables; do
 if ! adb shell "$firewall" -w 5 -n -L ALKARNA_SYNTHETIC_OFFLINE >/dev/null 2>&1; then adb shell "$firewall" -w 5 -N ALKARNA_SYNTHETIC_OFFLINE; fi
 if ! adb shell "$firewall" -w 5 -C ALKARNA_SYNTHETIC_OFFLINE '!' -o lo -j REJECT >/dev/null 2>&1; then adb shell "$firewall" -w 5 -A ALKARNA_SYNTHETIC_OFFLINE '!' -o lo -j REJECT; fi
 if ! adb shell "$firewall" -w 5 -C OUTPUT -j ALKARNA_SYNTHETIC_OFFLINE >/dev/null 2>&1; then adb shell "$firewall" -w 5 -I OUTPUT 1 -j ALKARNA_SYNTHETIC_OFFLINE; fi
 adb shell "$firewall" -w 5 -S ALKARNA_SYNTHETIC_OFFLINE >> "$proof/network-egress-block.txt"
done
adb shell ip link set dev eth0 down
adb shell cmd connectivity airplane-mode enable
adb shell svc wifi disable
adb shell svc data disable
assert_offline() {
 local label=$1 passed=0
 for attempt in $(seq 1 20); do
  adb shell am instrument -w -e class "$app.CandidateNetworkIsolationTest" "$runner" > "$proof/$label-attempt-$attempt.txt"
  if grep -Eq '^OK \(1 test\)' "$proof/$label-attempt-$attempt.txt"; then passed=$((passed+1)); else passed=0; fi
  if [ "$passed" -ge 2 ]; then cp "$proof/$label-attempt-$attempt.txt" "$proof/$label.txt"; return 0; fi
  sleep 1
 done
 return 1
}
adb install -r "$candidate"
adb install -r "$test_apk"
for suite in CloudBackupTest DeviceCloudLifecycleTest; do
 adb shell pm clear "$app"
 assert_offline "$suite-network-before"
 case "$suite" in
  CloudBackupTest) isolation=cloudBackupIsolation ;;
  DeviceCloudLifecycleTest) isolation=deviceCloudLifecycleIsolation ;;
 esac
 adb shell am instrument -w -e class "$app.$suite" -e "$isolation" true "$runner" | tee "$proof/$suite.txt"
 assert_offline "$suite-network-after"
done
adb shell am force-stop "$app"
adb uninstall "$app"
first=true
for baseline in 17 25; do
 previous=existing-v$baseline/alkarna-1.0.$((baseline-1))-v$baseline.apk
 for type in temporary perpetual; do
  if [ "$first" = false ]; then adb uninstall "$app"; fi
  first=false
  label=v$baseline-$type
  adb install -r "$previous"
  adb install -r "$test_apk"
  assert_offline "$label-network-before"
  adb shell am instrument -w -e class "$app.UpgradePersistenceTest#seedPreviousVersion" -e expectedVersionCode "$baseline" -e upgradeLicenseType "$type" "$runner" | tee "$proof/$label-before.txt"
  grep -Eq '^OK \(1 test\)' "$proof/$label-before.txt"
  adb shell am force-stop "$app"
  sleep 2
  adb install -r "$candidate" | tee "$proof/$label-install-r.txt"
  grep -q Success "$proof/$label-install-r.txt"
  adb shell am instrument -w -e class "$app.UpgradePersistenceTest#verifyAfterInPlaceUpdate" -e expectedVersionCode 25 -e requireOfflineElapsed true "$runner" | tee "$proof/$label-after.txt"
  adb shell am force-stop "$app"
  adb shell am instrument -w -e class "$app.UpgradePersistenceTest#verifyAfterOfflineColdRestart" -e expectedVersionCode 25 "$runner" | tee "$proof/$label-cold-restart.txt"
  adb shell am force-stop "$app"
  adb install -r "$candidate" | tee "$proof/$label-repeat-install-r.txt"
  grep -q Success "$proof/$label-repeat-install-r.txt"
  adb shell am instrument -w -e class "$app.UpgradePersistenceTest#verifyAfterRepeatedInPlaceUpdate" -e expectedVersionCode 25 "$runner" | tee "$proof/$label-repeat-after.txt"
  assert_offline "$label-network-after"
 done
done
adb logcat -d -s AlKarna:E AlKarnaJS:E AndroidRuntime:E > "$proof/runtime-errors.txt"
if grep -q 'FATAL EXCEPTION' "$proof/runtime-errors.txt"; then cat "$proof/runtime-errors.txt"; exit 1; fi
python3 - <<'PY'
from pathlib import Path
import hashlib,json,re
proof=Path('v25-acceptance-proof')
manifest=[]
for suite,marker in [('CloudBackupTest','CLOUD BACKUP CASE PASS'),('DeviceCloudLifecycleTest','DEVICE CLOUD LIFECYCLE CASE PASS')]:
 source=Path('existing-v25-source/approved-android/app/src/androidTest/java/mr/alkarna/mobile/approved',suite+'.java').read_text(encoding='utf-8')
 expected=re.findall(r'@Test\b(?:\([^)]*\))?\s+public\s+void\s+(\w+)\s*\(',source)
 text=(proof/(suite+'.txt')).read_text()
 actual=re.findall(r'^'+re.escape(marker)+r' (\w+)\s*$',text,re.M)
 assert len(expected)==6 and len(actual)==len(set(actual))==6 and set(actual)==set(expected),suite
 assert re.search(r'^OK \(6 tests\)',text,re.M) and not re.search(r'AssumptionFailed|SKIPPED|INSTRUMENTATION_FAILED|FAILURES!!!',text,re.I),suite
 manifest.append({'suite':suite,'cases':sorted(actual),'executed':6,'passed':True})
checks=[]
for baseline in [17,25]:
 for activation in ['temporary','perpetual']:
  for phase in ['before','after','cold-restart','repeat-after']:
   text=(proof/f'v{baseline}-{activation}-{phase}.txt').read_text()
   assert re.search(r'^OK \(1 test\)',text,re.M) and 'UpgradePersistenceTest:.' in text
   assert not re.search(r'AssumptionFailed|SKIPPED|INSTRUMENTATION_FAILED|FAILURES!!!',text,re.I)
   if phase!='before':checks.append({'baseline':baseline,'activation':activation,'phase':phase,'kind':'upgrade' if baseline==17 else 'same-version-reinstall','passed':True})
assert len(checks)==12
digest=hashlib.sha256(Path('existing-v25/alkarna-1.0.24-v25.apk').read_bytes()).hexdigest()
assert digest=='ceca18d43dceb2dd952923410b8c6c4e3c93157b2a56f338d0c64c311cce8cd4'
(proof/'acceptance-summary.json').write_text(json.dumps({'sourceCommit':'6dd9c848f6358eeb8c280350e734d8c055292ac8','apkSha256':digest,'versionCode':25,'passed':True,'upgradeScenarios':2,'sameVersionReinstallScenarios':2,'preservationChecks':checks,'nativeSuites':manifest,'transport':'Android instrumentation with injected transport; separate Node HTTP service evidence','realPhoneAcceptance':'not-executed','androidToRealService':'not-executed'},indent=2)+'\n')
PY
