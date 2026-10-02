import { z } from 'zod';

export const AZERBAIJAN_PHONE_EXAMPLE = '+994 12 345 67 89';
export const AZERBAIJAN_PHONE_ERROR = `Telefon nömrəsini ${AZERBAIJAN_PHONE_EXAMPLE} formatında daxil edin`;

/**
 * Converts the common Azerbaijan phone variants to the single value stored by
 * the platform. API clients may send 0501234567, 994501234567 or the displayed
 * format; malformed and non-Azerbaijan numbers are rejected.
 */
export function normalizeAzerbaijanPhone(value: string): string | null {
  const digits = value.replace(/\D/g, '');
  let local = '';

  if (digits.length === 12 && digits.startsWith('994')) local = digits.slice(3);
  else if (digits.length === 10 && digits.startsWith('0')) local = digits.slice(1);
  else if (digits.length === 9) local = digits;
  else return null;

  if (!/^[1-9]\d{8}$/.test(local)) return null;
  return `+994 ${local.slice(0, 2)} ${local.slice(2, 5)} ${local.slice(5, 7)} ${local.slice(7, 9)}`;
}

export const azerbaijanPhoneSchema = z.string().trim().transform((value, context) => {
  const normalized = normalizeAzerbaijanPhone(value);
  if (!normalized) {
    context.addIssue({ code: 'custom', message: AZERBAIJAN_PHONE_ERROR });
    return z.NEVER;
  }
  return normalized;
});

export const optionalAzerbaijanPhoneSchema = z.union([
  z.literal(''),
  azerbaijanPhoneSchema
]);
