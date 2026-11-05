import { requireAuth } from '@/lib/auth/helpers';
import { findNearbyDrivers } from '@/lib/services/ride-matcher';
import {activeOperations,zoneAt,courierReadiness} from '@/lib/operating-areas';
import Driver from '@/lib/db/models/Driver';
import User from '@/lib/db/models/User';

// GET /api/drivers/nearby — available drivers around a point (for the map)
export async function GET(request) {
  const { error } = await requireAuth();
  if (error) return error;

  try {
    const { searchParams } = request.nextUrl;
    const lat = parseFloat(searchParams.get('lat'));
    const lng = parseFloat(searchParams.get('lng'));
    const radiusKm = Math.min(20, parseFloat(searchParams.get('radiusKm') || '5'));
    const vehicleType = searchParams.get('vehicleType') || undefined;

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return Response.json({ error: 'lat and lng are required' }, { status: 400 });
    }

    const operations=await activeOperations();
    if(!operations.config.taxi||!zoneAt(operations,{lat,lng},'taxi'))return Response.json({drivers:[]});
    const nearby = await findNearbyDrivers({
      location: { lat, lng },
      radiusKm,
      vehicleType,
      limit: 20,
    });
    const profiles=await Driver.find({_id:{$in:nearby.map(d=>d._id)}}).lean();
    const users=await User.find({_id:{$in:profiles.map(d=>d.userId)}}).select('isActive wallet egpWallet currencyWallets').lean();
    const allowed=new Set(profiles.filter(d=>courierReadiness(d,users.find(u=>String(u._id)===String(d.userId)),{snapshot:operations,service:'taxi',pickup:{lat,lng},policy:{dispatch:{radiusKm}}}).eligible).map(d=>String(d._id)));
    const drivers=nearby.filter(d=>allowed.has(String(d._id)));

    // Public payload only — no user ids or personal data
    return Response.json({
      drivers: drivers.map((d) => ({
        id: String(d._id),
        vehicleType: d.vehicle?.type || 'economy',
        location: {
          lat: d.location.coordinates[1],
          lng: d.location.coordinates[0],
        },
        distance: Math.round(d.distance || 0),
      })),
    });
  } catch (err) {
    console.error('Nearby drivers error:', err);
    return Response.json({ error: 'Failed to fetch nearby drivers' }, { status: 500 });
  }
}
