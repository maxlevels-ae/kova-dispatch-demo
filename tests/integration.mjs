import {journeyFixture} from './ride-safety-fixture.mjs';
import { spawn } from "node:child_process";
import {createWriteStream} from 'node:fs';
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import sharp from "sharp";
import { io } from "socket.io-client";
// Hardcoded disposable localhost endpoints: this script cannot target production.
const dbName = `maxride_qa_${Date.now()}`;
process.env.MONGODB_URI = `mongodb://127.0.0.1:27028/${dbName}?replicaSet=rs0&directConnection=true`;
process.env.REDIS_URL = "redis://127.0.0.1:6389";
process.env.NODE_ENV = "production";
process.env.DEMO_WALLET_INITIALIZATION_TEST = "true";
const { default: mongoose } = await import("mongoose");
const { default: connectDB } = await import("../src/lib/db/mongodb.js");
const { default: User } = await import("../src/lib/db/models/User.js");
const { default: Driver } = await import("../src/lib/db/models/Driver.js");
const { default: Ride } = await import("../src/lib/db/models/Ride.js");
const { default: Payment } = await import("../src/lib/db/models/Payment.js");
const { default: WalletTransaction } =
  await import("../src/lib/db/models/WalletTransaction.js");
const { default: redis } = await import("../src/lib/db/redis.js");
const { completeRide, cancelRide } =
  await import("../src/lib/services/ride-service.js");
const { creditCheckoutSession } = await import("../src/lib/services/stripe.js");
const { calculateFare } =
  await import("../src/lib/services/fare-calculator.js");
const { default: PricingRule } =
  await import("../src/lib/db/models/PricingRule.js");
const { default: EgpPricingRule } =
  await import("../src/lib/db/models/EgpPricingRule.js");
