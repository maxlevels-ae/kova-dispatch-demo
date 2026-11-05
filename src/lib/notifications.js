import { recordOperationalError } from "@/lib/operational-errors";
import mongoose from "mongoose";
import NotificationJob from "@/lib/db/models/NotificationJob";
import NotificationPreference from "@/lib/db/models/NotificationPreference";
import Driver from "@/lib/db/models/Driver";
import Notification from "@/lib/db/models/Notification";
import Ride from "@/lib/db/models/Ride";
import { getSettings } from "@/lib/settings";
import User from '@/lib/db/models/User';
import {emitToUser} from '@/lib/realtime/emit';
import {rideLink} from '@/lib/notification-policy';
import {sendPush} from '@/lib/web-push';
import {translate} from '@/lib/i18n';
const eventMap = {
  searching: "booking_created",
  accepted: "driver_accepted",
  arrived: "driver_arrived",
  in_progress: "trip_started",
  completed: "trip_completed",
  ended_early: "trip_ended_early",
  early_end_reviewed:"early_end_reviewed",
  early_end_confirmed:"early_end_response",
  early_end_disputed:"early_end_response",
  cancelled: "trip_cancelled",
  no_drivers: "operational_alert",
};
const operationalText={early_end_reviewed:'The early-trip fare review is complete. View the recorded decision.',early_end_response:'A response to the early trip ending has been recorded.',trip_ended_early:'Your trip ended early. Review the reason and proposed fare.',driver_accepted:'Your driver accepted the booking',driver_arrived:'Your driver has arrived at pickup',trip_started:'Your trip has started',trip_completed:'Your trip is complete',trip_cancelled:'The trip was cancelled',operational_alert:'No driver is currently available',driver_cancelled:'Your driver cancelled. Looking for another driver.'};
export async function notifyRideParticipants(ride){
 try{await syncNotifications(ride.riderId);if(ride.driverId)await syncNotifications(ride.driverId);}catch{await recordOperationalError('notifications','RIDE_RECONCILE_FAILED');}
}
// Reconcile durable ride timelines on read. Idempotent upserts recover after process failure.
export async function syncNotifications(userId) {
  await Promise.all([Notification.init(), NotificationJob.init()]);
  const { notifications } = await getSettings();
  const rides = await Ride.find({
    $or: [{ riderId: userId }, { driverId: userId }, {'dispatch.currentOffer.userId':userId}],
  })
    .sort({ updatedAt: -1 })
    .limit(50)
    .lean();
  const writes = [];
  const user=await User.findById(userId).select('role language').lean();
  if(!user)return;
  const role=user.role;
  const enqueue=(ride,event,text,key,at,expiresAt)=>writes.push({updateOne:{filter:{key},update:{$setOnInsert:{key,userId,event,text,rideId:ride._id,role,href:rideLink(role,ride._id,event==='booking_offer'),createdAt:at||new Date(),expiresAt}},upsert:true}});
  for(const ride of rides){
    const offer=ride.dispatch?.currentOffer;
    if(role==='driver'&&ride.status==='searching'&&String(offer?.userId)===String(userId)&&new Date(offer.expiresAt)>new Date())
      enqueue(ride,'booking_offer','New ride request',`${userId}:${ride._id}:offer:${offer.id}`,offer.createdAt,offer.expiresAt);
    if(String(ride.riderId)!==String(userId)&&String(ride.driverId)!==String(userId))continue;
    for(const message of ride.messages||[]){
      if(message.from===role||Date.now()-new Date(message.at)>90*86400000)continue;
      enqueue(ride,'ride_message',`New message from your ${message.from}`,`${userId}:${ride._id}:message:${message._id}`,message.at);
    }
    for(const entry of ride.timeline||[]){
      if(entry.status==='searching'&&entry.note?.startsWith('Driver cancelled')&&role==='rider')
        enqueue(ride,'driver_cancelled',operationalText.driver_cancelled,`${userId}:${ride._id}:driver_cancelled:${new Date(entry.timestamp).getTime()}`,entry.timestamp);
    }
  }
  const driver = await Driver.findOne({ userId, isApproved: true }).lean();
  if (driver && notifications.enabledEvents.includes("driver_approval")) {
    const key = `${userId}:driver_approval:${driver._id}`;
    writes.push({
      updateOne: {
        filter: { key },
        update: {
          $setOnInsert: {
            key,
            userId,
            event: "driver_approval",
            text: notifications.templates.driver_approval,
          },
        },
        upsert: true,
      },
    });
  }
  for (const ride of rides)
    for (const entry of ride.timeline || []) {
      const event = eventMap[entry.status];
      if(String(ride.riderId)!==String(userId)&&String(ride.driverId)!==String(userId))continue;
      if (!event || (!operationalText[event]&&!notifications.enabledEvents.includes(event))) continue;
      // Don't tell the actor about their own cancellation or acceptance.
      if((event==='driver_accepted'&&role==='driver')||(event==='trip_cancelled'&&ride.cancelledBy===role))continue;
      const key = `${userId}:${ride._id}:${event}:${new Date(entry.timestamp).getTime()}`;
      writes.push({
        updateOne: {
          filter: { key },
          update: {
            $setOnInsert: {
              key,
              userId,
              event,
              text: role==='driver'&&event==='driver_arrived'?'Pickup arrival recorded':operationalText[event]||notifications.templates[event],
              rideId:ride._id,role,href:rideLink(role,ride._id),
              createdAt: entry.timestamp,
            },
          },
          upsert: true,
        },
      });
    }
  for (const ride of rides) {
    if(String(ride.riderId)!==String(userId)&&String(ride.driverId)!==String(userId))continue;
    const extra = [];
    if (ride.driverId&&!ride.timeline?.some(e=>e.status==='accepted')) extra.push("driver_assigned");
    if (ride.payment?.status === "captured") extra.push("payment_successful");
    if (ride.payment?.status === "failed") extra.push("payment_failed");
    for (const event of extra) {
      if (!notifications.enabledEvents.includes(event)) continue;
      const key = `${userId}:${ride._id}:${event}`;
      writes.push({
        updateOne: {
          filter: { key },
          update: {
            $setOnInsert: {
              key,
              userId,
              event,
              text: notifications.templates[event],
              rideId:ride._id,role,href:rideLink(role,ride._id),
            },
          },
          upsert: true,
        },
      });
    }
  }
  if (writes.length) {
    for(const write of writes){const value=write.updateOne.update.$setOnInsert;value.text=translate(value.text,user.language);value.createdAt ||= new Date();value.updatedAt=value.createdAt;}
    // Reconciliation is not a new delivery attempt; preserve its recorded time.
    await NotificationJob.bulkWrite(writes, { ordered: false,timestamps:false });
  }
  await deliverNotifications(userId);
}

