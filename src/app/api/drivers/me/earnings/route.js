import { walletAccount, walletAccounts } from '@/lib/currency';
import { CURRENCY } from '@/lib/currency';
import mongoose from 'mongoose';
import connectDB from '@/lib/db/mongodb';
import User from '@/lib/db/models/User';
import Ride from '@/lib/db/models/Ride';
import Driver from '@/lib/db/models/Driver';
import WalletTransaction from '@/lib/db/models/WalletTransaction';
import { requireAuth } from '@/lib/auth/helpers';

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfWeek(d = new Date()) {
  const x = startOfDay(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // Monday
  return x;
}

// GET /api/drivers/me/earnings — summary + ledger
export async function GET(request) {
  const { session, error } = await requireAuth(['driver']);
  if (error) return error;

  try {
    await connectDB();

    const driverUserId = session.user.id;
    const driverObjectId = new mongoose.Types.ObjectId(driverUserId);
    const today = startOfDay();
    const week = startOfWeek();

    const [driver, user, todayAgg, weekAgg, recentRides, transactions] = await Promise.all([
      Driver.findOne({ userId: driverUserId }).select('stats').lean(),
      User.findById(driverUserId).select('wallet egpWallet').lean(),
      Ride.aggregate([
        {
          $match: {
            driverId: driverObjectId,
            status: 'completed',
            'fare.currency': CURRENCY,
            completedAt: { $gte: today },
          },
        },
        {
          $group: {
            _id: null,
            earnings: { $sum: '$fare.driverEarnings' },
            trips: { $sum: 1 },
          },
        },
      ]),
      Ride.aggregate([
        {
          $match: {
            driverId: driverObjectId,
            status: 'completed',
            'fare.currency': CURRENCY,
            completedAt: { $gte: week },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$completedAt' } },
            earnings: { $sum: '$fare.driverEarnings' },
            trips: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Ride.find({ driverId: driverUserId, status: 'completed' })
        .sort({ completedAt: -1 })
        .limit(10)
        .select('pickup.address dropoff.address fare.currency fare.driverEarnings fare.total payment.method completedAt route.distanceMeters')
        .lean(),
      WalletTransaction.find({ userId: driverUserId })
        .sort({ createdAt: -1 })
        .limit(20)
        .lean(),
    ]);

    const lifetime = await Ride.aggregate([
      { $match: { driverId: driverObjectId, status: 'completed', 'fare.currency': CURRENCY } },
      { $group: { _id: null, total: { $sum: '$fare.driverEarnings' } } },
    ]);
    return Response.json({
      currency: CURRENCY,
      financialScope: 'EGP only; historical currencies remain in trip history',
      wallet: walletAccount(user) || { balance: 0, currency: null },
      accounts: walletAccounts(user),
      stats: { ...driver?.stats, totalEarnings: lifetime[0]?.total || 0, currency: CURRENCY },
      today: todayAgg[0] || { earnings: 0, trips: 0 },
      week: {
        total: weekAgg.reduce((s, d) => s + d.earnings, 0),
        trips: weekAgg.reduce((s, d) => s + d.trips, 0),
        byDay: weekAgg,
      },
      recentRides,
      transactions,
    });
  } catch (err) {
    console.error('Earnings error:', err);
    return Response.json({ error: 'Failed to fetch earnings' }, { status: 500 });
  }
}
