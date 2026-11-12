"""Check native license compatibility and reviewed entry, without old manual UI or test issuers."""
from pathlib import Path
import sys,zipfile
apk=Path(sys.argv[1])
runtime=Path(__file__).resolve().parents[1]/'approved-runtime'
with zipfile.ZipFile(apk) as package:
    names=package.namelist()
    for name in ['activation.html','activation.css','activation.js']:
        assert 'assets/approved/'+name not in names, 'Retired manual activation page must not ship: '+name
    for name in ['access.html','access.css','access.js']:
        content=package.read('assets/approved/'+name)
        assert content==(runtime/name).read_text(encoding='utf-8').encode('utf-8'), 'Entry differs from reviewed source: '+name
        assert b'wa.me' not in content and b'whatsapp://' not in content and b'tel:' not in content, 'Activation contact destination in entry: '+name
    entry=package.read('assets/approved/access.js')
    for control in [b'id="manual"',b'id="license-file"',b'id="license-text"',b'id="install-text"']:
        assert control not in entry, 'Retired manual import control in entry: '+control.decode()
    assert b'companyPending' in entry and b'deviceStatus' in entry, 'Owner-reviewed organization pending entry missing'
    assert not any('license-contract.json' in name for name in names), 'Test fixture included in APK'
    dex=b''.join(package.read(name) for name in names if name.endswith('.dex'))
    for name in [b'LicenseVerifier;',b'DeviceLicense;',b'LicenseClock;']:
        assert name in dex, 'Native gate missing: '+name.decode()
    for name in [b'TestLicenseIssuer;',b'LicenseCompatibilityTest;',b'ALKARNA_TEST_LICENSE_BYPASS']:
        assert name not in dex, 'Test-only activation code included: '+name.decode()
    for key in [b'VafWOl9h-bF8auIQTUvS5AATeR8yyxJu49p-QSzk7-s',b'-kAStxv0yNuJ9GyzSNaiywfrZ5BziSWL5kJVMFOnRUY']:
        assert key in dex, 'Desktop production verification key missing'
print('PASS customer APK preserves native license/public keys and reviewed entry; no manual activation page, test issuer, fixture or bypass')
