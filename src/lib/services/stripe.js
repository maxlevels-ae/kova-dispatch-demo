import mongoose from 'mongoose';
import {currencyDigits} from '@/lib/countries';
import { sameCurrency, walletDelta } from '@/lib/currency';
import Stripe from 'stripe';
import connectDB from '@/lib/db/mongodb';
import User from '@/lib/db/models/User';
import WalletTransaction from '@/lib/db/models/WalletTransaction';

export function isStripeEnabled() {
  return false; // Egypt merchant/payment capabilities have not been verified.
}

let client = null;

/** Lazily-initialized Stripe client (null when not configured). */
export function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  if (!client) {
    client = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return client;
}

/**
 * Credit a paid Checkout session to the user's wallet exactly once.
 * Safe to call from both the webhook and the success-return page —
 * the unique `ref` index makes double-credits impossible.
 *
 * @returns {{ credited: boolean, amount?: number, balance?: number }}
 */
export async function creditCheckoutSession(session) {
  if (session.payment_status !== 'paid') {
    return { credited: false, reason: 'not_paid' };
  }

  const userId = session.metadata?.userId;
  const currency=session.currency?.toUpperCase();
  if(!Object.hasOwn(currencyDigits,currency))throw new Error('Unsupported payment currency');
  const amount = (session.amount_total ?? 0) / 10**currencyDigits[currency];
  if (!userId || amount <= 0) {
    return { credited: false, reason: 'invalid_session' };
  }

  await connectDB();

  // Atomically credit the original session currency, never convert legacy payments.
  return mongoose.connection.transaction(async dbSession => {
    const existing = await WalletTransaction.findOne({ ref: session.id }).session(dbSession).lean();
    if (existing) return { credited: false, reason: 'already_credited' };
    const user = await User.findById(userId).session(dbSession).lean();
    if (!sameCurrency(user?.wallet?.currency, session.currency)) throw new Error('Payment currency requires manual reconciliation');
    const updated = await User.findOneAndUpdate({ _id: userId, 'wallet.currency': user.wallet.currency }, walletDelta(amount,currency), { returnDocument: 'after', session: dbSession, updatePipeline: true });
    await WalletTransaction.create([{ userId, type: 'topup', amount, currency: session.currency.toUpperCase(), balanceAfter: updated.wallet.balance, note: 'Card top-up (Stripe)', ref: session.id }], { session: dbSession });
    return { credited: true, amount, currency: session.currency.toUpperCase(), balance: updated.wallet.balance };
  });
}
