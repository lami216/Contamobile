"""CI proof-gate unit tests using controlled synthetic evidence, not app execution.

The positive fixture deliberately fabricates evidence to test the gate itself.
It must never be delivered as a real Android acceptance result. Original APK
hash constants are patched only inside this unit-test process so tiny fixture
bytes can exercise file-integrity checks without downloading release APKs.
"""
import hashlib
import importlib.util
import json
import re
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
SOURCE = HERE.parent
SPEC = importlib.util.spec_from_file_location("candidate_proof_merge", HERE / "merge-candidate-proofs.py")
GATE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(GATE)
HEAD = "a" * 40
RUN = 123456789


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    if isinstance(value, bytes):
        path.write_bytes(value)
    else:
        path.write_text(value, encoding="utf-8", newline="\n")


def save(path, value):
    write(path, json.dumps(value, indent=2) + "\n")


def junit(suites, count):
    return "\n" + "\n".join(GATE.APP + "." + suite + ":." for suite in suites) + f"\n\nOK ({count} tests)\n"


class CandidateProofGateTests(unittest.TestCase):
    def setUp(self):
        # Keep Windows paths below the native copy API length boundary. This is
        # a disposable CI-gate fixture within the task workspace, never app data.
        self.temp = tempfile.TemporaryDirectory(prefix=".pm-", dir=SOURCE.parent)
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.inputs, self.children, self.output = [self.root / part for part in ("inputs", "children", "merged")]
        candidate, test_apk = b"SYNTHETIC CI GATE APK BYTES ONLY", b"SYNTHETIC CI GATE TEST APK BYTES ONLY"
        self.candidate_hash, self.test_hash = [hashlib.sha256(value).hexdigest() for value in (candidate, test_apk)]
        write(self.inputs / GATE.CANDIDATE, candidate)
        write(self.inputs / GATE.TEST_APK, test_apk)
        baselines = {}
        for version in range(13, 31):
            data = f"SYNTHETIC CI GATE BASELINE {version}".encode()
            baselines[str(version)] = hashlib.sha256(data).hexdigest()
            write(self.inputs / f"baseline-v{version}/alkarna-approved.apk", data)
        self.pins = patch.dict(GATE.BASELINE_HASHES, baselines, clear=True)
        self.pins.start()
        self.addCleanup(self.pins.stop)
        self.common = {"version": 1, "sourceHead": HEAD, "workflowRunId": RUN,
                       "candidateVersionCode": 31, "candidateSha256": self.candidate_hash,
                       "testApkSha256": self.test_hash}
        save(self.inputs / "candidate-output/candidate-verified.json", {
            "sha256": self.candidate_hash, "applicationId": GATE.APP, "versionCode": 31,
            "versionName": "1.0.30", "certificateSha256": GATE.CERT, "apksignerVerified": True})
        self.sha = self.candidate_hash + "  " + GATE.CANDIDATE + "\n"
        write(self.inputs / "candidate-output/SHA256SUMS.txt", self.sha)
        save(self.inputs / "candidate-output/baseline-verified.json", {"mode": "baseline", "versionCode": 29})
        jvm_cases = GATE.source_cases(SOURCE, "test")
        rows = []
        for suite, methods in jvm_cases.items():
            xml = ET.Element("testsuite", name=GATE.APP + "." + suite, tests=str(len(methods)),
                             failures="0", errors="0", skipped="0")
            for name in methods:
                ET.SubElement(xml, "testcase", classname=GATE.APP + "." + suite, name=name)
                rows.append({"class": GATE.APP + "." + suite, "name": name, "passed": True})
            write(self.inputs / f"approved-android/app/build/test-results/testReleaseUnitTest/TEST-{suite}.xml",
                  ET.tostring(xml, encoding="unicode"))
        save(self.inputs / "candidate-proof/jvm-release-summary.json", {
            "passed": True, "executed": len(rows), "failed": 0, "skipped": 0, "cases": rows})
        for name in GATE.BROWSER_JSON:
            save(self.inputs / "build-browser-proof" / name, {"syntheticCiGateFixture": True, "name": name})
        write(self.inputs / "build-browser-proof/accounting-reset-fr-393.png",
              b"SYNTHETIC CI GATE IMAGE BYTES ONLY")
        files = {path.relative_to(self.inputs).as_posix(): GATE.digest(path)
                 for path in self.inputs.rglob("*") if path.is_file()}
        save(self.inputs / "build-inputs.json", {**self.common,
             "schema": "contamobile-candidate-build-inputs", "baselines": baselines, "files": files})
        self.build_hash = GATE.digest(self.inputs / "build-inputs.json")
        self.native_cases = GATE.source_cases(SOURCE, "androidTest")
        for group, versions in GATE.GROUPS.items():
            root = self.children / group
            save(root / "child-proof.json", {**self.common,
                 "schema": "contamobile-candidate-child-proof", "group": group,
                 "baselines": versions, "completed": True, "buildInputsSha256": self.build_hash})
            write(root / "after-test-sha256.txt", self.sha)
            write(root / "runtime-errors.txt", "")
            write(root / "root-readiness.txt", "verified uid=0 emulator=1\n")
            write(root / "network-egress-block.txt",
                  "-A ALKARNA_SYNTHETIC_OFFLINE ! -o lo -j REJECT --reject-with icmp-port-unreachable\n"
                  "-A ALKARNA_SYNTHETIC_OFFLINE ! -o lo -j REJECT --reject-with icmp6-port-unreachable\n")
            for name in ("group-network-before.txt", "group-network-after.txt"):
                write(root / name, junit(["CandidateNetworkIsolationTest"], 1))
            if group == "native":
                self.make_native(root)
            else:
                self.make_upgrades(root, versions)

    def make_native(self, root):
        summaries = []
        for suite, (prefix, label, count) in GATE.NATIVE.items():
            text = "\n" + GATE.APP + "." + suite + ":\n"
            text += "\n".join(prefix + " " + name for name in self.native_cases[suite])
            write(root / (suite + ".txt"), text + f"\nOK ({count} tests)\n")
            for suffix in ("before", "after"):
                write(root / f"{label}-network-{suffix}.txt", junit(["CandidateNetworkIsolationTest"], 1))
            summaries.append({"suite": suite, "executed": count,
                              "cases": sorted(self.native_cases[suite]), "passed": True})
        save(root / "native-scenario-summary.json", {"suites": summaries})
        for filename, (suite, count) in GATE.EXTRA_NATIVE.items():
            write(root / filename, junit([suite], count))
        offline = {name: cases for name, cases in self.native_cases.items() if name not in GATE.OFFLINE_EXCLUDED}
        write(root / "offline-suites.txt", junit(offline, sum(map(len, offline.values()))))
        for suffix in ("before", "after"):
            write(root / f"offline-suites-network-{suffix}.txt", junit(["CandidateNetworkIsolationTest"], 1))

    def make_upgrades(self, root, versions):
        progress, checks = [], []
        for version in versions:
            for activation in ("temporary", "perpetual"):
                label = f"v{version}-{activation}"
                for phase in GATE.ALL_PHASES:
                    write(root / f"{label}-{phase}.txt", junit(["UpgradePersistenceTest"], 1))
                    for verb in ("BEGIN", "PASS"):
                        progress.append(f"PRESERVATION {verb} baseline=v{version} activation={activation} "
                                        f"phase={'seed-before' if phase == 'before' else phase} candidate=v31")
                    if phase != "before":
                        checks.append({"baseline": version, "activation": activation, "phase": phase, "passed": True})
                for suffix in ("install-r", "repeat-install-r"):
                    write(root / f"{label}-{suffix}.txt", "Performing Streamed Install\nSuccess\n")
                for suffix in ("network", "network-after"):
                    write(root / f"{label}-{suffix}.txt", junit(["CandidateNetworkIsolationTest"], 1))
        write(root / "preservation-progress.txt", "\n".join(progress) + "\n")
        save(root / "preservation-summary.json", {"candidateVersionCode": 31,
             "selectedBaselines": versions, "upgradeScenarios": len(versions) * 2,
             "preservationChecks": len(checks), "checks": checks})

    def merge(self):
        return GATE.merge(self.inputs, self.children, SOURCE, HEAD, self.output, RUN)

    def change_json(self, path, **values):
        data = json.loads(path.read_text(encoding="utf-8"))
        data.update(values)
        save(path, data)

    def reseal_inputs(self):
        """Fixture-only reseal to reach semantic rejection behind hash checks."""
        path = self.inputs / "build-inputs.json"
        build = json.loads(path.read_text(encoding="utf-8"))
        build["files"] = {file.relative_to(self.inputs).as_posix(): GATE.digest(file)
                          for file in self.inputs.rglob("*") if file.is_file() and file != path}
        save(path, build)
        self.build_hash = GATE.digest(path)
        for group in GATE.GROUPS:
            self.change_json(self.children / group / "child-proof.json", buildInputsSha256=self.build_hash)

    def rejects(self, pattern):
        with self.assertRaisesRegex(GATE.ProofError, pattern):
            self.merge()
        self.assertFalse(self.output.exists(), "Rejected evidence must not publish partial output")

    def test_complete_fixture_merges_all_36_seed_and_108_post_checks_and_legacy_names_are_unique(self):
        result = self.merge()
        self.assertEqual((result["upgradeScenarios"], result["seedChecks"], result["preservationChecks"],
                          result["totalPreservationInvocations"]), (36, 36, 108, 144))
        self.assertEqual(result["nativeSuiteCases"], 72)
        self.assertEqual(result["nativeJvmCases"], 47)
        for name in GATE.RESERVED | {"offline-suites.txt"}:
            self.assertEqual(len(list(self.output.rglob(name))), 1, name)
        self.assertEqual(GATE.digest(self.output / GATE.CANDIDATE), self.candidate_hash)
        self.assertEqual(len(list(self.output.rglob("v*-*-before.txt"))), 36)
        for phase in GATE.PHASES:
            self.assertEqual(sum(bool(re.fullmatch(r"v\d+-(?:temporary|perpetual)-" + phase + r"\.txt", path.name))
                                 for path in self.output.rglob("*.txt")), 36)

    def test_missing_child_rejects(self):
        (self.children / "native").rename(self.root / "missing-native")
        self.rejects("seven exact")

    def test_unexpected_or_duplicate_child_rejects(self):
        (self.children / "duplicate").mkdir()
        self.rejects("seven exact")

    def test_changed_candidate_or_test_apk_hash_rejects(self):
        for field in ("candidateSha256", "testApkSha256"):
            path = self.children / "upgrade-28-30/child-proof.json"
            self.change_json(path, **{field: "f" * 64})
            self.rejects("Different candidate/test APK")
            self.change_json(path, **{field: self.common[field]})

    def test_changed_actual_candidate_baseline_or_after_test_hash_rejects(self):
        paths = [(self.inputs / GATE.CANDIDATE, "Different candidate/test APK"),
                 (self.inputs / "baseline-v29/alkarna-approved.apk", "input changed|baseline bytes changed"),
                 (self.children / "native/after-test-sha256.txt", "Different tested APK")]
        for path, message in paths:
            before = path.read_bytes()
            write(path, ("e" * 64 + "  changed.apk\n") if path.name.endswith(".txt") else b"CHANGED")
            self.rejects(message)
            write(path, before)

    def test_original_baseline_pin_rejects_even_with_resealed_file_checksums(self):
        write(self.inputs / "baseline-v29/alkarna-approved.apk", b"CHANGED ORIGINAL BASELINE")
        self.reseal_inputs()
        self.rejects("baseline bytes changed")

    def test_real_adb_install_output_with_crlf_is_accepted(self):
        write(self.children / "upgrade-13-15/v13-temporary-install-r.txt",
              b"Performing Streamed Install\r\nSuccess\r\n")
        self.assertTrue(self.merge()["passed"])

    def test_public_build_browser_evidence_is_preserved_exactly_without_reserved_metadata(self):
        self.merge()
        destination = self.output / "candidate-proof/build-browser"
        expected = GATE.BROWSER_JSON | {"accounting-reset-fr-393.png"}
        self.assertEqual({path.name for path in destination.iterdir()}, expected)
        for name in expected:
            self.assertEqual((destination / name).read_bytes(),
                             (self.inputs / "build-browser-proof" / name).read_bytes())
        self.assertFalse(expected & GATE.RESERVED)

    def test_unapproved_browser_file_or_reserved_basename_cannot_enter_delivery(self):
        path = self.inputs / "build-browser-proof/SHA256SUMS.txt"
        write(path, self.sha)
        self.reseal_inputs()
        self.rejects("Undeclared immutable build input type")

    def test_install_failure_cannot_be_hidden_behind_success(self):
        write(self.children / "upgrade-13-15/v13-temporary-install-r.txt",
              "Success\nFailure [INSTALL_FAILED_UPDATE_INCOMPATIBLE]\n")
        self.rejects("install success")

    def test_foreign_head_run_and_wrong_candidate_version_reject(self):
        path = self.children / "upgrade-13-15/child-proof.json"
        for field, value, message in (("sourceHead", "b" * 40, "Foreign source head"),
                                      ("workflowRunId", RUN + 1, "workflow run"),
                                      ("candidateVersionCode", 29, "Wrong candidate version")):
            self.change_json(path, **{field: value})
            self.rejects(message)
            self.change_json(path, **{field: self.common[field]})
        self.change_json(self.inputs / "build-inputs.json", workflowRunId=RUN + 1)
        self.rejects("workflow run")

    def test_incomplete_child_or_changed_group_membership_rejects(self):
        path = self.children / "upgrade-13-15/child-proof.json"
        self.change_json(path, completed=False)
        self.rejects("Incomplete or foreign")
        self.change_json(path, completed=True, baselines=[13, 14, 16])
        self.rejects("Incomplete or foreign")

    def test_child_from_another_immutable_build_manifest_rejects(self):
        self.change_json(self.children / "native/child-proof.json", buildInputsSha256="f" * 64)
        self.rejects("different immutable build manifest")

    def test_missing_seed_install_network_or_post_phase_rejects(self):
        for suffix, message in (("before", "preservation files"), ("after", "preservation files"),
                                ("repeat-install-r", "Missing regular proof"),
                                ("network-after", "Missing regular proof")):
            path = self.children / f"upgrade-13-15/v13-temporary-{suffix}.txt"
            before = path.read_bytes()
            path.unlink()
            self.rejects(message)
            write(path, before)

    def test_duplicate_or_foreign_preservation_phase_rejects(self):
        root = self.children / "upgrade-13-15"
        write(root / "duplicate/v13-temporary-after.txt", junit(["UpgradePersistenceTest"], 1))
        self.rejects("Duplicate preservation")
        (root / "duplicate/v13-temporary-after.txt").unlink()
        write(root / "v13-temporary-unexpected-phase.txt", junit(["UpgradePersistenceTest"], 1))
        self.rejects("Unexpected preservation")

    def test_failed_skipped_short_message_or_duplicate_junit_total_rejects(self):
        path = self.children / "upgrade-13-15/v13-temporary-after.txt"
        before = path.read_text(encoding="utf-8")
        for extra in ("FAILURES!!!\n", "SKIPPED\n", "AssumptionFailed\n",
                      "INSTRUMENTATION_RESULT: shortMsg=Process crashed\n", "OK (1 test)\n"):
            write(path, before + extra)
            self.rejects("execution|JUnit count")
        write(path, before.replace("OK (1 tests)", "OK (0 tests)"))
        self.rejects("JUnit count")

    def test_native_missing_duplicate_or_unexpected_case_markers_reject(self):
        path = self.children / "native/AccountAccessTest.txt"
        before = path.read_text(encoding="utf-8")
        marker = "ACCOUNT ACCESS CASE PASS " + self.native_cases["AccountAccessTest"][0]
        for changed in (before.replace(marker, ""), before + marker + "\n",
                        before.replace(marker, "ACCOUNT ACCESS CASE PASS unexpectedCase")):
            write(path, changed)
            self.rejects("native case markers")

    def test_native_failed_network_or_missing_original_extra_suite_rejects(self):
        path = self.children / "native/account-access-network-after.txt"
        before = path.read_bytes()
        write(path, "FAILURES!!!\n")
        self.rejects("execution")
        write(path, before)
        (self.children / "native/native-support-cold-entry.txt").unlink()
        self.rejects("Missing regular proof")

    def test_jvm_xml_skipped_or_missing_case_cannot_be_laundered_by_passing_summary(self):
        path = next((self.inputs / "approved-android/app/build/test-results/testReleaseUnitTest").glob("TEST-*.xml"))
        before = path.read_text(encoding="utf-8")
        write(path, before.replace('skipped="0"', 'skipped="1"'))
        self.reseal_inputs()
        self.rejects("Failed/skipped JVM")
        write(path, before)
        path.unlink()
        self.reseal_inputs()
        self.rejects("Missing, duplicate or unexpected JVM")

    def test_mutated_immutable_jvm_report_rejects_before_summary_laundering(self):
        write(self.inputs / "candidate-proof/jvm-release-summary.json", "{}\n")
        self.rejects("Immutable build input changed")

    def test_child_summary_cannot_hide_duplicate_or_missing_actual_phase(self):
        path = self.children / "upgrade-13-15/preservation-summary.json"
        summary = json.loads(path.read_text(encoding="utf-8"))
        summary["checks"][1] = summary["checks"][0]
        save(path, summary)
        self.rejects("summary differs")

    def test_group_egress_runtime_or_offline_suite_failure_rejects(self):
        path = self.children / "upgrade-28-30/runtime-errors.txt"
        write(path, "FATAL EXCEPTION: main\n")
        self.rejects("Fatal Android runtime")
        write(path, "")
        path = self.children / "upgrade-28-30/network-egress-block.txt"
        write(path, "No IPv6 firewall\n")
        self.rejects("IPv4/IPv6")

    def test_duplicate_progress_wrong_order_or_wrong_candidate_rejects(self):
        path = self.children / "upgrade-13-15/preservation-progress.txt"
        before = path.read_text(encoding="utf-8")
        lines = before.splitlines()
        for value in (before + lines[0] + "\n", "\n".join([lines[1], lines[0]] + lines[2:]) + "\n",
                      before.replace("candidate=v31", "candidate=v29", 1)):
            write(path, value)
            self.rejects("preservation progress")

    def test_ambiguous_json_keys_or_stale_output_rejects(self):
        path = self.children / "native/child-proof.json"
        before = path.read_text(encoding="utf-8")
        write(path, before.replace('"version": 1', '"version": 1, "version": 1'))
        self.rejects("Duplicate JSON key")
        write(path, before)
        self.output.mkdir()
        with self.assertRaisesRegex(GATE.ProofError, "Output must be new"):
            self.merge()


if __name__ == "__main__":
    unittest.main(verbosity=2)
