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
assert (code,name)==((16,'1.0.15') if mode=='baseline' else (17,'1.0.16'))
if mode=='baseline':assert actual=='4b896ca65abe0ca8ec9e766c48f66442f0aa82dcbc24696f47d6cf52ea0ade7d'
signature=subprocess.check_output([str(sdk/'apksigner'),'verify','--verbose','--print-certs',str(apk)],text=True)
certs=re.findall(r'Signer #\d+ certificate SHA-256 digest: ([a-fA-F0-9]+)',signature)
assert certs==[expected_cert],'Permanent signing identity changed'
assert 'application-debuggable' not in badging
result={'mode':mode,'file':apk.name,'applicationId':app,'versionCode':code,'versionName':name,'sha256':actual,'certificateSha256':expected_cert,'bytes':apk.stat().st_size,'apksignerVerified':True}
if mode=='candidate':
 config=json.loads((root/'approved-android/contatools-public.json').read_text())
 result['service']=runpy.run_path(str(root/'scripts/verify-contatools-apk.py'))['check'](apk,config)
print(json.dumps(result,indent=2))
