import { readSettingsJSON } from "@/lib/settings-http";
import mongoose from "mongoose";
import { requireAuth } from "@/lib/auth/helpers";
import { validSettingsOrigin } from "@/lib/settings-origin";
import { adjustWallet, apiError } from "@/lib/admin-accounts";
import { walletAccounts } from "@/lib/currency";
import User from "@/lib/db/models/User";
import WalletTransaction from "@/lib/db/models/WalletTransaction";
export async function GET(request, { params }) {
  const { error } = await requireAuth(["admin"]);
  if (error) return error;
  const { id } = await params;
  if (!mongoose.isValidObjectId(id))
    return Response.json({ error: "Invalid account ID" }, { status: 400 });
  try {
    const user = await User.findById(id).select("wallet egpWallet").lean();
    if (!user)
      return Response.json({ error: "Account not found" }, { status: 404 });
    const page = Math.max(
      1,
      Number(new URL(request.url).searchParams.get("page")) || 1,
    );
    const [transactions, total] = await Promise.all([
      WalletTransaction.find({ userId: id })
        .sort({ createdAt: -1 })
        .skip((page - 1) * 20)
        .limit(20)
        .lean(),
      WalletTransaction.countDocuments({ userId: id }),
    ]);
    return Response.json({
      accounts: walletAccounts(user),
      transactions,
      page,
      pages: Math.ceil(total / 20),
    });
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(request, { params }) {
  const { session, error } = await requireAuth(["admin"]);
  if (error) return error;
  if (!validSettingsOrigin(request))
    return Response.json({ error: "Invalid request origin" }, { status: 403 });
  const { id } = await params;
  if (!mongoose.isValidObjectId(id))
    return Response.json({ error: "Invalid account ID" }, { status: 400 });
  try {
    return Response.json({
      transaction: await adjustWallet(
        id,
        await readSettingsJSON(request),
        session.user,
      ),
    });
  } catch (e) {
    return apiError(e);
  }
}
