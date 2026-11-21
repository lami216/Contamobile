"""Synthetic unit fixtures for artifact gates; not APK/signature/device acceptance."""
import hashlib
import contextlib
import io
import json
import re
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

SOURCE=Path(__file__).resolve().parent/'candidate-inputs.py'
module=types.ModuleType('candidate_inputs_fixture');module.__file__=str(SOURCE)
exec(compile(SOURCE.read_text(encoding='utf-8'),str(SOURCE),'exec'),module.__dict__)
HEAD='1'*40
RUN=123

class InputGateTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory(prefix='candidate-input-gates-');self.root=Path(self.temp.name)
  self.pins={version:hashlib.sha256(('synthetic-baseline-'+version).encode()).hexdigest() for version in module.BASELINES}
  self.patcher=patch.object(module,'BASELINES',self.pins);self.patcher.start()
  for name in module.REQUIRED:
   target=self.root/name;target.parent.mkdir(parents=True,exist_ok=True)
   version=re.fullmatch(r'baseline-v(\d+)/alkarna-approved.apk',name)
   target.write_bytes(('synthetic-baseline-'+version[1]).encode() if version else ('synthetic:'+name).encode())
  self.candidate=self.root/module.CANDIDATE;self.test_apk=self.root/module.TEST_APK
  self.write('candidate-output/candidate-verified.json',{'applicationId':module.APP,'versionCode':34,'versionName':'1.0.33','certificateSha256':module.CERT,'sha256':module.sha(self.candidate),'apksignerVerified':True})
  self.write('candidate-proof/jvm-release-summary.json',{'passed':True,'executed':48,'sourceCasesExactlyMatched':True,'failed':0,'skipped':0})
  (self.root/'candidate-output/SHA256SUMS.txt').write_text(module.sha(self.candidate)+'  '+module.CANDIDATE+'\n')
  self.manifest={'schema':'contamobile-candidate-build-inputs','version':1,'sourceHead':HEAD,'workflowRunId':RUN,'candidateVersionCode':34,'candidateSha256':module.sha(self.candidate),'testApkSha256':module.sha(self.test_apk),'baselines':dict(self.pins),'files':{name:module.sha(self.root/name) for name in module.REQUIRED}}
  self.save()
 def tearDown(self):self.patcher.stop();self.temp.cleanup()
 def write(self,path,value):(self.root/path).write_text(json.dumps(value),encoding='utf-8')
 def save(self):self.write('build-inputs.json',self.manifest)
 def verify(self,head=HEAD,run=RUN):return module.verify(self.root,head,run,official=False)
 def test_valid_fixture_verifies_all_required_bytes(self):self.assertEqual(self.verify()['candidateSha256'],module.sha(self.candidate))
 def test_changed_customer_apk_fails(self):self.candidate.write_bytes(b'changed');self.assertRaises(AssertionError,self.verify)
 def test_changed_instrumentation_apk_fails(self):self.test_apk.write_bytes(b'changed');self.assertRaises(AssertionError,self.verify)
 def test_foreign_source_head_fails(self):self.assertRaises(AssertionError,self.verify,'2'*40)
 def test_foreign_workflow_run_fails(self):self.assertRaises(AssertionError,self.verify,HEAD,RUN+1)
 def test_missing_original_baseline_fails(self):del self.manifest['files']['baseline-v29/alkarna-approved.apk'];self.save();self.assertRaises(AssertionError,self.verify)
 def test_missing_delivered_v30_baseline_fails(self):del self.manifest['files']['baseline-v30/alkarna-approved.apk'];self.save();self.assertRaises(AssertionError,self.verify)
 def test_missing_delivered_v31_baseline_fails(self):del self.manifest['files']['baseline-v31/alkarna-approved.apk'];self.save();self.assertRaises(AssertionError,self.verify)
 def test_missing_delivered_v32_baseline_fails(self):del self.manifest['files']['baseline-v32/alkarna-approved.apk'];self.save();self.assertRaises(AssertionError,self.verify)
 def test_missing_delivered_v33_baseline_fails(self):del self.manifest['files']['baseline-v33/alkarna-approved.apk'];self.save();self.assertRaises(AssertionError,self.verify)
 def test_replacing_a_pin_even_with_a_consistent_file_map_fails(self):
  target=self.root/'baseline-v13/alkarna-approved.apk';target.write_bytes(b'replacement');self.manifest['baselines']['13']=module.sha(target);self.manifest['files']['baseline-v13/alkarna-approved.apk']=module.sha(target);self.save();self.assertRaises(AssertionError,self.verify)
 def test_inconsistent_customer_hash_fails(self):self.manifest['candidateSha256']='0'*64;self.save();self.assertRaises(AssertionError,self.verify)
 def test_inconsistent_test_hash_fails(self):self.manifest['testApkSha256']='0'*64;self.save();self.assertRaises(AssertionError,self.verify)
 def test_unknown_file_outside_public_input_allowlist_fails(self):self.manifest['files']['secret.p12']='0'*64;self.save();self.assertRaises(AssertionError,self.verify)
 def test_report_path_escape_fails(self):self.manifest['files']['approved-android/app/build/reports/tests/../../outside']='0'*64;self.save();self.assertRaises(AssertionError,self.verify)
 def test_jvm_failure_or_skip_fails_even_with_updated_digest(self):
  path='candidate-proof/jvm-release-summary.json';self.write(path,{'passed':True,'executed':48,'sourceCasesExactlyMatched':True,'failed':0,'skipped':1});self.manifest['files'][path]=module.sha(self.root/path);self.save();self.assertRaises(AssertionError,self.verify)
 def cli(self,*extra):
  with patch('sys.argv',[str(SOURCE),*extra]),patch.object(module,'identity',return_value=None),contextlib.redirect_stdout(io.StringIO()):module.main()
 def proof_fixture(self,group):
  proof=self.root/'execution-proof';proof.mkdir()
  for name in ['group-network-before.txt','group-network-after.txt']:(proof/name).write_text('OK (1 test)\n')
  (proof/'after-test-sha256.txt').write_text(self.manifest['candidateSha256']+'  '+module.CANDIDATE+'\n')
  if group=='native':
   names=['StandaloneControlTest','CloudBackupTest','AccountingResetTest','OwnerUsernameRecoveryTest','AccountingParityTest','DeviceCloudLifecycleTest','BootstrapSupportOutcomeTest','PhoneReplacementTest']
   counts={'StandaloneControlTest':13,'CloudBackupTest':7}
   (proof/'native-scenario-summary.json').write_text(json.dumps({'suites':[{'suite':name,'executed':counts.get(name,6),'passed':True} for name in names]}))
  else:
   selected=module.GROUPS[group];(proof/'preservation-summary.json').write_text(json.dumps({'candidateVersionCode':34,'selectedBaselines':selected,'upgradeScenarios':len(selected)*2,'preservationChecks':len(selected)*6}))
  return proof
 def complete(self,group,proof):self.cli('complete','--inputs',str(self.root),'--head',HEAD,'--run',str(RUN),'--check-workspace',str(self.root),'--group',group,'--proof',str(proof))
 def test_materialization_copies_public_working_inputs_without_duplicating_jvm_proof(self):
  with tempfile.TemporaryDirectory(prefix='candidate-materialized-') as directory:
   target=Path(directory);self.cli('verify','--inputs',str(self.root),'--head',HEAD,'--run',str(RUN),'--materialize',str(target))
   self.assertEqual(module.sha(target/module.CANDIDATE),self.manifest['candidateSha256']);self.assertTrue((target/module.TEST_APK).is_file());self.assertFalse((target/'candidate-proof').exists());self.assertEqual(len(list(target.glob('baseline-v*/alkarna-approved.apk'))),21)
 def test_build_creation_retains_only_allowlisted_public_browser_proof(self):
  browser=self.root/'build-browser-proof'
  for name in module.BROWSER_JSON:(self.root/'candidate-proof'/name).write_bytes((browser/name).read_bytes());(browser/name).unlink()
  browser.rmdir();(self.root/'candidate-proof/accounting-reset-fr-393.png').write_bytes(b'synthetic-public-screenshot');(self.root/'candidate-proof/private-capture.png').write_bytes(b'not-allowlisted');(self.root/'candidate-proof/candidate-verified.json').write_text('{}')
  self.cli('create','--inputs',str(self.root),'--head',HEAD,'--run',str(RUN));manifest=module.load(self.root/'build-inputs.json')
  self.assertIn('build-browser-proof/accounting-reset-fr-393.png',manifest['files']);self.assertIn('build-browser-proof/standalone-control-ux-proof.json',manifest['files']);self.assertFalse((browser/'private-capture.png').exists());self.assertFalse((browser/'candidate-verified.json').exists());self.assertEqual(len(list(browser.glob('*-ux-proof.json'))),7)
 def test_browser_allowlist_refuses_reserved_or_unreviewed_basenames(self):
  for name in ['candidate-verified.json','SHA256SUMS.txt','jvm-release-summary.json','arbitrary.png','nested/backup-ux-ar-393.png']:self.assertFalse(module.known_file('build-browser-proof/'+name),name)
 def test_native_completion_metadata_binds_exact_build_head_run_and_test_apk(self):
  proof=self.proof_fixture('native');self.complete('native',proof);child=module.load(proof/'child-proof.json')
  self.assertEqual((child['sourceHead'],child['workflowRunId'],child['group'],child['baselines']),(HEAD,RUN,'native',[]));self.assertEqual(child['testApkSha256'],self.manifest['testApkSha256']);self.assertEqual(child['buildInputsSha256'],module.sha(self.root/'build-inputs.json'));self.assertIs(child['completed'],True)
 def test_upgrade_completion_metadata_has_only_the_exact_fixed_partition(self):
  proof=self.proof_fixture('upgrade-28-33');self.complete('upgrade-28-33',proof);self.assertEqual(module.load(proof/'child-proof.json')['baselines'],[28,29,30,31,32,33])
 def test_completion_rejects_missing_required_network_check(self):
  proof=self.proof_fixture('native');(proof/'group-network-after.txt').unlink();self.assertRaises(FileNotFoundError,self.complete,'native',proof);self.assertFalse((proof/'child-proof.json').exists())
 def test_completion_rejects_a_different_post_test_apk_hash(self):
  proof=self.proof_fixture('native');(proof/'after-test-sha256.txt').write_text('0'*64+'  '+module.CANDIDATE+'\n');self.assertRaises(AssertionError,self.complete,'native',proof);self.assertFalse((proof/'child-proof.json').exists())
 def official_fixture(self,*,target=None,code='34',sdk='36',cert=None,debug=False):
  def output(command,**_):
   if 'xmltree' in command:return 'A: android:targetPackage(0x01010021)="'+(target or module.APP)+'" (Raw: "fixture")'
   if 'badging' in command:
    if str(command[-1]).endswith('app-release-androidTest.apk'):return "package: name='"+module.APP+".test' versionCode='' versionName=''\ntargetSdkVersion:'36'\n"
    return "package: name='"+module.APP+"' versionCode='"+code+"' versionName='1.0.33'\ntargetSdkVersion:'"+sdk+"'\n"+('application-debuggable\n' if debug else '')
   return 'Signer #1 certificate SHA-256 digest: '+(cert or module.CERT)+'\n'
  with patch.dict(module.os.environ,{'ANDROID_HOME':str(self.root)}),patch.object(module.subprocess,'check_output',side_effect=output),patch.object(module.runpy,'run_path',return_value={'check':lambda *_:None}):module.identity(self.root)
 def test_official_metadata_parser_accepts_real_test_apk_empty_versions(self):self.official_fixture()
 def test_foreign_instrumentation_target_fails(self):self.assertRaises(AssertionError,self.official_fixture,target='foreign.application')
 def test_debug_candidate_fails(self):self.assertRaises(AssertionError,self.official_fixture,debug=True)
 def test_wrong_candidate_version_fails(self):self.assertRaises(AssertionError,self.official_fixture,code='29')
 def test_delivered_v30_cannot_be_reused_as_the_new_candidate(self):self.assertRaises(AssertionError,self.official_fixture,code='30')
 def test_wrong_api_target_fails(self):self.assertRaises(AssertionError,self.official_fixture,sdk='35')
 def test_unapproved_certificate_fails(self):self.assertRaises(AssertionError,self.official_fixture,cert='0'*64)

