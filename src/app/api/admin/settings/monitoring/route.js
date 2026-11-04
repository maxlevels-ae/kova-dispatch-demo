import OperationalError from "@/lib/db/models/OperationalError";
import Payment from "@/lib/db/models/Payment";
import NotificationJob from "@/lib/db/models/NotificationJob";
import { requireAuth } from "@/lib/auth/helpers";
import { GET as health } from "@/app/api/health/route";
import Notification from "@/lib/db/models/Notification";
import {pushConfiguration} from '@/lib/web-push';
export async function GET() {
  const { error } = await requireAuth(["admin"]);
  if (error) return error;
  const response = await health();
  const result = await response.json();
  let queue = [],
    errors = [],
    operationalErrors = [],
    transactions = [],
    deliveries = [];
  if (result.checks.mongo === "up") {
    operationalErrors = await OperationalError.find({})
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();
    transactions = await Payment.aggregate([
      {
        $group: {
          _id: { currency: "$currency", status: "$status", method: "$method" },
          count: { $sum: 1 },
        },
      },
    ]);
    deliveries = await NotificationJob.find({})
      .sort({ updatedAt: -1 })
      .limit(30)
      .select("event status attempts createdAt updatedAt lastError")
      .lean();
    queue = await NotificationJob.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);
    errors = await NotificationJob.find({ lastError: { $exists: true } })
      .select("event status attempts lastError updatedAt")
      .sort({ updatedAt: -1 })
      .limit(20)
      .lean();
  }
  let count = null;
  try {
    if (result.checks.mongo === "up")
      count = await Notification.countDocuments();
  } catch {}
  return Response.json(
    {
      ...result,
      operationalErrors,
      transactions,
      version: "0.1.0",
      commit: process.env.RENDER_GIT_COMMIT || null,
      notifications: {
        pushDeliveries:result.checks.mongo==='up'?await Notification.find({pushStatus:{$exists:true}}).sort({updatedAt:-1}).limit(20).select('event pushStatus pushError updatedAt').lean():[],
        deliveries,
        queue,
        errors,
        worker: global.__notificationWorker ? "running" : "not running",
        stored: count,
        externalQueue: "Not configured",
        reconciliation: "Background worker every 15 seconds and inbox refresh",
        workerError: global.__notificationWorkerError || null,
      },
      providers: {
        email: "Not configured",
        sms: "Not configured",
        whatsapp: "Not configured",
          push: pushConfiguration().enabled?'VAPID configured':'Disabled — VAPID not configured',
        payments: "Restricted; eligibility and sandbox verification required",
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
