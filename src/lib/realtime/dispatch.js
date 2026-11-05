import { recordOperationalError } from '@/lib/operational-errors';
import crypto from 'node:crypto';
import {syncNotifications} from '@/lib/notifications';
import TripEvent from '@/lib/db/models/TripEvent';
import { getSettings } from '@/lib/settings';
import connectDB from '@/lib/db/mongodb';
import redis from '@/lib/db/redis';
import Ride from '@/lib/db/models/Ride';
import Driver from '@/lib/db/models/Driver';
import { findBestDriver, estimateDriverETA } from '@/lib/services/ride-matcher';
import { emitToRider, emitToDriver, emitToAdmin, rideBus } from './emit';

const offerKey = (rideId) => `ride:offer:${rideId}`;
const dispatchLockKey = (rideId) => `ride:dispatch:${rideId}`;

/**
 * Wait for an accept/decline/cancel signal for a ride, or time out.
 * Signals are published on the global ride bus by the API routes.
 */
function waitForSignal(rideId, timeoutMs) {
  const bus = rideBus();
  return new Promise((resolve) => {
    const event = `ride:${rideId}`;
    const timer = setTimeout(() => {
      bus.off(event, onSignal);
      resolve({ type: 'timeout' });
    }, timeoutMs);

    function onSignal(signal) {
      clearTimeout(timer);
      bus.off(event, onSignal);
      resolve(signal);
    }

    bus.on(event, onSignal);
  });
}

async function recordOfferOutcome(driverProfileId, accepted) {
  try {
    const driver = await Driver.findById(driverProfileId);
    if (!driver) return;
    const total = (driver.stats.totalOffers || 0) + 1;
    const acceptedCount = (driver.stats.acceptedOffers || 0) + (accepted ? 1 : 0);
    driver.stats.totalOffers = total;
    driver.stats.acceptedOffers = acceptedCount;
    driver.stats.acceptanceRate = Math.round((acceptedCount / total) * 100);
    await driver.save();
  } catch (err) {
    console.warn('[Dispatch] Failed to record offer outcome:', err.message);
  }
}

/**
 * Run the offer cascade for a ride. Fire-and-forget from the API route.
 *
 * One driver is offered the ride at a time; on decline/timeout the next
 * candidate is tried. A Redis lock prevents two dispatch loops for the
 * same ride (e.g. duplicate POST or sweeper overlap).
 */
export async function startDispatch(rideId, { manual = false } = {}) {
  await connectDB();

  // Prevent concurrent dispatch loops for the same ride
  try {
    const locked = await redis.set(dispatchLockKey(rideId), '1', 'EX', 300, 'NX');
    if (!locked) return;
  } catch {
    // Redis down — proceed without the lock rather than not dispatching
  }

  try {
    await runCascade(rideId, manual);
  } catch (err) {
    await recordOperationalError('dispatch', 'CASCADE_FAILED');
    console.error(`[Dispatch] Cascade failed for ride ${rideId}:`, err);
  } finally {
    try {
      await redis.del(dispatchLockKey(rideId));
    } catch {
      /* ignore */
    }
  }
}

