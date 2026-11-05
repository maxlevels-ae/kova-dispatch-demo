import {currencyDigits} from '@/lib/countries';
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { z } from "zod";
import User from "@/lib/db/models/User";
import Driver from "@/lib/db/models/Driver";
import WalletTransaction from "@/lib/db/models/WalletTransaction";
import AdminAudit from "@/lib/db/models/AdminAudit";
import { walletAccount, walletDelta, minorUnits } from "@/lib/currency";
import { getSettings } from "@/lib/settings";
export const profileSchema = z.object({
  name: z.string().trim().min(2).max(100),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(30)
    .regex(/^[a-z0-9_.]+$/),
  phone: z
    .union([
      z.literal(""),
      z
        .string()
        .trim()
        .regex(/^\+?[0-9\s\-()]{7,20}$/),
    ])
    .default(""),
  email: z
    .union([z.literal(""), z.string().trim().toLowerCase().email().max(200)])
    .default(""),
});
export const passwordSchema = z
  .string()
  .min(12, "Use at least 12 characters")
  .max(72, "Use at most 72 characters")
  .refine(
    (v) => Buffer.byteLength(v, "utf8") <= 72,
    "Password must fit within 72 UTF-8 bytes",
  );
const vehicleSchema = z.object({
  make: z.string().trim().max(60),
  model: z.string().trim().max(60),
  color: z.string().trim().max(40),
  plate: z.string().trim().max(30),
  year: z
    .number()
    .int()
    .min(1980)
    .max(new Date().getFullYear() + 1)
    .optional(),
  type: z.enum(["economy", "comfort", "premium", "xl"]),
});
export const driverSchema = z.object({
  vehicle: vehicleSchema,
  license: z.object({
    number: z.string().trim().max(80),
    expiry: z.union([z.literal(""), z.string().date()]).optional(),
    verified: z.boolean(),
  }),
  documents: z
    .array(
      z.object({
        type: z.enum([
          "license",
          "insurance",
          "registration",
          "background_check",
          "profile_photo",
        ]),
        url: z
          .string()
          .url()
          .max(500)
          .refine((v) => v.startsWith("https://"), "Use an HTTPS document URL"),
        verified: z.boolean(),
        rejectionReason: z.string().max(200).optional(),
      }),
    )
    .max(20),
  isApproved: z.boolean(),
  suspensionReason: z.string().trim().max(300).default(""),
});
export function fail(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}
export function apiError(e) {
  return Response.json(
    {
      error:
        e?.code === 11000
          ? "Username, email, phone or request reference is already in use"
          : e?.issues?.[0]?.message ||
            (e.status ? e.message : "Unable to complete request"),
    },
    { status: e?.code === 11000 ? 409 : e?.issues ? 400 : e.status || 500 },
  );
}
export function profileUpdate(data) {
  const { $set, $unset } = { $set: {}, $unset: {} };
  for (const [k, v] of Object.entries(data)) {
    if (v === "") $unset[k] = 1;
    else $set[k] = v;
  }
  return { $set, $unset };
}
export async function createAccount(input, actor) {
  const data = profileSchema
    .extend({ role: z.enum(["rider", "driver"]), password: passwordSchema })
    .strict()
    .parse(input);
  const passwordHash = await bcrypt.hash(data.password, 12);
  return mongoose.connection.transaction(async (session) => {
    const { password, ...fields } = data;
    void password;
    if (!fields.email) delete fields.email;
    if (!fields.phone) delete fields.phone;
    const [user] = await User.create(
      [{ ...fields, passwordHash, wallet: { balance: 0, currency: "EGP" } }],
      { session },
    );
    if (user.role === "driver")
      await Driver.create([{ userId: user._id }], { session });
    await AdminAudit.create(
      [
        {
          actorId: actor.id,
          targetId: user._id,
          action: "account.created",
          changes: { role: user.role },
        },
      ],
      { session },
    );
    return { id: String(user._id) };
  });
}
export async function editAccount(id, input, actor) {
  const data = profileSchema
    .extend({ isActive: z.boolean(), driver: driverSchema.optional() })
    .strict()
    .parse(input);
  return mongoose.connection.transaction(async (session) => {
    const user = await User.findById(id).session(session);
    if (!user) fail("Account not found", 404);
    if (user.role === "admin")
      fail("Administrator profiles must be changed by their owner", 403);
    const { driver, ...fields } = data;
    if (user.role === "driver" && !data.isActive) {
      const activeDriver = await Driver.findOne({ userId: id }).session(
        session,
      );
      if (activeDriver?.currentRideId)
        fail("Finish the active ride before deactivating this driver", 409);
      await Driver.updateOne(
        { userId: id },
        { $set: { isOnline: false } },
        { session },
      );
    }
    if (driver) {
      if (user.role !== "driver") fail("This account is not a driver");
      const existing = await Driver.findOne({ userId: id }).session(session);
      if (!existing) fail("Driver profile not found", 404);
      const { fleet } = await getSettings();
      if (
        driver.isApproved &&
        fleet.requiredDocuments.some(
          (type) =>
            !driver.documents.some((d) => d.type === type && d.verified),
        )
      )
        fail("Verify all required driver documents before approval");
      if (existing.isApproved && !driver.isApproved && !driver.suspensionReason)
        fail("A suspension reason is required");
      if (existing.currentRideId && (!data.isActive || !driver.isApproved))
        fail("Finish the active ride before suspending this driver", 409);
      driver.documents = driver.documents.map((d) => ({
        ...d,
        reviewedAt: new Date(),
      }));
      if (!driver.license.expiry) delete driver.license.expiry;
      driver.vehicle.imageUrl=existing.vehicle.imageUrl;
      Object.assign(existing, driver);
      if (!driver.isApproved || !data.isActive) existing.isOnline = false;
      await existing.save({ session });
    }
    await User.updateOne({ _id: id }, profileUpdate(fields), {
      session,
      runValidators: true,
    });
    await AdminAudit.create(
      [
        {
          actorId: actor.id,
          targetId: id,
          action: "account.updated",
          changes: data,
        },
      ],
      { session },
    );
    return { id };
  });
}
export const adjustmentSchema = z
  .object({
    currency: z.enum(Object.keys(currencyDigits)),
    direction: z.enum(["credit", "debit"]),
    amount: z
      .number()
      .positive()
      .max(1000000),
    reason: z.string().trim().min(5).max(200),
    reference: z.string().trim().max(100).default(""),
    idempotencyKey: z.string().uuid(),
    confirmed: z.literal(true),
  })
  .strict();