const base = "http://localhost:3188";
const secret = randomBytes(32).toString("hex");
const password = randomBytes(24).toString("hex");
let server;
let passed = 0;
async function check(label, fn) {
  await fn();
  passed++;
  console.log(`PASS ${label}`);
}
function request(path, cookie = "", options = {}) {
  return fetch(base + path, {
    redirect: "manual",
    ...options,
    headers: { cookie, origin: base, connection: "close", ...options.headers },
  });
}
async function start() {
  server = spawn(process.execPath, ["server.js"], {
    env: {
      ...process.env,
      PORT: "3188",
      HOSTNAME: "localhost",
      BIND_HOST: "127.0.0.1",
      NEXT_PUBLIC_APP_URL: base,
      AUTH_SECRET: secret,
      NEXTAUTH_SECRET: secret,
      AUTH_URL: base,
      NEXTAUTH_URL: base,
      SETTINGS_PUBLIC_ORIGINS: "https://kova-dispatch-demo.onrender.com",
    },
    stdio: ['ignore','pipe','pipe'],
    windowsHide: true,
  });
  const log=createWriteStream('.cache/notification-test-server.log');
  server.stdout.pipe(log);server.stderr.pipe(log);
  for (let i = 0; i < 60; i++) {
    try {
      if ((await request("/login")).status === 200) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("Server did not start");
}
async function stop() {
  if (!server || server.exitCode !== null) return;
  await new Promise((resolve) => {
    server.once("exit", resolve);
    server.kill();
  });
}
function cookieHeader(response, previous = "") {
  const map = new Map(
    previous
      .split("; ")
      .filter(Boolean)
      .map((v) => [v.split("=")[0], v.slice(v.indexOf("=") + 1)]),
  );
  for (const raw of response.headers.getSetCookie()) {
    const pair = raw.split(";")[0];
    map.set(pair.split("=")[0], pair.slice(pair.indexOf("=") + 1));
  }
  return [...map].map(([k, v]) => `${k}=${v}`).join("; ");
}
async function login(role, loginPassword=password) {
  const csrf = await request("/api/auth/csrf");
  const cookies = cookieHeader(csrf);
  const { csrfToken } = await csrf.json();
  const response = await request("/api/auth/callback/credentials", cookies, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "X-Auth-Return-Redirect": "1",
    },
    body: new URLSearchParams({
      username: `qa_${role}`,
      password:loginPassword,
      csrfToken,
      callbackUrl: base + "/dashboard",
    }),
  });
  assert.equal(response.status, 200);
  const signed = cookieHeader(response, cookies);
  const session = await (await request("/api/auth/session", signed)).json();
  assert.equal(session.user?.role, role);
  return signed;
}
async function logo(color) {
  return (
    "data:image/png;base64," +
    (
      await sharp({
        create: { width: 32, height: 24, channels: 3, background: color },
      })
        .png()
        .toBuffer()
    ).toString("base64")
  );
}
async function putBranding(cookie, body) {
  return request("/api/admin/settings", cookie, {
    method: "PUT",
    headers: { origin: base, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
let users;
let driver;
async function makeRide(currency = "EGP", status = "in_progress") {
  const fixture=await Ride.create({
    riderId: users.rider._id,
    driverId: users.driver._id,
    driverProfileId: driver._id,
    status,
    pickup: {
      address: "QA pickup",
      location: { type: "Point", coordinates: [31, 30] },
    },
    dropoff: {
      address: "QA dropoff",
      location: { type: "Point", coordinates: [31.1, 30.1] },
    },
    fare: { currency, total: 10.01, platformFee: 0.8, driverEarnings: 9.21 },
    startedAt: new Date(Date.now() - 600000),
  });
  if(status==="in_progress")await journeyFixture(fixture._id);
  return fixture;
}
try {
  await connectDB();
  await redis.ping();
  await Promise.all([
    User.init(),
    Driver.init(),
    Ride.init(),
    Payment.init(),
    WalletTransaction.init(),
    PricingRule.init(),
  ]);
  users = {};
  const passwordHash = await bcrypt.hash(password, 4);
  for (const role of ["admin", "driver", "rider"])
    users[role] = await User.create({
      username: `qa_${role}`,
      name: `QA ${role}`,
      role,
      passwordHash,
      wallet: { currency: "EGP", balance: 1000 },
    });
  driver = await Driver.create({
    userId: users.driver._id,
    isApproved: true,
    vehicle: { plate: "QA-ONLY" },
  });
  await start();
  const cookies = {};
  for (const [role, dashboard] of [
    ["admin", "/admin/dashboard"],
    ["driver", "/driver/dashboard"],
    ["rider", "/dashboard"],
  ])
    await check(
      `real ${role} password login and dashboard redirect`,
      async () => {
        cookies[role] = await login(role);
        const response = await request("/login", cookies[role]);
        assert.equal(
          new URL(response.headers.get("location"), base).pathname,
          dashboard,
        );
        assert.equal((await request(dashboard, cookies[role])).status, 200);
      },
    );
  if (!process.argv.includes("--maps-only") && !process.argv.includes("--accounts-only") && !process.argv.includes("--demo-only") && !process.argv.includes('--delivery-only') && !process.argv.includes('--notifications-only') && !process.argv.includes('--areas-only') && !process.argv.includes('--account-management-only') && !process.argv.includes('--safety-only') && !process.argv.includes('--audio-only') && !process.argv.includes('--contacts-only')) {
  await check(
    "custom server health reports MongoDB, Redis and Socket.IO up",
    async () => {
      const response = await request("/api/health");
      assert.equal(response.status, 200);
      assert.deepEqual((await response.json()).checks, {
        mongo: "up",
        redis: "up",
        socket: "up",
      });
    },
  );
  for (const role of ["admin", "driver", "rider"])
    await check(
      `${role} authenticates to its Socket.IO namespace`,
      async () => {
        const { token } = await (
          await request("/api/auth/socket-token", cookies[role])
        ).json();
        const socket = io(base + "/" + role, {
          auth: { token },
          transports: ["websocket"],
          reconnection: false,
          timeout: 10000,
        });
        try {
          await new Promise((resolve, reject) => {
            socket.once("connect", resolve);
            socket.once("connect_error", reject);
          });
        } finally {
          socket.disconnect();
        }
      },
    );
  await check("rider cannot connect to admin Socket.IO namespace", async () => {
    const { token } = await (
      await request("/api/auth/socket-token", cookies.rider)
    ).json();
    const socket = io(base + "/admin", {
      auth: { token },
      transports: ["websocket"],
      reconnection: false,
      timeout: 10000,
    });
    try {
      await assert.rejects(
        new Promise((resolve, reject) => {
          socket.once("connect", resolve);
          socket.once("connect_error", reject);
        }),
        /Wrong namespace/,
      );
    } finally {
      socket.disconnect();
    }
  });
  await check(
    "ride socket membership fails closed when Redis authorization lookup fails",
    async () => {
      const sockets = {};
      const unknownRide = String(new mongoose.Types.ObjectId());
      let leaked = false;
      await Driver.updateOne({_id:driver._id},{$set:{isOnline:true}});
      try {
        for (const role of ["rider", "driver", "admin"]) {
          const { token } = await (
            await request("/api/auth/socket-token", cookies[role])
          ).json();
          const socket = io(base + "/" + role, {
            auth: { token },
            transports: ["websocket"],
            reconnection: false,
            timeout: 10000,
          });
          sockets[role] = socket;
          await new Promise((resolve, reject) => {
            socket.once("connect", resolve);
            socket.once("connect_error", reject);
          });
        }
        // Fault only the disposable localhost Redis membership command. No mock API.
        await redis.acl("SETUSER", "default", "-sismember");
        await assert.rejects(
          redis.sismember("qa-membership-probe", "nobody"),
          /NOPERM/,
        );
        sockets.rider.on("driver:location", (data) => {
          if (data.rideId === unknownRide) leaked = true;
        });
        sockets.rider.emit("ride:subscribe", { rideId: unknownRide });
        await new Promise((resolve) => setTimeout(resolve, 250));
        const processed = new Promise((resolve, reject) => {
          const timer = setTimeout(
            () => reject(new Error("GPS relay did not process the fault test")),
            10000,
          );
          sockets.admin.once("driver:location", () => {
            clearTimeout(timer);
            resolve();
          });
        });
        sockets.driver.emit("driver:location", {
          lat: 30,
          lng: 31,
          rideId: unknownRide,
        });
        await processed;
        let persisted;
        for (let attempt = 0; attempt < 30; attempt++) {
          persisted = await Driver.findById(driver._id).lean();
          if (persisted.location.coordinates[1] === 30 && Date.now() - new Date(persisted.lastLocationUpdate).getTime() < 30000) break;
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        assert.equal(persisted.location.coordinates[1], 30, 'Socket GPS must reach MongoDB for dispatch readiness');
        assert.ok(Date.now() - new Date(persisted.lastLocationUpdate).getTime() < 30000, 'GPS persistence must preserve the real sample timestamp');
        await new Promise((resolve) => setTimeout(resolve, 100));
        assert.equal(
          leaked,
          false,
          "Redis failure must never grant membership to an unknown ride",
        );
      } finally {
        await redis.acl("SETUSER", "default", "+sismember");
        await Driver.updateOne({_id:driver._id},{$set:{isOnline:false}});
        for (const socket of Object.values(sockets)) socket.disconnect();
      }
    },
  );
  await check(
    "driver online/offline API remains functional with EGP wallet",
    async () => {
      const online = await request("/api/drivers/me/status", cookies.driver, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ online: true, location: { lat: 30, lng: 31 } }),
      });
      assert.equal(online.status, 200);
      assert.equal((await Driver.findById(driver._id)).isOnline, true);
      const offline = await request("/api/drivers/me/status", cookies.driver, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ online: false }),
      });
      assert.equal(offline.status, 200);
      assert.equal((await Driver.findById(driver._id)).isOnline, false);
    },
  );
  await check(
    "rider and driver cannot write branding with real sessions",
    async () => {
      for (const role of ["rider", "driver"])
        assert.equal(
          (
            await putBranding(cookies[role], {
              name: "Bad",
              logo: null,
              loginLogo: null,
            })
          ).status,
          403,
        );
    },
  );
  await check("session update cannot escalate rider role", async () => {
    const csrf = await request("/api/auth/csrf", cookies.rider);
    const c = cookieHeader(csrf, cookies.rider);
    const { csrfToken } = await csrf.json();
    const updated = await request("/api/auth/session", c, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ csrfToken, data: { role: "admin" } }),
    });
    const session = await updated.json();
    assert.equal(session.user.role, "rider");
  });
  await check(
    "authenticated admin mutations reject cross-origin, invalid images and oversized payloads",
    async () => {
      const write = (body, origin = base) =>
        request("/api/admin/settings", cookies.admin, {
          method: "PUT",
          headers: { origin, "content-type": "application/json" },
          body,
        });
      assert.equal((await write("{}", "https://evil.test")).status, 403);
      assert.equal(
        (
          await write(
            JSON.stringify({
              name: "QA",
              logo: "data:image/svg+xml;base64,PHN2Zz4=",
              loginLogo: null,
            }),
          )
        ).status,
        400,
      );
      assert.equal((await write(" ".repeat(740000))).status, 413);
    },
  );
  await check("default branding is returned from empty database", async () =>
    assert.deepEqual(await (await request("/api/branding")).json(), {
      name: "Maxride",
      logo: null,
      loginLogo: null,
    }),
  );
  let saved;
  await check("admin upload is persisted and publicly readable", async () => {
    const response = await putBranding(cookies.admin, {
      name: "QA Maxride",
      logo: await logo("red"),
      loginLogo: await logo("blue"),
    });
    assert.equal(response.status, 200);
    saved = await response.json();
    assert.match(saved.logo, /^data:image\/webp;base64,/);
    const stored = await mongoose.connection.db
      .collection("brandings")
      .findOne({ _id: "public" });
    assert.equal(stored.logo, saved.logo);
    assert.deepEqual(await (await request("/api/branding")).json(), saved);
  });
  await stop();
  await start();
  await check("branding persists after application restart", async () =>
    assert.deepEqual(await (await request("/api/branding")).json(), saved),
  );
  await check(
    "logo replacement and remove/default restoration persist",
    async () => {
      const response = await putBranding(cookies.admin, {
        name: "QA replacement",
        logo: await logo("green"),
        loginLogo: null,
      });
      assert.equal(response.status, 200);
      assert.notEqual((await response.json()).logo, saved.logo);
      assert.equal(
        (
          await putBranding(cookies.admin, {
            name: "Maxride",
            logo: null,
            loginLogo: null,
          })
        ).status,
        200,
      );
      assert.deepEqual(await (await request("/api/branding")).json(), {
        name: "Maxride",
        logo: null,
        loginLogo: null,
      });
    },
  );
  await check(
    "EGP tariffs ignore legacy pricing without modifying it",
    async () => {
      await PricingRule.collection.insertOne({
        vehicleType: "economy",
        city: "default",
        isActive: true,
        baseFare: 999,
        perKmRate: 999,
      });
      const fare = await calculateFare({
        distanceMeters: 1000,
        durationSeconds: 600,
        surgeMultiplier: 1,
      });
      assert.equal(fare.currency, "EGP");
      assert.equal(fare.total, 45);
      assert.equal(fare.driverEarnings + fare.platformFee, fare.total);
      const old = await PricingRule.collection.findOne({
        vehicleType: "economy",
      });
      assert.equal(old.currency, undefined);
      assert.equal(old.baseFare, 999);
    },
  );
  await check(
    "concurrent completion settles wallets and ledger exactly once",
    async () => {
      const ride = await makeRide();
      const results = await Promise.allSettled(
        [1, 2].map(() =>
          completeRide({ rideId: ride._id, driverUserId: users.driver._id }),
        ),
      );
      assert.equal(
        results.filter((r) => r.status === "fulfilled").length,
        2,
        results
          .filter((r) => r.status === "rejected")
          .map((r) => r.reason.message)
          .join("; "),
      );
      assert.equal(
        (await User.findById(users.rider._id).lean()).wallet.balance,
        989.99,
      );
      assert.equal(
        (await User.findById(users.driver._id).lean()).wallet.balance,
        1009.21,
      );
      const entries = await WalletTransaction.find({ rideId: ride._id }).lean();
      assert.equal(entries.length, 2);
      assert.ok(entries.every((e) => e.currency === "EGP"));
      assert.equal(
        await Payment.countDocuments({ rideId: ride._id, currency: "EGP" }),
        1,
      );
    },
  );
  await check(
    "currency mismatch rolls back status and all wallet changes",
    async () => {
      const ride = await makeRide("USD");
      await assert.rejects(
        completeRide({ rideId: ride._id, driverUserId: users.driver._id }),
        /currency review/,
      );
      assert.equal((await Ride.findById(ride._id)).status, "in_progress");
      assert.equal(
        await WalletTransaction.countDocuments({ rideId: ride._id }),
        0,
      );
    },
  );
  await check(
    "concurrent cancellation charges once with matching EGP metadata",
    async () => {
      const ride = await makeRide("EGP", "arrived");
      const before = (await User.findById(users.rider._id)).wallet.balance;
      const results = await Promise.allSettled(
        [1, 2].map(() =>
          cancelRide({
            rideId: ride._id,
            userId: users.rider._id,
            role: "rider",
          }),
        ),
      );
      assert.equal(
        results.filter((r) => r.status === "fulfilled").length,
        1,
        results
          .filter((r) => r.status === "rejected")
          .map((r) => r.reason.message)
          .join("; "),
      );
      assert.equal(
        (await User.findById(users.rider._id)).wallet.balance,
        Math.round((before - 30) * 100) / 100,
      );
      assert.equal(
        await WalletTransaction.countDocuments({ rideId: ride._id }),
        2,
      );
      assert.equal(
        await Payment.countDocuments({
          rideId: ride._id,
          "metadata.kind": "cancellation",
        }),
        1,
      );
    },
  );
  await check(
    "duplicate Stripe deliveries credit once and never mix currencies",
    async () => {
      const session = {
        id: "qa_checkout_1",
        payment_status: "paid",
        currency: "egp",
        amount_total: 1001,
        metadata: { userId: String(users.rider._id) },
      };
      const before = (await User.findById(users.rider._id)).wallet.balance;
      const results = await Promise.all([
        creditCheckoutSession(session),
        creditCheckoutSession(session),
      ]);
      assert.equal(results.filter((r) => r.credited).length, 1);
      assert.equal(
        (await User.findById(users.rider._id)).wallet.balance,
        Math.round((before + 10.01) * 100) / 100,
      );
      await assert.rejects(
        creditCheckoutSession({
          ...session,
          id: "qa_checkout_usd",
          currency: "usd",
        }),
        /currency/,
      );
    },
  );
  await check(
    "financial API summaries isolate EGP from historical USD",
    async () => {
      const legacy = await makeRide("USD", "completed");
      await Ride.updateOne({ _id: legacy._id }, { completedAt: new Date() });
      const overview = await (
        await request("/api/admin/overview", cookies.admin)
      ).json();
      assert.equal(overview.currency, "EGP");
      assert.equal(overview.revenueToday, 10.01);
      const earnings = await (
        await request("/api/drivers/me/earnings", cookies.driver)
      ).json();
      assert.equal(earnings.currency, "EGP");
      assert.equal(earnings.today.earnings, 9.21);
      assert.ok(earnings.recentRides.some((r) => r.fare.currency === "USD"));
    },
  );
  const savedPricing = [];
  let legacyPricing;
  await check(
    "all four EGP tariffs save and update alongside unchanged legacy rules",
    async () => {
      for (const vehicleType of ["comfort", "premium", "xl"])
        await PricingRule.collection.insertOne({
          vehicleType,
          city: "default",
          isActive: true,
          baseFare: 999,
          perKmRate: 999,
        });
      legacyPricing = await PricingRule.collection
        .find({})
        .sort({ vehicleType: 1 })
        .toArray();
      assert.deepEqual(
        (await (await request("/api/admin/pricing", cookies.admin)).json())
          .rules,
        [],
      );
      for (const [index, vehicleType] of [
        "economy",
        "comfort",
        "premium",
        "xl",
      ].entries()) {
        const payload = {
          vehicleType,
          city: "default",
          baseFare: 30 + index,
          perKmRate: 9,
          perMinRate: 2,
          minimumFare: 40,
          bookingFee: 6,
          platformCommission: 8,
          surgeMultiplierCap: 3,
        };
        for (const baseFare of [payload.baseFare - 1, payload.baseFare]) {
          const response = await request("/api/admin/pricing", cookies.admin, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ...payload, baseFare }),
          });
          assert.equal(response.status, 200);
          const { rule } = await response.json();
          assert.equal(rule.baseFare, baseFare);
          assert.equal(rule.currency, "EGP");
        }
        savedPricing.push(payload);
        const fare = await calculateFare({
          vehicleType,
          distanceMeters: 1000,
          durationSeconds: 600,
          surgeMultiplier: 1,
        });
        assert.equal(fare.total, payload.baseFare + 9 + 20 + 6);
      }
      assert.equal(EgpPricingRule.collection.name, "egppricingrules");
      assert.equal(await EgpPricingRule.countDocuments(), 4);
      assert.deepEqual(
        await PricingRule.collection
          .find({})
          .sort({ vehicleType: 1 })
          .toArray(),
        legacyPricing,
      );
    },
  );
  await stop();
  await start();
  await check(
    "saved EGP prices survive refresh and server restart and drive HTTP estimates",
    async () => {
      const response = await request("/api/admin/pricing", cookies.admin);
      assert.equal(response.status, 200);
      const { rules } = await response.json();
      assert.equal(rules.length, 4);
      const estimateResponse = await request(
        "/api/rides/estimate",
        cookies.rider,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            pickup: { lat: 30, lng: 31 },
            dropoff: { lat: 30.01, lng: 31.01 },
          }),
        },
      );
      assert.equal(estimateResponse.status, 200);
      const { estimates, route } = await estimateResponse.json();
      for (const payload of savedPricing) {
        const stored = rules.find(
          (rule) => rule.vehicleType === payload.vehicleType,
        );
        for (const [field, value] of Object.entries(payload))
          assert.equal(stored[field], value);
        const fare = estimates[payload.vehicleType];
        assert.equal(fare.baseFare, payload.baseFare);
        assert.equal(fare.currency, "EGP");
        assert.equal(
          fare.total,
          Math.round(
            (Math.max(
              (payload.baseFare +
                (route.distanceMeters / 1000) * payload.perKmRate +
                (route.durationSeconds / 60) * payload.perMinRate) *
                fare.surgeMultiplier,
              payload.minimumFare,
            ) +
              payload.bookingFee) *
              100,
          ) / 100,
        );
      }
      assert.deepEqual(
        await PricingRule.collection
          .find({})
          .sort({ vehicleType: 1 })
          .toArray(),
        legacyPricing,
      );
    },
  );
  await check(
    "settings authorization, persistence, revisions, provider lock and notification isolation",
    async () => {
      const { defaults: safeDefaults, events } =
        await import("../src/lib/settings-schema.js");
      const defaults = {
        ...safeDefaults,
        notifications: { ...safeDefaults.notifications, enabledEvents: events },
      };
      for (const role of ["rider", "driver"]) {
        assert.equal(
          (await request("/api/admin/settings/platform", cookies[role])).status,
          403,
        );
        assert.equal(
          (await request("/api/admin/settings/providers", cookies[role]))
            .status,
          403,
        );
      }
      const write = (section, value, revision = 0) =>
        request("/api/admin/settings/platform", cookies.admin, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ section, value, revision }),
        });
      for (const [section, value] of Object.entries(defaults))
        assert.equal((await write(section, value)).status, 200, section);
      assert.equal((await write("dispatch", defaults.dispatch)).status, 409);
      assert.equal(
        (await write("dispatch", { ...defaults.dispatch, maxAttempts: 99 }, 1))
          .status,
        400,
      );
      const persisted = await (
        await request("/api/admin/settings/platform", cookies.admin)
      ).json();
      assert.deepEqual(persisted.settings, defaults);
      assert.equal(
        persisted.records.find((r) => r._id === "dispatch").history.length,
        1,
      );
      const providers = await (
        await request("/api/admin/settings/providers", cookies.admin)
      ).json();
      const provider = providers.providers.find((p) => p.id === "paymob");
      assert.equal(provider.active, false);
      const providerPut = (value) =>
        request("/api/admin/settings/providers", cookies.admin, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: "paymob", value, revision: 0 }),
        });
      assert.equal(
        (await providerPut({ ...provider.value, active: true })).status,
        400,
      );
      assert.equal(
        (await providerPut({ ...provider.value, accountId: "qa-test" })).status,
        200,
      );
      assert.equal(
        (await request("/api/admin/settings/monitoring", cookies.admin)).status,
        200,
      );
      const notificationResponse = await request(
        "/api/notifications",
        cookies.rider,
      );
      assert.equal(notificationResponse.status, 200);
      const inbox = await notificationResponse.json();
      assert.ok(inbox.notifications.length > 0);
      assert.ok(
        inbox.notifications.every((n) => n.userId === String(users.rider._id)),
      );
      const count = inbox.notifications.length;
      assert.equal(
        (await (await request("/api/notifications", cookies.rider)).json())
          .notifications.length,
        count,
      );
      assert.equal(
        (
          await request("/api/notifications", cookies.rider, {
            method: "PATCH",
          })
        ).status,
        200,
      );
      assert.ok(
        (
          await (await request("/api/notifications", cookies.rider)).json()
        ).notifications.every((n) => n.readAt),
      );
      assert.equal(
        (
          await request("/api/notifications", cookies.rider, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ inApp: false }),
          })
        ).status,
        200,
      );
      assert.equal(
        (await (await request("/api/notifications", cookies.rider)).json())
          .preference,
        false,
      );
      assert.equal((await request('/api/notifications',cookies.rider,{
        method:'PUT',headers:{'content-type':'application/json'},
        body:JSON.stringify({inApp:inbox.preference}),
      })).status,200);
    },
  );
  await check(
    "production top-ups cannot mint funds when Stripe is disabled",
    async () => {
      const before = (await User.findById(users.rider._id)).wallet.balance;
      const response = await request("/api/wallet", cookies.rider, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amount: 100 }),
      });
      assert.equal(response.status, 409);
      assert.equal(
        (await User.findById(users.rider._id)).wallet.balance,
        before,
      );
    },
  );
  await check("new signup starts with an empty EGP wallet", async () => {
    const response = await request("/api/auth/signup", "", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "QA New Rider",
        username: "qa_new_rider",
        password,
        confirmPassword: password,
        role: "rider",
      }),
    });
    assert.equal(response.status, 201);
    const user = await User.findOne({ username: "qa_new_rider" }).lean();
    assert.equal(user.wallet.currency, "EGP");
    assert.equal(user.wallet.balance, 0);
  });
  await check(
    "booking policies and manual/scheduled dispatch preserve ride claims",
    async () => {
      const { defaults } = await import("../src/lib/settings-schema.js");
      const { createRide, acceptRide } =
        await import("../src/lib/services/ride-service.js");
      const { startDispatch } = await import("../src/lib/realtime/dispatch.js");
      const { default: Settings } =
        await import("../src/lib/db/models/PlatformSettings.js");
      const policyUser = await User.create({
        username: "qa_policy_rider",
        name: "Policy Rider",
        role: "rider",
        passwordHash: await bcrypt.hash(password, 10),
        wallet: { currency: "EGP", balance: 1000 },
      });
      const pickup = { address: "QA pickup", lat: 30, lng: 31 },
        dropoff = { address: "QA dropoff", lat: 30.02, lng: 31.02 };
      await Settings.updateOne(
        { _id: "fleet" },
        { $set: { value: { ...defaults.fleet, enabledCategories: ["xl"] } } },
      );
      await assert.rejects(
        createRide({
          riderId: policyUser._id,
          pickup,
          dropoff,
          vehicleType: "economy",
        }),
        /category/,
      );
      await Settings.updateOne(
        { _id: "fleet" },
        { $set: { value: defaults.fleet } },
      );
      await assert.rejects(
        createRide({
          riderId: policyUser._id,
          pickup,
          dropoff,
          vehicleType: "economy",
          scheduledAt: new Date(Date.now() + 3600000).toISOString(),
        }),
        /Scheduled/,
      );
      await Settings.updateOne(
        { _id: "dispatch" },
        {
          $set: {
            value: {
              ...defaults.dispatch,
              assignmentMode: "manual",
              scheduledEnabled: true,
            },
          },
        },
      );
      const scheduled = await createRide({
        riderId: policyUser._id,
        pickup,
        dropoff,
        vehicleType: "economy",
        scheduledAt: new Date(Date.now() + 3600000).toISOString(),
      });
      await startDispatch(String(scheduled._id));
      const stored = await Ride.findById(scheduled._id).lean();
      assert.equal(stored.status, "searching");
      assert.equal(stored.dispatch.offersSent, 0);
      await assert.rejects(
        acceptRide({ rideId: scheduled._id, driverUserId: users.driver._id }),
        /scheduled ride/,
      );
      await cancelRide({
        rideId: scheduled._id,
        userId: policyUser._id,
        role: "rider",
      });
      await Settings.updateOne(
        { _id: "dispatch" },
        { $set: { value: defaults.dispatch } },
      );
    },
  );
  await check(
    "all settings mutation routes accept configured production origin and reject hostile origins",
    async () => {
      for (const path of [
        "/api/admin/settings",
        "/api/admin/settings/platform",
        "/api/admin/settings/providers",
        "/api/admin/pricing",
      ]) {
        for (const origin of [
          "https://evil.test",
          "null",
          "https://kova-dispatch-demo.onrender.com.evil.test",
        ]) {
          const r = await request(path, cookies.admin, {
            method: "PUT",
            headers: {
              origin,
              "content-type": "application/json",
              "x-forwarded-host": "evil.test",
              "x-forwarded-proto": "https",
            },
            body: "{}",
          });
          assert.equal(r.status, 403, path);
        }
        const r = await request(path, cookies.admin, {
          method: "PUT",
          headers: {
            origin: "https://kova-dispatch-demo.onrender.com",
            "content-type": "application/json",
          },
          body: "{}",
        });
        assert.equal(
          r.status,
          400,
          path + " passes origin and reaches payload validation",
        );
      }
      const { providers } = await (
        await request("/api/admin/settings/providers", cookies.admin)
      ).json();
      for (const p of providers) {
        const value = { ...p.value, accountId: "qa-account" };
        const r = await request(
          "/api/admin/settings/providers",
          cookies.admin,
          {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ id: p.id, value, revision: p.revision }),
          },
        );
        assert.equal(r.status, 200);
      }
      const refreshed = await (
        await request("/api/admin/settings/providers", cookies.admin)
      ).json();
      assert.ok(
        refreshed.providers.every(
          (p) => p.value.accountId === "qa-account" && p.value.active === false,
        ),
      );
    },
  );
  await check(
    "all ten settings sections, draft retention, save/discard, validation and four responsive widths",
    async () => {
      process.env.PLAYWRIGHT_BROWSERS_PATH = new URL(
        "../.cache/playwright",
        import.meta.url,
      ).pathname.replace(/^\/(.:\/)/, "$1");
      const { chromium, expect } = await import("@playwright/test");
      const browser = await chromium.launch({ headless: true });
      try {
        const context = await browser.newContext({
          viewport: { width: 1440, height: 1000 },
        });
        await context.addCookies(
          cookies.admin
            .split("; ")
            .filter(Boolean)
            .map((pair) => ({
              name: pair.split("=")[0],
              value: pair.slice(pair.indexOf("=") + 1),
              url: base,
            })),
        );
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (e) => errors.push(e.message));
        await page.goto(base + "/admin/settings");
        const nav = page.getByRole("navigation", { name: "Settings sections" });
        await expect(nav.getByRole("button")).toHaveCount(11);
        await expect(nav.getByRole("button",{name:"Countries & Service Zones",exact:true})).toBeVisible();
        await nav.getByRole("button", { name: "Bookings & Dispatch" }).click();
        await page
          .getByLabel("Driver search radius (km)", { exact: true })
          .fill("12");
        await nav.getByRole("button", { name: "Drivers & Fleet" }).click();
        await nav.getByRole("button", { name: "Bookings & Dispatch" }).click();
        await expect(
          page.getByLabel("Driver search radius (km)", { exact: true }),
        ).toHaveValue("12");
        await page
          .getByRole("button", { name: "Save changes", exact: true })
          .click();
        await expect(page.locator(".settings-save-confirmation")).toBeVisible();
        await page.reload();
        await nav.getByRole("button", { name: "Bookings & Dispatch" }).click();
        await expect(
          page.getByLabel("Driver search radius (km)", { exact: true }),
        ).toHaveValue("12");
        await page
          .getByLabel("Driver search radius (km)", { exact: true })
          .fill("99");
        await page
          .getByRole("button", { name: "Save changes", exact: true })
          .click();
        await expect(
          page.getByLabel("Driver search radius (km)", { exact: true }),
        ).toHaveAttribute("aria-invalid", "true");
        await page
          .getByRole("button", { name: "Discard", exact: true })
          .click();
        await expect(
          page.getByLabel("Driver search radius (km)", { exact: true }),
        ).toHaveValue("12");
        const sections = {
          branding: "General & Branding",
          dispatch: "Bookings & Dispatch",
          fleet: "Drivers & Fleet",
          maps: "Maps & Appearance",
          payment: "Payment Gateways",
          pricing: "Pricing & Commission",
          notifications: "Notifications",
          integrations: "Integrations",
          security: "Users & Security",
          monitoring: "System & Monitoring",
        };
        for (const width of [1440, 768, 390, 360]) {
          await page.setViewportSize({ width, height: 1000 });
          for (const [id, title] of Object.entries(sections)) {
            if (width === 1440)
              await nav
                .getByRole("button", { name: title, exact: true })
                .click();
            else
              await page
                .getByLabel("Settings section", { exact: true })
                .selectOption(id);
            await expect(
              page.getByRole("heading", { name: title, exact: true }),
            ).toBeVisible();
            if (id === "payment" || id === "integrations")
              await expect(
                page.getByRole("button", { name: /Configure/ }),
              ).toHaveCount(id === "payment" ? 3 : 4);
            if (id === "branding")
              await expect(
                page.getByLabel("Company / brand display name"),
              ).toBeVisible();
            if (id === "pricing")
              await expect(
                page.getByLabel("Service tier", { exact: true }),
              ).toBeVisible();
            if (id === "monitoring")
              await expect(
                page.getByRole("heading", { name: "MongoDB", exact: true }),
              ).toBeVisible();
            assert.ok(
              await page.evaluate(
                () =>
                  document.documentElement.scrollWidth <= window.innerWidth + 1,
              ),
              title + " overflow at " + width,
            );
            if (["branding", "dispatch", "payment", "monitoring"].includes(id))
              await page.screenshot({
                path: "docs/qa/settings-" + id + "-" + width + ".png",
                fullPage: true,
              });
          }
        }
        await page
          .getByLabel("Settings section", { exact: true })
          .selectOption("payment");
        await expect(
          page.getByRole("button", { name: /Configure/ }),
        ).toHaveCount(3);
        await page
          .getByRole("button", { name: /Configure/ })
          .first()
          .click();
        await expect(
          page.getByRole("heading", {
            name: "Credentials status",
            exact: true,
          }),
        ).toBeVisible();
        await page
          .getByLabel("Merchant / account ID", { exact: true })
          .fill("browser-qa");
        await page
          .getByRole("button", { name: "Save changes", exact: true })
          .click();
        await expect(page.locator(".settings-save-confirmation")).toBeVisible();
        await page.screenshot({
          path: "docs/qa/settings-provider-360.png",
          fullPage: true,
        });
        await page.reload();
        await page
          .getByLabel("Settings section", { exact: true })
          .selectOption("payment");
        await page
          .getByRole("button", { name: /Configure/ })
          .first()
          .click();
        await expect(
          page.getByLabel("Merchant / account ID", { exact: true }),
        ).toHaveValue("browser-qa");
        await page
          .getByLabel("Settings section", { exact: true })
          .selectOption("branding");
        await page
          .getByLabel("Company / brand display name")
          .fill("Maxride QA");
        await page
          .getByRole("button", { name: "Save changes", exact: true })
          .click();
        await expect(page.locator(".settings-save-confirmation")).toBeVisible();
        await page.reload();
        await expect(
          page.getByLabel("Company / brand display name"),
        ).toHaveValue("Maxride QA");
        await page
          .getByLabel("Settings section", { exact: true })
          .selectOption("pricing");
        await page.getByLabel("Base fare (EGP)", { exact: true }).fill("24");
        await page
          .getByRole("button", { name: "Save changes", exact: true })
          .click();
        await expect(page.locator(".settings-save-confirmation")).toBeVisible();
        await page.reload();
        await page
          .getByLabel("Settings section", { exact: true })
          .selectOption("pricing");
        await expect(
          page.getByLabel("Base fare (EGP)", { exact: true }),
        ).toHaveValue("24");
        await page.getByLabel("Base fare (EGP)", { exact: true }).fill("25");
        await page.screenshot({
          path: "docs/qa/settings-savebar-360.png",
          fullPage: true,
        });
        await page
          .getByRole("button", { name: "Discard", exact: true })
          .click();
        assert.deepEqual(errors, []);
      } finally {
        await browser.close();
      }
    },
  );
  }
  if (!process.argv.includes("--accounts-only") && !process.argv.includes("--demo-only") && !process.argv.includes('--delivery-only') && !process.argv.includes('--notifications-only') && !process.argv.includes('--areas-only') && !process.argv.includes('--account-management-only') && !process.argv.includes('--safety-only') && !process.argv.includes('--audio-only') && !process.argv.includes('--contacts-only')) await check(
    "real basemaps, dependent map settings, save feedback and authorized live driver tracking",
    async () => {
      const { mapBrowserChecks } = await import("./maps-browser.mjs");
      await mapBrowserChecks({
        makeRide,
        base,
        cookies,
        driver,
        Driver,
        redis,
        request,
        start,
        stop,
      });
    },
  );
  if (!process.argv.includes('--maps-only') && !process.argv.includes('--accounts-only') && !process.argv.includes('--delivery-only') && !process.argv.includes('--notifications-only') && !process.argv.includes('--areas-only') && !process.argv.includes('--account-management-only') && !process.argv.includes('--safety-only') && !process.argv.includes('--audio-only') && !process.argv.includes('--contacts-only')) {
    const {demoWalletChecks}=await import('./demo-wallet-integration.mjs');
    await demoWalletChecks({request,cookies,User,Driver,Ride,Payment,WalletTransaction,password,base,check});
  }
  if (!process.argv.includes('--maps-only') && !process.argv.includes('--demo-only') && !process.argv.includes('--delivery-only') && !process.argv.includes('--notifications-only') && !process.argv.includes('--areas-only') && !process.argv.includes('--account-management-only') && !process.argv.includes('--safety-only') && !process.argv.includes('--audio-only') && !process.argv.includes('--contacts-only')) {
    const {notificationChecks}=await import('./ride-notifications.mjs');
    await notificationChecks({base,request,cookies,User,Driver,Ride,password,check});
    const {deliveryChecks}=await import('./delivery-integration.mjs');
    await deliveryChecks({base,request,cookies,User,Driver,Ride,WalletTransaction,password,check,start,stop});
    const {accountsChecks}=await import('./accounts-integration.mjs');
    await accountsChecks({request,cookies,User,Driver,WalletTransaction,check,password,base,completeRide,Ride});
    // The password-rotation regression deliberately expires the old session.
    cookies.admin=await login('admin',password+'new');
  }
  if(process.argv.includes('--notifications-only')){const {notificationChecks}=await import('./ride-notifications.mjs');await notificationChecks({base,request,cookies,User,Driver,Ride,password,check});}
  if(process.argv.includes('--delivery-only')){const {deliveryChecks}=await import('./delivery-integration.mjs');await deliveryChecks({base,request,cookies,User,Driver,Ride,WalletTransaction,password,check,start,stop});}
  if(process.argv.includes('--account-management-only')){const {accountsChecks}=await import('./accounts-integration.mjs');await accountsChecks({request,cookies,User,Driver,WalletTransaction,check,password,base,completeRide,Ride});}
  if(process.argv.includes('--areas-only')||!process.argv.some(v=>v.endsWith('-only'))){const {operatingChecks}=await import('./operating-integration.mjs');await operatingChecks({base,request,cookies,User,Driver,Ride,WalletTransaction,password,check,start,stop});}
  if(process.argv.includes('--contacts-only')||!process.argv.some(v=>v.endsWith('-only'))){const {contactChecks}=await import('./contact-integration.mjs');await contactChecks({base,User,password,check});}
  if(process.argv.includes('--audio-only')||!process.argv.some(v=>v.endsWith('-only'))){const {audioHydrationChecks}=await import('./audio-hydration.mjs');await audioHydrationChecks({base,cookies,check});}
  if(process.argv.includes('--safety-only')||!process.argv.some(v=>v.endsWith('-only'))){const {safetyChecks}=await import('./ride-safety-integration.mjs');await safetyChecks({base,request,cookies,User,Driver,Ride,WalletTransaction,check});}
  console.log(
    `${passed} database/API integration checks passed; only disposable database ${dbName} was written.`,
  );
} catch (error) {
  console.error("Integration failed:", error.stack);
  process.exitCode = 1;
} finally {
  await stop();
  redis.disconnect();
  await mongoose.disconnect();
}
