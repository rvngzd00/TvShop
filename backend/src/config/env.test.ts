import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const envModuleUrl = new URL('./env.js', import.meta.url).href;
const emailModuleUrl = new URL('../core/email.js', import.meta.url).href;
const productionEnv = {
  ...process.env,
  NODE_ENV: 'production',
  PUBLIC_ORIGIN: 'https://tvshop.az',
  DATABASE_URL: 'postgresql://tvshop:tvshop@127.0.0.1:5432/tvshop',
  JWT_SECRET: 'j'.repeat(64),
  COOKIE_SECRET: 'c'.repeat(64),
  BOOTSTRAP_ADMIN_PASSWORD: 'production-admin-password',
  DEFAULT_STORE_CODE: 'daily-baku'
};

function runModule(source: string, overrides: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, ['--input-type=module', '--eval', source], {
    encoding: 'utf8',
    env: { ...productionEnv, ...overrides }
  });
}

test('production accepts the disabled email provider without a Resend key', () => {
  const result = runModule(
    `const {sendEmail}=await import(${JSON.stringify(emailModuleUrl)}); const delivery=await sendEmail({to:'customer@example.com',subject:'Test',html:'<p>Test</p>'}); if(delivery.provider!=='disabled'||delivery.accepted!==false) process.exit(2);`,
    { EMAIL_PROVIDER: 'disabled', RESEND_API_KEY: '' }
  );
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

test('production requires a Resend key only when Resend is selected', () => {
  const missing = runModule(
    `await import(${JSON.stringify(envModuleUrl)})`,
    { EMAIL_PROVIDER: 'resend', RESEND_API_KEY: '' }
  );
  assert.notEqual(missing.status, 0);
  assert.match(`${missing.stdout}\n${missing.stderr}`, /RESEND_API_KEY is required when EMAIL_PROVIDER=resend/);

  const configured = runModule(
    `await import(${JSON.stringify(envModuleUrl)})`,
    { EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 're_test_tvshop' }
  );
  assert.equal(configured.status, 0, `${configured.stdout}\n${configured.stderr}`);
});
