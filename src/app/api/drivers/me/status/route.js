import {activeOperations,zoneAt} from '@/lib/operating-areas';
import {validSettingsOrigin} from '@/lib/settings-origin';
import { walletAccount, walletAccounts } from '@/lib/currency';
import { getSettings } from '@/lib/settings';
import { z } from 'zod';
import connectDB from '@/lib/db/mongodb';
import Driver from '@/lib/db/models/Driver';
import User from '@/lib/db/models/User';
import Ride from '@/lib/db/models/Ride';
import Delivery from '@/lib/db/models/Delivery';
import { requireAuth } from '@/lib/auth/helpers';
import { updateDriverCell, removeDriverFromIndex } from '@/lib/services/h3-redis';
import { emitToAdmin } from '@/lib/realtime/emit';

/** How far a driver's wallet may go negative before they must settle up. */


const statusSchema = z.object({
  online: z.boolean(),
  location: z
    .object({
      accuracy: z.number().nonnegative().max(100000).optional(),
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
    })
    .optional(),
});

// POST /api/drivers/me/status — go online / offline
export async function POST(request) {
  const { session, error } = await requireAuth(['driver']);
  if (error) return error;
  if(!validSettingsOrigin(request))return Response.json({error:'Invalid request origin'},{status:403});

  try {
    const body = await request.json();
    const parsed = statusSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: 'Invalid status payload' }, { status: 400 });
    }

    const { online, location } = parsed.data;

    await connectDB();
    const driver = await Driver.findOne({ userId: session.user.id });
    if (!driver) {
      return Response.json({ error: 'Driver profile not found' }, { status: 404 });
    }

    if (online) {
      const { fleet:baseFleet } = await getSettings();
      const assignment=driver.currentRideId?await Ride.findById(driver.currentRideId).select('operations fare.currency').lean():driver.currentDeliveryId?await Delivery.findById(driver.currentDeliveryId).select('operations fare.currency').lean():null;
      const operations=assignment?.operations||await activeOperations(),currency=assignment?.fare?.currency||operations.country.currency;
      const fleet=assignment&&!assignment.operations?baseFleet:operations.country.code==='EG'&&!assignment?baseFleet:{...baseFleet,enabledCategories:operations.config.vehicles,requiredDocuments:operations.config.documents,maxDebtEGP:0};
      if(!driver.currentRideId&&!driver.currentDeliveryId){
       const allowed=(driver.services?.rides!==false&&operations.config.taxi&&zoneAt(operations,location,'taxi'))||(driver.services?.deliveries&&operations.config.delivery&&zoneAt(operations,location,'delivery'));
       if(!allowed)return Response.json({error:'This location is outside the active service zone.'},{status:409});
       if(!operations.config.vehicles.includes(driver.vehicle?.type))return Response.json({error:'Vehicle category is unavailable in this country'},{status:409});
       if(operations.config.requireLicense&&(!driver.license?.verified||(driver.license.expiry&&driver.license.expiry<=new Date())))return Response.json({error:'A verified, unexpired driving license is required'},{status:409});
       driver.operatingCountry=operations.country.code;
      }
      const MAX_DRIVER_DEBT = -fleet.maxDebtEGP;
      if (!fleet.enabledCategories.includes(driver.vehicle.type) || fleet.requiredDocuments.some(type => !driver.documents.some(d => d.type === type && d.verified))) return Response.json({ error: 'Vehicle category or verified documents do not meet fleet policy' }, { status: 403 });
      if (!driver.isApproved) {
        return Response.json(
          { error: 'Your driver account is pending approval' },
          { status: 403 }
        );
      }
      if (!driver.vehicle?.plate) {
        return Response.json(
          { error: 'Add your vehicle details before going online', code: 'NO_VEHICLE' },
          { status: 409 }
        );
      }
      if (!location) {
        return Response.json(
          { error: 'Location is required to go online' },
          { status: 400 }
        );
      }

      // Defensive: a driver carrying an outstanding balance must settle up
      // before driving again.
      const user = await User.findById(session.user.id).select('wallet egpWallet currencyWallets').lean();
      if (walletAccount(user,currency)?.currency !== currency) return Response.json({ error: 'Wallet requires currency review before accepting new requests.', code: 'CURRENCY_REVIEW' }, { status: 409 });
      const balance = walletAccount(user,currency)?.balance ?? 0;
      if (balance < MAX_DRIVER_DEBT) {
        return Response.json(
          {
            error: `You have an outstanding balance of ${Math.abs(balance).toFixed(2)} — top up your wallet to go back online`,
            code: 'BALANCE_OWED',
          },
          { status: 402 }
        );
      }

      driver.isOnline = true;
      driver.location = { type: 'Point', coordinates: [location.lng, location.lat] };
      driver.lastLocationUpdate = new Date();
      driver.locationAccuracy = location.accuracy ?? null;

      // Seed the H3 spatial index immediately
      const { h3Cell } = await updateDriverCell(String(driver._id), location.lat, location.lng);
      driver.h3Cell = h3Cell || driver.h3Cell;
      await driver.save();
    } else {
      if (driver.currentRideId || driver.currentDeliveryId) {
        return Response.json(
          { error: 'Finish your current trip before going offline' },
          { status: 409 }
        );
      }
      driver.isOnline = false;
      await driver.save();
      await removeDriverFromIndex(String(driver._id));
    }

    emitToAdmin('driver:status-changed', {
      driverProfileId: String(driver._id),
      online: driver.isOnline,
      location: location || null,
    });

    return Response.json({ online: driver.isOnline });
  } catch (err) {
    console.error('Driver status error:', err);
    return Response.json({ error: 'Failed to update status' }, { status: 500 });
  }
}
