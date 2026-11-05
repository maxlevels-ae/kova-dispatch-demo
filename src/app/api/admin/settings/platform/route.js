import {activeOperations} from '@/lib/operating-areas';
import { cartoConfigured } from "@/lib/map-config";
import { validSettingsOrigin } from "@/lib/settings-origin";
import { readSettingsJSON } from "@/lib/settings-http";
import { requireAuth } from "@/lib/auth/helpers";
import { getSettings } from "@/lib/settings";
import { schemas } from "@/lib/settings-schema";
import PlatformSettings from "@/lib/db/models/PlatformSettings";
export async function GET() {
  const { error } = await requireAuth(["admin"]);
  if (error) return error;
  try {
    const settings = await getSettings();
    const records = await PlatformSettings.find({})
      .select("_id revision history")
      .lean();
    return Response.json(
      { settings, records },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json({ error: "Settings unavailable" }, { status: 503 });
  }
}
export async function PUT(request) {
  const { session, error } = await requireAuth(["admin"]);
  if (error) return error;
  if (!validSettingsOrigin(request))
    return Response.json({ error: "Invalid origin" }, { status: 403 });
  try {
    const { section, value, revision } = await readSettingsJSON(request);
    if (
      !Object.hasOwn(schemas, section) ||
      !Number.isInteger(revision) ||
      revision < 0
    )
      return Response.json(
        { error: "Invalid section or revision" },
        { status: 400 },
      );
    const existing=await getSettings();
    const preserved={...value};if(section==='maps')for(const key of ['country','governorate','city','restrictPickup','restrictDropoff','south','north','west','east'])preserved[key]=existing.maps[key];
    const parsed = schemas[section].safeParse(preserved);
    if (!parsed.success)
      return Response.json(
        {
          error: parsed.error.issues
            .map((i) => i.path.join(".") + ": " + i.message)
            .join("; "),
        },
        { status: 400 },
      );
    if(section === 'maps' && parsed.data.basemapProvider === 'carto' && !cartoConfigured) return Response.json({error:'CARTO requires a configured browser basemap API key. Choose OpenFreeMap.'},{status:400});
    await getSettings();
    const row = await PlatformSettings.findOneAndUpdate(
      { _id: section, revision },
      {
        $set: { value: parsed.data },
        $inc: { revision: 1 },
        $push: {
          history: {
            $each: [
              {
                actor: session.user.id,
                at: new Date(),
                fields: Object.keys(parsed.data),
                value: parsed.data,
              },
            ],
            $slice: -100,
          },
        },
      },
      { upsert: revision === 0, returnDocument: "after", runValidators: true },
    );
    if (!row)
      return Response.json(
        { error: "Settings changed. Reload before saving." },
        { status: 409 },
      );
    return Response.json({ revision: row.revision, savedAt: row.updatedAt, ...(section === "maps" ? { center: (await activeOperations()).config.center } : {}) });
  } catch (e) {
    if (e.status)
      return Response.json({ error: e.message }, { status: e.status });
    return Response.json(
      {
        error:
          e.code === 11000
            ? "Settings changed. Reload before saving."
            : "Unable to save settings",
      },
      { status: e.code === 11000 ? 409 : 503 },
    );
  }
}
