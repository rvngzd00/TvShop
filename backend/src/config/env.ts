import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// Workspace scripts execute with `backend/` as cwd. Resolve the project-level
// env file from this module so dev, migration, tests and compiled builds agree.
loadEnv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

const booleanFromString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  PUBLIC_ORIGIN: z.url().default('http://127.0.0.1:3000'),
  ALLOWED_ORIGINS: z.string().trim().default(''),
  DATABASE_URL: z.string().min(1),
  DATABASE_SSL: z.enum(['disable', 'require']).default('disable'),
  DATABASE_SSL_REJECT_UNAUTHORIZED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  JWT_SECRET: z.string().min(32),
  COOKIE_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  TRUST_PROXY: booleanFromString,
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  UPLOAD_DIR: z.string().default('./uploads'),
  MAX_UPLOAD_BYTES: z.coerce.number().int().min(1024).max(50 * 1024 * 1024).default(10 * 1024 * 1024),
  // This is a stable internal tenant key used by existing records and sessions.
  // Branding, domain and infrastructure are TVShop-specific.
  DEFAULT_STORE_CODE: z.string().regex(/^[a-z0-9-]+$/).default('daily-baku'),
  BOOTSTRAP_ADMIN_EMAIL: z.email().default('admin@tvshop.az'),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().min(12).default('change-this-immediately'),
  EMAIL_PROVIDER: z.enum(['disabled', 'resend']).default('disabled'),
  RESEND_API_KEY: z.string().trim().optional(),
  EMAIL_FROM: z.string().trim().default('TVShop <noreply@tvshop.az>'),
  EMAIL_REPLY_TO: z.email().optional(),
  EMAIL_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30_000).default(10_000),
  YOUTUBE_API_KEY: z.string().trim().optional(),
  YOUTUBE_LIVE_CACHE_SECONDS: z.coerce.number().int().min(30).max(900).default(120)
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const message = parsed.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  throw new Error(`Environment configuration is invalid:\n${message}`);
}

if (parsed.data.NODE_ENV === 'production') {
  if (parsed.data.JWT_SECRET.includes('replace-with') || parsed.data.COOKIE_SECRET.includes('replace-with')) {
    throw new Error('Production secrets must be replaced');
  }
  if (parsed.data.BOOTSTRAP_ADMIN_PASSWORD === 'change-this-immediately') {
    throw new Error('Production bootstrap password must be replaced');
  }
  if (!parsed.data.PUBLIC_ORIGIN.startsWith('https://')) {
    throw new Error('PUBLIC_ORIGIN must use HTTPS in production');
  }
  if (parsed.data.EMAIL_PROVIDER === 'resend' && !parsed.data.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is required when EMAIL_PROVIDER=resend');
  }
}

export const env = Object.freeze(parsed.data);
export type Environment = z.infer<typeof schema>;
