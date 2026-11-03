import { DEFAULT_PRICING, CURRENCY } from '../src/lib/currency.js';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
// No production model defaults or destructive seed script: explicit staging-only inserts.
export async function seedStaging(env) {
  if (env.APP_ENV !== 'staging' || !env.MONGODB_URI?.includes('/maxride_staging?') || !env.STAGING_DEMO_PASSWORD || env.STAGING_DEMO_PASSWORD.length < 16) throw new Error('Staging seeding requires isolated database and a strong staging-only password');
  const connection = await mongoose.createConnection(env.MONGODB_URI, { serverSelectionTimeoutMS: 20000 }).asPromise();
  try {
    const db = connection.db;
    const marker = await db.collection('environment').findOne({ _id: 'identity' });
    if (marker && marker.name !== 'maxride_staging') throw new Error('Database environment mismatch');
    if (!marker && (await db.listCollections().toArray()).some(c => !c.name.startsWith('system.'))) throw new Error('Refusing to seed a nonempty unmarked database');
    await db.collection('environment').updateOne({ _id: 'identity' }, { $setOnInsert: { name: 'maxride_staging' } }, { upsert: true });
    const passwordHash = await bcrypt.hash(env.STAGING_DEMO_PASSWORD, 12);
    const session = await connection.startSession();
    try {
      await session.withTransaction(async () => {
        for (const role of ['admin','rider','driver']) {
          const username = `staging_${role}`;
          if (await db.collection('users').findOne({ username }, { session })) continue;
          const user = { _id: new mongoose.Types.ObjectId(), username, name: `Maxride Staging ${role}`, role, passwordHash, isActive: true, wallet: { balance: role === 'rider' ? 5000 : 0, currency: 'EGP' }, rating: { average: 5, count: 0 }, createdAt: new Date(), updatedAt: new Date() };
          await db.collection('users').insertOne(user, { session });
          if (role === 'rider') await db.collection('wallettransactions').insertOne({ userId: user._id, type: 'topup', amount: 5000, balanceAfter: 5000, currency: 'EGP', ref: 'staging-opening-rider-v1', note: 'Staging-only test funds; no cash value', createdAt: new Date(), updatedAt: new Date() }, { session });
          if (role === 'driver') await db.collection('drivers').insertOne({ userId: user._id, isApproved: true, isOnline: false, currentRideId: null, vehicle: { make: 'Toyota', model: 'Corolla', year: 2024, color: 'White', plate: 'STAGING-ONLY', type: 'economy' }, location: { type: 'Point', coordinates: [0,0] }, stats: { totalTrips: 0, totalEarnings: 0, currency: 'EGP', averageRating: 5, acceptanceRate: 100, cancellationRate: 0 }, createdAt: new Date(), updatedAt: new Date() }, { session });
        }
        for (const [vehicleType, rates] of Object.entries(DEFAULT_PRICING)) await db.collection('pricingrules').updateOne({ vehicleType, city: 'default' }, { $setOnInsert: { vehicleType, city: 'default', currency: CURRENCY, ...rates, isActive: true } }, { upsert: true, session });
      });
    } finally { await session.endSession(); }
    console.log('Staging fixtures ready; existing accounts, wallets and trips were preserved.');
  } finally { await connection.close(); }
}
