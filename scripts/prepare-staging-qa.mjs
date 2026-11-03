import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
const secret = () => randomBytes(32).toString('base64');
const values = {
  APP_ENV: 'staging', STAGING_MONGO_HOST: '127.0.0.1:27029',
  STAGING_MONGO_PASSWORD: secret(), STAGING_MONGO_ADMIN_PASSWORD: secret(),
  MONGO_REPLICA_KEY: secret(), STAGING_DEMO_PASSWORD: secret(), NEXTAUTH_SECRET: secret(),
  STAGING_APP_URL: 'http://localhost:3190', REDIS_URL: 'redis://127.0.0.1:6390',
  PORT: '3190', HOSTNAME: 'localhost', BIND_HOST: '127.0.0.1',
  PLAYWRIGHT_BROWSERS_PATH: new URL('../.cache/playwright', import.meta.url).pathname.replace(/^\/(.:\/)/, '$1'),
};
try {
  await writeFile('.env.staging.qa', Object.entries(values).map(([k, v]) => `${k}=${v}`).join('\n') + '\n', { flag: 'wx', mode: 0o600 });
  console.log('Created ignored local staging configuration. No credentials were printed.');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.log('Existing local staging configuration preserved.');
}
