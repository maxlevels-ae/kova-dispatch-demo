import {pickupEvidence,tripEvidence,rejectUnsafe,RideSafetyError} from '@/lib/ride-safety';
import {currencyDigits} from '@/lib/countries';
import {bookingArea,courierReadiness} from '@/lib/operating-areas';
import {isTaxiEnabled} from '@/lib/service-availability';
import { getSettings } from '@/lib/settings';
import {notifyRideParticipants} from '@/lib/notifications';
import mongoose from 'mongoose';
import { CURRENCY, LATE_CANCEL_FEE as EGP_CANCEL_FEE, sameCurrency, LEGACY_USD_CANCEL_FEE, walletDelta, walletAccount, minorUnits } from '@/lib/currency';
import crypto from 'crypto';
import connectDB from '@/lib/db/mongodb';
import redis from '@/lib/db/redis';
import Ride, { ACTIVE_STATUSES } from '@/lib/db/models/Ride';
import Driver from '@/lib/db/models/Driver';
import User from '@/lib/db/models/User';
import Payment from '@/lib/db/models/Payment';
import WalletTransaction from '@/lib/db/models/WalletTransaction';
import { calculateFare } from './fare-calculator';
import { getRoute } from './routing';
import { estimateDriverETA } from './ride-matcher';
import { haversineDistance } from '@/lib/utils/geo';
import {
  startDispatch,
  signalDispatch,
  verifyOfferHolder,
  clearOffer,
} from '@/lib/realtime/dispatch';
import {
  emitToRider,
  emitToDriver,
  emitToRide,
  emitToAdmin,
  joinRiderToRide,
  joinDriverToRide,
  leaveRideRoom,
} from '@/lib/realtime/emit';

/** Fee charged when a rider cancels after the driver has already arrived. */

class RideError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
export { RideError };

const round2 = (n) => Math.round(n * 100) / 100;

/** Redis set of user ids allowed in a ride's socket room. */
async function addRideMember(rideId, userId) {
  try {
    await redis.sadd(`ride:members:${rideId}`, String(userId));
    await redis.expire(`ride:members:${rideId}`, 24 * 3600);
  } catch {
    /* server.js fails open when Redis is down */
  }
}

async function clearRideMembers(rideId) {
  try {
    await redis.del(`ride:members:${rideId}`);
  } catch {
    /* ignore */
  }
}

function point(lat, lng) {
  return { type: 'Point', coordinates: [lng, lat] };
}

function coordsToLatLng(location) {
  return { lat: location.coordinates[1], lng: location.coordinates[0] };
}

/** Public shape of a ride for API responses & socket payloads. */
export function serializeRide(ride, { driver, driverUser } = {}) {
  const r = ride.toObject ? ride.toObject({ virtuals: false }) : ride;
  return {
    id: String(r._id),
    country:r.operations?.country, zones:r.operations?{pickup:r.operations.pickupZone,dropoff:r.operations.dropoffZone}:undefined,
    scheduledAt: r.scheduledAt,
    safety: r.safety, earlyEnd: r.earlyEnd, endedAt:r.endedAt,
    status: r.status,
    pickup: { address: r.pickup.address, ...coordsToLatLng(r.pickup.location) },
    dropoff: { address: r.dropoff.address, ...coordsToLatLng(r.dropoff.location) },
    route: {
      distanceMeters: r.route.distanceMeters,
      durationSeconds: r.route.durationSeconds,
      geometry: r.route.geometry || null,
    },
    vehicleType: r.vehicleType,
    fare: r.fare,
    payment: r.payment,
    pin: r.pin,
    rating: r.rating,
    messages: r.messages || [],
    timeline: r.timeline || [],
    cancelledBy: r.cancelledBy,
    cancellationReason: r.cancellationReason,
    riderId: String(r.riderId),
    driverId: r.driverId ? String(r.driverId) : null,
    driver: driver
      ? {
          profileId: String(driver._id),
          name: driverUser?.name || '',
          avatar: driverUser?.avatar || '',
          rating: driver.stats?.averageRating ?? 5,
          totalTrips: driver.stats?.totalTrips ?? 0,
          vehicle: r.assignedVehicle?.plate ? r.assignedVehicle : driver.vehicle,
          location: driver.location ? coordsToLatLng(driver.location) : null,
        }
      : undefined,
    startedAt: r.startedAt,
    completedAt: r.completedAt,
    createdAt: r.createdAt,
  };
}

