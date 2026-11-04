import PlatformSettings from '@/lib/db/models/PlatformSettings';
import connectDB from '@/lib/db/mongodb';
import {deliveryDefaults,deliverySettingsSchema} from './delivery-policy';
export async function getDeliverySettings(){await connectDB();const row=await PlatformSettings.findById('delivery').lean();return {settings:deliverySettingsSchema.parse(row?.value||deliveryDefaults),revision:row?.revision||0};}
