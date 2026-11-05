import {countries} from '@/lib/countries';
import {validSettingsOrigin} from '@/lib/settings-origin';
import mongoose from 'mongoose';
import { startDispatch } from '@/lib/realtime/dispatch';
import connectDB from '@/lib/db/mongodb';
import Ride from '@/lib/db/models/Ride';
import { requireAuth } from '@/lib/auth/helpers';

// GET /api/admin/rides — all rides with filters
export async function GET(request) {
  const { error } = await requireAuth(['admin']);
  if (error) return error;

  try {
    await connectDB();

    const { searchParams } = request.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(50, parseInt(searchParams.get('limit') || '20', 10));
    const status = searchParams.get('status');

    const query = {};
    const country=searchParams.get('country');
    if(Object.hasOwn(countries,country))query['operations.country.code']=country;
    if (status) query.status = status;

    const [rides, total] = await Promise.all([
      Ride.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('riderId', 'name username')
        .populate('driverId', 'name username')
        .select('status pickup.address dropoff.address fare vehicleType payment createdAt completedAt')
        .lean(),
      Ride.countDocuments(query),
    ]);

    return Response.json({
      rides,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('Admin rides error:', err);
    return Response.json({ error: 'Failed to fetch rides' }, { status: 500 });
  }
}

// Manual dispatch initiates the existing safe offer cascade; drivers must still accept.
export async function POST(request) {
 const { error } = await requireAuth(['admin']); if (error) return error;
 if (!validSettingsOrigin(request)) return Response.json({ error: 'Invalid origin' }, { status: 403 });
 try {
 const { rideId } = await request.json();
 if (!mongoose.isValidObjectId(rideId)) return Response.json({ error: 'Invalid ride' }, { status: 400 });
 await connectDB();
 const ride = await Ride.findOneAndUpdate({ _id: rideId, status: 'searching', $or: [{ scheduledAt: null }, { scheduledAt: { $lte: new Date() } }] }, { $set: { 'dispatch.manualHold': false } }, { returnDocument: 'after' });
 if (!ride) return Response.json({ error: 'Ride is not ready for dispatch' }, { status: 409 });
 startDispatch(rideId, { manual: true }).catch(() => console.error('[Dispatch] Manual cascade failed'));
 return Response.json({ ok: true }, { status: 202 });
 } catch { return Response.json({ error: 'Dispatch failed' }, { status: 503 }); }
}
