import {customerLocale} from './i18n';
export const CURRENCY = 'EGP';
export const COUNTRY = 'EG';
export const COUNTRY_NAME = 'Egypt';
export const CURRENCY_SYMBOL = 'E£';
export const CURRENCY_LOCALE = 'en-EG';
export const LATE_CANCEL_FEE = 30;
export const LEGACY_USD_CANCEL_FEE = 3;
export const PAYMENT_LIMITATION = 'Card payments and bank payouts are unavailable until an Egypt-compatible provider and merchant account are verified.';
export function money(amount, currency = CURRENCY) {
  const value = Number(amount ?? 0);
  if (!currency) return `${value.toFixed(2)} (currency unverified)`;
  return new Intl.NumberFormat(customerLocale(), { style: 'currency', currency: currency.toUpperCase(), currencyDisplay: 'code', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value).replace('EGP', customerLocale()==='ar-EG'?'ج.م.':CURRENCY_SYMBOL);
}
export function minorUnits(amount) {
  if (!Number.isFinite(amount)) throw new Error('Invalid monetary amount');
  const minor = Math.sign(amount) * Math.round((Math.abs(amount) + Number.EPSILON) * 100);
  if (!Number.isSafeInteger(minor)) throw new Error('Monetary amount exceeds precision');
  return minor;
}
export function sameCurrency(a, b) {
  return typeof a === 'string' && typeof b === 'string' && /^[A-Z]{3}$/i.test(a) && a.toUpperCase() === b.toUpperCase();
}
// Fresh EGP tariffs, not an FX conversion of stored prices or balances.
export const DEFAULT_PRICING = {
  economy: { baseFare: 20, perKmRate: 8, perMinRate: 1, minimumFare: 40, bookingFee: 5, platformCommission: 8, surgeMultiplierCap: 3 },
  comfort: { baseFare: 30, perKmRate: 12, perMinRate: 1.5, minimumFare: 65, bookingFee: 7.5, platformCommission: 8, surgeMultiplierCap: 3 },
  premium: { baseFare: 50, perKmRate: 20, perMinRate: 2.5, minimumFare: 120, bookingFee: 10, platformCommission: 10, surgeMultiplierCap: 3 },
  xl: { baseFare: 40, perKmRate: 15, perMinRate: 2, minimumFare: 80, bookingFee: 7.5, platformCommission: 8, surgeMultiplierCap: 3 },
};

export function walletAccount(user, currency = CURRENCY) {
  if (sameCurrency(user?.wallet?.currency, currency)) return user.wallet;
  if (currency === CURRENCY && user) return { balance: user.egpWallet?.balance ?? 0, currency: CURRENCY };
  return null;
}
export function walletAccounts(user) {
  return user?.wallet?.currency === CURRENCY ? [user.wallet] : [walletAccount(user), user?.wallet].filter(Boolean);
}
export function walletDelta(amount, currency) {
  if (currency === CURRENCY) return [{ $set: {
    'wallet.balance': { $cond: [{ $eq: ['$wallet.currency', CURRENCY] }, { $round: [{ $add: ['$wallet.balance', minorUnits(amount) / 100] }, 2] }, '$wallet.balance'] },
    egpWallet: { $cond: [{ $eq: ['$wallet.currency', CURRENCY] }, '$egpWallet', { currency: CURRENCY, balance: { $round: [{ $add: [{ $ifNull: ['$egpWallet.balance', 0] }, minorUnits(amount) / 100] }, 2] } }] },
  } }];
  return [{ $set: { 'wallet.balance': { $round: [{ $add: ['$wallet.balance', minorUnits(amount) / 100] }, 2] } } }];
}
