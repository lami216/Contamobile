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
# The baseline is the exact delivered signed v32 from successful run 43306139583,
# source edeaee1745e7c01dc7e62143dc880e879abdbfb3; it must never be rebuilt.
assert (code,name)==((32,'1.0.31') if mode=='baseline' else (33,'1.0.32'))
if mode=='baseline':assert actual=='043a302c8b4fcd12b3963b2f51b4a79b5982343e9937eb8baed94c3fa64e8761'
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
