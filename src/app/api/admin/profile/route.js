import { readSettingsJSON } from "@/lib/settings-http";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/helpers";
import { validSettingsOrigin } from "@/lib/settings-origin";
import {
  profileSchema,
  passwordSchema,
  profileUpdate,
  apiError,
  fail,
} from "@/lib/admin-accounts";
import User from "@/lib/db/models/User";
import AdminAudit from "@/lib/db/models/AdminAudit";
import redis from "@/lib/db/redis";
export async function GET() {
  const { session, error } = await requireAuth(["admin"]);
  if (error) return error;
  const user = await User.findById(session.user.id)
    .select("name username phone email avatar")
    .lean();
  return Response.json({ user });
}
export async function PATCH(request) {
  const { session, error } = await requireAuth(["admin"]);
  if (error) return error;
  if (!validSettingsOrigin(request))
    return Response.json({ error: "Invalid request origin" }, { status: 403 });
  try {
    const data = profileSchema.strict().parse(await readSettingsJSON(request));
    await mongoose.connection.transaction(async (dbSession) => {
      await User.updateOne({ _id: session.user.id }, profileUpdate(data), {
        session: dbSession,
        runValidators: true,
      });
      await AdminAudit.create(
        [
          {
            actorId: session.user.id,
            targetId: session.user.id,
            action: "profile.updated",
            changes: data,
          },
        ],
        { session: dbSession },
      );
    });
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(request) {
  const { session, error } = await requireAuth(["admin"]);
  if (error) return error;
  if (!validSettingsOrigin(request))
    return Response.json({ error: "Invalid request origin" }, { status: 403 });
  try {
    const count = await redis.eval(
      "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],900) end; return n",
      1,
      `password-change:${session.user.id}`,
    );
    if (count > 5)
      fail("Too many password attempts. Try again in 15 minutes.", 429);
    const data = z
      .object({
        currentPassword: z.string().min(1).max(200),
        newPassword: passwordSchema,
        confirmation: z.string(),
      })
      .strict()
      .parse(await readSettingsJSON(request));
    if (data.newPassword !== data.confirmation)
      fail("New passwords do not match");
    if (data.newPassword === data.currentPassword)
      fail("Choose a different new password");
    const user = await User.findById(session.user.id).select("+passwordHash");
    if (!(await bcrypt.compare(data.currentPassword, user.passwordHash)))
      fail("Current password is incorrect", 400);
    const hash = await bcrypt.hash(data.newPassword, 12);
    await mongoose.connection.transaction(async (dbSession) => {
      const result = await User.updateOne(
        { _id: user._id, passwordHash: user.passwordHash },
        { $set: { passwordHash: hash }, $inc: { authVersion: 1 } },
        { session: dbSession },
      );
      if (!result.modifiedCount)
        fail("Password changed in another session. Sign in again.", 409);
      await AdminAudit.create(
        [{ actorId: user._id, targetId: user._id, action: "password.changed" }],
        { session: dbSession },
      );
    });
    return Response.json({
      ok: true,
      message: "Password changed successfully. Sign in again on all devices.",
    });
  } catch (e) {
    return apiError(e);
  }
}
