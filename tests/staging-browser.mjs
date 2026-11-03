import { chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import sharp from 'sharp';
import { stagingEnvironment } from '../scripts/staging-config.mjs';
import { seedStaging } from '../scripts/staging-seed.mjs';

// This suite only writes to the explicitly isolated local staging environment.
const env = stagingEnvironment(process.env);
const base = env.NEXTAUTH_URL;
assert.equal(base, 'http://localhost:3190');
assert.equal(env.STAGING_MONGO_HOST, '127.0.0.1:27029');
assert.equal(env.REDIS_URL, 'redis://127.0.0.1:6390');
const artifacts = 'docs/qa/staging';
const mode = process.argv.includes('--resume-gps') ? 'resume-gps' : process.argv.includes('--ride-only') ? 'ride-only' : 'full';
// Use the native Windows GPU for real MapLibre QA. SwiftShader stalls during
// repeated map navigation on this host; do not disable or mock map rendering.
const browserArgs = process.platform === 'win32' ? ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist'] : ['--enable-unsafe-swiftshader'];
await mkdir(artifacts, { recursive: true });
const results = [], errors = [], socketDiagnostics = [], apiDiagnostics = [], navigationTimings = [];
function safeMessage(value) {
  let message = String(value);
  for (const [key, secret] of Object.entries(env)) if (/PASSWORD|SECRET|KEY|MONGODB_URI|REDIS_URL/.test(key) && secret) message = message.replaceAll(secret, '[redacted]');
  return message;
}
let server, browser, connection;
let gpsStarted = 0;
let browserRenderer = null;
const pause = ms => new Promise(r => setTimeout(r, ms));
async function check(name, fn) { await fn(); results.push(name); console.log(`PASS ${name}`); }
async function start() {
  server = spawn(process.execPath, ['server.js'], { env, stdio: 'ignore', windowsHide: true });
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(base + '/api/health'); if (r.ok) { assert.deepEqual((await r.json()).checks, { mongo: 'up', redis: 'up', socket: 'up' }); return; } } catch {}
    await pause(1000);
  }
  throw new Error('Local staging health did not become ready');
}
async function stop() { if (server && server.exitCode === null) await new Promise(r => { server.once('exit', r); server.kill(); }); }
async function shot(page, name) { await page.screenshot({ path: `${artifacts}/${name}.png`, fullPage: true, animations: 'disabled', caret: 'hide' }); }
async function api(page, path) { const r = await page.request.get(base + path); assert.equal(r.status(), 200, path); return r.json(); }
async function login(page, role) {
  await page.goto(base + '/login', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Username', { exact: true }).fill(`staging_${role}`);
  await page.getByLabel('Password', { exact: true }).fill(env.STAGING_DEMO_PASSWORD);
  await page.getByRole('button', { name: /^Sign in/ }).click();
  await expect(page).toHaveURL(base + ({ admin: '/admin/dashboard', driver: '/driver/dashboard', rider: '/dashboard' }[role]), { timeout: 30000 });
}
try {
  await seedStaging(env);
  connection = await mongoose.createConnection(env.MONGODB_URI).asPromise();
  const db = connection.db;
  const historic = db.collection('users');
  for (const [username, wallet] of [['staging_legacy_usd', { balance: 19.27, currency: 'USD' }], ['staging_legacy_unknown', { balance: 8.33 }]]) {
    await historic.updateOne({ username }, { $setOnInsert: { username, role: 'rider', isActive: false, wallet } }, { upsert: true });
  }
  const historicalBefore = JSON.stringify(await historic.find({ username: /^staging_legacy_/ }).sort({ username: 1 }).toArray());
  const usersBefore = JSON.stringify(await historic.find({ username: /^staging_/ }).sort({ username: 1 }).toArray());
  await check('seed is idempotent and preserves existing wallets and credentials', async () => {
    await seedStaging(env);
    assert.equal(JSON.stringify(await historic.find({ username: /^staging_/ }).sort({ username: 1 }).toArray()), usersBefore);
  });
  await start();
  results.push('health: MongoDB, Redis and Socket.IO up');
  browser = await chromium.launch({ headless: true, args: browserArgs });
  const pages = {}, contexts = {}, gpsFrames = [], connectedRoles = new Set();
  async function openRoles(recordLogin = true) {
  for (const role of ['admin', 'rider', 'driver']) {
    contexts[role] = await browser.newContext({ viewport: { width: 1365, height: 900 }, geolocation: { latitude: 40.7484, longitude: -73.9857 }, permissions: ['geolocation'] });
    pages[role] = await contexts[role].newPage();
    connectedRoles.delete(role);
    pages[role].on('websocket', ws => ws.on('framereceived', ({ payload }) => { if (String(payload).startsWith(`40/${role},`)) connectedRoles.add(role); }));
    pages[role].on('response', async response => {
      const path = new URL(response.url()).pathname;
      if (gpsStarted && role === 'rider' && response.request().isNavigationRequest()) { const timing = response.request().timing(); navigationTimings.push({ path, status: response.status(), responseStartMs: timing.responseStart }); console.log(`GPS navigation response: ${timing.responseStart}ms`); }
      if (['/api/rides/active', '/api/auth/socket-token', '/api/auth/session'].includes(path)) {
        try { const body = await response.json(); apiDiagnostics.push({ role, path, status: response.status(), hasRide: Boolean(body.ride), hasToken: Boolean(body.token), authenticated: Boolean(body.user) }); if (gpsStarted && role === 'rider') console.log(`GPS refresh ${path}: ${Date.now() - gpsStarted}ms`); } catch {}
      }
    });
    pages[role].on('websocket', ws => ws.on('framesent', ({ payload }) => { const value = String(payload); if (value.includes('driver:location') || value.includes('ride:subscribe')) socketDiagnostics.push({ role, value }); }));
    if (role === 'rider') pages[role].on('websocket', ws => ws.on('framereceived', ({ payload }) => { const value = String(payload); if (value.includes('driver:location')) gpsFrames.push(value); }));
    pages[role].on('pageerror', e => errors.push({ role, message: safeMessage(e.message) }));
    if (recordLogin) await check(`${role} browser login and redirect`, () => login(pages[role], role));
    else await login(pages[role], role);
    await expect.poll(() => connectedRoles.has(role), { timeout: 30000 }).toBe(true);
  }
  }
  await openRoles();
  let { admin, rider, driver } = pages;
  let ride, riderBefore, driverBefore;
  if (!process.argv.includes('--resume-gps')) {
  const unfinished = (await api(rider, '/api/rides/active')).ride;
  if (unfinished && ['searching', 'accepted', 'arrived'].includes(unfinished.status)) {
    const cancelled = await rider.request.post(base + `/api/rides/${unfinished.id}/cancel`, { data: { reason: 'Previous staging QA run interrupted' } });
    assert.equal(cancelled.status(), 200); await rider.reload({ waitUntil: 'domcontentloaded' }); await driver.reload({ waitUntil: 'domcontentloaded' });
  }
  if (mode !== 'ride-only') {
  await check('/admin app redirect and refresh', async () => { await admin.goto(base + '/admin', { waitUntil: 'domcontentloaded' }); await expect(admin).toHaveURL(base + '/admin/dashboard'); await admin.reload({ waitUntil: 'domcontentloaded' }); await expect(admin.getByRole('heading', { name: /Overview|Dashboard/ }).first()).toBeVisible(); });
  await check('non-admin branding write is forbidden', async () => { const r = await rider.request.put(base + '/api/admin/settings', { data: { name: 'Unauthorized' }, headers: { Origin: base } }); assert.equal(r.status(), 403); });
  await check('payments and demo top-ups are disabled', async () => { const wallet = await api(rider, '/api/wallet'); assert.equal(wallet.stripeEnabled, false); assert.equal(wallet.topupEnabled, false); assert.equal((await rider.request.post(base + '/api/wallet', { data: { amount: 10 } })).status(), 409); });
  await check('real payouts are disabled', async () => { const status = await api(driver, '/api/drivers/me/payouts'); assert.equal(status.configured, false); assert.equal(status.canCashOut, false); assert.equal((await driver.request.post(base + '/api/drivers/me/payouts', { data: { action: 'cashout', amount: 10 } })).status(), 501); });
  await admin.goto(base + '/admin/settings', { waitUntil: 'domcontentloaded' });
  const main = admin.locator('section').filter({ has: admin.getByRole('heading', { name: 'Main company logo', exact: true }) });
  const png = await sharp({ create: { width: 100, height: 60, channels: 3, background: '#CA8A04' } }).png().toBuffer();
  const webp = await sharp({ create: { width: 100, height: 60, channels: 3, background: '#0C0A09' } }).webp().toBuffer();
  async function save() { const response = admin.waitForResponse(r => r.url().endsWith('/api/admin/settings') && r.request().method() === 'PUT'); await admin.getByRole('button', { name: 'Save changes', exact: true }).click(); assert.equal((await response).status(), 200); }
  let firstLogo, replacement;
  await check('logo upload, preview and persistent save', async () => {
    await main.locator('input[type=file]').setInputFiles({ name: 'qa-logo.png', mimeType: 'image/png', buffer: png });
    await expect(main.getByAltText('Main company logo preview')).toBeVisible();
    await save(); firstLogo = (await api(admin, '/api/branding')).logo; assert.ok(firstLogo);
    await shot(admin, 'settings-desktop-custom');
  });
  const publicContext = await browser.newContext({ viewport: { width: 1365, height: 900 } });
  const publicPage = await publicContext.newPage();
  await check('public header, footer, login, signup and dashboards use saved logo', async () => {
    for (const route of ['/', '/login', '/signup']) { await publicPage.goto(base + route, { waitUntil: 'domcontentloaded' }); await expect(publicPage.locator('img[alt="Maxride"]').first()).toHaveAttribute('src', firstLogo); if (route === '/') await expect(publicPage.locator('footer img[alt="Maxride"]')).toHaveAttribute('src', firstLogo); await shot(publicPage, route === '/' ? 'public-desktop-custom' : route.slice(1) + '-desktop-custom'); }
    for (const page of [admin, rider, driver]) { await page.reload({ waitUntil: 'domcontentloaded' }); await expect(page.locator('img[alt="Maxride"]').first()).toHaveAttribute('src', firstLogo); }
  });
  await check('replace logo and preserve it after application restart', async () => {
    await main.locator('input[type=file]').setInputFiles({ name: 'replacement.webp', mimeType: 'image/webp', buffer: webp }); await save();
    replacement = (await api(admin, '/api/branding')).logo; assert.notEqual(replacement, firstLogo);
    await stop(); await start(); await admin.reload({ waitUntil: 'domcontentloaded' });
    assert.equal((await api(admin, '/api/branding')).logo, replacement);
    await expect(admin.locator('img[alt="Maxride"]').first()).toHaveAttribute('src', replacement);
  });
  await check('mobile branding and settings have no horizontal overflow', async () => {
    await admin.setViewportSize({ width: 390, height: 844 }); await shot(admin, 'settings-mobile-custom');
    assert.ok(await admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await publicPage.setViewportSize({ width: 390, height: 844 });
    for (const route of ['/', '/login', '/signup']) { await publicPage.goto(base + route, { waitUntil: 'domcontentloaded' }); await expect(publicPage.locator('img[alt="Maxride"]').first()).toBeVisible(); assert.ok(await publicPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), route); await shot(publicPage, route === '/' ? 'public-mobile-custom' : route.slice(1) + '-mobile-custom'); }
    await admin.setViewportSize({ width: 1365, height: 900 });
  });
  await check('restore default branding and fallback', async () => { await admin.getByRole('button', { name: 'Restore default branding' }).click(); await save(); assert.equal((await api(admin, '/api/branding')).logo, null); await publicPage.goto(base + '/login', { waitUntil: 'domcontentloaded' }); await expect(publicPage.locator('img[alt="Maxride"]')).toHaveCount(0); await shot(publicPage, 'login-mobile-default'); });
  // Release the map/WebGL contexts from the branding matrix before the ride flow.
  // This also verifies fresh-device sessions read the persisted default branding.
  await browser.close();
  browser = await chromium.launch({ headless: true, args: browserArgs });
  await openRoles(false);
  ({ admin, rider, driver } = pages);
  }
  riderBefore = (await api(rider, '/api/wallet')).wallet;
  driverBefore = (await api(driver, '/api/wallet')).wallet;
  await check('driver goes online with real geolocation', async () => {
    await expect(driver.getByRole('button', { name: /^Go (online|offline)$/ })).toBeVisible();
    if (await driver.getByRole('button', { name: 'Go online', exact: true }).isVisible()) await driver.getByRole('button', { name: 'Go online', exact: true }).click();
    await expect(driver.getByRole('button', { name: 'Go offline', exact: true })).toBeVisible({ timeout: 20000 });
  });
  await check('real destination search and EGP estimate', async () => {
    await rider.bringToFront();
    await rider.getByPlaceholder('Where are you going?').fill('Times Square');
    await rider.getByRole('option').first().click({ timeout: 20000 });
    await expect(rider.getByRole('button', { name: /^Book / })).toBeEnabled({ timeout: 20000 });
    await expect(rider.getByRole('button', { name: /^Book / })).toContainText('E£');
    await shot(rider, 'booking-desktop');
  });
  await check('booking dispatches a real offer and driver accepts', async () => {
    await rider.bringToFront();
    await rider.getByRole('button', { name: /^Book / }).click();
    await driver.bringToFront();
    await driver.getByRole('button', { name: 'Accept', exact: true }).click({ timeout: 20000 });
    await expect.poll(async () => (await api(rider, '/api/rides/active')).ride?.status).toBe('accepted');
    ride = (await api(rider, '/api/rides/active')).ride; assert.equal(ride.fare.currency, 'EGP');
    await rider.bringToFront();
    await expect(rider.getByRole('button', { name: 'Copy PIN', exact: true })).toBeVisible({ timeout: 30000 });
  });
  } else {
    ride = (await api(rider, '/api/rides/active')).ride;
    assert.ok(ride, 'An interrupted staging ride is required for GPS diagnosis');
    riderBefore = (await api(rider, '/api/wallet')).wallet;
    driverBefore = (await api(driver, '/api/wallet')).wallet;
  }
  await check('GPS updates arrive live at rider over WebSocket', async () => {
    gpsStarted = Date.now();
    const subscriptionsBefore = socketDiagnostics.length;
    await rider.bringToFront();
    await rider.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
    console.log(`GPS document ready: ${Date.now() - gpsStarted}ms`);
    await expect(rider.getByRole('button', { name: 'Copy PIN', exact: true })).toBeVisible({ timeout: 60000 });
    console.log(`GPS ride controls ready: ${Date.now() - gpsStarted}ms`);
    await expect.poll(() => socketDiagnostics.slice(subscriptionsBefore).some(frame => frame.role === 'rider' && frame.value.includes('ride:subscribe')), { timeout: 30000 }).toBe(true);
    await driver.bringToFront();
    await pause(4500);
    await contexts.driver.setGeolocation({ latitude: 40.749, longitude: -73.985 });
    await expect.poll(() => gpsFrames.some(frame => frame.includes('40.749')), { timeout: 25000 }).toBe(true);
    browserRenderer = await rider.locator('canvas.maplibregl-canvas').evaluate(canvas => { const gl = canvas.getContext('webgl2'); const info = gl?.getExtension('WEBGL_debug_renderer_info'); return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'unavailable'; });
    await shot(rider, 'tracking-desktop');
    await rider.setViewportSize({ width: 390, height: 844 }); await shot(rider, 'tracking-mobile');
    await driver.setViewportSize({ width: 390, height: 844 }); await shot(driver, 'driver-mobile-active');
    for (const page of [rider, driver]) assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    gpsStarted = 0;
  });
  await check('arrival, PIN start and trip completion through driver UI', async () => {
    if (ride.status === 'accepted') await driver.getByRole('button', { name: /arrived/ }).click();
    if (ride.status !== 'in_progress') {
      await driver.getByRole('button', { name: 'Enter PIN to start' }).click();
      await driver.getByRole('textbox', { name: 'Rider PIN', exact: true }).fill(ride.pin);
      await driver.getByRole('button', { name: 'Start trip', exact: true }).click();
    }
    await driver.getByRole('button', { name: 'Complete trip', exact: true }).click();
    await expect(driver.getByText('Trip complete', { exact: false }).first()).toBeVisible({ timeout: 15000 });
    await shot(driver, 'driver-mobile-receipt'); await shot(rider, 'rider-mobile-receipt');
  });
  await check('EGP settlement reconciles wallets, ledger and one payment', async () => {
    const stored = await db.collection('rides').findOne({ _id: new mongoose.Types.ObjectId(ride.id) });
    assert.equal(stored.status, 'completed'); assert.equal(stored.fare.currency, 'EGP');
    const r = (await api(rider, '/api/wallet')).wallet, d = (await api(driver, '/api/wallet')).wallet;
    assert.equal(r.currency, 'EGP'); assert.equal(d.currency, 'EGP');
    assert.equal(Math.round((riderBefore.balance - r.balance) * 100), Math.round(stored.fare.total * 100));
    assert.equal(Math.round((d.balance - driverBefore.balance) * 100), Math.round(stored.fare.driverEarnings * 100));
    const ledger = await db.collection('wallettransactions').find({ rideId: stored._id }).toArray();
    assert.equal(ledger.length, 2); assert.ok(ledger.every(l => l.currency === 'EGP'));
    assert.equal(Math.round(ledger.reduce((sum, l) => sum + l.amount, 0) * 100), -Math.round(stored.fare.platformFee * 100));
    assert.equal(await db.collection('payments').countDocuments({ rideId: stored._id, currency: 'EGP' }), 1);
    assert.equal(JSON.stringify(await historic.find({ username: /^staging_legacy_/ }).sort({ username: 1 }).toArray()), historicalBefore);
  });
  await check('EGP receipts, wallets, earnings and admin financial screens', async () => {
    for (const [page, route, name] of [[rider, '/wallet', 'rider-wallet-mobile'], [rider, `/rides/${ride.id}`, 'rider-receipt-mobile'], [driver, '/driver/wallet', 'driver-wallet-mobile'], [driver, '/driver/earnings', 'driver-earnings-mobile'], [admin, '/admin/dashboard', 'admin-overview-desktop'], [admin, '/admin/pricing', 'admin-pricing-desktop']]) {
      await page.goto(base + route, { waitUntil: 'domcontentloaded' });
      await expect(page.getByText(route === '/admin/pricing' ? /Base fare \(EGP\)/ : /E£/).first()).toBeVisible({ timeout: 15000 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), route);
      await shot(page, name);
    }
  });
  await check('no browser JavaScript errors', async () => assert.deepEqual(errors, []));
} catch (error) {
  process.exitCode = 1; const message = safeMessage(error.message); console.error(message); results.push(`FAIL: ${message}`);
  if (browser) for (const [i, context] of browser.contexts().entries()) for (const page of context.pages()) await shot(page, `failure-${i}`).catch(() => {});
} finally {
  if (browser) await browser.close();
  await stop(); if (connection) await connection.close();
  await writeFile(`${artifacts}/results${mode === 'full' ? '' : '-' + mode}.json`, JSON.stringify({ date: new Date().toISOString(), mode, target: base, node: process.version, browserRenderer, hostedDeploymentVerified: false, visualDefects: env.NEXT_PUBLIC_CARTO_BASEMAP_KEY ? [] : ['CARTO basemap requires a configured key; placeholder tiles remain visible.'], checks: results, browserErrors: errors, socketDiagnostics, apiDiagnostics, navigationTimings }, null, 2));
}
