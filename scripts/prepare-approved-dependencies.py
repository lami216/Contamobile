"""Fetch one pinned build dependency; the installed application has no network permission."""
from pathlib import Path
import base64,hashlib,io,tarfile,urllib.request

ROOT=Path(__file__).resolve().parents[1]
VERSION='1.13.0'
INTEGRITY='RJbVP1HRDlUUXahJ7VMTcu9Rm1Nzw+EBpoPr94vnbD4LwR715F3CcxE2G2k45PewcaZ57pjetYa+LoSJLAASgA=='
ASSET_SHA256='c83beac167ae9c1af075449555b1db68b24b5280d0fc65c1f7ac4d1cd103459d'

def prepare():
    path=ROOT/'approved-runtime/assets/sql-asm.js'
    if path.exists() and hashlib.sha256(path.read_bytes()).hexdigest()==ASSET_SHA256:
        return
    with urllib.request.urlopen(f'https://registry.npmjs.org/sql.js/-/sql.js-{VERSION}.tgz',timeout=60) as response:
        package=response.read(4*1024*1024+1)
    if len(package)>4*1024*1024 or base64.b64encode(hashlib.sha512(package).digest()).decode()!=INTEGRITY:
        raise ValueError('Pinned sql.js package integrity mismatch')
    with tarfile.open(fileobj=io.BytesIO(package),mode='r:gz') as archive:
        data=archive.extractfile('package/dist/sql-asm.js').read(2*1024*1024+1)
    if hashlib.sha256(data).hexdigest()!=ASSET_SHA256:
        raise ValueError('Pinned sql.js runtime digest mismatch')
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_bytes(data)

if __name__=='__main__':
    prepare()
    print('Verified pinned offline SQLite runtime')
