import {activeOperations} from '@/lib/operating-areas';
import { demoLegacyRecord } from '@/lib/demo-wallet-initialization';
import { walletAccount, walletAccounts } from '@/lib/currency';
import mongoose from 'mongoose';
import { CURRENCY, PAYMENT_LIMITATION, walletDelta } from '@/lib/currency';
import { z } from 'zod';
import connectDB from '@/lib/db/mongodb';
import User from '@/lib/db/models/User';
import WalletTransaction from '@/lib/db/models/WalletTransaction';
import { requireAuth } from '@/lib/auth/helpers';
import { isStripeEnabled } from '@/lib/services/stripe';

const topupSchema = z.object({
  amount: z
    .number()
    .positive('Amount must be positive')
    .max(1000, 'Maximum top-up is EGP 1,000'),
});

// GET /api/wallet — balance + transaction history
export async function GET(request) {
  const { session, error } = await requireAuth();
  if (error) return error;

  try {
    await connectDB();

    const { searchParams } = request.nextUrl;
    const limit = Math.min(100, parseInt(searchParams.get('limit') || '30', 10));

    const [user, transactions] = await Promise.all([
      User.findById(session.user.id).select('wallet egpWallet currencyWallets').lean(),
      WalletTransaction.find({ userId: session.user.id })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean(),
    ]);

    const country=(await activeOperations()).country;
    return Response.json({
      operatingCountry:country.code,
      operatingCurrency:country.currency,
      wallet: walletAccount(user,country.currency) || { balance: 0, currency: country.currency },
      accounts: walletAccounts(user),
      legacyRecord: await demoLegacyRecord(session.user.id),
      transactions,
      stripeEnabled: country.currency===CURRENCY && isStripeEnabled(),
      topupEnabled: country.currency===CURRENCY && process.env.DEMO_WALLET_TOPUPS === 'true' && process.env.NODE_ENV !== 'production' && walletAccount(user)?.currency === CURRENCY,
      limitation: PAYMENT_LIMITATION,
    },{headers:{'Cache-Control':'private, no-store'}});
  } catch (err) {
    console.error('Wallet error:', err);
    return Response.json({ error: 'Failed to fetch wallet' }, { status: 500 });
  }
}

// POST /api/wallet — demo top-up (instant credit). Automatically disabled
// once Stripe is configured, so real deployments can't mint free balance.
export async function POST(request) {
  const { session, error } = await requireAuth();
  if (error) return error;

  if (process.env.DEMO_WALLET_TOPUPS !== 'true' || process.env.NODE_ENV === 'production' || isStripeEnabled()) {
    return Response.json(
      { error: 'Top-ups are disabled pending local payment-provider verification' },
      { status: 409 }
    );
  }

  try {
    const body = await request.json();
    const parsed = topupSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message || 'Invalid amount' },
        { status: 400 }
      );
    }

    const amount = Math.round(parsed.data.amount * 100) / 100;

    await connectDB();
    const result = await mongoose.connection.transaction(async dbSession => {
      const user = await User.findOneAndUpdate(
        { _id: session.user.id },
        walletDelta(amount, CURRENCY), { returnDocument: 'after', session: dbSession, updatePipeline: true }
      );
      if (!user) return null;
      const [txn] = await WalletTransaction.create([{ userId: session.user.id, type: 'topup', amount, currency: CURRENCY, balanceAfter: walletAccount(user).balance, note: 'Demo wallet top-up' }], { session: dbSession });
      return { user, txn };
    });
    if (!result) return Response.json({ error: 'Wallet currency requires review. Balance unchanged.' }, { status: 409 });
    const { user, txn } = result;

    return Response.json({ wallet: walletAccount(user), transaction: txn }, { status: 201 });
  } catch (err) {
    console.error('Top-up error:', err);
    return Response.json({ error: 'Failed to top up wallet' }, { status: 500 });
  }
}
