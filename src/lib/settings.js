import connectDB from "@/lib/db/mongodb";
import PlatformSettings from "@/lib/db/models/PlatformSettings";
import { defaults, schemas } from "@/lib/settings-schema";
export async function getSettings() {
  await connectDB();
  const rows = await PlatformSettings.find({
    _id: { $in: Object.keys(defaults) },
  }).lean();
  const result = structuredClone(defaults);
  for (const row of rows) result[row._id] = schemas[row._id].parse(row.value);
  return result;
}
