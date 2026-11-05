import { readSettingsJSON } from "@/lib/settings-http";
import mongoose from "mongoose";
import { requireAuth } from "@/lib/auth/helpers";
import { validSettingsOrigin } from "@/lib/settings-origin";
import { editAccount, apiError } from "@/lib/admin-accounts";
import { walletAccounts } from "@/lib/currency";
import User from "@/lib/db/models/User";
import Driver from "@/lib/db/models/Driver";
import Ride from "@/lib/db/models/Ride";
import AdminAudit from "@/lib/db/models/AdminAudit";
export async function GET(request, { params }) {
  const { error } = await requireAuth(["admin"]);
  if (error) return error;
  const { id } = await params;
  if (!mongoose.isValidObjectId(id))
    return Response.json({ error: "Invalid account ID" }, { status: 400 });
  try {
    const user = await User.findById(id)
      .select(
        "name username email phone avatar role isActive createdAt lastLoginAt wallet egpWallet currencyWallets rating",
      )
      .lean();
    if (!user)
      return Response.json({ error: "Account not found" }, { status: 404 });
    const [driver, trips, audit, earnings] = await Promise.all([
      Driver.findOne({ userId: id })
        .select(
          "vehicle license documents isApproved isOnline suspensionReason stats",
        )
        .lean(),
      Ride.find({ $or: [{ riderId: id }, { driverId: id }] })
        .sort({ createdAt: -1 })
        .limit(30)
        .select("status pickup.address dropoff.address fare createdAt")
        .lean(),
      AdminAudit.find({ targetId: id })
        .sort({ createdAt: -1 })
        .limit(30)
        .populate("actorId", "name username")
        .select("action actorId createdAt")
        .lean(),
      Ride.aggregate([
        {
          $match: {
            driverId: new mongoose.Types.ObjectId(id),
            status: "completed",
          },
        },
        {
          $group: {
            _id: "$fare.currency",
            total: { $sum: "$fare.driverEarnings" },
            trips: { $sum: 1 },
          },
        },
      ]),
    ]);
    return Response.json({
      user,
      driver,
      trips,
      audit,
      earnings,
      accounts: walletAccounts(user),
    });
  } catch (e) {
    return apiError(e);
  }
}
export async function PATCH(request, { params }) {
  const { session, error } = await requireAuth(["admin"]);
  if (error) return error;
  if (!validSettingsOrigin(request))
    return Response.json({ error: "Invalid request origin" }, { status: 403 });
  const { id } = await params;
  if (!mongoose.isValidObjectId(id))
    return Response.json({ error: "Invalid account ID" }, { status: 400 });
  try {
    return Response.json(
      await editAccount(id, await readSettingsJSON(request), session.user),
    );
  } catch (e) {
    return apiError(e);
  }
}
