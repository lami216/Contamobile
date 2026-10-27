"""Read-only inspection of the final customer APK. Never substitutes source checks for APK evidence."""
from pathlib import Path
import json,sys,zipfile,hashlib

def check(apk, config):
    origin=config['CONTATOOLS_ORIGIN'];keys=config['CONTATOOLS_ISSUERS']
    assert origin == 'https://3ali.store' and keys, 'Confirmed production origin/issuers required'
    for key in keys.values():
        assert set(key)=={'kty','crv','x','y'} and key['kty']=='EC' and key['crv']=='P-256', 'Public verification parameters only'
    with zipfile.ZipFile(apk) as package:
        dex=b''.join(package.read(n) for n in package.namelist() if n.endswith('.dex'))
        assert origin.encode() in dex, 'Production service origin missing from APK'
        expected=json.dumps(keys,separators=(',',':'),ensure_ascii=True).encode()
        assert expected in dex, 'Exact confirmed issuer map missing from APK'
        assert b'https://appassets.androidplatform.net' in dex, 'Original WebView origin missing'
        for secret in [b'-----BEGIN PRIVATE KEY-----',b'keystoreBase64',b'ALKARNA_SIGNING_BUNDLE']:
            assert secret not in dex, 'Private deployment/signing material detected'
    return {'apkSha256':hashlib.sha256(Path(apk).read_bytes()).hexdigest(),'origin':origin,'publicIssuerIds':list(keys),'inspection':'actual APK bytes'}

if __name__=='__main__':
    if len(sys.argv)!=2:raise SystemExit('Usage: verify-contatools-apk.py FINAL_APK')
    config=json.loads((Path(__file__).resolve().parent.parent/'approved-android/contatools-public.json').read_text())
    print(json.dumps(check(sys.argv[1],config),indent=2))