export async function adjustWallet(id, input, actor) {
  const data = adjustmentSchema.parse(input),
    amount =
      (minorUnits(data.amount,data.currency) / 10**currencyDigits[data.currency]) * (data.direction === "credit" ? 1 : -1),
    ref = `admin:${data.idempotencyKey}`;
  if(!amount||Math.abs(Math.abs(amount)-data.amount)>1e-8)fail('Amount exceeds currency precision',400);
  const match = (entry) => {
    if (
      String(entry.userId) !== String(id) ||
      String(entry.actorId) !== actor.id ||
      entry.amount !== amount ||
      entry.currency !== data.currency ||
      entry.reason !== data.reason ||
      entry.reference !== data.reference
    )
      fail("This request key was already used for a different adjustment", 409);
    return entry;
  };
  try {
    return await mongoose.connection.transaction(async (session) => {
      const prior = await WalletTransaction.findOne({ ref })
        .session(session)
        .lean();
      if (prior) return match(prior);
      const user = await User.findById(id).session(session);
      if (!user) fail("Account not found", 404);
      if (!["rider", "driver"].includes(user.role))
        fail("Wallet adjustments are limited to riders and drivers", 403);
      const account = walletAccount(user, data.currency)||(data.currency==='USD'&&data.direction==='credit'?{currency:'USD',balance:0}:null);
      if (!account) fail("This currency account does not exist", 409);
      const before = minorUnits(account.balance,data.currency),
        after = before + minorUnits(amount,data.currency);
      if (after < 0)
        fail(
          "Insufficient balance. Manual adjustments cannot create debt.",
          409,
        );
      const updated = await User.findByIdAndUpdate(
        id,
        walletDelta(amount, data.currency),
        { session, returnDocument: "after", updatePipeline: true },
      );
      const [entry] = await WalletTransaction.create(
        [
          {
            userId: id,
            type: amount > 0 ? "manual_credit" : "manual_debit",
            amount,
            currency: data.currency,
            balanceBefore: before / 10**currencyDigits[data.currency],
            balanceAfter: walletAccount(updated, data.currency).balance,
            actorId: actor.id,
            actorName: actor.name,
            reason: data.reason,
            note: data.reason,
            reference: data.reference,
            ref,
          },
        ],
        { session },
      );
      return entry.toObject();
    });
  } catch (e) {
    if (e.code === 11000) {
      const prior = await WalletTransaction.findOne({ ref }).lean();
      if (prior) return match(prior);
    }
    throw e;
  }
}
