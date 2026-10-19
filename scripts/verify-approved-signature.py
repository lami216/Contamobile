"""Reject an APK whose public signing identity differs from the pinned release key."""
from pathlib import Path
import os, re, subprocess, sys

root = Path(__file__).resolve().parents[1]
expected = (root / 'approved-android/signing-certificate.sha256').read_text().strip()
sdk = Path(os.environ['ANDROID_HOME']) / 'build-tools/35.0.0'
signer = sdk / ('apksigner.bat' if os.name == 'nt' else 'apksigner')
for argument in sys.argv[1:]:
    result = subprocess.run([str(signer), 'verify', '--verbose', '--print-certs', argument], text=True, capture_output=True, check=True)
    actual = re.findall(r'Signer #\d+ certificate SHA-256 digest: ([a-fA-F0-9]+)', result.stdout)
    if actual != [expected]:
        raise SystemExit('APK release certificate mismatch: '+str(Path(argument).name))
    print(Path(argument).name+': verified persistent certificate '+expected)
