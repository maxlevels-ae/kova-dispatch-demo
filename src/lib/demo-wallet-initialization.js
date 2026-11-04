import mongoose from "mongoose";
import User from "@/lib/db/models/User";
import Driver from "@/lib/db/models/Driver";
import Ride from "@/lib/db/models/Ride";
import Payment from "@/lib/db/models/Payment";
import WalletTransaction from "@/lib/db/models/WalletTransaction";
import AdminAudit from "@/lib/db/models/AdminAudit";
import DemoWalletInitialization from "@/lib/db/models/DemoWalletInitialization";
export const DEMO_OPERATION = "maxride-existing-demo-egp-v1";
export const DEMO_CONFIRMATION =
  "INITIALIZE EXISTING MAXRIDE DEMO EGP WALLETS ONCE";
// These identities were inspected before release. Never match arbitrary accounts by role/name.
export const DEMO_ACCOUNTS = [
  {
    username: "rider1",
    id: "6aea46b6df27fd11abf23a10",
    role: "rider",
    usd: 100,
    egp: 1000,
  },
  {
    username: "driver1",
    id: "6aea46b6df27fd11abf23a11",
    role: "driver",
    usd: 0,
    egp: 0,
  },
  {
    username: "driver2",
    id: "6aea46b7df27fd11abf23a13",
    role: "driver",
    usd: 0,
    egp: 0,
  },
  {
    username: "driver3",
    id: "6aea46b8df27fd11abf23a15",
    role: "driver",
    usd: 0,
    egp: 0,
  },
  {
    username: "driver4",
    id: "6aea46b9df27fd11abf23a17",
    role: "driver",
    usd: 0,
    egp: 0,
  },
  {
    username: "driver5",
    id: "6aea46b9df27fd11abf23a19",
    role: "driver",
    usd: 0,
    egp: 0,
  },
];
export function demoInitializationAllowed(env = process.env) {
  try {
    if (
      new URL(env.RENDER_EXTERNAL_URL || env.NEXT_PUBLIC_APP_URL || "")
        .origin === "https://kova-dispatch-demo.onrender.com"
    )
      return true;
  } catch {}
  // Tests must use the isolated local QA database, never a remote/production database.
  return (
    env.DEMO_WALLET_INITIALIZATION_TEST === "true" &&
    /^mongodb:\/\/127\.0\.0\.1:27028\/maxride_qa_[0-9]+\?/.test(
      env.MONGODB_URI || "",
    )
  );
}
function unavailable() {
  throw Object.assign(
    new Error("Demo wallet initialization is unavailable on this deployment"),
    { status: 403 },
  );
}
async function inspectAccount(target, session) {
  const user = await User.findById(target.id).session(session).lean();
  if (!user || user.username !== target.username || user.role !== target.role)
    return { reason: "Pinned demo identity does not match" };
  const driver =
    target.role === "driver"
      ? await Driver.findOne({ userId: user._id }).session(session).lean()
      : null;
  if (!user.isActive) return { user, driver, reason: "Account is inactive" };
  if (target.role === "driver" && !driver)
    return { user, reason: "Linked driver record is missing" };
  if (driver?.isOnline || driver?.currentRideId)
    return {
      user,
      driver,
      reason: "Driver must be offline without an active ride",
    };
  // Any ledger/payment/ride history is conservatively treated as a blocker, even if its balance is zero.
  if (await WalletTransaction.exists({ userId: user._id }).session(session))
    return {
      user,
      driver,
      reason: "Existing wallet transactions require review",
    };
  if (
    await Payment.exists({
      $or: [{ riderId: user._id }, { driverId: user._id }],
    }).session(session)
  )
    return {
      user,
      driver,
      reason: "Existing payment activity requires review",
    };
  if (
    await Ride.exists({
      $or: [
        { riderId: user._id },
        { driverId: user._id },
        ...(driver ? [{ driverProfileId: driver._id }] : []),
      ],
    }).session(session)
  )
    return { user, driver, reason: "Existing or active rides require review" };
  if (driver?.stats?.totalTrips || driver?.stats?.totalEarnings)
    return {
      user,
      driver,
      reason: "Existing driver financial statistics require review",
    };
  if (user.wallet?.currency !== "USD" || user.wallet.balance !== target.usd)
    return {
      user,
      driver,
      reason: "Legacy wallet does not match the inspected USD demo balance",
    };
  if (user.egpWallet !== undefined && user.egpWallet !== null)
    return {
      user,
      driver,
      reason: "An EGP operational account already exists",
    };
  return { user, driver };
}
export async function demoWalletPreflight() {
  if (!demoInitializationAllowed()) unavailable();
  const receipt =
    await DemoWalletInitialization.findById(DEMO_OPERATION).lean();
  if (receipt) return { closed: true, receipt };
  const accounts = [];
  for (const target of DEMO_ACCOUNTS) {
    const { user, driver, reason } = await inspectAccount(target, null);
    accounts.push({
      username: target.username,
      userId: target.id,
      eligible: !reason,
      reason: reason || null,
      legacyWallet: user?.wallet,
      operationalWallet: { balance: target.egp, currency: "EGP" },
      driverProfileId: driver?._id,
    });
  }
  return { closed: false, operation: DEMO_OPERATION, accounts };
}
export async function initializeDemoWallets(actor) {
  if (!demoInitializationAllowed()) unavailable();
  try {
    return await mongoose.connection.transaction(async (session) => {
      const prior = await DemoWalletInitialization.findById(DEMO_OPERATION)
        .session(session)
        .lean();
      if (prior) return { replayed: true, receipt: prior };
      const accounts = [],
        executedAt = new Date();
      for (const target of DEMO_ACCOUNTS) {
        const preliminary = await inspectAccount(target, session);
        if (preliminary.reason) {
          accounts.push({
            username: target.username,
            userId: target.id,
            driverProfileId: preliminary.driver?._id,
            status: "blocked",
            reason: preliminary.reason,
            legacyWallet: preliminary.user?.wallet,
          });
          continue;
        }
        // Taking a write lock makes concurrent wallet adjustments conflict/retry before inspection.
        // No upsert: missing or replaced demo accounts can never be created by this operation.
        const pinned = await User.findOne({
          _id: target.id,
          username: target.username,
          role: target.role,
        }).session(session);
        if (pinned)
          await User.updateOne(
            { _id: pinned._id },
            { $inc: { __v: 1 } },
            { session, timestamps: false },
          );
        const linked =
          target.role === "driver"
            ? await Driver.findOne({ userId: target.id }).session(session)
            : null;
        // Serialize with driver online/assignment mutations while checking for active work.
        if (linked)
          await Driver.updateOne(
            { _id: linked._id },
            { $inc: { __v: 1 } },
            { session, timestamps: false },
          );
        const { user, driver, reason } = await inspectAccount(target, session);
        const record = {
          username: target.username,
          userId: target.id,
          driverProfileId: driver?._id,
          status: reason ? "blocked" : "initialized",
          reason: reason || "One-time demo funds; no currency conversion",
          legacyWallet: user?.wallet,
        };
        if (!reason) {
          record.operationalWallet = { balance: target.egp, currency: "EGP" };
          record.ledgerRef = `${DEMO_OPERATION}:${target.id}`;
          await User.updateOne(
            { _id: user._id },
            { $set: { egpWallet: record.operationalWallet } },
            { session, runValidators: true },
          );
          await WalletTransaction.create(
            [
              {
                userId: user._id,
                type: "demo_initialization",
                currency: "EGP",
                amount: target.egp,
                balanceBefore: 0,
                balanceAfter: target.egp,
                actorId: actor.id,
                actorName: actor.name,
                reason: record.reason,
                note: target.egp
                  ? "Demo-only EGP credit; original USD funds preserved"
                  : "Demo-only zero-balance EGP account initialized",
                reference: DEMO_OPERATION,
                ref: record.ledgerRef,
              },
            ],
            { session },
          );
          await AdminAudit.create(
            [
              {
                actorId: actor.id,
                targetId: user._id,
                action: "demo.wallet.initialized",
                changes: {
                  operation: DEMO_OPERATION,
                  legacyWallet: record.legacyWallet,
                  operationalWallet: record.operationalWallet,
                },
              },
            ],
            { session },
          );
        }
        accounts.push(record);
      }
      const [receipt] = await DemoWalletInitialization.create(
        [
          {
            _id: DEMO_OPERATION,
            actorId: actor.id,
            actorName: actor.name,
            executedAt,
            accounts,
          },
        ],
        { session },
      );
      return { replayed: false, receipt: receipt.toObject() };
    });
  } catch (e) {
    if (e.code === 11000) {
      const receipt =
        await DemoWalletInitialization.findById(DEMO_OPERATION).lean();
      if (receipt) return { replayed: true, receipt };
    }
    throw e;
  }
}

export async function demoLegacyRecord(userId) {
  const receipt = await DemoWalletInitialization.findOne({
    "accounts.userId": userId,
  })
    .select({ _id: 1, executedAt: 1, "accounts.$": 1 })
    .lean();
  if (!receipt || receipt.accounts[0]?.status !== "initialized") return null;
  return {
    operation: receipt._id,
    preservedAt: receipt.executedAt,
    wallet: receipt.accounts[0].legacyWallet,
    ledgerRef: receipt.accounts[0].ledgerRef,
  };
}
