import test from "node:test";
import assert from "node:assert/strict";
import {
  defaults,
  schemas,
  bookingPolicy,
} from "../src/lib/settings-schema.js";
import {
  providerSchema,
  providerReadiness,
} from "../src/lib/provider-config.js";
for (const [section, value] of Object.entries(defaults))
  test(`${section}: strict defaults and unknown-field rejection`, () => {
    assert.deepEqual(schemas[section].parse(value), value);
    assert.equal(
      schemas[section].safeParse({ ...value, untrusted: true }).success,
      false,
    );
  });
test("dispatch limits cannot exceed claim lock lifetime or permit invalid hours", () => {
  for (const patch of [
    { acceptanceSeconds: Infinity },
    { acceptanceSeconds: 26 },
    { maxAttempts: 9 },
    { searchRadiusKm: 0 },
    { serviceStartHour: 22, serviceEndHour: 3 },
  ])
    assert.equal(
      schemas.dispatch.safeParse({ ...defaults.dispatch, ...patch }).success,
      false,
    );
});
test("geofence includes boundary and checks pickup and dropoff independently", () => {
  const settings = structuredClone(defaults);
  settings.maps.restrictPickup = true;
  settings.maps.restrictDropoff = true;
  const inside = { lat: 30, lng: 31 },
    outside = { lat: 10, lng: 10 };
  assert.equal(bookingPolicy(settings, inside, inside, "economy"), null);
  assert.match(bookingPolicy(settings, outside, inside, "economy"), /Pickup/);
  assert.match(bookingPolicy(settings, inside, outside, "economy"), /Dropoff/);
  settings.fleet.enabledCategories = ["xl"];
  assert.match(bookingPolicy(settings, inside, inside, "economy"), /category/);
});
test("fleet policy cannot relax historical driver debt limit", () => {
  assert.equal(
    schemas.fleet.safeParse({ ...defaults.fleet, maxDebtEGP: 26 }).success,
    false,
  );
  assert.equal(
    schemas.fleet.safeParse({ ...defaults.fleet, enabledCategories: [] })
      .success,
    false,
  );
});
test("providers never expose managed secrets or become active through configuration", () => {
  const secret = "must-not-escape";
  const readiness = providerReadiness("paymob", { PAYMOB_API_KEY: secret });
  assert.equal(readiness.active, false);
  assert.ok(!JSON.stringify(readiness).includes(secret));
  const config = {
    name: "Paymob",
    active: false,
    mode: "sandbox",
    accountId: "test",
    currency: "EGP",
    methods: ["card"],
    webhookUrl: "",
  };
  assert.equal(providerSchema.safeParse(config).success, true);
  for (const patch of [
    { active: true },
    { currency: "USD" },
    { webhookUrl: "http://localhost" },
    { apiKey: secret },
  ])
    assert.equal(
      providerSchema.safeParse({ ...config, ...patch }).success,
      false,
    );
});

import { readSettingsJSON } from "../src/lib/settings-http.js";
test("settings request reader bounds streams and rejects malformed data", async () => {
  const req = (body) =>
    new Request("https://example.test", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body,
    });
  assert.deepEqual(await readSettingsJSON(req('{"ok":true}')), { ok: true });
  await assert.rejects(readSettingsJSON(req("bad")), (e) => e.status === 400);
  await assert.rejects(
    readSettingsJSON(req("x".repeat(30)), 20),
    (e) => e.status === 413,
  );
  await assert.rejects(
    readSettingsJSON(
      new Request("https://example.test", { method: "PUT", body: "{}" }),
    ),
    (e) => e.status === 415,
  );
});

import { validSettingsOrigin } from "../src/lib/settings-origin.js";
test("settings origin trusts configured HTTPS origins behind Render, never forwarded headers", () => {
  const publicOrigin = "https://kova-dispatch-demo.onrender.com";
  const env = { NODE_ENV: "production", RENDER_EXTERNAL_URL: publicOrigin };
  const req = (origin, extra = {}) =>
    new Request("http://internal-render:10000/api/admin/settings", {
      headers: { ...(origin ? { origin } : {}), ...extra },
    });
  assert.equal(validSettingsOrigin(req(publicOrigin), env), true);
  for (const origin of [
    null,
    "null",
    "https://evil.test",
    publicOrigin + ".evil.test",
    "http://kova-dispatch-demo.onrender.com",
    publicOrigin + "/",
  ])
    assert.equal(validSettingsOrigin(req(origin), env), false);
  assert.equal(
    validSettingsOrigin(
      req("https://evil.test", {
        "x-forwarded-host": "evil.test",
        "x-forwarded-proto": "https",
        host: "evil.test",
      }),
      env,
    ),
    false,
  );
  assert.equal(
    validSettingsOrigin(
      req(publicOrigin, { "sec-fetch-site": "cross-site" }),
      env,
    ),
    false,
  );
  assert.equal(
    validSettingsOrigin(req(publicOrigin), { NODE_ENV: "production" }),
    false,
  );
  assert.equal(
    validSettingsOrigin(req(publicOrigin), {
      NODE_ENV: "production",
      AUTH_URL: publicOrigin,
    }),
    true,
  );
  assert.equal(
    validSettingsOrigin(
      new Request("http://localhost:3000", {
        headers: { origin: "http://localhost:3000" },
      }),
      { NODE_ENV: "development" },
    ),
    true,
  );
});
