import { mapDefaults, egyptLocations } from "./map-config.js";
import { z } from "zod";
const number = (min, max) => z.number().finite().min(min).max(max);
export const categories = ["economy", "comfort", "premium", "xl"];
export const events = [
  "booking_created",
  "driver_assigned",
  "driver_accepted",
  "driver_arrived",
  "trip_started",
  "trip_completed",
  "trip_cancelled",
  "payment_successful",
  "payment_failed",
  "driver_approval",
  "operational_alert",
];
export const defaults = {
  dispatch: {
    assignmentMode: "automatic",
    fallback: "no_drivers",
    scheduledEnabled: false,
    maxScheduleDays: 7,
    searchRadiusKm: 15,
    acceptanceSeconds: 16,
    maxAttempts: 8,
    maxTripKm: 200,
    serviceStartHour: 0,
    serviceEndHour: 24,
  },
  fleet: {
    maxDailyTrips: 0,
    suspensionReasonRequired: false,
    enabledCategories: categories,
    requiredDocuments: [],
    maxDebtEGP: 25,
  },
  maps: {
    ...mapDefaults,
    routingMode: "osrm",
    city: "Cairo",
    country: "Egypt",
    restrictPickup: false,
    restrictDropoff: false,
    south: 22,
    north: 32,
    west: 25,
    east: 37,
  },
  notifications: {
    driverSound:true,
    riderSound:true,
    messageSound:true,
    enabledEvents: [],
    templates: Object.fromEntries(
      events.map((e) => [e, e.replaceAll("_", " ")]),
    ),
  },
  security: { sessionHours: 720 },
};
export const schemas = {
  dispatch: z
    .object({
      assignmentMode: z.enum(["automatic", "manual"]),
      fallback: z.enum(["no_drivers", "manual"]),
      scheduledEnabled: z.boolean(),
      maxScheduleDays: number(1, 30).int(),
      searchRadiusKm: number(0.5, 50),
      acceptanceSeconds: number(5, 25).int(),
      maxAttempts: number(1, 8).int(),
      maxTripKm: number(1, 200),
      serviceStartHour: number(0, 23).int(),
      serviceEndHour: number(1, 24).int(),
    })
    .strict()
    .refine(
      (v) => v.serviceStartHour < v.serviceEndHour,
      "Service end must follow start (Africa/Cairo)",
    ),
  fleet: z
    .object({
      maxDailyTrips: number(0, 100).int(),
      suspensionReasonRequired: z.boolean(),
      enabledCategories: z.array(z.enum(categories)).min(1).max(4),
      requiredDocuments: z
        .array(
          z.enum([
            "license",
            "insurance",
            "registration",
            "background_check",
            "profile_photo",
          ]),
        )
        .max(5),
      maxDebtEGP: number(0, 25),
    })
    .strict(),
  maps: z
    .object({
      routingMode: z.enum(["osrm", "estimate"]),
      basemapProvider: z.enum(["openfreemap", "carto"]).default("openfreemap"),
      mapStyle: z.enum(["standard", "light", "dark"]).default("standard"),
      governorate: z.enum(Object.keys(egyptLocations)).default("Cairo"),
      initialZoom: z
        .union([
          z.literal(8),
          z.literal(10),
          z.literal(12),
          z.literal(14),
          z.literal(16),
        ])
        .default(12),
      autoFitDrivers: z.boolean().default(true),
      showVehicleMarkers: z.boolean().default(true),
      showDriverNames: z.boolean().default(false),
      driverStatusFilter: z
        .enum(["all", "available", "on_trip"])
        .default("all"),
      vehicleCategoryFilter: z.enum(["all", ...categories]).default("all"),
      locationRefreshSeconds: z
        .union([z.literal(5), z.literal(15), z.literal(30), z.literal(60)])
        .default(15),
      city: z.string().trim().min(1).max(80),
      country: z.literal("Egypt"),
      restrictPickup: z.boolean(),
      restrictDropoff: z.boolean(),
      south: number(-90, 90),
      north: number(-90, 90),
      west: number(-180, 180),
      east: number(-180, 180),
    })
    .strict()
    .refine(
      (v) => v.south < v.north && v.west < v.east,
      "Invalid service boundary",
    )
    .refine((v) => Object.hasOwn(egyptLocations[v.governorate] || {}, v.city), {
      message: "Choose a city in the selected governorate",
      path: ["city"],
    }),
  notifications: z
    .object({
      driverSound:z.boolean().default(true),
      riderSound:z.boolean().default(true),
      messageSound:z.boolean().default(true),
      enabledEvents: z.array(z.enum(events)).max(events.length),
      templates: z
        .object(
          Object.fromEntries(
            events.map((e) => [e, z.string().trim().min(1).max(300)]),
          ),
        )
        .strict(),
    })
    .strict(),
  security: z.object({ sessionHours: number(1, 720).int() }).strict(),
};
export function bookingPolicy(
  settings,
  pickup,
  dropoff,
  vehicleType,
  now = new Date(),
) {
  if (!settings.fleet.enabledCategories.includes(vehicleType))
    return "Vehicle category is unavailable";
  const hour = Number(
    new Intl.DateTimeFormat("en", {
      timeZone: "Africa/Cairo",
      hour: "numeric",
      hourCycle: "h23",
    }).format(now),
  );
  if (
    hour < settings.dispatch.serviceStartHour ||
    hour >= settings.dispatch.serviceEndHour
  )
    return "Booking is outside service hours (Africa/Cairo)";
  const m = settings.maps;
  const inside = (p) =>
    p.lat >= m.south && p.lat <= m.north && p.lng >= m.west && p.lng <= m.east;
  if (m.restrictPickup && !inside(pickup))
    return "Pickup is outside the service area";
  if (m.restrictDropoff && !inside(dropoff))
    return "Dropoff is outside the service area";
  return null;
}