/** Load a ride's driver + user docs for payload composition. */
async function loadDriverBundle(ride) {
  if (!ride.driverProfileId) return {};
  const [driver, driverUser] = await Promise.all([
    Driver.findById(ride.driverProfileId).lean(),
    User.findById(ride.driverId).lean(),
  ]);
  return { driver, driverUser };
}

// ─── Create & dispatch ────────────────────────────────────────────────────────

export async function createRide({ riderId, pickup, dropoff, vehicleType, scheduledAt }) {
  await connectDB();
  if(!await isTaxiEnabled())throw new RideError('Taxi bookings are currently paused.',409);

  const settings = await getSettings();
  const scheduledDate = scheduledAt ? new Date(scheduledAt) : null;
  if(scheduledDate&&!Number.isFinite(+scheduledDate))throw new RideError('Invalid scheduled date');
  const operations=await bookingArea('taxi',pickup,dropoff,scheduledDate||new Date());
  const countryDispatch=operations.config.dispatch;
  settings.dispatch={...settings.dispatch,...countryDispatch,searchRadiusKm:countryDispatch.radiusKm,fallback:operations.country.code==='EG'?settings.dispatch.fallback:'no_drivers'};
  if (scheduledDate && (!settings.dispatch.scheduledEnabled || !Number.isFinite(+scheduledDate) || +scheduledDate < Date.now() + 60000 || +scheduledDate > Date.now() + settings.dispatch.maxScheduleDays * 86400000)) throw new RideError('Scheduled booking is disabled or outside the allowed advance window');
  operations.taxiDispatch={...settings.dispatch,...operations.config.dispatch,searchRadiusKm:operations.config.dispatch.radiusKm};
  if(!operations.config.vehicles.includes(vehicleType))throw new RideError('Vehicle category is unavailable');
  const policyError = !operations.config.vehicles.includes(vehicleType) ? 'Vehicle category is unavailable' : null;
  if (policyError) throw new RideError(policyError);

  // One live ride per rider
  const existing = await Ride.findOne({ riderId, status: { $in: ACTIVE_STATUSES } });
  if (existing) {
    throw new RideError('You already have a ride in progress', 409);
  }

  const route = await getRoute(pickup, dropoff);
  if (route.distanceMeters < 100) {
    throw new RideError('Pickup and destination are too close together');
  }
  if (route.distanceMeters > settings.dispatch.maxTripKm * 1000) {
    throw new RideError(`This trip exceeds the ${settings.dispatch.maxTripKm} km limit`);
  }

  const fare = await calculateFare({
    distanceMeters: route.distanceMeters,
    durationSeconds: route.durationSeconds,
    vehicleType,
    pickup, operations,
  });

  const rider = await User.findById(riderId).select('wallet egpWallet currencyWallets').lean();
  if (!sameCurrency(walletAccount(rider,fare.currency)?.currency, fare.currency)) throw new RideError('Wallet currency is unavailable. Existing funds are unchanged.', 409);
  const balance = walletAccount(rider,fare.currency)?.balance ?? 0;

  // An outstanding balance (unpaid cancellation fee, or a fare that couldn't
  // be covered) must be cleared before booking again.
  if (balance < 0) {
    throw new RideError(
      `You have an outstanding balance of ${Math.abs(balance).toFixed(2)} — top up your wallet to book again`,
      402
    );
  }

  if (balance < fare.total) {
    throw new RideError(
      'Insufficient wallet balance — add funds to book this ride',
      402
    );
  }

  const pin = String(crypto.randomInt(1000, 10000));

  const ride = await Ride.create({
    operations, riderId, safety:{policy:settings.dispatch.safety},
    status: 'searching',
    scheduledAt: scheduledDate || undefined,
    dispatch: { manualHold: settings.dispatch.assignmentMode === 'manual' },
    pickup: { address: pickup.address, location: point(pickup.lat, pickup.lng) },
    dropoff: { address: dropoff.address, location: point(dropoff.lat, dropoff.lng) },
    route: {
      distanceMeters: route.distanceMeters,
      durationSeconds: route.durationSeconds,
      geometry: route.geometry || undefined,
    },
    vehicleType,
    fare,
    payment: { method: 'wallet', status: 'pending' },
    pin,
    timeline: [
      { status: 'searching', timestamp: new Date(), location: point(pickup.lat, pickup.lng) },
    ],
  });

  await addRideMember(String(ride._id), riderId);
  joinRiderToRide(String(riderId), String(ride._id));
  emitToAdmin('ride:updated', { rideId: String(ride._id), status: 'searching' });

  // Fire the offer cascade — deliberately not awaited
  startDispatch(String(ride._id));

  return ride;
}

