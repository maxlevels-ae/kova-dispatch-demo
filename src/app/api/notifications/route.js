import NotificationPreference from "@/lib/db/models/NotificationPreference";
import { requireAuth } from "@/lib/auth/helpers";
import connectDB from "@/lib/db/mongodb";
import Notification from "@/lib/db/models/Notification";
import { syncNotifications } from "@/lib/notifications";
import {validSettingsOrigin} from '@/lib/settings-origin';
import {preferenceDefaults,preferenceSchema} from '@/lib/notification-policy';
import {readSettingsJSON} from '@/lib/settings-http';
import {getSettings} from '@/lib/settings';
export async function GET() {
  const { session, error } = await requireAuth();
  if (error) return error;
  try {
    await syncNotifications(session.user.id);
    return Response.json(
      {
        preferences:{...preferenceDefaults,...await NotificationPreference.findById(session.user.id).select('-_id -createdAt -updatedAt -__v').lean()},
        soundPolicy:(await getSettings()).notifications,
        unreadCount:await Notification.countDocuments({userId:session.user.id,readAt:null}),
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
  if (!validSettingsOrigin(request))
    return Response.json({ error: "Invalid origin" }, { status: 403 });
  try {
    await connectDB();
    const body=await request.text();let id;
    if(body){try{id=JSON.parse(body).id;}catch{return Response.json({error:'Invalid notification'},{status:400});}if(id&&!/^[a-f\d]{24}$/i.test(id))return Response.json({error:'Invalid notification'},{status:400});}
    await Notification.updateMany(
      { userId: session.user.id, readAt: null,...(id?{_id:id}:{}) },
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
  if (!validSettingsOrigin(request))
    return Response.json({ error: "Invalid origin" }, { status: 403 });
  try {
    const parsed=preferenceSchema.safeParse(await readSettingsJSON(request));
    if (!parsed.success)
      return Response.json({ error: "Invalid preference" }, { status: 400 });
    await connectDB();
    await NotificationPreference.findOneAndUpdate(
      { _id: session.user.id },
      { $set: parsed.data },
      { upsert: true },
    );
    return Response.json({ ok: true });
  } catch(e) {
    return Response.json(
      { error: e.status?e.message:"Unable to save preference" },
      { status: e.status||503 },
    );
  }
}
