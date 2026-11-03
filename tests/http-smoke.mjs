import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { encode } from 'next-auth/jwt';
import assert from 'node:assert/strict';
const port = 3187;
const base = `http://localhost:${port}`;
const secret = randomBytes(32).toString('hex');
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(port)], {
  env: { ...process.env, NODE_ENV: 'production', AUTH_SECRET: secret, NEXTAUTH_SECRET: secret, AUTH_URL: base, NEXTAUTH_URL: base, MONGODB_URI: '', REDIS_URL: 'redis://127.0.0.1:1' },
  stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
});
let output = '';
server.stdout.on('data', c => { output += c; });
server.stderr.on('data', c => { output += c; });
let passed = 0;
async function check(label, fn) { await fn(); passed++; console.log(`PASS ${label}`); }
async function request(path, cookie, options = {}) {
  return fetch(base + path, { redirect: 'manual', ...options, headers: { ...(cookie ? { cookie } : {}), ...options.headers } });
}
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try { if ((await request('/login')).status === 200) { ready = true; break; } } catch {}
    await new Promise(r => setTimeout(r, 1000));
  }
  assert.ok(ready, 'Built app must start');
  const cookies = {};
  for (const role of ['admin', 'driver', 'rider']) {
    const token = await encode({ token: { id: '000000000000000000000001', role, name: 'HTTP regression' }, secret, salt: 'authjs.session-token' });
    cookies[role] = `authjs.session-token=${token}`;
  }
  await check('anonymous /admin redirects to login', async () => {
    const r = await request('/admin'); assert.equal(r.status, 307); assert.ok(r.headers.get('location').includes('/login?'));
  });
  for (const [role, dashboard] of [['admin','/admin/dashboard'],['driver','/driver/dashboard'],['rider','/dashboard']]) {
    await check(`${role} authenticated login redirects to correct dashboard`, async () => {
      const r = await request('/login', cookies[role]); assert.equal(r.status, 307); assert.equal(new URL(r.headers.get('location'), base).pathname, dashboard);
    });
    await check(`${role} dashboard direct navigation returns 200`, async () => assert.equal((await request(dashboard, cookies[role])).status, 200));
  }
  await check('admin root redirects to admin dashboard', async () => {
    const r = await request('/admin', cookies.admin); assert.equal(r.status, 308); assert.equal(new URL(r.headers.get('location'), base).pathname, '/admin/dashboard');
  });
  await check('admin settings renders', async () => assert.equal((await request('/admin/settings', cookies.admin)).status, 200));
  await check('safe callback retained', async () => {
    const r = await request('/login?callbackUrl=%2Fadmin%2Fsettings', cookies.admin); assert.equal(new URL(r.headers.get('location'), base).pathname, '/admin/settings');
  });
  await check('external callback rejected', async () => {
    const r = await request('/login?callbackUrl=https%3A%2F%2Fevil.test', cookies.admin); assert.equal(new URL(r.headers.get('location'), base).href, base + '/admin/dashboard');
  });
  for (const role of ['driver','rider']) {
    await check(`${role} cannot visit admin settings`, async () => assert.equal((await request('/admin/settings', cookies[role])).status, 307));
    await check(`${role} cannot update branding`, async () => assert.equal((await request('/api/admin/settings', cookies[role], { method: 'PUT' })).status, 403));
  }
  await check('anonymous cannot update branding', async () => assert.equal((await request('/api/admin/settings', null, { method: 'PUT' })).status, 401));
  await check('admin cross-origin update rejected', async () => assert.equal((await request('/api/admin/settings', cookies.admin, { method: 'PUT', headers: { origin: 'https://evil.test' } })).status, 403));
  await check('admin SVG upload rejected before storage', async () => assert.equal((await request('/api/admin/settings', cookies.admin, { method: 'PUT', headers: { origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Maxride', logo: 'data:image/svg+xml;base64,PHN2Zz4=', loginLogo: null }) })).status, 400));
  await check('oversize request rejected', async () => assert.equal((await request('/api/admin/settings', cookies.admin, { method: 'PUT', headers: { origin: base, 'content-type': 'application/json' }, body: ' '.repeat(740000) })).status, 413));
  await check('public branding failure returns safe default only', async () => {
    const r = await request('/api/branding'); assert.equal(r.status, 503); assert.deepEqual(await r.json(), { name: 'Maxride', logo: null, loginLogo: null }); assert.match(r.headers.get('cache-control'), /no-store/);
  });
  await check('public homepage uses Maxride text', async () => assert.match(await (await request('/')).text(), /Maxride/));
  console.log(`${passed} HTTP checks passed. Sessions are signed test fixtures; database login and persistence require integration infrastructure.`);
} catch (error) {
  console.error('HTTP checks failed:', error.message);
  process.exitCode = 1;
} finally {
  server.kill();
}