class FixedPartitionTests(unittest.TestCase):
 def test_each_browser_proof_producer_runs_in_the_runtime_and_candidate_jobs(self):
  workflow=(SOURCE.parents[1]/'.github/workflows/contatools-candidate.yml').read_text(encoding='utf-8')
  for job in ['runtime_access','candidate']:
   body=re.search(r'^  '+job+r':\n(.*?)(?=^  [a-z_]+:|\Z)',workflow,re.M|re.S)
   self.assertIsNotNone(body,job)
   self.assertIn('node scripts/test-standalone-control-ux.mjs',body[1],job)
 def test_the_six_known_groups_cover_each_original_once(self):
  groups=[values for key,values in module.GROUPS.items() if key!='native']
  self.assertEqual(len(groups),6);self.assertEqual([v for group in groups for v in group],list(range(13,34)));self.assertEqual(module.GROUPS['native'],[])
 def test_hardcoded_original_hashes_match_existing_workflow_pins(self):
  workflow=(SOURCE.parents[1]/'.github/workflows/contatools-candidate.yml').read_text(encoding='utf-8')
  found={v:sha for sha,v in re.findall(r'echo "([0-9a-f]{64})  baseline-v(\d+)/alkarna-approved.apk"',workflow)}
  self.assertEqual(module.BASELINES,found)

if __name__=='__main__':unittest.main()
