import * as Crypto from 'expo-crypto';
import { scryptAsync } from '@noble/hashes/scrypt.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';

const SCRYPT = { N: 2 ** 14, r: 8, p: 1, dkLen: 64 } as const;

export async function hashPassword(password: string) {
  if (password.length < 4) throw new Error('كلمة المرور يجب أن تكون 4 أحرف على الأقل');
  const salt = bytesToHex(await Crypto.getRandomBytesAsync(16));
  const derived = await scryptAsync(password, salt, SCRYPT);
  return `${salt}:${bytesToHex(derived)}`;
}

export async function verifyPasswordHash(password: string, stored: string) {
  const [salt, expectedHex, extra] = stored.split(':');
  if (!salt || !expectedHex || extra) return false;
  let expected: Uint8Array;
  try { expected = hexToBytes(expectedHex); } catch { return false; }
  if (expected.length !== SCRYPT.dkLen) return false;
  const actual = await scryptAsync(password, salt, SCRYPT);
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= expected[i]! ^ actual[i]!;
  return diff === 0;
}
