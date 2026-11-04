import Driver from "@/lib/db/models/Driver";
import { readSettingsJSON } from "@/lib/settings-http";
import { createAccount, apiError } from "@/lib/admin-accounts";
import { validSettingsOrigin } from "@/lib/settings-origin";
import connectDB from "@/lib/db/mongodb";
import User from "@/lib/db/models/User";
import { requireAuth } from "@/lib/auth/helpers";

// GET /api/admin/users — user list
export async function GET(request) {
  const { error } = await requireAuth(["admin"]);
  if (error) return error;

  try {
    await connectDB();

    const { searchParams } = request.nextUrl;
    const page = Math.max(
      1,
      Math.min(100000, parseInt(searchParams.get("page") || "1", 10) || 1),
    );
    const limit = Math.max(
      1,
      Math.min(50, parseInt(searchParams.get("limit") || "20", 10) || 20),
    );
    const role = searchParams.get("role");
    const q = (searchParams.get("q") || "")
      .slice(0, 100)
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const query = {};
    if (searchParams.get("active"))
      query.isActive = searchParams.get("active") === "true";
    if (role) query.role = role;
    const approval = searchParams.get("approval");
    if (
      role === "driver" &&
      ["approved", "pending", "suspended"].includes(approval)
    ) {
      const match =
        approval === "approved"
          ? { isApproved: true }
          : {
              isApproved: false,
              suspensionReason:
                approval === "suspended"
                  ? { $nin: ["", null] }
                  : { $in: ["", null] },
            };
      query._id = { $in: await Driver.find(match).distinct("userId") };
    }

    if (q) {
      query.$or = [
        { name: { $regex: q, $options: "i" } },
        { username: { $regex: q, $options: "i" } },
      ];
    }

    const [users, total] = await Promise.all([
      User.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select(
          "name username role rating wallet egpWallet isActive createdAt lastLoginAt",
        )
        .lean(),
      User.countDocuments(query),
    ]);

    return Response.json({
      users,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error("Admin users error:", err);
    return Response.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}

export async function POST(request) {
  const { session, error } = await requireAuth(["admin"]);
  if (error) return error;
  if (!validSettingsOrigin(request))
    return Response.json({ error: "Invalid request origin" }, { status: 403 });
  try {
    return Response.json(
      await createAccount(await readSettingsJSON(request), session.user),
      { status: 201 },
    );
  } catch (e) {
    return apiError(e);
  }
}
