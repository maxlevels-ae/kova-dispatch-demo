import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { safeCallback, dashboardForRole } from '../src/lib/auth/redirects.js';
import { money, minorUnits, sameCurrency, DEFAULT_PRICING } from '../src/lib/currency.js';
import { validateLogo } from '../src/lib/validate-branding.js';
import User from '../src/lib/db/models/User.js';
import Ride from '../src/lib/db/models/Ride.js';
import Payment from '../src/lib/db/models/Payment.js';
import WalletTransaction from '../src/lib/db/models/WalletTransaction.js';
import { isStripeEnabled } from '../src/lib/services/stripe.js';

for (const [role, destination] of [['admin','/admin/dashboard'],['driver','/driver/dashboard'],['rider','/dashboard']]) {
  test(`${role}: default and safe post-login redirects`, () => {
    assert.equal(dashboardForRole(role), destination);
    assert.equal(safeCallback(null, role), destination);
    assert.equal(safeCallback(destination + '?tab=recent', role), destination + '?tab=recent');
    assert.equal(safeCallback('https://app.test' + destination, role, 'https://app.test'), destination);
    for (const malicious of ['https://evil.test','//evil.test','/\\evil.test','/%5cevil.test','/%2f%2fevil.test','javascript:alert(1)','/login','/api/auth/signout','/foo%0abar']) assert.equal(safeCallback(malicious, role), destination, malicious);
  });
}
test('admin root canonicalization and cross-role isolation', () => {
  assert.equal(safeCallback('/admin', 'admin'), '/admin/dashboard');
  assert.equal(safeCallback('/admin/settings', 'rider'), '/dashboard');
  assert.equal(safeCallback('/admin/settings', 'driver'), '/driver/dashboard');
  assert.equal(safeCallback('/driver/dashboard', 'admin'), '/admin/dashboard');
});
test('EGP formatting and explicit historical/unknown currencies', () => {
  assert.match(money(1234.5), /E£/);
  assert.match(money(10, 'USD'), /USD/);
  assert.match(money(10, null), /currency unverified/);
  assert.equal(minorUnits(1.005), 101);
  assert.equal(minorUnits(-1.005), -101);
  assert.equal(minorUnits(0.1 + 0.2), 30);
  assert.throws(() => minorUnits(Infinity));
  assert.equal(sameCurrency(undefined, undefined), false);
  assert.equal(sameCurrency('USD', 'EGP'), false);
  assert.equal(sameCurrency('egp', 'EGP'), true);
  assert.equal(DEFAULT_PRICING.economy.baseFare, 20);
});
test('new document defaults never relabel hydrated historical records', () => {
  assert.equal(new User().wallet.currency, 'EGP');
  assert.equal(new Ride().fare.currency, 'EGP');
  assert.equal(new Payment().currency, 'EGP');
  assert.equal(new WalletTransaction().currency, 'EGP');
  assert.equal(User.hydrate({ wallet: { balance: 100 } }).wallet.currency, undefined);
  assert.equal(Ride.hydrate({ fare: { total: 100 } }).fare.currency, undefined);
  assert.equal(Payment.hydrate({ amount: 100 }).currency, undefined);
  assert.equal(WalletTransaction.hydrate({ amount: 100 }).currency, undefined);
  assert.equal(User.hydrate({ wallet: { balance: 100, currency: 'USD' } }).wallet.currency, 'USD');
});
test('unverified Egyptian payment initiation is disabled', () => {
  assert.equal(isStripeEnabled(), false);
});
for (const format of ['png', 'jpeg', 'webp']) test(`valid ${format} logo is decoded and stored as sanitized WebP`, async () => {
  const bytes = await sharp({ create: { width: 24, height: 24, channels: 3, background: '#ca8a04' } })[format]().toBuffer();
  const result = await validateLogo(`data:image/${format};base64,${bytes.toString('base64')}`);
  assert.match(result, /^data:image\/webp;base64,/);
  const metadata = await sharp(Buffer.from(result.split(',')[1], 'base64')).metadata();
  assert.equal(metadata.width, 24);
});
test('logos reject SVG, disguised, truncated and oversized files; removal is supported', async () => {
  assert.equal(await validateLogo(null), null);
  await assert.rejects(validateLogo('data:image/svg+xml;base64,PHN2Zz4='));
  await assert.rejects(validateLogo('data:image/png;base64,' + Buffer.from('<script>bad</script>').toString('base64')));
  await assert.rejects(validateLogo('data:image/png;base64,' + Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]).toString('base64')));
  await assert.rejects(validateLogo('data:image/png;base64,' + Buffer.alloc(262145).toString('base64')));
  const png = await sharp({ create: { width: 1, height: 1, channels: 3, background: 'red' } }).png().toBuffer();
  await assert.rejects(validateLogo('data:image/jpeg;base64,' + png.toString('base64')));
});
