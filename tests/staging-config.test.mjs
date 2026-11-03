import test from 'node:test';
import assert from 'node:assert/strict';
import { stagingEnvironment } from '../scripts/staging-config.mjs';
const env = { APP_ENV: 'staging', STAGING_MONGO_HOST: 'staging-mongo', STAGING_MONGO_PASSWORD: 'test-only+/password', NEXTAUTH_SECRET: 'test-only-secret', REDIS_URL: 'redis://staging-redis:6379', RENDER_EXTERNAL_URL: 'https://maxride-staging.example.com' };
test('staging derives an isolated authenticated database and disables payments', () => {
  const result = stagingEnvironment(env);
  const uri = new URL(result.MONGODB_URI);
  assert.equal(uri.pathname, '/maxride_staging');
  assert.equal(uri.hostname, 'staging-mongo');
  assert.equal(decodeURIComponent(uri.password), env.STAGING_MONGO_PASSWORD);
  assert.equal(uri.searchParams.get('replicaSet'), 'rs0');
  assert.equal(result.AUTH_URL, env.RENDER_EXTERNAL_URL);
  assert.equal(result.AUTH_SECRET, env.NEXTAUTH_SECRET);
  assert.equal(result.STRIPE_SECRET_KEY, '');
  assert.equal(result.DEMO_WALLET_TOPUPS, 'false');
});
for (const [name, change] of Object.entries({
  'production environment': { APP_ENV: 'production' },
  'inherited database URL': { MONGODB_URI: 'mongodb://production/db' },
  'real payment credentials': { STRIPE_SECRET_KEY: 'test-placeholder' },
  'real webhook credentials': { STRIPE_WEBHOOK_SECRET: 'test-placeholder' },
  'production public URL': { RENDER_EXTERNAL_URL: 'https://kova-dispatch-demo.onrender.com' },
  'insecure remote URL': { RENDER_EXTERNAL_URL: 'http://staging.example.com' },
  'malformed database host': { STAGING_MONGO_HOST: 'host/db?authSource=admin' },
  'missing Redis': { REDIS_URL: '' },
})) test(`staging rejects ${name}`, () => assert.throws(() => stagingEnvironment({ ...env, ...change })));
