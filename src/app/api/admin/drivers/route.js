import { getSettings } from '@/lib/settings';
import { CURRENCY } from '@/lib/currency';
import { z } from 'zod';
import mongoose from 'mongoose';
import connectDB from '@/lib/db/mongodb';
import Ride from '@/lib/db/models/Ride';
import Driver from '@/lib/db/models/Driver';
import { requireAuth } from '@/lib/auth/helpers';

// GET /api/admin/drivers — driver list (?pending=1 for approval queue)
export async function GET(request) {
  const { error } = await requireAuth(['admin']);
  if (error) return error;

  try {
    await connectDB();

    const { searchParams } = request.nextUrl;
    const pending = searchParams.get('pending') === '1';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(50, parseInt(searchParams.get('limit') || '20', 10));

    const query = pending ? { isApproved: false } : {};

    const [drivers, total] = await Promise.all([
      Driver.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('userId', 'name username avatar rating createdAt')
        .lean(),
      Driver.countDocuments(query),
    ]);

    const totals = await Ride.aggregate([
      { $match: { driverId: { $in: drivers.map(d => d.userId?._id).filter(Boolean) }, status: 'completed', 'fare.currency': CURRENCY } },
      { $group: { _id: '$driverId', earnings: { $sum: '$fare.driverEarnings' } } },
    ]);
    const earnings = new Map(totals.map(t => [String(t._id), t.earnings]));
    for (const d of drivers) d.stats = { ...d.stats, totalEarnings: earnings.get(String(d.userId?._id)) || 0, currency: CURRENCY };
    return Response.json({
      drivers,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('Admin drivers error:', err);
    return Response.json({ error: 'Failed to fetch drivers' }, { status: 500 });
  }
}

const patchSchema = z.object({
  reason: z.string().trim().max(300).optional(),
  driverId: z.string(),
  isApproved: z.boolean(),
});

// PATCH /api/admin/drivers — approve / suspend a driver
export async function PATCH(request) {
  const { error } = await requireAuth(['admin']);
  if (error) return error;

  try {
    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success || !mongoose.Types.ObjectId.isValid(parsed.data.driverId)) {
      return Response.json({ error: 'Invalid request' }, { status: 400 });
    }

    await connectDB();
    const { fleet } = await getSettings();
    if (!parsed.data.isApproved && fleet.suspensionReasonRequired && !parsed.data.reason) return Response.json({ error: 'A suspension reason is required' }, { status: 400 });
    if (parsed.data.isApproved) {
      const existing = await Driver.findById(parsed.data.driverId).lean();
      if (!existing) return Response.json({ error: 'Driver not found' }, { status: 404 });
      if (fleet.requiredDocuments.some(type => !existing.documents?.some(d => d.type === type && d.verified))) return Response.json({ error: 'Required documents must be verified before approval' }, { status: 409 });
    }
    const update = { suspensionReason: parsed.data.isApproved ? '' : parsed.data.reason || '', isApproved: parsed.data.isApproved };
    if (!parsed.data.isApproved) update.isOnline = false; // suspend also knocks them offline

    const driver = await Driver.findByIdAndUpdate(parsed.data.driverId, update, {
      new: true,
    })
      .populate('userId', 'name username')
      .lean();

    if (!driver) return Response.json({ error: 'Driver not found' }, { status: 404 });

    return Response.json({ driver });
  } catch (err) {
    console.error('Admin driver update error:', err);
    return Response.json({ error: 'Failed to update driver' }, { status: 500 });
  }
}