// ─── Driver accept / decline ──────────────────────────────────────────────────

export async function acceptRide({ rideId, driverUserId }) {
  await connectDB();

  const driver = await Driver.findOne({ userId: driverUserId });
  if (!driver) throw new RideError('Driver profile not found', 404);
  if (!driver.isApproved) throw new RideError('Your driver account is not approved yet', 403);
  const offeredRide = await Ride.findById(rideId).lean();
  const { fleet:currentFleet } = await getSettings();
  const fleet=offeredRide?.operations?{...currentFleet,enabledCategories:offeredRide.operations.config.vehicles,requiredDocuments:offeredRide.operations.config.documents,maxDailyTrips:offeredRide.operations.config.dispatch.maxDailyTrips}:currentFleet;
  if (!fleet.enabledCategories.includes(driver.vehicle.type) || fleet.requiredDocuments.some(type => !driver.documents.some(d => d.type === type && d.verified))) throw new RideError('Driver does not meet current fleet policy', 403);
  if (fleet.maxDailyTrips > 0) {
    const since = new Date(Date.now() - 86400000);
    const count = await Ride.countDocuments({ driverId: driverUserId, status: 'completed', completedAt: { $gte: since } });
    if (count >= fleet.maxDailyTrips) throw new RideError('Driver trip limit reached for the past 24 hours', 409);
  }

  if (offeredRide?.scheduledAt && new Date(offeredRide.scheduledAt) > new Date()) throw new RideError('This scheduled ride is not ready for dispatch', 409);
  if (offeredRide?.dispatch?.manualHold) throw new RideError('Ride is awaiting manual dispatch', 409);
  if (!driver.isOnline || driver.vehicle.type !== offeredRide?.vehicleType) throw new RideError('Driver is unavailable or vehicle category does not match', 409);
  if(offeredRide?.dispatch?.currentOffer?.expiresAt && (new Date(offeredRide.dispatch.currentOffer.expiresAt)<=new Date()||String(offeredRide.dispatch.currentOffer.userId)!==String(driverUserId)))throw new RideError('This offer expired or belongs to another driver',409);
  if(offeredRide?.dispatch?.offersSent>0&&!offeredRide.dispatch.currentOffer?.id)throw new RideError('This offer is no longer active',409);
  const driverWallet = await User.findById(driverUserId).select('wallet egpWallet currencyWallets isActive').lean();
  if(offeredRide?.operations){const check=courierReadiness(driver,driverWallet,{snapshot:offeredRide.operations,service:'taxi',pickup:coordsToLatLng(offeredRide.pickup.location)});if(!check.eligible)throw new RideError(check.reasons.map(r=>r.message).join('; '),409);}
  if (!sameCurrency(offeredRide?.fare?.currency, walletAccount(driverWallet, offeredRide?.fare?.currency)?.currency)) throw new RideError('Wallet currency does not match this ride; contact support for currency review.', 409);

  const holdsOffer = await verifyOfferHolder(rideId, driver._id);
  if (!holdsOffer) {
    throw new RideError('This request was already taken or expired', 409);
  }

  // Claim the driver first (prevents accepting two rides at once)
  const claimedDriver = await Driver.findOneAndUpdate(
    { _id: driver._id, currentRideId: null, currentDeliveryId:null,'services.rides':{$ne:false} },
    { currentRideId: rideId },
    { returnDocument: 'after' }
  );
  if (!claimedDriver) throw new RideError('You already have an active ride', 409);

  // Atomically claim the ride
  const ride = await Ride.findOneAndUpdate(
    { _id: rideId, status: 'searching',...(offeredRide.dispatch?.currentOffer?.id?{'dispatch.currentOffer.id':offeredRide.dispatch.currentOffer.id,'dispatch.currentOffer.expiresAt':{$gt:new Date()}}:{}) },
    {
      status: 'accepted',
      driverId: driverUserId,
      driverProfileId: driver._id,
      assignedVehicle: driver.vehicle,
      $push: {
        timeline: {
          status: 'accepted',
          timestamp: new Date(),
          location: claimedDriver.location,
        },
      },
    },
    { returnDocument: 'after' }
  );

  if (!ride) {
    // Lost the race or the ride was cancelled — release the driver
    await Driver.updateOne(
      { _id: driver._id, currentRideId: rideId },
      { currentRideId: null }
    );
    throw new RideError('This request was already taken or cancelled', 409);
  }

  await clearOffer(rideId);
  signalDispatch(rideId, 'accepted');

  // Update acceptance stats
  const total = (claimedDriver.stats.totalOffers || 0) + 1;
  const acceptedCount = (claimedDriver.stats.acceptedOffers || 0) + 1;
  await Driver.updateOne(
    { _id: driver._id },
    {
      'stats.totalOffers': total,
      'stats.acceptedOffers': acceptedCount,
      'stats.acceptanceRate': Math.round((acceptedCount / total) * 100),
    }
  );

  const driverUser = await User.findById(driverUserId).lean();
  const pickup = coordsToLatLng(ride.pickup.location);
  const driverLoc = claimedDriver.location ? coordsToLatLng(claimedDriver.location) : null;
  const etaMinutes = driverLoc
    ? estimateDriverETA(
        haversineDistance(driverLoc.lat, driverLoc.lng, pickup.lat, pickup.lng) * 1000
      )
    : 5;

  await addRideMember(String(ride._id), driverUserId);
  joinDriverToRide(String(driverUserId), String(ride._id));

  emitToRider(String(ride.riderId), 'ride:accepted', {
    ride: serializeRide(ride, { driver: claimedDriver, driverUser }),
    etaMinutes,
  });
  emitToDriver(String(driverUserId),'ride:accepted',{ride:serializeRide(ride,{driver:claimedDriver,driverUser}),etaMinutes});
  emitToAdmin('ride:updated', { rideId: String(ride._id), status: 'accepted' });
  await notifyRideParticipants(ride);

  return { ride, driver: claimedDriver, driverUser, etaMinutes };
}

