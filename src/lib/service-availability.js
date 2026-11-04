import connectDB from '@/lib/db/mongodb';
import PlatformSettings from '@/lib/db/models/PlatformSettings';
import {getDeliverySettings} from '@/lib/delivery-settings';
export async function isTaxiEnabled(){await connectDB();const record=await PlatformSettings.findById('services').select('value').lean();return record?.value?.taxiEnabled!==false;}
export async function serviceAvailability(){await connectDB();const [record,delivery]=await Promise.all([PlatformSettings.findById('services').lean(),getDeliverySettings()]);return {taxiEnabled:record?.value?.taxiEnabled!==false,deliveryEnabled:delivery.settings.general.enabled,revisions:{services:record?.revision||0,delivery:delivery.revision}};}
