"""Inspect downloaded baseline or candidate bytes with official Android tools."""
from pathlib import Path
import hashlib,json,os,re,subprocess,sys,runpy
mode,filename=sys.argv[1:]
assert mode in ['baseline','candidate']
apk=Path(filename);root=Path(__file__).resolve().parent.parent
sdk=Path(os.environ['ANDROID_HOME'])/'build-tools/35.0.0'
expected_cert='a696960cb0e62dc311287331500a2a0b459bff8a0188c8d9ab55edbdaddd1fd2'
actual=hashlib.sha256(apk.read_bytes()).hexdigest()
badging=subprocess.check_output([str(sdk/'aapt'),'dump','badging',str(apk)],text=True)
match=re.search(r"^package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'",badging,re.M)
assert match,'Missing APK identity'
app,code,name=match.groups();code=int(code)
assert app=='mr.alkarna.mobile.approved'
# The baseline is the exact signed v28 delivered from successful run 43057716368,
# source fd621872ba20ad2149ad6910d76f9ac30494bf90; it must never be rebuilt.
assert (code,name)==((28,'1.0.27') if mode=='baseline' else (29,'1.0.28'))
if mode=='baseline':assert actual=='9fde991e118b464dce9649bb3f86b9d20bbe5ebf01bbce3726f66265bb77bb59'
if mode=='candidate':
 target=re.search(r"^targetSdkVersion:'(\d+)'",badging,re.M)
 assert target and int(target.group(1))==36,'Candidate must target Android API 36'
signature=subprocess.check_output([str(sdk/'apksigner'),'verify','--verbose','--print-certs',str(apk)],text=True)
certs=re.findall(r'Signer #\d+ certificate SHA-256 digest: ([a-fA-F0-9]+)',signature)
assert certs==[expected_cert],'Permanent signing identity changed'
assert 'application-debuggable' not in badging
result={'mode':mode,'file':apk.name,'applicationId':app,'versionCode':code,'versionName':name,'sha256':actual,'certificateSha256':expected_cert,'bytes':apk.stat().st_size,'apksignerVerified':True}
if mode=='candidate':
 config=json.loads((root/'approved-android/contatools-public.json').read_text())
 result['service']=runpy.run_path(str(root/'scripts/verify-contatools-apk.py'))['check'](apk,config)
print(json.dumps(result,indent=2))
