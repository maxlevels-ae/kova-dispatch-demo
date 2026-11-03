import mongoose from 'mongoose';
import connectDB from '@/lib/db/mongodb';
import redis from '@/lib/db/redis';

/**
 * GET /api/health — liveness/readiness probe for the host and uptime monitors.
 * Returns 200 only when MongoDB and Redis are both reachable.
 */
export async function GET() {
  const checks = { mongo: 'down', redis: 'down', socket: global.io ? 'up' : 'down' };

  try {
    await connectDB();
    checks.mongo = mongoose.connection.readyState === 1 ? 'up' : 'down';
  
} catch (err) {
  const servers = [
    ...(err?.reason?.servers?.values?.() || [])
  ];

  const details = servers.map((server) => {
    const error = server.error;
    const cause = error?.cause;

    const message = String(
      cause?.message || error?.message || ''
    )
      .replace(/mongodb(?:\+srv)?:\/\/\S+/gi, '[REDACTED]')
      .slice(0, 250);

    return {
      type: server.type,
      errorName: error?.name || 'none',
      errorCode: error?.code || cause?.code || 'none',
      message
    };
  });

  console.error('[KOVA_MONGO_DETAILS]', details);
  checks.mongo = 'down';
}


  try {
    const pong = await redis.ping();
    checks.redis = pong === 'PONG' ? 'up' : 'down';
  } catch {
    checks.redis = 'down';
  }

  const healthy = checks.mongo === 'up' && checks.redis === 'up';

  return Response.json(
    {
      status: healthy ? 'ok' : 'degraded',
      checks,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    },
    {
      status: healthy ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    }
  );
}
