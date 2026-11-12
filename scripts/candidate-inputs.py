"""Freeze/verify one signed CI build for isolated emulator proof groups.

Children verify immutable bytes; they never build or sign an APK. This helper
does not install an app or access a production service.
"""
import argparse
import hashlib
import json
import os
import re
import runpy
import shutil
import subprocess
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
CERT='a696960cb0e62dc311287331500a2a0b459bff8a0188c8d9ab55edbdaddd1fd2'
APP='mr.alkarna.mobile.approved'
CANDIDATE='candidate-output/alkarna-1.0.29-v30.apk'
TEST_APK='approved-android/app/build/outputs/apk/androidTest/release/app-release-androidTest.apk'
BASELINES={
 '13':'9c6f9ccc5000b58864191f2e6003d79560c811aa7190878620cb1900a61cfe8c',
 '14':'4d69fc1f88d4709d4928c906e15801ff2028995ad0131d611e946973bb831c90',
 '15':'6204cfe04ce59acb2d4e089bb9d1711524949441e04b05d5b10b0c985ff7b74d',
 '16':'4b896ca65abe0ca8ec9e766c48f66442f0aa82dcbc24696f47d6cf52ea0ade7d',
 '17':'4ea578e57144431cfc2aab9902f717834ba5f1e8936e3e77141f12d66cc10b9a',
 '18':'ef3b276c51c7cfb92616080d1b8145dce2a7a4b6c48198356bdec9b34eaf59a4',
 '19':'c5558a074e48c5705f10ef20b233d39d33ee1ccc3b91d5c0bfe1c745d0153f3e',
 '20':'94848194716a6a794182ae4eb86d29af471899b79bc3a6c011903e58613c52e4',
 '21':'8c662cc4b98578bacf04b60fbe302a4222a5aba8f4578d181dcb961c13554f90',
 '22':'88e85413785a0a969f96a7545ae0d3eaf3f0dfce2b99373199610df0a84266cd',
 '23':'fd337af2516d614319c4cbd2d61b29ca0b55e83e96c577df544020879dcaf587',
 '24':'cc8f16481f1f185a29a089fd2c73c6b593db65dd6d672a53178ba485370c2a6c',
 '25':'ceca18d43dceb2dd952923410b8c6c4e3c93157b2a56f338d0c64c311cce8cd4',
 '26':'7226c40c95aed22d474aa146b7d53681c701a7818b2fed1a89820a41c461df45',
 '27':'174da0f4e076250cda7aa436f9b776d1b6bebd5c60a6cd543d5702b9ac4a55e3',
 '28':'9fde991e118b464dce9649bb3f86b9d20bbe5ebf01bbce3726f66265bb77bb59',
 '29':'4a14cb5cc87db8a42b56a0de91a504c2aa799f53d661ac7ba2cd234051c2c592',
}
GROUPS={'native':[],**{'upgrade-'+str(a)+'-'+str(b):list(range(a,b+1)) for a,b in [(13,15),(16,18),(19,21),(22,24),(25,27),(28,29)]}}
BROWSER_JSON={'accounting-parity-ux-proof.json','backup-ux-proof.json','device-lifecycle-ux-proof.json','owner-recovery-ux-proof.json','phone-replacement-ux-proof.json','signed-accounts-ux-proof.json'}
BROWSER_PNG=re.compile(r'(?:accounting-reset-fr-393|(?:backup-ux|manual-backup)-(?:ar|fr)-393|cloud-bootstrap-(?:ar|fr)-(?:360|393)|(?:online-activation|bootstrap-terminal)-(?:ar|fr)-360|owner-recovery-ux-(?:ar|fr)-(?:360|393)|phone-replacement-(?:replaced|accepted)-(?:ar|fr)-(?:360|393))\.png')
PUBLIC=[CANDIDATE,TEST_APK,'candidate-output/candidate-verified.json','candidate-output/baseline-verified.json','candidate-output/SHA256SUMS.txt']
REQUIRED=PUBLIC+['candidate-proof/jvm-release-summary.json']+[f'baseline-v{version}/alkarna-approved.apk' for version in BASELINES]+['build-browser-proof/'+name for name in sorted(BROWSER_JSON)]

