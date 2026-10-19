"""Exercise credential handling without a real release key or printed credentials."""
import base64, contextlib, importlib.util, io, json, shutil, unittest, uuid
from pathlib import Path

spec = importlib.util.spec_from_file_location('signing', Path(__file__).with_name('prepare-approved-signing.py'))
signing = importlib.util.module_from_spec(spec)
spec.loader.exec_module(signing)

class SigningPreparationTest(unittest.TestCase):
    def setUp(self):
        self.base = Path(__file__).resolve().parents[1]/'approved-android/app/build/signing-tests'
        self.root = self.base/uuid.uuid4().hex
        self.root.mkdir(parents=True)
        self.env = {'RUNNER_TEMP': str(self.root), 'GITHUB_ENV': str(self.root/'env')}
        self.fixture = {'keystoreBase64': base64.b64encode(b'fixture-only-not-a-key'*100).decode(), 'storePassword': 'fixture-password', 'keyPassword': 'fixture-password', 'keyAlias': 'fixture'}
    def tearDown(self):
        assert self.root.resolve().is_relative_to(self.base.resolve())
        shutil.rmtree(self.root)
    def run_prepare(self, bundle):
        if bundle is not None:
            self.env['ALKARNA_SIGNING_BUNDLE'] = bundle
        with contextlib.redirect_stdout(io.StringIO()) as captured:
            signing.prepare(self.env)
        return captured.getvalue()
    def test_missing_secret_fails_without_generating_key(self):
        with self.assertRaisesRegex(ValueError, 'Missing ALKARNA_SIGNING_BUNDLE'):
            self.run_prepare(None)
        self.assertEqual(list(self.root.iterdir()), [])
    def test_malformed_or_injected_secret_creates_no_files(self):
        for value in ['not-json', '{}', '[]', json.dumps({**self.fixture, 'keyAlias': 'bad\nOTHER_ENV=1'}), json.dumps({**self.fixture, 'storePassword': 123}), json.dumps({**self.fixture, 'keystoreBase64': 'bad base64'})]:
            with self.subTest(value=value[:20]), self.assertRaisesRegex(ValueError, 'Invalid signing bundle'):
                self.run_prepare(value)
            self.assertEqual(list(self.root.iterdir()), [])
    def test_same_bundle_reuses_identical_key_bytes_and_masks_values(self):
        log = self.run_prepare(json.dumps(self.fixture))
        key = self.root/'alkarna-signing/release.p12'
        expected = base64.b64decode(self.fixture['keystoreBase64'])
        self.assertEqual(key.read_bytes(), expected)
        self.assertIn('::add-mask::fixture-password', log)
        self.assertIn('ALKARNA_KEYSTORE_PATH=', (self.root/'env').read_text())
        self.run_prepare(json.dumps(self.fixture))
        self.assertEqual(key.read_bytes(), expected)

if __name__ == '__main__':
    unittest.main()
