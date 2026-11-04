import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import {
  DEMO_ACCOUNTS,
  DEMO_CONFIRMATION,
  DEMO_OPERATION,
  demoInitializationAllowed,
} from "../src/lib/demo-wallet-initialization.js";
import DemoWalletInitialization from "../src/lib/db/models/DemoWalletInitialization.js";
import { demoLogin, runDemoRide } from "./demo-ride-flow.mjs";
export async function demoWalletChecks({
  request,
  cookies,
  User,
  Driver,
  Ride,
  Payment,
  WalletTransaction,
  password,
  base,
  check,
}) {
  assert.match(
    process.env.MONGODB_URI,
    /^mongodb:\/\/127\.0\.0\.1:27028\/maxride_qa_/,
    "Fixtures are local only",
  );
  const path = "/api/admin/demo-wallet-initialization";
  const post = (
    cookie = cookies.admin,
    body = { confirmation: DEMO_CONFIRMATION },
    origin = base,
  ) =>
    request(path, cookie, {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  const originals = [];
  const hash = await bcrypt.hash(password, 4);
  for (const item of DEMO_ACCOUNTS) {
    const u = await User.create({
      _id: item.id,
      username: item.username,
      name: `Demo ${item.username}`,
      role: item.role,
      passwordHash: hash,
      wallet: { currency: "USD", balance: item.usd },
    });
    let d;
    if (item.role === "driver")
      d = await Driver.create({
        userId: u._id,
        isApproved: true,
        vehicle: {
          make: "Toyota",
          model: "QA vehicle",
          plate: "DEMO-" + item.username,
          type: "economy",
        },
      });
    originals.push({ user: u.toObject(), driver: d?.toObject() });
  }
  await check(
    "demo initializer is deployment-scoped, administrator-only and origin protected",
    async () => {
      assert.equal(
        demoInitializationAllowed({
          NEXT_PUBLIC_APP_URL: "https://another.example",
        }),
        false,
      );
      assert.equal(
        demoInitializationAllowed({
          DEMO_WALLET_INITIALIZATION_TEST: "true",
          MONGODB_URI: "mongodb://production/db",
        }),
        false,
      );
      assert.equal((await post(cookies.rider)).status, 403);
      assert.equal((await post("", {})).status, 401);
      assert.equal(
        (await post(cookies.admin, {}, "https://evil.example")).status,
        403,
      );
      assert.equal(
        (
          await post(cookies.admin, {
            confirmation: DEMO_CONFIRMATION,
            amount: 5000,
          })
        ).status,
        400,
      );
      const preflight = await (await request(path, cookies.admin)).json();
      assert.equal(preflight.accounts.filter((a) => a.eligible).length, 6);
    },
  );
  await check(
    "demo preflight blocks financial history, active rides, online drivers and existing EGP accounts",
    async () => {
      await WalletTransaction.create({
        userId: DEMO_ACCOUNTS[2].id,
        type: "manual_credit",
        currency: "USD",
        amount: 0,
        balanceAfter: 0,
      });
      const blockedRide = await Ride.create({
        riderId: (await User.findOne({ username: "qa_rider" }))._id,
        driverId: DEMO_ACCOUNTS[4].id,
        status: "searching",
        pickup: {
          address: "QA",
          location: { type: "Point", coordinates: [31, 30] },
        },
        dropoff: {
          address: "QA",
          location: { type: "Point", coordinates: [31.1, 30.1] },
        },
      });
      await Payment.create({
        riderId: DEMO_ACCOUNTS[3].id,
        rideId: blockedRide._id,
        amount: 1,
        currency: "USD",
      });
      await User.updateOne(
        { _id: DEMO_ACCOUNTS[5].id },
        { $set: { egpWallet: { balance: 0, currency: "EGP" } } },
      );
      await Driver.updateOne(
        { userId: DEMO_ACCOUNTS[1].id },
        { $set: { isOnline: true } },
      );
      let preflight = await (await request(path, cookies.admin)).json();
      assert.equal(preflight.accounts.filter((a) => a.eligible).length, 1);
      assert.ok(preflight.accounts.slice(1).every((a) => a.reason));
      await Driver.updateOne(
        { userId: DEMO_ACCOUNTS[1].id },
        { $set: { isOnline: false } },
      );
    },
  );
  await check(
    "demo initialization is atomic, immutable, idempotent and preserves all original identities and USD funds",
    async () => {
      const originalCount = await User.countDocuments();
      const results = await Promise.all([post(), post()]);
      assert.equal(await User.countDocuments(), originalCount);
      for (const r of results)
        assert.equal(r.status, 200, await r.clone().text());
      const bodies = await Promise.all(results.map((r) => r.json()));
      assert.equal(bodies.filter((b) => !b.replayed).length, 1);
      const receipt = bodies[0].receipt;
      assert.equal(
        receipt.accounts.filter((a) => a.status === "initialized").length,
        2,
      );
      assert.equal(
        receipt.accounts.filter((a) => a.status === "blocked").length,
        4,
      );
      const rider = await User.findById(DEMO_ACCOUNTS[0].id);
      assert.equal(rider.egpWallet.balance, 1000);
      assert.equal(rider.wallet.balance, 100);
      assert.equal(
        (await User.findById(DEMO_ACCOUNTS[1].id)).egpWallet.balance,
        0,
      );
      for (const original of originals) {
        const user = await User.findById(original.user._id).select(
          "+passwordHash",
        );
        assert.deepEqual(
          user.wallet.toObject?.() || user.wallet,
          original.user.wallet,
        );
        assert.equal(user.username, original.user.username);
        assert.equal(user.passwordHash, hash);
        if (original.driver) {
          const d = await Driver.findById(original.driver._id);
          assert.deepEqual(d.vehicle.toObject(), original.driver.vehicle);
          assert.equal(String(d.userId), String(original.user._id));
        }
      }
      for (const target of DEMO_ACCOUNTS.slice(2, 5))
        assert.equal((await User.findById(target.id)).egpWallet, undefined);
      assert.equal(
        await WalletTransaction.countDocuments({ type: "demo_initialization" }),
        2,
      );
      assert.equal(
        await WalletTransaction.countDocuments({
          ref: `${DEMO_OPERATION}:${DEMO_ACCOUNTS[0].id}`,
        }),
        1,
      );
      await assert.rejects(
        DemoWalletInitialization.updateOne(
          { _id: DEMO_OPERATION },
          { $set: { actorName: "changed" } },
        ),
        /immutable/,
      );
      assert.equal((await (await post()).json()).replayed, true);
      assert.equal(
        await WalletTransaction.countDocuments({ type: "demo_initialization" }),
        2,
      );
      const legacy = await (
        await request(`/api/admin/users/${rider._id}/wallet`, cookies.admin)
      ).json();
      assert.deepEqual(legacy.legacyRecord.wallet, {
        balance: 100,
        currency: "USD",
      });
    },
  );
  await check(
    "existing demo rider and driver complete an automatically assigned EGP ride with untouched USD funds",
    async () => {
      // End the synthetic blocker and restore other fixtures after this flow so
      // its artificial demand/supply cannot alter later surge-pricing tests.
      await Ride.updateMany(
        { driverId: DEMO_ACCOUNTS[4].id, status: "searching" },
        { $set: { status: "cancelled" } },
      );
      const previousDrivers = await Driver.find({
        userId: { $ne: DEMO_ACCOUNTS[1].id },
      })
        .select("isOnline")
        .lean();
      await Driver.updateMany(
        { userId: { $ne: DEMO_ACCOUNTS[1].id } },
        { $set: { isOnline: false } },
      );
      try {
        const rider = await demoLogin({ base, username: "rider1", password }),
          driver = await demoLogin({ base, username: "driver1", password });
        const result = await runDemoRide({ base, rider, driver });
        assert.equal(result.stage, "completed");
        assert.equal(result.fare.currency, "EGP");
        const before = (await rider.json("/api/wallet")).wallet.balance;
        assert.equal((await (await post()).json()).replayed, true);
        assert.equal((await rider.json("/api/wallet")).wallet.balance, before);
      } finally {
        for (const driver of previousDrivers)
          await Driver.updateOne(
            { _id: driver._id },
            { $set: { isOnline: driver.isOnline } },
          );
      }
    },
  );
}