def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def load(path):return json.loads(path.read_text(encoding='utf-8-sig'))
def safe(root,name):
 assert isinstance(name,str) and not name.startswith(('/', '\\')) and '\\' not in name
 parts=Path(name).parts
 assert parts and all(p not in ('.','..') and ':' not in p for p in parts)
 path=root/name
 assert path.resolve().is_relative_to(root.resolve()) and not path.is_symlink(),name
 return path
def known_file(name):
 browser=Path(name).parts
 return name in REQUIRED or (len(browser)==2 and browser[0]=='build-browser-proof' and (browser[1] in BROWSER_JSON or BROWSER_PNG.fullmatch(browser[1]) is not None)) or name.startswith(('approved-android/app/build/reports/tests/','approved-android/app/build/test-results/testReleaseUnitTest/'))
def identity(inputs):
 sdk=Path(os.environ['ANDROID_HOME'])/'build-tools/35.0.0'
 aapt=sdk/('aapt.exe' if os.name=='nt' else 'aapt')
 signer=sdk/('apksigner.bat' if os.name=='nt' else 'apksigner')
 for relative,app in [(CANDIDATE,APP),(TEST_APK,APP+'.test')]:
  apk=safe(inputs,relative)
  badge=subprocess.check_output([str(aapt),'dump','badging',str(apk)],text=True)
  package=re.search(r"^package: name='([^']+)' versionCode='(\d*)' versionName='([^']*)'",badge,re.M)
  assert package and package[1]==app,relative
  if relative==CANDIDATE:
   assert package.groups()[1:] == ('30','1.0.29') and "targetSdkVersion:'36'" in badge and 'application-debuggable' not in badge
  else:
   manifest=subprocess.check_output([str(aapt),'dump','xmltree',str(apk),'AndroidManifest.xml'],text=True)
   assert re.search(r'android:targetPackage\(0x[0-9a-fA-F]+\)="'+re.escape(APP)+'"',manifest),'Instrumentation target missing'
  signatures=subprocess.check_output([str(signer),'verify','--verbose','--print-certs',str(apk)],text=True)
  assert re.findall(r'Signer #\d+ certificate SHA-256 digest: ([a-fA-F0-9]+)',signatures)==[CERT],relative
 config=load(ROOT/'approved-android/contatools-public.json')
 runpy.run_path(str(ROOT/'scripts/verify-contatools-apk.py'))['check'](safe(inputs,CANDIDATE),config)

def verify(inputs,head,run,official=True):
 m=load(inputs/'build-inputs.json')
 assert m['schema']=='contamobile-candidate-build-inputs' and m['version']==1
 assert re.fullmatch('[0-9a-f]{40}',head) and m['sourceHead']==head
 assert type(run) is int and run>0 and type(m['workflowRunId']) is int and m['workflowRunId']==run
 assert m['candidateVersionCode']==30 and m['baselines']==BASELINES
 assert isinstance(m['files'],dict) and set(REQUIRED)<=set(m['files']) and len(m['files'])<=10000
 for name,expected in m['files'].items():
  assert known_file(name) and re.fullmatch('[0-9a-f]{64}',expected),name
  path=safe(inputs,name);assert path.is_file() and sha(path)==expected,name
 assert m['candidateSha256']==m['files'][CANDIDATE] and m['testApkSha256']==m['files'][TEST_APK]
 for version,expected in BASELINES.items():assert m['files'][f'baseline-v{version}/alkarna-approved.apk']==expected
 candidate=load(safe(inputs,'candidate-output/candidate-verified.json'))
 assert candidate['sha256']==m['candidateSha256'] and candidate['certificateSha256']==CERT
 assert candidate['applicationId']==APP and candidate['versionCode']==30 and candidate['versionName']=='1.0.29' and candidate['apksignerVerified'] is True
 assert safe(inputs,'candidate-output/SHA256SUMS.txt').read_text().split()[0]==m['candidateSha256']
 jvm=load(safe(inputs,'candidate-proof/jvm-release-summary.json'))
 assert jvm['passed'] is True and jvm['executed']==44 and jvm['failed']==jvm['skipped']==0
 if official:identity(inputs)
 return m

