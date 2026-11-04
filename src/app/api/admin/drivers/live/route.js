import { requireAuth } from "@/lib/auth/helpers";
import Driver from "@/lib/db/models/Driver";
import redis from "@/lib/db/redis";
import { DRIVER_STALE_MS } from "@/lib/map-config";
export async function GET() {
  const { error } = await requireAuth(["admin"]);
  if (error) return error;
  try {
    const drivers = await Driver.find({ isOnline: true, isApproved: true })
      .select("_id userId vehicle currentRideId location lastLocationUpdate")
      .populate("userId", "name isActive role")
      .lean();
    const result = await Promise.all(
      drivers.map(async (d) => {
        if (!d.userId?.isActive || d.userId.role !== "driver") return null;
        // Redis membership expires on disconnect; Mongo coordinates alone do not prove liveness.
        const [membership, gps] = await Promise.all([
          redis.get(`h3:driver:cell:${d._id}`),
          redis.hgetall(`driver:loc:${d._id}`),
        ]);
        if (!membership) return null;
        const timestamp =
          Number(gps.ts) || new Date(d.lastLocationUpdate).getTime();
        const location = gps.ts
          ? { lat: Number(gps.lat), lng: Number(gps.lng) }
          : { lat: d.location.coordinates[1], lng: d.location.coordinates[0] };
        if (
          !Number.isFinite(timestamp) ||
          Date.now() - timestamp > DRIVER_STALE_MS ||
          !Number.isFinite(location.lat) ||
          !Number.isFinite(location.lng)
        )
          return null;
        return {
          id: String(d._id),
          name: d.userId.name,
          vehicle: d.vehicle,
          status: d.currentRideId ? "on_trip" : "available",
          timestamp,
          location,
        };
      }),
    );
    return Response.json(
      { drivers: result.filter(Boolean), staleAfterMs: DRIVER_STALE_MS },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Live driver snapshot unavailable. Retrying shortly." },
      { status: 503 },
    );
  }
}
