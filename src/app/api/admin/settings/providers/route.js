import { readSettingsJSON } from "@/lib/settings-http";
import { requireAuth } from "@/lib/auth/helpers";
import connectDB from "@/lib/db/mongodb";
import ProviderConfig from "@/lib/db/models/ProviderConfig";
import {
  providerRegistry,
  providerSchema,
  providerReadiness,
} from "@/lib/provider-config";
export async function GET() {
  const { error } = await requireAuth(["admin"]);
  if (error) return error;
  try {
    await connectDB();
    const rows = await ProviderConfig.find({}).lean();
    return Response.json(
      {
        providers: Object.entries(providerRegistry).map(([id, p]) => {
          const row = rows.find((r) => r._id === id);
          return {
            id,
            ...p,
            value: row?.value || {
              name: p.name,
              active: false,
              mode: "sandbox",
              accountId: "",
              currency: "EGP",
              methods: [],
              webhookUrl: "",
            },
            revision: row?.revision || 0,
            history: row?.history || [],
            ...providerReadiness(id),
          };
        }),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Provider configuration unavailable" },
      { status: 503 },
    );
  }
}
export async function PUT(request) {
  const { session, error } = await requireAuth(["admin"]);
  if (error) return error;
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return Response.json({ error: "Invalid origin" }, { status: 403 });
  try {
    const { id, value, revision } = await readSettingsJSON(request, 8000);
    if (
      !Object.hasOwn(providerRegistry, id) ||
      !Number.isInteger(revision) ||
      revision < 0
    )
      return Response.json({ error: "Invalid provider" }, { status: 400 });
    const parsed = providerSchema.safeParse(value);
    if (!parsed.success)
      return Response.json(
        {
          error:
            "Invalid configuration. Activation remains locked until verification.",
        },
        { status: 400 },
      );
    await connectDB();
    const row = await ProviderConfig.findOneAndUpdate(
      { _id: id, revision },
      {
        $set: { value: parsed.data },
        $inc: { revision: 1 },
        $push: {
          history: {
            $each: [
              {
                actor: session.user.id,
                at: new Date(),
                action: "Configuration saved",
              },
            ],
            $slice: -100,
          },
        },
      },
      { upsert: revision === 0, returnDocument: "after" },
    );
    if (!row)
      return Response.json(
        { error: "Configuration changed; reload." },
        { status: 409 },
      );
    return Response.json({ revision: row.revision });
  } catch (e) {
    if (e.status)
      return Response.json({ error: e.message }, { status: e.status });
    return Response.json(
      {
        error:
          e.code === 11000
            ? "Configuration changed; reload."
            : "Unable to save provider",
      },
      { status: e.code === 11000 ? 409 : 503 },
    );
  }
}
