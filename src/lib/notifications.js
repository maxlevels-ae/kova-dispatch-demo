import { recordOperationalError } from "@/lib/operational-errors";
import mongoose from "mongoose";
import NotificationJob from "@/lib/db/models/NotificationJob";
import NotificationPreference from "@/lib/db/models/NotificationPreference";
import Driver from "@/lib/db/models/Driver";
import Notification from "@/lib/db/models/Notification";
import Ride from "@/lib/db/models/Ride";
import { getSettings } from "@/lib/settings";
const eventMap = {
  searching: "booking_created",
  accepted: "driver_accepted",
  arrived: "driver_arrived",
  in_progress: "trip_started",
  completed: "trip_completed",
  cancelled: "trip_cancelled",
  no_drivers: "operational_alert",
};
// Reconcile durable ride timelines on read. Idempotent upserts recover after process failure.
export async function syncNotifications(userId) {
  await Promise.all([Notification.init(), NotificationJob.init()]);
  const { notifications } = await getSettings();
  const rides = await Ride.find({
    $or: [{ riderId: userId }, { driverId: userId }],
  })
    .sort({ updatedAt: -1 })
    .limit(50)
    .lean();
  const writes = [];
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
      if (!event || !notifications.enabledEvents.includes(event)) continue;
      const key = `${userId}:${ride._id}:${event}:${new Date(entry.timestamp).getTime()}`;
      writes.push({
        updateOne: {
          filter: { key },
          update: {
            $setOnInsert: {
              key,
              userId,
              event,
              text: notifications.templates[event],
              createdAt: entry.timestamp,
            },
          },
          upsert: true,
        },
      });
    }
  for (const ride of rides) {
    const extra = [];
    if (ride.driverId) extra.push("driver_assigned");
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
            },
          },
          upsert: true,
        },
      });
    }
  }
  if (writes.length)
    await NotificationJob.bulkWrite(writes, { ordered: false });
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
      if (preference?.inApp === false) {
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
            },
          },
          { upsert: true },
        );
        job.status = "delivered";
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
    .select("riderId driverId updatedAt")
    .lean();
  for (const ride of rides) {
    await syncNotifications(ride.riderId);
    if (ride.driverId) await syncNotifications(ride.driverId);
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
