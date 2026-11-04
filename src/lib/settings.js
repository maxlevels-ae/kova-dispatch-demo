import { egyptLocations } from "./map-config.js";
import connectDB from "@/lib/db/mongodb";
import PlatformSettings from "@/lib/db/models/PlatformSettings";
import { defaults, schemas } from "@/lib/settings-schema";
export async function getSettings() {
  await connectDB();
  const rows = await PlatformSettings.find({
    _id: { $in: Object.keys(defaults) },
  }).lean();
  const result = structuredClone(defaults);
  for (const row of rows) {
    let value = row.value;
    // Upgrade old location shape in memory only. Never rewrite historical records.
    if (row._id === "maps" && !value.governorate) {
      const governorate =
        Object.keys(egyptLocations).find((g) =>
          Object.hasOwn(egyptLocations[g], value.city),
        ) || "Cairo";
      value = {
        ...value,
        country: "Egypt",
        governorate,
        city: Object.hasOwn(egyptLocations[governorate], value.city)
          ? value.city
          : "Cairo",
      };
    }
    result[row._id] = schemas[row._id].parse(value);
  }
  return result;
}