export async function deliverNotifications(userId) {
  await NotificationJob.updateMany({ status: 'processing', attempts: { $gte: 5 }, availableAt: { $lte: new Date() } }, { $set: { status: 'failed', lastError: 'Delivery lease expired after final attempt' } });
  for (let i = 0; i < 100; i++) {
    const now = new Date();
    const job = await NotificationJob.findOneAndUpdate(
      {
        ...(userId ? { userId } : {}),
        attempts: { $lt: 5 },
        $or: [
          { status: "queued", availableAt: { $lte: now } },
          { status: "processing", availableAt: { $lte: now } },
        ],
      },
      {
        $set: {
          status: "processing",
          availableAt: new Date(Date.now() + 60000),
        },
        $inc: { attempts: 1 },
      },
      { returnDocument: "after", sort: { availableAt: 1 } },
    );
    if (!job) break;
    try {
      const preference = await NotificationPreference.findById(
        job.userId,
      ).lean();
      if (preference?.inApp === false || (['ride_message','delivery_message'].includes(job.event)&&preference?.messages===false) || (!['ride_message','delivery_message'].includes(job.event)&&preference?.rideEvents===false)) {
        job.status = "suppressed";
      } else {
        await Notification.updateOne(
          { key: job.key },
          {
            $setOnInsert: {
              key: job.key,
              userId: job.userId,
              event: job.event,
              text: job.text,
              rideId:job.rideId,href:job.href,role:job.role,expiresAt:job.expiresAt,createdAt:job.createdAt,
            },
          },
          { upsert: true },
        );
        job.status = "delivered";
        const notification=await Notification.findOne({key:job.key});
        // A compare-and-set claim prevents overlapping workers from sending twice.
        const claimed=await Notification.findOneAndUpdate({_id:notification._id,pushAttemptAt:null},{$set:{pushAttemptAt:new Date()}},{returnDocument:'after'});
        if(claimed){
          emitToUser('/'+(job.role||'rider'),String(job.userId),'notification:new',notification.toObject());
          const fresh=Date.now()-new Date(job.createdAt)<300000&&(!job.expiresAt||job.expiresAt>new Date());
          const result=fresh&&preference?.push!==false&&!preference?.muted?await sendPush(notification):{pushStatus:'suppressed'};
          await Notification.updateOne({_id:notification._id},{$set:result});
        }
      }
      job.lastError = undefined;
      await job.save();
    } catch {
      await NotificationJob.updateOne(
        { _id: job._id },
        {
          $set: {
            status: job.attempts >= 5 ? "failed" : "queued",
            lastError: "In-app persistence failed",
            availableAt: new Date(
              Date.now() + Math.min(300000, 1000 * 2 ** job.attempts),
            ),
          },
        },
      );
    }
  }
}
const cursorSchema = new mongoose.Schema({
  _id: String,
  at: Date,
  rideId: mongoose.Schema.Types.ObjectId,
});
const NotificationCursor =
  mongoose.models.NotificationCursor ||
  mongoose.model("NotificationCursor", cursorSchema);
