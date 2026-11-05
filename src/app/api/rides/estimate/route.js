import {bookingArea} from '@/lib/operating-areas';
import {isTaxiEnabled} from '@/lib/service-availability';
import { getSettings } from '@/lib/settings';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/helpers';
import { getRoute } from '@/lib/services/routing';
import { getAllFareEstimates } from '@/lib/services/fare-calculator';

const coord = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const estimateSchema = z.object({
  pickup: coord,
  dropoff: coord,
});

// POST /api/rides/estimate — route + fares for all vehicle types
export async function POST(request) {
  const { error } = await requireAuth();
  if (error) return error;

  try {
    if(!await isTaxiEnabled())return Response.json({error:'Taxi bookings are currently paused.'},{status:409});
    const body = await request.json();
    const parsed = estimateSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: 'Pickup and dropoff coordinates are required' }, { status: 400 });
    }

    const { pickup, dropoff } = parsed.data;
    const operations=await bookingArea('taxi',pickup,dropoff);
    const route = await getRoute(pickup, dropoff);

    const estimates = await getAllFareEstimates({
      distanceMeters: route.distanceMeters,
      durationSeconds: route.durationSeconds,
      pickup, operations,
    });

    const settings = await getSettings();
    for (const type of Object.keys(estimates)) if (!operations.config.vehicles.includes(type)) delete estimates[type];
    return Response.json({
      bookingPolicy: { scheduledEnabled: operations.config.dispatch.scheduledEnabled, maxScheduleDays: operations.config.dispatch.maxScheduleDays },
      route: {
        distanceMeters: route.distanceMeters,
        durationSeconds: route.durationSeconds,
        geometry: route.geometry,
        source: route.source,
      },
      estimates,
    });
  } catch (err) {
    if(err.status)return Response.json({error:err.message},{status:err.status});
    console.error('Estimate error:', err);
    return Response.json({ error: 'Failed to estimate fare' }, { status: 500 });
  }
}
