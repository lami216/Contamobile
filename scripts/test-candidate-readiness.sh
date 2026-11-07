#!/usr/bin/env bash
# Disposable fake transport tests for the exact release harness prefix.
set -euo pipefail
root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
fixture_parent=$(cd "${TMPDIR:-/tmp}" && pwd -P)
temporary=$(mktemp -d "$fixture_parent/alkarna-readiness.XXXXXX")
temporary=$(cd "$temporary" && pwd -P)
case "$temporary" in "$fixture_parent"/alkarna-readiness.*) : ;; *) exit 1 ;; esac
cleanup() {
 for mode in closed-root delayed-root persistent-nonroot physical; do
  rm -f -- "$temporary/$mode/candidate-proof/root-readiness.txt" "$temporary/$mode/adb.log" "$temporary/$mode/root-count"
  rmdir -- "$temporary/$mode/candidate-proof" "$temporary/$mode" 2>/dev/null || true
 done
 rm -f -- "$temporary/adb" "$temporary/prefix.sh"
 rmdir -- "$temporary"
}
trap cleanup EXIT
awk '/^: > "\$proof_dir\/network-egress-block.txt"/{found=1;exit}{print}END{if(!found)exit 1}' "$root/scripts/test-candidate-upgrade.sh" > "$temporary/prefix.sh"
cat >> "$temporary/prefix.sh" <<'PREFIX'
adb shell iptables --readiness-fixture
adb install --readiness-fixture
PREFIX
cat > "$temporary/adb" <<'ADB'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$FAKE_ADB_LOG"
case "$*" in
 'shell getprop ro.kernel.qemu') if [ "$FAKE_ADB_MODE" = physical ];then echo 0;else echo 1;fi ;;
 root)
  count=0;if [ -f "$FAKE_ADB_COUNT" ];then read -r count < "$FAKE_ADB_COUNT";fi
  count=$((count+1));echo "$count" > "$FAKE_ADB_COUNT"
  if [ "$count" = 1 ] && { [ "$FAKE_ADB_MODE" = closed-root ] || [ "$FAKE_ADB_MODE" = delayed-root ]; };then echo 'adb: unable to connect for root: closed' >&2;exit 1;fi
  echo 'adbd is already running as root' ;;
 'wait-for-device') : ;;
 'shell id -u')
  count=0;if [ -f "$FAKE_ADB_COUNT" ];then read -r count < "$FAKE_ADB_COUNT";fi
  if [ "$FAKE_ADB_MODE" = persistent-nonroot ] || { [ "$FAKE_ADB_MODE" = delayed-root ] && [ "$count" -lt 2 ]; };then echo 2000;else echo 0;fi ;;
 'shell iptables --readiness-fixture'|'install --readiness-fixture') : ;;
 *) echo 'Unexpected fake ADB command' >&2;exit 99 ;;
esac
ADB
chmod +x "$temporary/adb"
for mode in closed-root delayed-root persistent-nonroot physical; do
 mkdir "$temporary/$mode"
 export FAKE_ADB_MODE=$mode FAKE_ADB_LOG="$temporary/$mode/adb.log" FAKE_ADB_COUNT="$temporary/$mode/root-count"
 if (cd "$temporary/$mode" && PATH="$temporary:$PATH" bash "$temporary/prefix.sh");then status=0;else status=$?;fi
 case "$mode" in
  closed-root|delayed-root)
   test "$status" = 0
   grep -q '^verified uid=0 emulator=1$' "$temporary/$mode/candidate-proof/root-readiness.txt"
   grep -q '^shell iptables --readiness-fixture$' "$FAKE_ADB_LOG"
   grep -q '^install --readiness-fixture$' "$FAKE_ADB_LOG"
   expected=1;if [ "$mode" = delayed-root ];then expected=2;fi
   test "$(grep -c '^root$' "$FAKE_ADB_LOG")" = "$expected" ;;
  persistent-nonroot)
   test "$status" != 0
   test "$(grep -c '^root$' "$FAKE_ADB_LOG")" = 3
   if grep -Eq 'iptables|install' "$FAKE_ADB_LOG";then exit 1;fi ;;
  physical)
   test "$status" != 0
   if grep -Eq '^root$|iptables|install' "$FAKE_ADB_LOG";then exit 1;fi ;;
 esac
 echo "PASS emulator readiness $mode"
done
