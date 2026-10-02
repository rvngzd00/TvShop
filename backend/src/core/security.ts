import { createHash, randomBytes } from 'node:crypto';

export const randomToken = (bytes = 48): string => randomBytes(bytes).toString('base64url');
export const tokenDigest = (token: string): string => createHash('sha256').update(token).digest('hex');

export function privacyHash(value: string | undefined, secret: string): string | null {
  if (!value) return null;
  const day = new Date().toISOString().slice(0, 10);
  return createHash('sha256').update(`${day}:${secret}:${value}`).digest('hex');
}