export async function declineOffer({ rideId, driverUserId }) {
  await connectDB();
  const driver = await Driver.findOne({ userId: driverUserId }).select('_id').lean();
  if (!driver) throw new RideError('Driver profile not found', 404);

  signalDispatch(rideId, 'declined', { driverProfileId: String(driver._id) });
  return { ok: true };
}

// ─── Trip progression ─────────────────────────────────────────────────────────

async function transition({ rideId, driverUserId, from, to, extra = {}, note, dbSession }) {
  const ride = await Ride.findOneAndUpdate(
    { _id: rideId, driverId: driverUserId, status: from },
    {
      status: to,
      ...extra,
      $push: { timeline: { status: to, timestamp: new Date(), note } },
    },
    { returnDocument: 'after', session: dbSession, updatePipeline: true }
  );
  if (!ride) {
    throw new RideError(`Cannot move ride to "${to}" — check the current status`, 409);
  }
  return ride;
}

export async function driverArrived({ rideId, driverUserId }) {
  await connectDB();
  const current=await Ride.findOne({_id:rideId,driverId:driverUserId,status:'accepted'}).lean();
  if(!current)throw new RideError('Ride is not awaiting pickup arrival',409);
  const evidence=await pickupEvidence(current);if(!evidence.valid)await rejectUnsafe(current,evidence,'pickup_rejected');
  const ride = await transition({
    rideId,
    driverUserId,
    from: 'accepted',
    to: 'arrived',
    extra: { 'pickup.arrivedAt': new Date(), 'safety.arrival':evidence.lastFix,'safety.policy':evidence.policy },
  });

  emitToRide(rideId, 'ride:driver-arrived', { rideId: String(ride._id) });
  emitToAdmin('ride:updated', { rideId: String(ride._id), status: 'arrived' });
  await notifyRideParticipants(ride);
  return ride;
}