async function runCascade(rideId, manual) {
  const { dispatch:currentDispatch } = await getSettings();
  const initial=await Ride.findById(rideId).lean();
  const dispatch=initial?.operations?.taxiDispatch||currentDispatch;
  const OFFER_TIMEOUT_MS = dispatch.acceptanceSeconds * 1000;
  const OFFER_TTL_SECONDS = dispatch.acceptanceSeconds + 9;
  const MAX_OFFERS = dispatch.maxAttempts;
  const User = (await import('@/lib/db/models/User')).default;
  let riderInfo = null;

  for (let attempt = 0; attempt < MAX_OFFERS; attempt++) {
    const ride = await Ride.findById(rideId);
    if (!ride || ride.status !== 'searching') return;
    if (ride.scheduledAt && ride.scheduledAt > new Date()) return;
    if (!manual && (ride.dispatch.manualHold || dispatch.assignmentMode === 'manual')) return;

    if (!riderInfo) {
      const rider = await User.findById(ride.riderId).select('name rating').lean();
      riderInfo = {
        name: rider?.name || 'Rider',
        rating: rider?.rating?.average ?? 5,
      };
    }

    const pickup = {
      lat: ride.pickup.location.coordinates[1],
      lng: ride.pickup.location.coordinates[0],
    };

    if ((ride.dispatch?.offersSent || 0) >= MAX_OFFERS) { await failDispatch(ride, ride.dispatch.offersSent, dispatch.fallback); return; }
    const excludeIds = (ride.dispatch?.offeredTo || []).map(String);
    const candidate = await findBestDriver({
      pickup,
      vehicleType: ride.vehicleType,
      maxRadiusKm: dispatch.searchRadiusKm,
      excludeDriverIds: excludeIds, operations:ride.operations,
    });

    if (!candidate) {
      await failDispatch(ride, attempt, dispatch.fallback);
      return;
    }

    const driverUserId = String(candidate.userId);
    const etaMinutes = estimateDriverETA(candidate.distance || 0);

    // Claim the offer in Redis so only this driver can accept right now
    try {
      await redis.set(offerKey(rideId), String(candidate._id), 'EX', OFFER_TTL_SECONDS);
    } catch {
      /* non-fatal */
    }

    ride.dispatch.offeredTo.push(candidate._id);
    ride.dispatch.offersSent = (ride.dispatch.offersSent || 0) + 1;
    const offerId=crypto.randomUUID();
    const expiresAt=new Date(Date.now()+OFFER_TIMEOUT_MS-1000);
    const payload={
      offerId,expiresAt:expiresAt.toISOString(),
      rideId: String(ride._id),
      pickup: { address: ride.pickup.address, ...pickup },
      dropoff: {
        address: ride.dropoff.address,
        lat: ride.dropoff.location.coordinates[1],
        lng: ride.dropoff.location.coordinates[0],
      },
      vehicleType: ride.vehicleType,
      distanceMeters: ride.route.distanceMeters,
      durationSeconds: ride.route.durationSeconds,
      earnings: ride.fare.driverEarnings,
        currency: ride.fare.currency,
      surgeMultiplier: ride.fare.surgeMultiplier,
      distanceToPickupMeters: Math.round(candidate.distance || 0),
      etaMinutes,
      rider: riderInfo,
      expiresInSeconds: Math.round(OFFER_TIMEOUT_MS / 1000) - 1,
    };
    ride.dispatch.currentOffer={id:offerId,userId:driverUserId,createdAt:new Date(),expiresAt,payload};
    await ride.save();
    await TripEvent.updateOne({key:offerId},{$setOnInsert:{key:offerId,rideId:ride._id,event:'offer_sent',actorId:driverUserId,details:`Offer ${ride.dispatch.offersSent}; expires ${expiresAt.toISOString()}`}},{upsert:true});
    emitToDriver(driverUserId,'ride:offer',payload);
    syncNotifications(driverUserId).catch(()=>recordOperationalError('notifications','OFFER_DELIVERY_FAILED'));

    emitToRider(String(ride.riderId), 'ride:searching-update', {
      rideId: String(ride._id),
      offersSent: ride.dispatch.offersSent,
    });

    const signal = await waitForSignal(rideId, OFFER_TIMEOUT_MS);
    await TripEvent.updateOne({key:offerId+':outcome'},{$setOnInsert:{key:offerId+':outcome',rideId:ride._id,event:'offer_'+signal.type,actorId:driverUserId}},{upsert:true});
    await Ride.updateOne({_id:rideId,'dispatch.currentOffer.id':offerId},{$unset:{'dispatch.currentOffer':1}});

    if (signal.type === 'accepted') {
      // Accept route already updated everything
      return;
    }

    if (signal.type === 'cancelled') {
      emitToDriver(driverUserId, 'ride:offer-withdrawn', { rideId: String(ride._id) });
      try {
        await redis.del(offerKey(rideId));
      } catch {
        /* ignore */
      }
      return;
    }

    // declined or timeout — clear claim, penalize acceptance, continue
    try {
      await redis.del(offerKey(rideId));
    } catch {
      /* ignore */
    }

    if (signal.type === 'timeout') {
      emitToDriver(driverUserId, 'ride:offer-expired', { rideId: String(ride._id) });
    }
    await recordOfferOutcome(candidate._id, false);

    if (signal.type === 'declined') {
      emitToDriver(driverUserId,'ride:offer-withdrawn',{rideId:String(ride._id)});
      await Ride.updateOne(
        { _id: rideId },
        { $addToSet: { 'dispatch.declinedBy': candidate._id } }
      );
    }
  }

  const ride = await Ride.findById(rideId);
  if (ride && ride.status === 'searching') {
    await failDispatch(ride, MAX_OFFERS, dispatch.fallback);
  }
}

