import NotificationPreference from "@/lib/db/models/NotificationPreference";
import { requireAuth } from "@/lib/auth/helpers";
import connectDB from "@/lib/db/mongodb";
import Notification from "@/lib/db/models/Notification";
import { syncNotifications } from "@/lib/notifications";
export async function GET() {
  const { session, error } = await requireAuth();
  if (error) return error;
  try {
    await syncNotifications(session.user.id);
    return Response.json(
      {
        preference:
          (await NotificationPreference.findById(session.user.id).lean())
            ?.inApp ?? true,
        notifications: await Notification.find({ userId: session.user.id })
          .sort({ createdAt: -1 })
          .limit(50)
          .lean(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Notifications unavailable; retry shortly" },
      { status: 503 },
    );
  }
}
export async function PATCH(request) {
  const { session, error } = await requireAuth();
  if (error) return error;
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return Response.json({ error: "Invalid origin" }, { status: 403 });
  try {
    await connectDB();
    await Notification.updateMany(
      { userId: session.user.id, readAt: null },
      { $set: { readAt: new Date() } },
    );
    return Response.json({ ok: true });
  } catch {
    return Response.json(
      { error: "Unable to mark notifications read" },
      { status: 503 },
    );
  }
}

export async function PUT(request) {
  const { session, error } = await requireAuth();
  if (error) return error;
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return Response.json({ error: "Invalid origin" }, { status: 403 });
  try {
    const { inApp } = await request.json();
    if (typeof inApp !== "boolean")
      return Response.json({ error: "Invalid preference" }, { status: 400 });
    await connectDB();
    await NotificationPreference.findOneAndUpdate(
      { _id: session.user.id },
      { $set: { inApp } },
      { upsert: true },
    );
    return Response.json({ ok: true });
  } catch {
    return Response.json(
      { error: "Unable to save preference" },
      { status: 503 },
    );
  }
}
