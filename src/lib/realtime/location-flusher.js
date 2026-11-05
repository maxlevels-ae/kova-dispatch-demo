import connectDB from '@/lib/db/mongodb';
import redis from '@/lib/db/redis';

/**
 * Driver GPS pings arrive over Socket.IO at high frequency. server.js
 * writes them to Redis only (`driver:loc:{driverProfileId}` hashes plus
 * the H3 index). This worker flushes those positions to MongoDB every
 * few seconds so `$geoNear` fallbacks and admin views stay fresh
 * without a Mongo write per ping.
 */
const FLUSH_INTERVAL_MS = 10 * 1000;

export function startLocationFlusher() {
  if (global.__locationFlusher) return;
  global.__locationFlusher = setInterval(flushLocations, FLUSH_INTERVAL_MS);
}

async function flushLocations() {
  if (global.__locationFlushRunning) return;
  global.__locationFlushRunning = true;
  try {
    const keys = [];
    let cursor = '0';
    do {
      const [next, batch] = await redis.scan(cursor, 'MATCH', 'driver:loc:*', 'COUNT', 200);
      cursor = next;
      keys.push(...batch);
    } while (cursor !== '0' && keys.length < 2000);

    if (keys.length === 0) return;

    const db = await connectDB();

    const ops = [];
    const samples = [];
    for (const key of keys) {
      const data = await redis.hgetall(key);
      if (!data?.lat || !data?.lng || data.flushed === '1') continue;

      const driverProfileId = key.slice('driver:loc:'.length);
      const lat = Number(data.lat), lng = Number(data.lng), ts = Number(data.ts);
      if (!db.Types.ObjectId.isValid(driverProfileId) || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || !Number.isFinite(ts) || ts <= 0 || ts > Date.now() + 30000) continue;
      ops.push({
        updateOne: {
          filter: { _id: new db.Types.ObjectId(driverProfileId), $or: [{lastLocationUpdate: {$lte: new Date(ts)}}, {lastLocationUpdate: {$exists: false}}] },
          update: { $set: {
            location: {
              type: 'Point',
              coordinates: [lng, lat],
            },
            lastLocationUpdate: new Date(ts),
            ...(data.h3 ? { h3Cell: data.h3 } : {}),
          } },
        },
      });
      samples.push({key, ts: data.ts});
    }

    if (ops.length > 0) {
      // Instrumentation and route bundles can own different Mongoose model
      // registries. Use the actual shared connection, not an unconnected model.
      await db.connection.collection('drivers').bulkWrite(ops, { ordered: false });
      // Acknowledge only persisted samples; a newer concurrent GPS ping must
      // remain pending, and failed Mongo writes must be retried next tick.
      for (const sample of samples) await redis.eval("if redis.call('HGET', KEYS[1], 'ts') == ARGV[1] then return redis.call('HSET', KEYS[1], 'flushed', '1') end return 0", 1, sample.key, sample.ts);
    }
  } catch (err) {
    // Redis or Mongo down — the next tick will retry
    console.warn('[LocationFlusher] Location persistence failed; retrying:', err.name);
  } finally {
    global.__locationFlushRunning = false;
  }
}