async function failDispatch(ride, offersSent, fallback) {
  if (fallback === 'manual') {
    await Ride.updateOne({ _id: ride._id, status: 'searching' }, { $set: { 'dispatch.manualHold': true } });
    emitToAdmin('ride:updated', { rideId: String(ride._id), status: 'searching', manualHold: true });
    return;
  }
  const updated = await Ride.findOneAndUpdate(
    { _id: ride._id, status: 'searching' },
    { $set: { status: 'no_drivers' }, $push: { timeline: {
      status: 'no_drivers', timestamp: new Date(),
      note: offersSent > 0 ? `No driver accepted (${offersSent} offered)` : 'No drivers nearby',
    } } }, { returnDocument: 'after' }
  );
  if (!updated) return;

  emitToRider(String(ride.riderId), 'ride:no-drivers', {
    rideId: String(ride._id),
    offersSent,
  });
  emitToAdmin('ride:updated', { rideId: String(ride._id), status: 'no_drivers' });
  console.log(`[Dispatch] Ride ${ride._id} failed — no drivers (${offersSent} offers)`);
}

/**
 * Check that the accepting driver holds the current offer.
 * When Redis is down we allow the accept (the ride status update is
 * atomic anyway, so double-accept is still impossible).
 */
export async function verifyOfferHolder(rideId, driverProfileId) {
  try {
    const holder = await redis.get(offerKey(rideId));
    if (holder == null) return true; // expired or Redis flushed — let atomic update decide
    return holder === String(driverProfileId);
  } catch {
    return true;
  }
}

/** Clear the offer claim (after accept). */
export async function clearOffer(rideId) {
  try {
    await redis.del(offerKey(rideId));
  } catch {
    /* ignore */
  }
}

/**
 * Signal the dispatch loop from API routes.
 * type: 'accepted' | 'declined' | 'cancelled'
 */
export function signalDispatch(rideId, type, payload = {}) {
  rideBus().emit(`ride:${rideId}`, { type, ...payload });
}

/**
 * Sweeper: re-dispatch rides stuck in `searching` (e.g. server restarted
 * mid-cascade). Started once per process from instrumentation.js.
 */
export function startDispatchSweeper() {
  if (global.__dispatchSweeper) return;
  global.__dispatchSweeper = setInterval(async () => {
    try {
      await connectDB();
      const cutoff = new Date(Date.now() - 90 * 1000);
      const stuck = await Ride.find({
        status: 'searching',
        'dispatch.manualHold': { $ne: true },
        $or: [{ scheduledAt: null }, { scheduledAt: { $lte: new Date() } }],
        updatedAt: { $lt: cutoff },
      })
        .select('_id')
        .limit(20)
        .lean();

      for (const ride of stuck) {
        console.log(`[Dispatch] Sweeper re-dispatching stuck ride ${ride._id}`);
        startDispatch(String(ride._id));
      }
    } catch (err) {
      console.warn('[Dispatch] Sweeper error:', err.message);
    }
  }, 60 * 1000);
}
