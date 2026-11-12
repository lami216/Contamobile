"""Merge seven executed CI shards only after the complete v30 proof gate passes.

This validates CI evidence; it does not run app tests, verify APK signatures itself,
or turn source declarations into execution evidence. Build/signature checks run
before the immutable build-input artifact is published. The final APK still needs
independent byte/signature inspection. Only Python's standard library is used.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path

APP = "mr.alkarna.mobile.approved"
CERT = "a696960cb0e62dc311287331500a2a0b459bff8a0188c8d9ab55edbdaddd1fd2"
CANDIDATE = "candidate-output/alkarna-1.0.29-v30.apk"
TEST_APK = "approved-android/app/build/outputs/apk/androidTest/release/app-release-androidTest.apk"
GROUPS = {"native": [], "upgrade-13-15": [13, 14, 15],
          "upgrade-16-18": [16, 17, 18], "upgrade-19-21": [19, 20, 21],
          "upgrade-22-24": [22, 23, 24], "upgrade-25-27": [25, 26, 27],
          "upgrade-28-29": [28, 29]}
BASELINE_HASHES = {
    "13": "9c6f9ccc5000b58864191f2e6003d79560c811aa7190878620cb1900a61cfe8c",
    "14": "4d69fc1f88d4709d4928c906e15801ff2028995ad0131d611e946973bb831c90",
    "15": "6204cfe04ce59acb2d4e089bb9d1711524949441e04b05d5b10b0c985ff7b74d",
    "16": "4b896ca65abe0ca8ec9e766c48f66442f0aa82dcbc24696f47d6cf52ea0ade7d",
    "17": "4ea578e57144431cfc2aab9902f717834ba5f1e8936e3e77141f12d66cc10b9a",
    "18": "ef3b276c51c7cfb92616080d1b8145dce2a7a4b6c48198356bdec9b34eaf59a4",
    "19": "c5558a074e48c5705f10ef20b233d39d33ee1ccc3b91d5c0bfe1c745d0153f3e",
    "20": "94848194716a6a794182ae4eb86d29af471899b79bc3a6c011903e58613c52e4",
    "21": "8c662cc4b98578bacf04b60fbe302a4222a5aba8f4578d181dcb961c13554f90",
    "22": "88e85413785a0a969f96a7545ae0d3eaf3f0dfce2b99373199610df0a84266cd",
    "23": "fd337af2516d614319c4cbd2d61b29ca0b55e83e96c577df544020879dcaf587",
    "24": "cc8f16481f1f185a29a089fd2c73c6b593db65dd6d672a53178ba485370c2a6c",
    "25": "ceca18d43dceb2dd952923410b8c6c4e3c93157b2a56f338d0c64c311cce8cd4",
    "26": "7226c40c95aed22d474aa146b7d53681c701a7818b2fed1a89820a41c461df45",
    "27": "174da0f4e076250cda7aa436f9b776d1b6bebd5c60a6cd543d5702b9ac4a55e3",
    "28": "9fde991e118b464dce9649bb3f86b9d20bbe5ebf01bbce3726f66265bb77bb59",
    "29": "4a14cb5cc87db8a42b56a0de91a504c2aa799f53d661ac7ba2cd234051c2c592",
}
NATIVE = {
    "AccountAccessTest": ("ACCOUNT ACCESS CASE PASS", "account-access", 10),
    "OfflineAccountControlTest": ("OFFLINE ACCOUNT CONTROL CASE PASS", "offline-account-control", 15),
    "CloudBackupTest": ("CLOUD BACKUP CASE PASS", "cloud-backup", 7),
    "AccountingResetTest": ("ACCOUNTING RESET CASE PASS", "accounting-reset", 8),
    "OwnerUsernameRecoveryTest": ("OWNER USERNAME RECOVERY CASE PASS", "owner-username-recovery", 6),
    "AccountingParityTest": ("ACCOUNTING PARITY CASE PASS", "accounting-parity", 1),
    "DeviceCloudLifecycleTest": ("DEVICE CLOUD LIFECYCLE CASE PASS", "device-cloud-lifecycle", 6),
    "BootstrapSupportOutcomeTest": ("BOOTSTRAP SUPPORT OUTCOME CASE PASS", "bootstrap-support-outcome", 7),
    "PhoneReplacementTest": ("PHONE REPLACEMENT CASE PASS", "phone-replacement", 8),
}
EXTRA_NATIVE = {"ActivationConcurrencyTest.txt": ("ActivationConcurrencyTest", 5),
                "BusyBackNavigationTest.txt": ("BusyBackNavigationTest", 2),
                "native-support-cold-entry.txt": ("RecoverySupportEntryTest", 1),
                "real-capture-device.txt": ("RecoveryCaptureDeviceTest", 1)}
OFFLINE_EXCLUDED = set(NATIVE) | {row[0] for row in EXTRA_NATIVE.values()} | {
    "UpgradePersistenceTest", "ContatoolsRecoveryTest"}
PHASES = ("after", "cold-restart", "repeat-after")
ALL_PHASES = ("before",) + PHASES
METHOD = re.compile(r"@Test\b(?:\([^)]*\))?\s+public\s+void\s+(\w+)\s*\(")
BAD_EXECUTION = re.compile(r"AssumptionFailed|\bSKIP(?:PED)?\b|INSTRUMENTATION_FAILED|"
                           r"FAILURES!!!|INSTRUMENTATION_RESULT:\s*shortMsg\s*=|"
                           r"FATAL EXCEPTION|^Error in |java\.lang\.AssertionError", re.I | re.M)
RESERVED = {"candidate-verified.json", "SHA256SUMS.txt", "after-test-sha256.txt",
            "jvm-release-summary.json", "native-scenario-summary.json",
            "preservation-summary.json", "runtime-errors.txt"}
BROWSER_JSON = {"accounting-parity-ux-proof.json", "backup-ux-proof.json",
                "device-lifecycle-ux-proof.json", "owner-recovery-ux-proof.json",
                "phone-replacement-ux-proof.json", "signed-accounts-ux-proof.json"}
BROWSER_PNG = re.compile(r"(?:accounting-reset-fr-393|(?:backup-ux|manual-backup)-(?:ar|fr)-393|"
                         r"cloud-bootstrap-(?:ar|fr)-(?:360|393)|"
                         r"(?:online-activation|bootstrap-terminal)-(?:ar|fr)-360|"
                         r"owner-recovery-ux-(?:ar|fr)-(?:360|393)|"
                         r"phone-replacement-(?:replaced|accepted)-(?:ar|fr)-(?:360|393))\.png")


class ProofError(ValueError):
    """Missing, conflicting or unsuccessful execution evidence."""


def need(condition, message):
    if not condition:
        raise ProofError(message)


def read(path: Path):
    need(path.is_file() and not path.is_symlink(), f"Missing regular proof file: {path}")
    return path.read_text(encoding="utf-8-sig")


def document(path: Path):
    def unique(items):
        result = {}
        for key, value in items:
            need(key not in result, f"Duplicate JSON key {key}: {path}")
            result[key] = value
        return result
    try:
        return json.loads(read(path), object_pairs_hook=unique)
    except (json.JSONDecodeError, UnicodeError) as error:
        raise ProofError(f"Invalid JSON proof: {path}") from error


def digest(path: Path):
    need(path.is_file() and not path.is_symlink(), f"Missing immutable input: {path}")
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def safe_tree(root: Path):
    need(root.is_dir() and not root.is_symlink(), f"Missing regular input directory: {root}")
    entries = list(root.rglob("*"))
    need(len(entries) <= 20000, f"Too many proof entries: {root}")
    for entry in entries:
        need(not entry.is_symlink() and (entry.is_file() or entry.is_dir()),
             f"Unsafe proof entry: {entry}")


def checksum(path: Path, expected: str):
    lines = read(path).splitlines()
    need(len(lines) == 1 and re.fullmatch(r"[0-9a-f]{64} [ *][^\r\n]+", lines[0]),
         f"Malformed or multiple APK checksum rows: {path}")
    need(lines[0][:64] == expected, f"Different tested APK bytes: {path}")


def junit(path: Path, count: int, suites=None):
    text = read(path)
    need(not BAD_EXECUTION.search(text), f"Failed/skipped/incomplete execution: {path}")
    totals = re.findall(r"^OK \((\d+) tests?\)\s*$", text, re.M)
    need(totals == [str(count)], f"Missing, duplicate or wrong JUnit count: {path}")
    if suites is not None:
        found = re.findall(r"^mr\.alkarna\.mobile\.approved\.(\w+):", text, re.M)
        need(len(found) == len(set(found)) and set(found) == set(suites),
             f"Missing, duplicate or unexpected executed classes: {path}")
    return text


def source_cases(source: Path, variant: str):
    root = source / f"approved-android/app/src/{variant}/java/mr/alkarna/mobile/approved"
    need(root.is_dir(), f"Missing exact source test directory: {root}")
    result = {}
    for path in sorted(root.glob("*.java")):
        methods = METHOD.findall(read(path))
        need(len(methods) == len(set(methods)), f"Duplicate source test methods: {path}")
        if methods:
            result[path.stem] = methods
    return result


def check_jvm(inputs: Path, cases):
    expected = {(APP + "." + suite, method) for suite, methods in cases.items() for method in methods}
    need(len(expected) == 44, "All 44 current native JVM cases are required")
    directory = inputs / "approved-android/app/build/test-results/testReleaseUnitTest"
    files = sorted(directory.glob("TEST-*.xml"))
    need(files, "Missing actual release JVM XML; a summary alone is insufficient")
    executed = []
    for path in files:
        try:
            suite = ET.fromstring(read(path))
        except ET.ParseError as error:
            raise ProofError(f"Invalid executed JVM XML: {path}") from error
        rows = suite.findall("testcase")
        need(suite.tag == "testsuite" and int(suite.get("tests", "0")) == len(rows) > 0,
             f"Incomplete JVM XML: {path}")
        need(all(int(suite.get(key, "0")) == 0 for key in ("failures", "errors", "skipped")),
             f"Failed/skipped JVM suite: {path}")
        for row in rows:
            need(not any(row.find(key) is not None for key in ("failure", "error", "skipped")),
                 f"Failed/skipped JVM case: {path}")
            executed.append((row.get("classname", suite.get("name")), row.get("name")))
    need(len(executed) == len(set(executed)) == 44 and set(executed) == expected,
         "Missing, duplicate or unexpected JVM cases")
    summary = document(inputs / "candidate-proof/jvm-release-summary.json")
    need(summary.get("passed") is True and summary.get("executed") == 44 and
         summary.get("failed") == summary.get("skipped") == 0, "Invalid JVM execution summary")
    rows = summary.get("cases", [])
    need(len(rows) == 44 and all(row.get("passed") is True for row in rows) and
         {(row.get("class"), row.get("name")) for row in rows} == expected,
         "JVM summary differs from actual source/XML cases")


def check_input_inventory(inputs: Path, build):
    required = {CANDIDATE, TEST_APK, "candidate-output/candidate-verified.json",
                "candidate-output/baseline-verified.json", "candidate-output/SHA256SUMS.txt",
                "candidate-proof/jvm-release-summary.json"} | {
                    f"baseline-v{version}/alkarna-approved.apk" for version in BASELINE_HASHES} | {
                        "build-browser-proof/" + name for name in BROWSER_JSON}
    files = build.get("files")
    need(isinstance(files, dict) and required <= set(files) and len(files) <= 10000,
         "Missing immutable build file inventory")
    actual = {path.relative_to(inputs).as_posix() for path in inputs.rglob("*") if path.is_file()}
    need(actual == set(files) | {"build-inputs.json"}, "Unexpected or missing immutable build input files")
    for name, expected in files.items():
        parts = Path(name).parts
        need(isinstance(name, str) and name and "\\" not in name and not Path(name).is_absolute() and
             all(part not in (".", "..") and ":" not in part for part in parts),
             "Unsafe immutable build input path")
        browser_png = len(parts) == 2 and parts[0] == "build-browser-proof" and BROWSER_PNG.fullmatch(parts[1])
        need(name in required or browser_png or name.startswith(("approved-android/app/build/reports/tests/",
                                                                 "approved-android/app/build/test-results/testReleaseUnitTest/")),
             f"Undeclared immutable build input type: {name}")
        need(isinstance(expected, str) and re.fullmatch(r"[0-9a-f]{64}", expected) and
             digest(inputs / name) == expected, f"Immutable build input changed: {name}")


def common_metadata(meta, head, run, candidate_hash, test_hash, label):
    need(meta.get("sourceHead") == head, f"Foreign source head: {label}")
    need(type(meta.get("workflowRunId")) is int and meta["workflowRunId"] == run,
         f"Foreign immutable build workflow run: {label}")
    need(type(meta.get("version")) is int and meta["version"] == 1,
         f"Unsupported metadata version: {label}")
    need(type(meta.get("candidateVersionCode")) is int and meta["candidateVersionCode"] == 30,
         f"Wrong candidate version: {label}")
    need(meta.get("candidateSha256") == candidate_hash and meta.get("testApkSha256") == test_hash,
         f"Different candidate/test APK bytes: {label}")


def check_group_network(root: Path):
    junit(root / "group-network-before.txt", 1, ["CandidateNetworkIsolationTest"])
    junit(root / "group-network-after.txt", 1, ["CandidateNetworkIsolationTest"])
    firewall = read(root / "network-egress-block.txt")
    need("icmp-port-unreachable" in firewall and "icmp6-port-unreachable" in firewall and
         firewall.count("-A ALKARNA_SYNTHETIC_OFFLINE ! -o lo -j REJECT") == 2,
         f"Both IPv4/IPv6 egress blocks are mandatory: {root}")
    need(re.search(r"^verified uid=0 emulator=1$", read(root / "root-readiness.txt"), re.M),
         f"Missing actual emulator/root identity: {root}")


def check_native(root: Path, cases):
    summaries = []
    for suite, (prefix, label, count) in NATIVE.items():
        expected = cases.get(suite, [])
        need(len(expected) == count, f"Mandatory native source case count changed: {suite}")
        text = junit(root / (suite + ".txt"), count, [suite])
        executed = re.findall(r"^" + re.escape(prefix) + r" (\w+)\s*$", text, re.M)
        need(len(executed) == len(set(executed)) == count and set(executed) == set(expected),
             f"Missing, duplicate or unexpected native case markers: {suite}")
        junit(root / f"{label}-network-before.txt", 1, ["CandidateNetworkIsolationTest"])
        junit(root / f"{label}-network-after.txt", 1, ["CandidateNetworkIsolationTest"])
        summaries.append({"suite": suite, "executed": count, "cases": sorted(executed), "passed": True})
    for filename, (suite, count) in EXTRA_NATIVE.items():
        need(len(cases.get(suite, [])) == count, f"Missing independent native suite: {suite}")
        junit(root / filename, count, [suite])
    offline = {suite: names for suite, names in cases.items() if suite not in OFFLINE_EXCLUDED}
    need(set(offline) == {"ApprovedRuntimeTest", "BarcodeDecoderTest", "CandidateNetworkIsolationTest",
                          "DeviceLicenseTest", "LicenseCompatibilityTest", "SupportContactTest"},
         "Unexpected offline-suite source selection")
    need(sum(map(len, offline.values())) == 10, "All ten residual offline cases are mandatory")
    junit(root / "offline-suites.txt", 10, offline)
    junit(root / "offline-suites-network-before.txt", 1, ["CandidateNetworkIsolationTest"])
    junit(root / "offline-suites-network-after.txt", 1, ["CandidateNetworkIsolationTest"])
    need(document(root / "native-scenario-summary.json").get("suites") == summaries,
         "Native child summary differs from executed cases")
    return summaries


def check_upgrades(root: Path, versions):
    expected_files = {f"v{v}-{activation}-{phase}.txt" for v in versions
                      for activation in ("temporary", "perpetual") for phase in ALL_PHASES}
    found = {path.name for path in root.rglob("*.txt")
             if re.fullmatch(r"v\d+-(?:temporary|perpetual)-(?:before|after|cold-restart|repeat-after)\.txt", path.name)}
    need(found == expected_files, f"Missing or unexpected preservation files: {root}")
    need(all(len(list(root.rglob(name))) == 1 for name in expected_files),
         f"Duplicate preservation evidence paths: {root}")
    allowed = {f"v{v}-{activation}-{suffix}.txt" for v in versions
               for activation in ("temporary", "perpetual")
               for suffix in ALL_PHASES + ("install-r", "repeat-install-r", "network", "network-after")}
    for path in root.rglob("v*.txt"):
        if re.match(r"v\d+-", path.name):
            attempt = re.fullmatch(r"v(\d+)-(temporary|perpetual)-network(?:-after)?-attempt-([1-9]\d*)\.txt", path.name)
            need(path.name in allowed or attempt is not None and int(attempt[1]) in versions,
                 f"Unexpected preservation baseline/type/phase evidence: {path}")
    progress = read(root / "preservation-progress.txt")
    rows = re.findall(r"^PRESERVATION (BEGIN|PASS) baseline=v(\d+) activation=(\w+) "
                      r"phase=([\w-]+) candidate=v(\d+)\s*$", progress, re.M)
    expected_progress = [(verb, str(v), activation, phase, "30") for v in versions
                         for activation in ("temporary", "perpetual")
                         for phase in ("seed-before",) + PHASES for verb in ("BEGIN", "PASS")]
    need(len(rows) == len(set(rows)) == len(expected_progress) and rows == expected_progress,
         f"Missing, duplicate or unexpected preservation progress: {root}")
    need(len([line for line in progress.splitlines() if line.strip()]) == len(rows),
         f"Unexpected preservation progress text: {root}")
    checks = []
    for version in versions:
        for activation in ("temporary", "perpetual"):
            label = f"v{version}-{activation}"
            for phase in ALL_PHASES:
                junit(root / f"{label}-{phase}.txt", 1, ["UpgradePersistenceTest"])
                if phase != "before":
                    checks.append({"baseline": version, "activation": activation, "phase": phase, "passed": True})
            for suffix in ("install-r", "repeat-install-r"):
                text = read(root / f"{label}-{suffix}.txt")
                need(len(re.findall(r"^Success\s*$", text, re.M)) == 1 and
                     not re.search(r"\bFailure\b|INSTALL_FAILED", text),
                     f"Missing exact in-place install success: {label}-{suffix}")
            junit(root / f"{label}-network.txt", 1, ["CandidateNetworkIsolationTest"])
            junit(root / f"{label}-network-after.txt", 1, ["CandidateNetworkIsolationTest"])
    summary = document(root / "preservation-summary.json")
    need(summary.get("candidateVersionCode") == 30 and summary.get("selectedBaselines") == versions and
         summary.get("upgradeScenarios") == len(versions) * 2 and
         summary.get("preservationChecks") == len(checks) and summary.get("checks") == checks,
         f"Child preservation summary differs from executed evidence: {root}")
    return checks


def merge(inputs: Path, children: Path, source: Path, head: str, output: Path, run: int):
    need(re.fullmatch(r"[0-9a-f]{40}", head), "An exact current source head is required")
    need(type(run) is int and run > 0, "An exact current workflow run ID is required")
    inputs, children, source, output = [path.resolve() for path in (inputs, children, source, output)]
    need(not output.exists(), "Output must be new; stale merged proof is never reused")
    need(not any(output == root or output in root.parents or root in output.parents
                 for root in (inputs, children)), "Output must be separate from input artifacts")
    safe_tree(inputs)
    safe_tree(children)
    need({p.name for p in children.iterdir()} == set(GROUPS) and
         all(p.is_dir() for p in children.iterdir()), "All seven exact child proof sets are required")
    candidate_hash, test_hash = digest(inputs / CANDIDATE), digest(inputs / TEST_APK)
    build = document(inputs / "build-inputs.json")
    build_hash = digest(inputs / "build-inputs.json")
    need(build.get("schema") == "contamobile-candidate-build-inputs", "Wrong immutable build schema")
    common_metadata(build, head, run, candidate_hash, test_hash, "build inputs")
    check_input_inventory(inputs, build)
    need(build.get("baselines") == BASELINE_HASHES, "All seventeen pinned original baseline hashes are required")
    for version, expected in BASELINE_HASHES.items():
        need(digest(inputs / f"baseline-v{version}/alkarna-approved.apk") == expected,
             f"Original baseline bytes changed: v{version}")
    candidate = document(inputs / "candidate-output/candidate-verified.json")
    need(candidate.get("sha256") == candidate_hash and candidate.get("applicationId") == APP and
         candidate.get("versionCode") == 30 and candidate.get("versionName") == "1.0.29" and
         candidate.get("certificateSha256") == CERT and candidate.get("apksignerVerified") is True,
         "Missing or inconsistent candidate identity/signature evidence")
    checksum(inputs / "candidate-output/SHA256SUMS.txt", candidate_hash)
    check_jvm(inputs, source_cases(source, "test"))
    native_cases = source_cases(source, "androidTest")
    suites, checks, runtime = [], [], []
    for group, versions in GROUPS.items():
        root = children / group
        meta = document(root / "child-proof.json")
        need(meta.get("schema") == "contamobile-candidate-child-proof", f"Wrong child schema: {group}")
        common_metadata(meta, head, run, candidate_hash, test_hash, group)
        need(meta.get("buildInputsSha256") == build_hash,
             f"Child proof belongs to a different immutable build manifest: {group}")
        need(meta.get("group") == group and meta.get("baselines") == versions and
             meta.get("completed") is True, f"Incomplete or foreign child group: {group}")
        checksum(root / "after-test-sha256.txt", candidate_hash)
        check_group_network(root)
        errors = read(root / "runtime-errors.txt")
        need(not re.search(r"FATAL EXCEPTION", errors, re.I), f"Fatal Android runtime error: {group}")
        runtime.append(f"===== {group} =====\n{errors}")
        if group == "native":
            need(not list(root.rglob("v*-*-after.txt")), "Native child must not carry upgrade evidence")
            suites = check_native(root, native_cases)
        else:
            need(not any(list(root.rglob(suite + ".txt")) for suite in NATIVE),
                 f"Upgrade child must not carry duplicated native suites: {group}")
            checks.extend(check_upgrades(root, versions))
    matrix = {(version, activation, phase) for version in range(13, 30)
              for activation in ("temporary", "perpetual") for phase in PHASES}
    need(len(checks) == 102 and {(r["baseline"], r["activation"], r["phase"]) for r in checks} == matrix,
         "The complete 34-scenario/102-check preservation matrix is mandatory")
    summary = {"schema": "contamobile-candidate-proof-aggregation", "version": 1,
               "sourceHead": head, "workflowRunId": run, "buildInputsSha256": build_hash,
               "candidateVersionCode": 30, "candidateSha256": candidate_hash,
               "testApkSha256": test_hash, "groups": list(GROUPS), "nativeJvmCases": 44,
               "nativeSuiteCases": sum(s["executed"] for s in suites), "offlineCases": 10,
               "upgradeScenarios": 34, "seedChecks": 34, "preservationChecks": 102,
               "totalPreservationInvocations": 136, "passed": True,
               "scope": "Validated actual child execution evidence; not physical-device acceptance"}
    output.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=".candidate-proof-merge-", dir=output.parent))
    try:
        for directory in ("candidate-proof", "approved-android/app/build/reports/tests",
                          "approved-android/app/build/test-results/testReleaseUnitTest"):
            if (inputs / directory).is_dir():
                shutil.copytree(inputs / directory, staging / directory)
        target = staging / "candidate-output"
        target.mkdir(parents=True)
        for path in (inputs / "candidate-output").iterdir():
            if path.is_file() and path.suffix in (".json", ".txt"):
                shutil.copy2(path, target / path.name)
        shutil.copy2(inputs / CANDIDATE, target / Path(CANDIDATE).name)
        proof = staging / "candidate-proof"
        proof.mkdir(exist_ok=True)
        # Only manifest-validated public browser evidence is retained here.
        # Keeping this separate avoids legacy metadata basename collisions.
        browser = proof / "build-browser"
        browser.mkdir()
        for path in (inputs / "build-browser-proof").iterdir():
            need(path.is_file() and (path.name in BROWSER_JSON or BROWSER_PNG.fullmatch(path.name)),
                 f"Unexpected public browser evidence: {path}")
            shutil.copy2(path, browser / path.name)
        for group in GROUPS:
            target = proof / "children" / group
            for path in (children / group).rglob("*"):
                if path.is_file():
                    relative = path.relative_to(children / group)
                    if path.name in RESERVED:
                        relative = relative.with_name(group + "-original-" + path.name)
                    destination = target / relative
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(path, destination)
        shutil.copy2(inputs / TEST_APK, proof / "app-release-androidTest.apk")
        for name, value in (("native-scenario-summary.json", {"suites": suites}),
                            ("preservation-summary.json", {"candidateVersionCode": 30,
                             "upgradeScenarios": 34, "preservationChecks": 102, "checks": checks}),
                            ("aggregation-summary.json", summary)):
            (proof / name).write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")
        (proof / "after-test-sha256.txt").write_text(candidate_hash + "  " + CANDIDATE + "\n", encoding="utf-8")
        (proof / "runtime-errors.txt").write_text("\n".join(runtime), encoding="utf-8")
        # Critical legacy inspector inputs must be unique even after preserving children.
        for name in (RESERVED | {"offline-suites.txt"}):
            need(len(list(staging.rglob(name))) == 1, f"Ambiguous final inspection input: {name}")
        staging.rename(output)
    except BaseException:
        shutil.rmtree(staging)
        raise
    return summary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("inputs", "children", "source", "output"):
        parser.add_argument("--" + name, type=Path, required=True)
    parser.add_argument("--head", required=True)
    parser.add_argument("--run", type=int, required=True)
    args = parser.parse_args()
    try:
        result = merge(args.inputs, args.children, args.source, args.head, args.output, args.run)
    except (ProofError, OSError, ValueError, TypeError, KeyError) as error:
        parser.exit(1, f"Candidate proof aggregation refused: {error}\n")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
