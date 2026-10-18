"""Check the customer APK includes the native gate but no instrumentation issuer/fixtures."""
from pathlib import Path
import sys,zipfile
apk=Path(sys.argv[1])
with zipfile.ZipFile(apk) as package:
    names=package.namelist()
    for name in ['activation.html','activation.css','activation.js']:
        assert 'assets/approved/'+name in names, 'Missing activation UI: '+name
    assert not any('license-contract.json' in name for name in names), 'Test fixture included in APK'
    dex=b''.join(package.read(name) for name in names if name.endswith('.dex'))
    for name in [b'LicenseVerifier;',b'DeviceLicense;',b'LicenseClock;']:
        assert name in dex, 'Native gate missing: '+name.decode()
    for name in [b'TestLicenseIssuer;',b'LicenseCompatibilityTest;',b'ALKARNA_TEST_LICENSE_BYPASS']:
        assert name not in dex, 'Test-only activation code included: '+name.decode()
    for key in [b'VafWOl9h-bF8auIQTUvS5AATeR8yyxJu49p-QSzk7-s',b'-kAStxv0yNuJ9GyzSNaiywfrZ5BziSWL5kJVMFOnRUY']:
        assert key in dex, 'Desktop production verification key missing'
print('PASS customer APK includes native activation and desktop public keys; no test issuer, fixtures, or activation bypass')
