import {RideSafetyError} from '@/lib/ride-safety';
import {validSettingsOrigin} from '@/lib/settings-origin';
import { requireAuth } from '@/lib/auth/helpers';
import { startRide, serializeRide, RideError } from '@/lib/services/ride-service';

// POST /api/rides/[id]/start — driver starts the trip (requires rider PIN)
export async function POST(request, { params }) {
  const { session, error } = await requireAuth(['driver']);
  if (error) return error;
  if(!validSettingsOrigin(request))return Response.json({error:'Invalid request origin'},{status:403});

  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const ride = await startRide({
      rideId: id,
      driverUserId: session.user.id,
      pin: body?.pin,
    });
    return Response.json({ ride: serializeRide(ride) });
  } catch (err) {
    if(err instanceof RideSafetyError)return Response.json({error:err.message,code:err.code,evidence:err.evidence},{status:409});
    if (err instanceof RideError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    console.error('Start ride error:', err);
    return Response.json({ error: 'Failed to start ride' }, { status: 500 });
  }
}
