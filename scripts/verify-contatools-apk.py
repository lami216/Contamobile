"""Read-only inspection of the final customer APK. Never substitutes source checks for APK evidence."""
from pathlib import Path
import json,sys,zipfile,hashlib,struct

def dex_strings(data):
    assert data.startswith(b'dex\n'), 'Expected actual DEX data'
    count,offset=struct.unpack_from('<II',data,56)
    assert offset+count*4 <= len(data), 'Invalid DEX string index'
    for index in range(count):
        pos=struct.unpack_from('<I',data,offset+index*4)[0]
        while data[pos]&128:pos+=1
        pos+=1
        yield data[pos:data.index(b'\0',pos)].decode('utf-8',errors='replace')

def check(apk, config):
    origin=config['CONTATOOLS_ORIGIN'];keys=config['CONTATOOLS_ISSUERS']
    assert origin == 'https://3ali.store' and keys, 'Confirmed production origin/issuers required'
    for key in keys.values():
        assert set(key)=={'kty','crv','x','y'} and key['kty']=='EC' and key['crv']=='P-256', 'Public verification parameters only'
    with zipfile.ZipFile(apk) as package:
        dex_files=[package.read(n) for n in package.namelist() if n.endswith('.dex')]
        dex=b''.join(dex_files)
        assert origin.encode() in dex, 'Production service origin missing from APK'
        maps=[]
        for data in dex_files:
            for value in dex_strings(data):
                if value.startswith('{'):
                    try:maps.append(json.loads(value))
                    except ValueError:pass
        assert keys in maps, 'Exact confirmed issuer map missing from APK'
        assert b'https://appassets.androidplatform.net' in dex, 'Original WebView origin missing'
        for secret in [b'-----BEGIN PRIVATE KEY-----',b'keystoreBase64',b'ALKARNA_SIGNING_BUNDLE']:
            assert secret not in dex, 'Private deployment/signing material detected'
    return {'apkSha256':hashlib.sha256(Path(apk).read_bytes()).hexdigest(),'origin':origin,'publicIssuerIds':list(keys),'inspection':'actual APK bytes'}

if __name__=='__main__':
    if len(sys.argv)!=2:raise SystemExit('Usage: verify-contatools-apk.py FINAL_APK')
    config=json.loads((Path(__file__).resolve().parent.parent/'approved-android/contatools-public.json').read_text())
    print(json.dumps(check(sys.argv[1],config),indent=2))
