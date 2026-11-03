import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import sharp from 'sharp';
import { io } from 'socket.io-client';
// Hardcoded disposable localhost endpoints: this script cannot target production.
const dbName = `maxride_qa_${Date.now()}`;
process.env.MONGODB_URI = `mongodb://127.0.0.1:27028/${dbName}?replicaSet=rs0&directConnection=true`;
process.env.REDIS_URL = 'redis://127.0.0.1:6389';
process.env.NODE_ENV = 'production';
const { default: mongoose } = await import('mongoose');
const { default: connectDB } = await import('../src/lib/db/mongodb.js');
const { default: User } = await import('../src/lib/db/models/User.js');
const { default: Driver } = await import('../src/lib/db/models/Driver.js');
const { default: Ride } = await import('../src/lib/db/models/Ride.js');
const { default: Payment } = await import('../src/lib/db/models/Payment.js');
const { default: WalletTransaction } = await import('../src/lib/db/models/WalletTransaction.js');
const { default: redis } = await import('../src/lib/db/redis.js');
const { completeRide, cancelRide } = await import('../src/lib/services/ride-service.js');
const { creditCheckoutSession } = await import('../src/lib/services/stripe.js');
const { calculateFare } = await import('../src/lib/services/fare-calculator.js');
const { default: PricingRule } = await import('../src/lib/db/models/PricingRule.js');
const base = 'http://localhost:3188';
const secret = randomBytes(32).toString('hex');
const password = randomBytes(24).toString('hex');
let server;
let passed = 0;
async function check(label, fn) { await fn(); passed++; console.log(`PASS ${label}`); }
function request(path, cookie = '', options = {}) { return fetch(base + path, { redirect: 'manual', ...options, headers: { cookie, ...options.headers } }); }
async function start() {
  server = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: '3188', HOSTNAME: 'localhost', BIND_HOST: '127.0.0.1', NEXT_PUBLIC_APP_URL: base, AUTH_SECRET: secret, NEXTAUTH_SECRET: secret, AUTH_URL: base, NEXTAUTH_URL: base }, stdio: 'ignore', windowsHide: true });
  for (let i = 0; i < 60; i++) { try { if ((await request('/login')).status === 200) return; } catch {} await new Promise(r => setTimeout(r, 1000)); }
  throw new Error('Server did not start');
}
async function stop() { if (!server || server.exitCode !== null) return; await new Promise(resolve => { server.once('exit', resolve); server.kill(); }); }
function cookieHeader(response, previous = '') {
  const map = new Map(previous.split('; ').filter(Boolean).map(v => [v.split('=')[0], v.slice(v.indexOf('=') + 1)]));
  for (const raw of response.headers.getSetCookie()) { const pair = raw.split(';')[0]; map.set(pair.split('=')[0], pair.slice(pair.indexOf('=') + 1)); }
  return [...map].map(([k, v]) => `${k}=${v}`).join('; ');
}
async function login(role) {
  const csrf = await request('/api/auth/csrf');
  const cookies = cookieHeader(csrf);
  const { csrfToken } = await csrf.json();
  const response = await request('/api/auth/callback/credentials', cookies, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'X-Auth-Return-Redirect': '1' }, body: new URLSearchParams({ username: `qa_${role}`, password, csrfToken, callbackUrl: base + '/dashboard' }) });
  assert.equal(response.status, 200);
  const signed = cookieHeader(response, cookies);
  const session = await (await request('/api/auth/session', signed)).json();
  assert.equal(session.user?.role, role);
  return signed;
}
async function logo(color) { return 'data:image/png;base64,' + (await sharp({ create: { width: 32, height: 24, channels: 3, background: color } }).png().toBuffer()).toString('base64'); }
async function putBranding(cookie, body) { return request('/api/admin/settings', cookie, { method: 'PUT', headers: { origin: base, 'content-type': 'application/json' }, body: JSON.stringify(body) }); }
let users;
let driver;
async function makeRide(currency = 'EGP', status = 'in_progress') {
  return Ride.create({ riderId: users.rider._id, driverId: users.driver._id, driverProfileId: driver._id, status, pickup: { address: 'QA pickup', location: { type: 'Point', coordinates: [31, 30] } }, dropoff: { address: 'QA dropoff', location: { type: 'Point', coordinates: [31.1, 30.1] } }, fare: { currency, total: 10.01, platformFee: 0.8, driverEarnings: 9.21 }, startedAt: new Date(Date.now() - 600000) });
}
try {
  await connectDB(); await redis.ping();
  await Promise.all([User.init(), Driver.init(), Ride.init(), Payment.init(), WalletTransaction.init(), PricingRule.init()]);
  users = {};
  const passwordHash = await bcrypt.hash(password, 4);
  for (const role of ['admin','driver','rider']) users[role] = await User.create({ username: `qa_${role}`, name: `QA ${role}`, role, passwordHash, wallet: { currency: 'EGP', balance: 1000 } });
  driver = await Driver.create({ userId: users.driver._id, isApproved: true, vehicle: { plate: 'QA-ONLY' } });
  await start();
  const cookies = {};
  for (const [role, dashboard] of [['admin','/admin/dashboard'],['driver','/driver/dashboard'],['rider','/dashboard']]) await check(`real ${role} password login and dashboard redirect`, async () => {
    cookies[role] = await login(role);
    const response = await request('/login', cookies[role]);
    assert.equal(new URL(response.headers.get('location'), base).pathname, dashboard);
    assert.equal((await request(dashboard, cookies[role])).status, 200);
  });
  await check('custom server health reports MongoDB, Redis and Socket.IO up', async () => {
    const response = await request('/api/health'); assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).checks, { mongo: 'up', redis: 'up', socket: 'up' });
  });
  for (const role of ['admin','driver','rider']) await check(`${role} authenticates to its Socket.IO namespace`, async () => {
    const { token } = await (await request('/api/auth/socket-token', cookies[role])).json();
    const socket = io(base + '/' + role, { auth: { token }, transports: ['websocket'], reconnection: false, timeout: 10000 });
    try { await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); }); }
    finally { socket.disconnect(); }
  });
  await check('rider cannot connect to admin Socket.IO namespace', async () => {
    const { token } = await (await request('/api/auth/socket-token', cookies.rider)).json();
    const socket = io(base + '/admin', { auth: { token }, transports: ['websocket'], reconnection: false, timeout: 10000 });
    try { await assert.rejects(new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); }), /Wrong namespace/); }
    finally { socket.disconnect(); }
  });
  await check('ride socket membership fails closed when Redis authorization lookup fails', async () => {
    const sockets = {};
    const unknownRide = String(new mongoose.Types.ObjectId());
    let leaked = false;
    try {
      for (const role of ['rider', 'driver', 'admin']) {
        const { token } = await (await request('/api/auth/socket-token', cookies[role])).json();
        const socket = io(base + '/' + role, { auth: { token }, transports: ['websocket'], reconnection: false, timeout: 10000 });
        sockets[role] = socket;
        await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
      }
      // Fault only the disposable localhost Redis membership command. No mock API.
      await redis.acl('SETUSER', 'default', '-sismember');
      await assert.rejects(redis.sismember('qa-membership-probe', 'nobody'), /NOPERM/);
      sockets.rider.on('driver:location', data => { if (data.rideId === unknownRide) leaked = true; });
      sockets.rider.emit('ride:subscribe', { rideId: unknownRide });
      await new Promise(resolve => setTimeout(resolve, 250));
      const processed = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('GPS relay did not process the fault test')), 10000);
        sockets.admin.once('driver:location', () => { clearTimeout(timer); resolve(); });
      });
      sockets.driver.emit('driver:location', { lat: 30, lng: 31, rideId: unknownRide });
      await processed;
      await new Promise(resolve => setTimeout(resolve, 100));
      assert.equal(leaked, false, 'Redis failure must never grant membership to an unknown ride');
    } finally {
      await redis.acl('SETUSER', 'default', '+sismember');
      for (const socket of Object.values(sockets)) socket.disconnect();
    }
  });
  await check('driver online/offline API remains functional with EGP wallet', async () => {
    const online = await request('/api/drivers/me/status', cookies.driver, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ online: true, location: { lat: 30, lng: 31 } }) });
    assert.equal(online.status, 200);
    assert.equal((await Driver.findById(driver._id)).isOnline, true);
    const offline = await request('/api/drivers/me/status', cookies.driver, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ online: false }) });
    assert.equal(offline.status, 200);
    assert.equal((await Driver.findById(driver._id)).isOnline, false);
  });
  await check('rider and driver cannot write branding with real sessions', async () => {
    for (const role of ['rider','driver']) assert.equal((await putBranding(cookies[role], { name: 'Bad', logo: null, loginLogo: null })).status, 403);
  });
  await check('session update cannot escalate rider role', async () => {
    const csrf = await request('/api/auth/csrf', cookies.rider);
    const c = cookieHeader(csrf, cookies.rider);
    const { csrfToken } = await csrf.json();
    const updated = await request('/api/auth/session', c, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ csrfToken, data: { role: 'admin' } }) });
    const session = await updated.json(); assert.equal(session.user.role, 'rider');
  });
  await check('default branding is returned from empty database', async () => assert.deepEqual(await (await request('/api/branding')).json(), { name: 'Maxride', logo: null, loginLogo: null }));
  let saved;
  await check('admin upload is persisted and publicly readable', async () => {
    const response = await putBranding(cookies.admin, { name: 'QA Maxride', logo: await logo('red'), loginLogo: await logo('blue') });
    assert.equal(response.status, 200); saved = await response.json();
    assert.match(saved.logo, /^data:image\/webp;base64,/);
    const stored = await mongoose.connection.db.collection('brandings').findOne({ _id: 'public' });
    assert.equal(stored.logo, saved.logo);
    assert.deepEqual(await (await request('/api/branding')).json(), saved);
  });
  await stop(); await start();
  await check('branding persists after application restart', async () => assert.deepEqual(await (await request('/api/branding')).json(), saved));
  await check('logo replacement and remove/default restoration persist', async () => {
    const response = await putBranding(cookies.admin, { name: 'QA replacement', logo: await logo('green'), loginLogo: null });
    assert.equal(response.status, 200); assert.notEqual((await response.json()).logo, saved.logo);
    assert.equal((await putBranding(cookies.admin, { name: 'Maxride', logo: null, loginLogo: null })).status, 200);
    assert.deepEqual(await (await request('/api/branding')).json(), { name: 'Maxride', logo: null, loginLogo: null });
  });
  await check('EGP tariffs ignore legacy pricing without modifying it', async () => {
    await PricingRule.collection.insertOne({ vehicleType: 'economy', city: 'default', isActive: true, baseFare: 999, perKmRate: 999 });
    const fare = await calculateFare({ distanceMeters: 1000, durationSeconds: 600, surgeMultiplier: 1 });
    assert.equal(fare.currency, 'EGP'); assert.equal(fare.total, 45); assert.equal(fare.driverEarnings + fare.platformFee, fare.total);
    const old = await PricingRule.collection.findOne({ vehicleType: 'economy' }); assert.equal(old.currency, undefined); assert.equal(old.baseFare, 999);
  });
  await check('concurrent completion settles wallets and ledger exactly once', async () => {
    const ride = await makeRide();
    const results = await Promise.allSettled([1,2].map(() => completeRide({ rideId: ride._id, driverUserId: users.driver._id })));
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1, results.filter(r => r.status === 'rejected').map(r => r.reason.message).join('; '));
    assert.equal((await User.findById(users.rider._id).lean()).wallet.balance, 989.99);
    assert.equal((await User.findById(users.driver._id).lean()).wallet.balance, 1009.21);
    const entries = await WalletTransaction.find({ rideId: ride._id }).lean(); assert.equal(entries.length, 2); assert.ok(entries.every(e => e.currency === 'EGP'));
    assert.equal(await Payment.countDocuments({ rideId: ride._id, currency: 'EGP' }), 1);
  });
  await check('currency mismatch rolls back status and all wallet changes', async () => {
    const ride = await makeRide('USD');
    await assert.rejects(completeRide({ rideId: ride._id, driverUserId: users.driver._id }), /currency review/);
    assert.equal((await Ride.findById(ride._id)).status, 'in_progress');
    assert.equal(await WalletTransaction.countDocuments({ rideId: ride._id }), 0);
  });
  await check('concurrent cancellation charges once with matching EGP metadata', async () => {
    const ride = await makeRide('EGP', 'arrived');
    const before = (await User.findById(users.rider._id)).wallet.balance;
    const results = await Promise.allSettled([1,2].map(() => cancelRide({ rideId: ride._id, userId: users.rider._id, role: 'rider' })));
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1, results.filter(r => r.status === 'rejected').map(r => r.reason.message).join('; '));
    assert.equal((await User.findById(users.rider._id)).wallet.balance, Math.round((before - 30) * 100) / 100);
    assert.equal(await WalletTransaction.countDocuments({ rideId: ride._id }), 2);
    assert.equal(await Payment.countDocuments({ rideId: ride._id, 'metadata.kind': 'cancellation' }), 1);
  });
  await check('duplicate Stripe deliveries credit once and never mix currencies', async () => {
    const session = { id: 'qa_checkout_1', payment_status: 'paid', currency: 'egp', amount_total: 1001, metadata: { userId: String(users.rider._id) } };
    const before = (await User.findById(users.rider._id)).wallet.balance;
    const results = await Promise.all([creditCheckoutSession(session), creditCheckoutSession(session)]);
    assert.equal(results.filter(r => r.credited).length, 1);
    assert.equal((await User.findById(users.rider._id)).wallet.balance, Math.round((before + 10.01) * 100) / 100);
    await assert.rejects(creditCheckoutSession({ ...session, id: 'qa_checkout_usd', currency: 'usd' }), /currency/);
  });
  await check('financial API summaries isolate EGP from historical USD', async () => {
    const legacy = await makeRide('USD', 'completed');
    await Ride.updateOne({ _id: legacy._id }, { completedAt: new Date() });
    const overview = await (await request('/api/admin/overview', cookies.admin)).json();
    assert.equal(overview.currency, 'EGP'); assert.equal(overview.revenueToday, 10.01);
    const earnings = await (await request('/api/drivers/me/earnings', cookies.driver)).json();
    assert.equal(earnings.currency, 'EGP'); assert.equal(earnings.today.earnings, 9.21);
    assert.ok(earnings.recentRides.some(r => r.fare.currency === 'USD'));
  });
  await check('admin pricing cannot relabel a legacy rule', async () => {
    const response = await request('/api/admin/pricing', cookies.admin, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ vehicleType: 'economy', city: 'default', baseFare: 20, perKmRate: 8, perMinRate: 1, minimumFare: 40, bookingFee: 5, platformCommission: 8, surgeMultiplierCap: 3 }) });
    assert.equal(response.status, 409);
    const legacy = await PricingRule.collection.findOne({ vehicleType: 'economy' }); assert.equal(legacy.currency, undefined); assert.equal(legacy.baseFare, 999);
  });
  await check('production top-ups cannot mint funds when Stripe is disabled', async () => {
    const before = (await User.findById(users.rider._id)).wallet.balance;
    const response = await request('/api/wallet', cookies.rider, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ amount: 100 }) });
    assert.equal(response.status, 409);
    assert.equal((await User.findById(users.rider._id)).wallet.balance, before);
  });
  await check('new signup starts with an empty EGP wallet', async () => {
    const response = await request('/api/auth/signup', '', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'QA New Rider', username: 'qa_new_rider', password, confirmPassword: password, role: 'rider' }) });
    assert.equal(response.status, 201);
    const user = await User.findOne({ username: 'qa_new_rider' }).lean(); assert.equal(user.wallet.currency, 'EGP'); assert.equal(user.wallet.balance, 0);
  });
  console.log(`${passed} database/API integration checks passed; only disposable database ${dbName} was written.`);
} catch (error) { console.error('Integration failed:', error.stack); process.exitCode = 1; }
finally { await stop(); redis.disconnect(); await mongoose.disconnect(); }
