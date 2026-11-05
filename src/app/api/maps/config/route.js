import {activeOperations,enabledZones} from '@/lib/operating-areas';
import { requireAuth } from "@/lib/auth/helpers";
import { getSettings } from "@/lib/settings";
import { cartoConfigured } from "@/lib/map-config";
export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;
  try {
    const { maps } = await getSettings();
    const operations=await activeOperations();
    return Response.json(
      {
        settings: maps,
        center: operations.config.center,
        country:operations.country,
        zones: [...new Map([...enabledZones(operations.config,'taxi'),...enabledZones(operations.config,'delivery')].map(z=>[z.id,z])).values()],
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
