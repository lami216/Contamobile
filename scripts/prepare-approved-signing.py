"""Materialize the persistent GitHub signing secret in ephemeral runner storage only."""
import base64, json, os
from pathlib import Path

def prepare(environ=os.environ):
    encoded = environ.get('ALKARNA_SIGNING_BUNDLE', '')
    if not encoded:
        raise ValueError('Missing ALKARNA_SIGNING_BUNDLE repository secret; refusing temporary signing.')
    try:
        bundle = json.loads(encoded)
        raw = base64.b64decode(bundle['keystoreBase64'], validate=True)
        values = {
            'ALKARNA_STORE_PASSWORD': bundle['storePassword'],
            'ALKARNA_KEY_PASSWORD': bundle['keyPassword'],
            'ALKARNA_KEY_ALIAS': bundle['keyAlias'],
        }
        if len(raw) < 500 or len(raw) > 100000:
            raise ValueError()
        if any(not isinstance(v, str) or not v or '\n' in v or '\r' in v for v in values.values()):
            raise ValueError()
    except (ValueError, KeyError, TypeError):
        raise ValueError('Invalid signing bundle; refusing to generate a replacement key.') from None
    folder = Path(environ['RUNNER_TEMP']) / 'alkarna-signing'
    folder.mkdir(mode=0o700 if os.name != 'nt' else 0o777, exist_ok=True)
    path = folder / 'release.p12'
    path.write_bytes(raw)
    path.chmod(0o600)
    values['ALKARNA_KEYSTORE_PATH'] = str(path.resolve())
    with Path(environ['GITHUB_ENV']).open('a', encoding='utf-8') as output:
        for name, value in values.items():
            # GitHub masks secret values even if another tool accidentally echoes them.
            masked = value.replace('%', '%25').replace('\r', '%0D').replace('\n', '%0A')
            print('::add-mask::'+masked)
            output.write(name+'='+value+'\n')
    print('Persistent release signing configured; certificate is verified against the repository pin by Gradle.')

if __name__ == '__main__':
    try:
        prepare()
    except (ValueError, OSError) as error:
        raise SystemExit(str(error))
