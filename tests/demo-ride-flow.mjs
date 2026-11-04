import assert from "node:assert/strict";
import { io } from "socket.io-client";
export async function demoLogin({ base, username, password }) {
  const jar = new Map();
  const request = async (path, options = {}) => {
    const response = await fetch(base + path, {
      redirect: "manual",
      signal: AbortSignal.timeout(30000),
      ...options,
      headers: {
        cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
        origin: base,
        ...options.headers,
      },
    });
    for (const raw of response.headers.getSetCookie()) {
      const pair = raw.split(";")[0];
      jar.set(
        pair.slice(0, pair.indexOf("=")),
        pair.slice(pair.indexOf("=") + 1),
      );
    }
    return response;
  };
  const csrf = await (await request("/api/auth/csrf")).json();
  await request("/api/auth/callback/credentials", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "X-Auth-Return-Redirect": "1",
    },
    body: new URLSearchParams({
      username,
      password,
      csrfToken: csrf.csrfToken,
      callbackUrl: base + "/dashboard",
    }),
  });
  const session = await (await request("/api/auth/session")).json();
  assert.equal(
    session.user?.username,
    username,
    "Existing demo credentials must still work",
  );
  const json = async (path, body) => {
    const response = await request(
      path,
      body === undefined
        ? {}
        : {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          },
    );
    const raw = await response.text();
    assert.ok(raw, `${path}: empty HTTP ${response.status} response`);
    const data = JSON.parse(raw);
    assert.ok(response.ok, `${path}: ${response.status} ${data.error || ""}`);
    return data;
  };
  return {
    request,
    json,
    session,
    cookies: () => [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
  };
}
export async function runDemoRide({
  base,
  rider,
  driver,
  onProgress = () => {},
}) {
  const beforeRider = await rider.json("/api/wallet"),
    beforeDriver = await driver.json("/api/wallet");
  assert.equal(beforeRider.wallet.currency, "EGP");
  assert.equal(beforeDriver.wallet.currency, "EGP");
  const active = await rider.json("/api/rides/active");
  assert.equal(
    active.ride,
    null,
    "Do not create a second demo ride while another is active",
  );
  const { token } = await driver.json("/api/auth/socket-token");
  const socket = io(base + "/driver", {
    auth: { token },
    transports: ["websocket"],
    reconnection: false,
  });
  let timer, heartbeat, ride;
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Driver socket connection timed out")),
        15000,
      );
      socket.once("connect", () => {
        clearTimeout(timeout);
        resolve();
      });
      socket.once("connect_error", (e) => {
        clearTimeout(timeout);
        reject(e);
      });
    });
    const pickup = {
        lat: 30.0444,
        lng: 31.2357,
        address: "DEMO QA pickup — Cairo Tahrir Square",
      },
      dropoff = {
        lat: 30.05,
        lng: 31.24,
        address: "DEMO QA destination — Cairo",
      };
    await driver.json("/api/drivers/me/status", {
      online: true,
      location: pickup,
    });
    heartbeat = setInterval(() => socket.emit("driver:location", pickup), 4000);
    const offered = new Promise((resolve, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new Error("No automatic driver offer received within 45 seconds"),
          ),
        45000,
      );
      socket.once("ride:offer", resolve);
    });
    // Attach a handler immediately so a failed booking does not leave an unhandled timeout.
    offered.catch(() => {});
    ride = (
      await rider.json("/api/rides", {
        pickup,
        dropoff,
        vehicleType: "economy",
      })
    ).ride;
    assert.equal(ride.fare.currency, "EGP");
    onProgress({ stage: "booked", rideId: ride.id, fare: ride.fare });
    const offer = await offered;
    clearTimeout(timer);
    assert.equal(offer.rideId, ride.id);
    assert.equal(offer.currency, "EGP");
    onProgress({ stage: "assigned", rideId: ride.id });
    await driver.json(`/api/rides/${ride.id}/accept`, {});
    onProgress({ stage: "accepted", rideId: ride.id });
    await driver.json(`/api/rides/${ride.id}/arrive`, {});
    await driver.json(`/api/rides/${ride.id}/start`, { pin: ride.pin });
    onProgress({ stage: "in_progress", rideId: ride.id });
    socket.emit("driver:location", dropoff);
    const completed = (await driver.json(`/api/rides/${ride.id}/complete`, {}))
      .ride;
    assert.equal(completed.status, "completed");
    const afterRider = await rider.json("/api/wallet"),
      afterDriver = await driver.json("/api/wallet");
    const cents = (n) => Math.round(n * 100);
    assert.equal(
      cents(afterRider.wallet.balance),
      cents(beforeRider.wallet.balance) - cents(completed.fare.total),
    );
    assert.equal(
      cents(afterDriver.wallet.balance),
      cents(beforeDriver.wallet.balance) + cents(completed.fare.driverEarnings),
    );
    assert.deepEqual(
      afterRider.accounts.find((a) => a.currency === "USD"),
      beforeRider.accounts.find((a) => a.currency === "USD"),
    );
    assert.deepEqual(
      afterDriver.accounts.find((a) => a.currency === "USD"),
      beforeDriver.accounts.find((a) => a.currency === "USD"),
    );
    assert.ok(
      afterRider.transactions.some(
        (t) =>
          String(t.rideId) === ride.id &&
          t.type === "ride_payment" &&
          t.currency === "EGP",
      ),
    );
    assert.ok(
      afterDriver.transactions.some(
        (t) =>
          String(t.rideId) === ride.id &&
          t.type === "ride_earning" &&
          t.currency === "EGP",
      ),
    );
    const result = {
      stage: "completed",
      rideId: ride.id,
      fare: completed.fare,
      riderBalance: afterRider.wallet,
      driverBalance: afterDriver.wallet,
      legacyUSDUnchanged: true,
      simulatedGPS: true,
    };
    onProgress(result);
    return result;
  } finally {
    clearTimeout(timer);
    clearInterval(heartbeat);
    try {
      await driver.json("/api/drivers/me/status", { online: false });
    } finally {
      socket.disconnect();
    }
  }
}
