import {activeOperations} from '@/lib/operating-areas';
import {readiness} from '@/lib/operating-policy';
import connectDB from '@/lib/db/mongodb';
import PlatformSettings from '@/lib/db/models/PlatformSettings';
import {getDeliverySettings} from '@/lib/delivery-settings';
export async function isTaxiEnabled(){await connectDB();const record=await PlatformSettings.findById('services').select('value').lean();const o=await activeOperations();return record?.value?.taxiEnabled!==false&&o.config.taxi&&!readiness(o.country.code,o.config).some(v=>v.startsWith('taxi:')||v.startsWith('settlement:'));}
export async function serviceAvailability(){await connectDB();const [record,delivery]=await Promise.all([PlatformSettings.findById('services').lean(),getDeliverySettings()]);const o=await activeOperations(),blockers=readiness(o.country.code,o.config);return {country:o.country,taxiEnabled:record?.value?.taxiEnabled!==false&&o.config.taxi&&!blockers.some(v=>v.startsWith('taxi:')||v.startsWith('settlement:')),deliveryEnabled:delivery.settings.general.enabled&&o.config.delivery&&!blockers.some(v=>v.startsWith('delivery:')||v.startsWith('settlement:')),revisions:{services:record?.revision||0,delivery:delivery.revision}};}
