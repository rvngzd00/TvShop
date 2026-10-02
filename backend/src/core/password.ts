import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
const keyLength = 64;
const parameters = { N: 32_768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;

function deriveKey(
  password: string,
  salt: Buffer,
  length: number,
  options: { N: number; r: number; p: number; maxmem: number }
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, length, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await deriveKey(password.normalize('NFKC'), salt, keyLength, parameters);
  return `scrypt$${parameters.N}$${parameters.r}$${parameters.p}$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, n, r, p, saltValue, hashValue] = encoded.split('$');
  if (algorithm !== 'scrypt' || !n || !r || !p || !saltValue || !hashValue) return false;

  const N = Number(n); const rValue = Number(r); const pValue = Number(p);
  if (![N, rValue, pValue].every(Number.isSafeInteger) || N < 16_384 || N > 65_536 || (N & (N - 1)) !== 0 || rValue !== 8 || pValue !== 1) return false;
  const salt = Buffer.from(saltValue, 'base64url');
  const expected = Buffer.from(hashValue, 'base64url');
  if (salt.length !== 16 || expected.length !== keyLength) return false;
  const actual = await deriveKey(password.normalize('NFKC'), salt, expected.length, {
    N, r: rValue, p: pValue, maxmem: 64 * 1024 * 1024
  });
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