export async function startRide({ rideId, driverUserId, pin }) {
  await connectDB();

  const current = await Ride.findOne({ _id: rideId, driverId: driverUserId })
    .select('pin status pickup driverId driverProfileId safety')
    .lean();
  if (!current) throw new RideError('Ride not found', 404);
  if (current.status !== 'arrived') {
    throw new RideError('You must arrive at the pickup before starting the trip', 409);
  }
  if (current.pin && String(pin || '') !== current.pin) {
    throw new RideError('Incorrect PIN — ask the rider for their 4-digit code', 400);
  }

  const evidence=await pickupEvidence(current);if(!evidence.valid)await rejectUnsafe(current,evidence,'start_rejected');
  const ride = await transition({
    rideId,
    driverUserId,
    from: 'arrived',
    to: 'in_progress',
    extra: { startedAt: new Date(), 'safety.start':evidence.lastFix,'safety.policy':evidence.policy },
  });

  emitToRide(rideId, 'ride:started', {
    rideId: String(ride._id),
    startedAt: ride.startedAt,
  });
  emitToAdmin('ride:updated', { rideId: String(ride._id), status: 'in_progress' });
  await notifyRideParticipants(ride);
  return ride;
}

export async function completeRide({ rideId, driverUserId }) {
  await connectDB();

  const { ride, shortfall } = await mongoose.connection.transaction(async dbSession => {
    const current = await Ride.findOne({ _id: rideId, driverId: driverUserId }).session(dbSession).lean();
    if (!current) throw new RideError('Ride not found', 404);
    if(current.status==='completed')return {ride:current,shortfall:false};
    if(current.status!=='in_progress')throw new RideError('Trip is not in progress',409);
    const evidence=await tripEvidence(current,dbSession);if(!evidence.valid)throw new RideSafetyError(evidence.error,evidence);
    const wallets = await User.find({ _id: { $in: [current.riderId, current.driverId] } }).select('wallet egpWallet currencyWallets').session(dbSession).lean();
    if (wallets.length !== 2 || wallets.some(u => !sameCurrency(walletAccount(u, current.fare?.currency)?.currency, current.fare?.currency))) throw new RideError('Settlement requires currency review. Balances are unchanged.', 409);
    const ride = await transition({
      rideId,
      driverUserId,
      from: 'in_progress',
      dbSession,
      to: 'completed',
      extra: { completedAt: new Date(), 'safety.end':evidence.lastFix,'safety.progress':evidence,'route.actualDistanceMeters':evidence.verifiedDistanceMeters },
    });

    // Actual trip duration (distance stays the quoted route)
    ride.route.actualDurationSeconds = Math.round(
      (ride.completedAt - ride.startedAt) / 1000
    );

    // ── Settle payment ──────────────────────────────────────────────
    const total = ride.fare.total;
    const driverEarnings = ride.fare.driverEarnings;

    // Charge the rider's wallet. The balance is allowed to go negative if it
    // dropped since booking — the trip happened, so the fare is owed and they
    // must settle before booking again (enforced in createRide).
    const rider = await User.findByIdAndUpdate(
      ride.riderId,
      walletDelta(-total, ride.fare.currency),
      { returnDocument: 'after', session: dbSession, updatePipeline: true }
    );
    const shortfall = rider ? walletAccount(rider, ride.fare.currency).balance < 0 : false;

    if (rider) {
      await WalletTransaction.create([{
        currency: ride.fare.currency,
        userId: ride.riderId,
        type: 'ride_payment',
        amount: -total,
        balanceAfter: walletAccount(rider, ride.fare.currency).balance,
        rideId: ride._id,
        note: `Ride to ${ride.dropoff.address}`.slice(0, 200),
      }], { session: dbSession });
    }

    // Credit the driver their share regardless — they did the work, and any
    // rider shortfall is a platform receivable, not the driver's problem.
    const driverUser = await User.findByIdAndUpdate(
      ride.driverId,
      walletDelta(driverEarnings, ride.fare.currency),
      { returnDocument: 'after', session: dbSession, updatePipeline: true }
    );
    if (driverUser) {
      await WalletTransaction.create([{
        currency: ride.fare.currency,
        userId: ride.driverId,
        type: 'ride_earning',
        amount: driverEarnings,
        balanceAfter: walletAccount(driverUser, ride.fare.currency).balance,
        rideId: ride._id,
        note: `Trip earnings`,
      }], { session: dbSession });
    }

    ride.payment.status = 'captured';
    await ride.save({ session: dbSession });

    await Payment.create([{
      rideId: ride._id,
      riderId: ride.riderId,
      driverId: ride.driverId,
      amount: total,
      currency: ride.fare.currency,
      platformFee: ride.fare.platformFee,
      driverPayout: driverEarnings,
      status: 'succeeded',
      method: 'wallet',
    }], { session: dbSession });

    // ── Free the driver & update stats ──────────────────────────────
    await Driver.updateOne(
      { _id: ride.driverProfileId },
      {
        currentRideId: null,
        $inc: {
          'stats.totalTrips': 1,
        },
      }, { session: dbSession }
    );

    return { ride, shortfall };
  }).catch(async error=>{if(error instanceof RideSafetyError){const current=await Ride.findOne({_id:rideId,driverId:driverUserId}).lean();if(current)await rejectUnsafe(current,error.evidence,'completion_rejected');}throw error;});

  emitToRide(rideId, 'ride:completed', {
    rideId: String(ride._id),
    fare: ride.fare,
    payment: ride.payment,
    completedAt: ride.completedAt,
    // The wallet went negative — the rider must settle before booking again
    shortfall,
  });
  emitToAdmin('ride:updated', { rideId: String(ride._id), status: 'completed' });
  await notifyRideParticipants(ride);

  leaveRideRoom('/rider', String(ride.riderId), String(ride._id));
  leaveRideRoom('/driver', String(ride.driverId), String(ride._id));
  await clearRideMembers(String(ride._id));

  return ride;
}

