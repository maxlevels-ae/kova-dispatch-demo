import { requireAuth } from "@/lib/auth/helpers";
import { getSettings } from "@/lib/settings";
import { cityCenter, cartoConfigured } from "@/lib/map-config";
export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;
  try {
    const { maps } = await getSettings();
    return Response.json(
      {
        settings: maps,
        center: cityCenter(maps),
        providers: [
          {
            id: "openfreemap",
            name: "OpenFreeMap",
            available: true,
            status: "Available · No API key required",
          },
          {
            id: "carto",
            name: "CARTO",
            available: cartoConfigured,
            status: cartoConfigured
              ? "Key configured · Connection checked when loaded"
              : "Unavailable · API key required",
          },
        ],
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Map configuration unavailable" },
      { status: 503 },
    );
  }
}
