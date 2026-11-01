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
# The baseline is the exact signed v19 from successful run 41264015644,
# source 7742c98594fee76d50aab4f749c8c9850a059552; it must never be rebuilt.
assert (code,name)==((19,'1.0.18') if mode=='baseline' else (20,'1.0.19'))
if mode=='baseline':assert actual=='c5558a074e48c5705f10ef20b233d39d33ee1ccc3b91d5c0bfe1c745d0153f3e'
signature=subprocess.check_output([str(sdk/'apksigner'),'verify','--verbose','--print-certs',str(apk)],text=True)
certs=re.findall(r'Signer #\d+ certificate SHA-256 digest: ([a-fA-F0-9]+)',signature)
assert certs==[expected_cert],'Permanent signing identity changed'
assert 'application-debuggable' not in badging
result={'mode':mode,'file':apk.name,'applicationId':app,'versionCode':code,'versionName':name,'sha256':actual,'certificateSha256':expected_cert,'bytes':apk.stat().st_size,'apksignerVerified':True}
if mode=='candidate':
 config=json.loads((root/'approved-android/contatools-public.json').read_text())
 result['service']=runpy.run_path(str(root/'scripts/verify-contatools-apk.py'))['check'](apk,config)
print(json.dumps(result,indent=2))