// ─── Cancellation ─────────────────────────────────────────────────────────────

export async function cancelRide({ rideId, userId, role, reason }) {
  await connectDB();

  const match =
    role === 'rider'
      ? { _id: rideId, riderId: userId, status: { $in: ['searching', 'accepted', 'arrived'] } }
      : { _id: rideId, driverId: userId, status: { $in: ['accepted', 'arrived'] } };

  let ride = await Ride.findOne(match);
  if (!ride) {
    throw new RideError('This ride can no longer be cancelled', 409);
  }

  if (role === 'rider' && ride.status === 'arrived') {
    const wallets = await User.find({ _id: { $in: [ride.riderId, ride.driverId].filter(Boolean) } }).select('wallet egpWallet currencyWallets').lean();
    if (!Object.hasOwn(currencyDigits,ride.fare?.currency) || wallets.some(u => !sameCurrency(walletAccount(u, ride.fare?.currency)?.currency, ride.fare?.currency))) throw new RideError('Cancellation settlement requires currency review.', 409);
  }
  const hadDriver = Boolean(ride.driverProfileId);

  if (role === 'driver') {
    // Driver bails — free them, penalize, and put the ride back in dispatch
    await Driver.updateOne(
      { _id: ride.driverProfileId, currentRideId: ride._id },
      { currentRideId: null, $inc: { 'stats.cancellationRate': 1 } }
    );

    ride.dispatch.declinedBy.push(ride.driverProfileId);
    ride.status = 'searching';
    ride.driverId = null;
    ride.driverProfileId = null;
    ride.assignedVehicle = undefined;
    ride.timeline.push({
      status: 'searching',
      timestamp: new Date(),
      note: `Driver cancelled${reason ? `: ${reason}` : ''} — finding a new driver`,
    });
    await ride.save();

    try {
      await redis.srem(`ride:members:${ride._id}`, String(userId));
    } catch {
      /* ignore */
    }

    emitToRider(String(ride.riderId), 'ride:driver-cancelled', {
      rideId: String(ride._id),
      reason: reason || '',
    });
    emitToAdmin('ride:updated', { rideId: String(ride._id), status: 'searching' });
    await notifyRideParticipants(ride);

    startDispatch(String(ride._id));
    return ride;
  }

  // Commit status, wallet deltas and ledger together. The status predicate plus
  // transaction write conflict prevents concurrent cancellations charging twice.
  const settled = await mongoose.connection.transaction(async dbSession => {
    const current = await Ride.findOne(match).session(dbSession);
    if (!current) throw new RideError('This ride can no longer be cancelled', 409);
    const cancellationFee = current.status === 'arrived' ? (current.fare.quotedCancellationFee ?? (current.fare.currency==='USD'?LEGACY_USD_CANCEL_FEE:current.fare.currency==='EGP'?EGP_CANCEL_FEE:0)) : 0;
    if (cancellationFee) {
      const wallets = await User.find({ _id: { $in: [current.riderId, current.driverId].filter(Boolean) } }).session(dbSession).lean();
      if (wallets.length !== (current.driverId ? 2 : 1) || wallets.some(u => !sameCurrency(walletAccount(u, current.fare?.currency)?.currency, current.fare?.currency))) throw new RideError('Cancellation settlement requires currency review.', 409);
      const deltas = [{ id: current.riderId, amount: -cancellationFee, type: 'cancellation_fee', note: 'Late cancellation fee' }];
      if (current.driverId) deltas.push({ id: current.driverId, amount: minorUnits(cancellationFee * 0.8,current.fare.currency)/10**currencyDigits[current.fare.currency], type: 'ride_earning', note: 'Cancellation compensation' });
      for (const delta of deltas) {
        const user = await User.findByIdAndUpdate(delta.id, walletDelta(delta.amount, current.fare.currency), { returnDocument: 'after', session: dbSession, updatePipeline: true });
        await WalletTransaction.create([{ userId: delta.id, currency: current.fare.currency, amount: delta.amount, type: delta.type, note: delta.note, balanceAfter: walletAccount(user, current.fare.currency).balance, rideId: current._id }], { session: dbSession });
      }
    }
    if (cancellationFee) {
      const driverPayout = current.driverId ? minorUnits(cancellationFee * 0.8,current.fare.currency)/10**currencyDigits[current.fare.currency] : 0;
      await Payment.create([{ rideId: current._id, riderId: current.riderId, driverId: current.driverId, amount: cancellationFee, currency: current.fare.currency, platformFee: minorUnits(cancellationFee - driverPayout,current.fare.currency)/10**currencyDigits[current.fare.currency], driverPayout, status: 'succeeded', method: 'wallet', metadata: { kind: 'cancellation' } }], { session: dbSession });
    }
    current.status = 'cancelled'; current.cancelledBy = 'rider'; current.cancellationReason = reason || '';
    current.fare.cancellationFee = cancellationFee;
    current.payment.status = cancellationFee > 0 ? 'captured' : 'waived';
    current.timeline.push({ status: 'cancelled', timestamp: new Date(), note: reason || 'Cancelled by rider' });
    await current.save({ session: dbSession });
    return current;
  });
  ride = settled;
  const cancellationFee = settled.fare.cancellationFee;
  signalDispatch(String(ride._id), 'cancelled');

  // Free the driver
  if (hadDriver) {
    await Driver.updateOne(
      { _id: ride.driverProfileId, currentRideId: ride._id },
      { currentRideId: null }
    );
    emitToDriver(String(ride.driverId), 'ride:cancelled', {
      rideId: String(ride._id),
      cancelledBy: 'rider',
      reason: reason || '',
      currency: ride.fare.currency,
      compensation: cancellationFee > 0 ? minorUnits(cancellationFee * 0.8,ride.fare.currency)/10**currencyDigits[ride.fare.currency] : 0,
    });
    leaveRideRoom('/driver', String(ride.driverId), String(ride._id));
  }

  emitToAdmin('ride:updated', { rideId: String(ride._id), status: 'cancelled' });
  await notifyRideParticipants(ride);
  leaveRideRoom('/rider', String(ride.riderId), String(ride._id));
  await clearRideMembers(String(ride._id));

  return ride;
}