def main():
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('mode',choices=['create','verify','complete'])
 parser.add_argument('--inputs',type=Path,required=True)
 parser.add_argument('--head',required=True)
 parser.add_argument('--run',type=int,required=True)
 parser.add_argument('--materialize',type=Path)
 parser.add_argument('--check-workspace',type=Path)
 parser.add_argument('--group',choices=list(GROUPS))
 parser.add_argument('--proof',type=Path)
 args=parser.parse_args();inputs=args.inputs.resolve()
 if args.mode=='create':
  assert not args.materialize and not args.check_workspace and not args.group and not args.proof
  browser=inputs/'build-browser-proof';browser.mkdir(exist_ok=True)
  for path in (inputs/'candidate-proof').iterdir():
   if path.is_file() and (path.name in BROWSER_JSON or BROWSER_PNG.fullmatch(path.name)):
    assert not path.is_symlink();shutil.copyfile(path,browser/path.name)
  for path in browser.iterdir():assert path.is_file() and known_file('build-browser-proof/'+path.name),path.name
  files=set(REQUIRED)
  files.update('build-browser-proof/'+path.name for path in browser.iterdir())
  for directory in ['approved-android/app/build/reports/tests','approved-android/app/build/test-results/testReleaseUnitTest']:
   files.update(str(p.relative_to(inputs)).replace('\\','/') for p in (inputs/directory).rglob('*') if p.is_file())
  for name in files:assert safe(inputs,name).is_file(),name
  m={'schema':'contamobile-candidate-build-inputs','version':1,'sourceHead':args.head,'workflowRunId':args.run,'candidateVersionCode':30,'candidateSha256':sha(safe(inputs,CANDIDATE)),'testApkSha256':sha(safe(inputs,TEST_APK)),'baselines':BASELINES,'files':{name:sha(safe(inputs,name)) for name in sorted(files)}}
  (inputs/'build-inputs.json').write_text(json.dumps(m,indent=2)+'\n',encoding='utf-8')
 m=verify(inputs,args.head,args.run)
 copies=PUBLIC+[f'baseline-v{version}/alkarna-approved.apk' for version in BASELINES]
 if args.materialize:
  assert args.mode=='verify' and not args.check_workspace
  for name in copies:
   target=safe(args.materialize.resolve(),name);target.parent.mkdir(parents=True,exist_ok=True)
   shutil.copyfile(safe(inputs,name),target)
 if args.check_workspace:
  for name in copies:assert sha(safe(args.check_workspace.resolve(),name))==m['files'][name],name
 if args.mode=='complete':
  assert args.group and args.proof and args.check_workspace and not args.materialize
  proof=args.proof
  for name in ['group-network-before.txt','group-network-after.txt']:
   text=(proof/name).read_text();assert re.search(r'^OK \(1 test\)',text,re.M) and not re.search('FAILURES!!!|INSTRUMENTATION_FAILED|SKIPPED',text,re.I)
  assert (proof/'after-test-sha256.txt').read_text().split()[0]==m['candidateSha256']
  if args.group=='native':
   suites=load(proof/'native-scenario-summary.json')['suites'];assert len(suites)==9 and all(s['passed'] is True for s in suites)
   for name,count in [('AccountAccessTest',10),('OfflineAccountControlTest',15),('CloudBackupTest',7)]:assert len([s for s in suites if s['suite']==name and s['executed']==count])==1
  else:
   p=load(proof/'preservation-summary.json');selected=GROUPS[args.group]
   assert p['candidateVersionCode']==30 and p['selectedBaselines']==selected
   assert p['upgradeScenarios']==len(selected)*2 and p['preservationChecks']==len(selected)*6
  child={'schema':'contamobile-candidate-child-proof','version':1,'sourceHead':args.head,'workflowRunId':args.run,'candidateVersionCode':30,'candidateSha256':m['candidateSha256'],'testApkSha256':m['testApkSha256'],'group':args.group,'baselines':GROUPS[args.group],'completed':True,'buildInputsSha256':sha(inputs/'build-inputs.json')}
  (proof/'child-proof.json').write_text(json.dumps(child,indent=2)+'\n',encoding='utf-8')
 print(json.dumps({'mode':args.mode,'sourceHead':args.head,'candidateSha256':m['candidateSha256'],'testApkSha256':m['testApkSha256'],'pinnedOriginalBaselines':len(BASELINES),'group':args.group,'verified':True}))

if __name__=='__main__':main()