async function reconcileChangedRides() {
  const cursor = await NotificationCursor.findById("rides").lean();
  const at = cursor?.at || new Date(Date.now() - 86400000);
  const query = cursor?.rideId
    ? {
        $or: [
          { updatedAt: { $gt: at } },
          { updatedAt: at, _id: { $gt: cursor.rideId } },
        ],
      }
    : { updatedAt: { $gte: at } };
  const rides = await Ride.find(query)
    .sort({ updatedAt: 1, _id: 1 })
    .limit(20)
    .select("riderId driverId updatedAt dispatch.currentOffer")
    .lean();
  for (const ride of rides) {
    await syncNotifications(ride.riderId);
    if (ride.driverId) await syncNotifications(ride.driverId);
    if(ride.dispatch?.currentOffer?.userId&&new Date(ride.dispatch.currentOffer.expiresAt)>new Date())await syncNotifications(ride.dispatch.currentOffer.userId);
    await NotificationCursor.findOneAndUpdate(
      { _id: "rides" },
      { $set: { at: ride.updatedAt, rideId: ride._id } },
      { upsert: true },
    );
  }
}
async function reconcileDrivers() {
 const cursor = await NotificationCursor.findById('drivers').lean();
 const at = cursor?.at || new Date(Date.now()-86400000);
 const query = cursor?.rideId ? { $or: [{ updatedAt: { $gt: at } }, { updatedAt: at, _id: { $gt: cursor.rideId } }] } : { updatedAt: { $gte: at } };
 for (const driver of await Driver.find(query).sort({updatedAt:1,_id:1}).limit(20).select('userId updatedAt').lean()) {
  await syncNotifications(driver.userId);
  await NotificationCursor.findOneAndUpdate({_id:'drivers'},{$set:{at:driver.updatedAt,rideId:driver._id}},{upsert:true});
 }
}
export function startNotificationWorker() {
  if (global.__notificationWorker) return;
  global.__notificationWorker = setInterval(async () => {
    if (global.__notificationWorkerBusy) return;
    global.__notificationWorkerBusy = true;
    try {
      await getSettings();
      await reconcileChangedRides();
      await reconcileDrivers();
      await deliverNotifications();
      global.__notificationWorkerError = null;
    } catch {
      global.__notificationWorkerError = "Notification queue unavailable";
      await recordOperationalError("notifications", "WORKER_UNAVAILABLE");
    } finally {
      global.__notificationWorkerBusy = false;
    }
  }, 15000);
  global.__notificationWorker.unref?.();
}