// ─── Rating ───────────────────────────────────────────────────────────────────

export async function rateRide({ rideId, userId, role, rating, comment }) {
  await connectDB();

  const match =
    role === 'rider'
      ? { _id: rideId, riderId: userId, status: 'completed' }
      : { _id: rideId, driverId: userId, status: 'completed' };

  const ride = await Ride.findOne(match);
  if (!ride) throw new RideError('Ride not found or not completed', 404);

  const field = role === 'rider' ? 'byRider' : 'byDriver';
  if (ride.rating?.[field]) throw new RideError('You already rated this ride', 409);

  ride.rating = ride.rating || {};
  ride.rating[field] = rating;
  if (comment) {
    ride.rating[role === 'rider' ? 'riderComment' : 'driverComment'] = comment.slice(0, 500);
  }
  await ride.save();

  // Update the counterpart's aggregate rating
  const targetUserId = role === 'rider' ? ride.driverId : ride.riderId;
  if (targetUserId) {
    const target = await User.findById(targetUserId);
    if (target) {
      const count = (target.rating?.count || 0) + 1;
      const avg =
        ((target.rating?.average || 5) * (count - 1) + rating) / count;
      target.rating = { average: round2(avg), count };
      await target.save();

      if (role === 'rider') {
        await Driver.updateOne(
          { userId: targetUserId },
          { 'stats.averageRating': round2(avg) }
        );
      }
    }
  }

  return ride;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

/** The user's current live ride (for reconnect/resume), with driver info. */
export async function getActiveRide({ userId, role }) {
  await connectDB();

  const query =
    role === 'driver'
      ? { driverId: userId, status: { $in: ['accepted', 'arrived', 'in_progress'] } }
      : { riderId: userId, status: { $in: ACTIVE_STATUSES } };

  const ride = await Ride.findOne(query).sort({ createdAt: -1 });
  if (!ride) return null;

  const { driver, driverUser } = await loadDriverBundle(ride);
  return serializeRide(ride, { driver, driverUser });
}

/** Persisted chat message + realtime relay. */
export async function addRideMessage({ rideId, userId, role, text, clientId }) {
  await connectDB();

  const match =
    role === 'rider'
      ? { _id: rideId, riderId: userId }
      : { _id: rideId, driverId: userId };
  if(clientId){const existing=await Ride.findOne({...match,'messages.clientId':clientId}).select('messages').lean();if(existing)return existing.messages.find(m=>m.clientId===clientId);}
  const messageId=new mongoose.Types.ObjectId();

  const ride = await Ride.findOneAndUpdate(
    { ...match, status: { $in: ['accepted', 'arrived', 'in_progress'] },'messages.499':{$exists:false},...(clientId?{'messages.clientId':{$ne:clientId}}:{}) },
    { $push: { messages: { _id:messageId,from: role,senderId:userId, text: text.slice(0, 500), at: new Date(),clientId } } },
    { returnDocument: 'after' }
  );
  if (!ride) {if(clientId){const existing=await Ride.findOne({...match,'messages.clientId':clientId}).select('messages').lean();if(existing)return existing.messages.find(m=>m.clientId===clientId);}throw new RideError('No active ride to message, or message limit reached', 409);}

  const message = ride.messages[ride.messages.length - 1];
  emitToRide(rideId, 'ride:message', {
    rideId: String(ride._id),
    id:String(message._id),
    from: role,
    text: message.text,
    at: message.at,
  });
  await notifyRideParticipants(ride);
  return message;
}
