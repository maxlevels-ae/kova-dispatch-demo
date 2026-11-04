import OperationalError from '@/lib/db/models/OperationalError';
import NotificationJob from '@/lib/db/models/NotificationJob';
import User from '@/lib/db/models/User';
import { getSettings } from '@/lib/settings';
// Call sites supply fixed codes only: provider responses, URLs and credentials never enter logs.
export async function recordOperationalError(source, code) {
 try {
  const error = await OperationalError.create({ source, code });
  const { notifications } = await getSettings();
  if (!notifications.enabledEvents.includes('operational_alert')) return;
  const admins = await User.find({ role: 'admin', isActive: true }).select('_id').lean();
  for (const admin of admins) {
   const key = `${admin._id}:operational:${error._id}`;
   await NotificationJob.updateOne({key},{$setOnInsert:{key,userId:admin._id,event:'operational_alert',text:notifications.templates.operational_alert}},{upsert:true});
  }
 } catch { /* Database outage: retain process health signal. */ }
}
