import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { io } from "socket.io-client";
export async function mapBrowserChecks({
  makeRide,
  base,
  cookies,
  driver,
  Driver,
  redis,
  request,
  start,
  stop,
}) {
  const write = (section, value, revision) =>
    request("/api/admin/settings/platform", cookies.admin, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ section, value, revision }),
    });
  for (const role of ["rider", "driver"])
    assert.equal(
      (await request("/api/admin/drivers/live", cookies[role])).status,
      403,
    );
  assert.equal((await request("/api/admin/drivers/live")).status, 401);
  const initial = await (
    await request("/api/admin/settings/platform", cookies.admin)
  ).json();
  const maps = initial.settings.maps;
  let revision = initial.records.find((r) => r._id === "maps")?.revision || 0;
  assert.equal(
    (await write("maps", { ...maps, basemapProvider: "carto" }, revision))
      .status,
    400,
    "Unconfigured CARTO cannot be saved",
  );
  assert.equal(
    (
      await write(
        "maps",
        { ...maps, governorate: "Alexandria", city: "Cairo" },
        revision,
      )
    ).status,
    400,
  );
  assert.equal(
    (await write("maps", { ...maps, locationRefreshSeconds: 5, autoFitDrivers: false }, revision))
      .status,
    200,
  );
  revision++;
  await Driver.updateOne(
    { _id: driver._id },
    { $set: { isOnline: true, isApproved: true, currentRideId: null } },
  );
  const { token } = await (
    await request("/api/auth/socket-token", cookies.driver)
  ).json();
  const socket = io(base + "/driver", {
    auth: { token },
    transports: ["websocket"],
    reconnection: false,
  });
  await new Promise((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("connect_error", reject);
  });
  let livePosition={lat:30.0444,lng:31.2357};
  socket.emit("driver:location", livePosition);
  const gpsTimer=setInterval(()=>{if(socket.connected)socket.emit("driver:location",livePosition);},5000);
  await expect
    .poll(async () => {
      const d = await (
        await request("/api/admin/drivers/live", cookies.admin)
      ).json();
      return d.drivers?.length;
    })
    .toBe(1);
  console.log("MAP QA: authorized live snapshot passed");
  const browser = await chromium.launch({ headless: true, args:["--use-angle=swiftshader","--enable-unsafe-swiftshader"] });
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
    page.setDefaultTimeout(30000);page.setDefaultNavigationTimeout(45000);
    const errors = [];
    page.on("pageerror", (e) => { errors.push(e.message);console.log("MAP JS ERROR",e.message); });
    const requests = [];


    page.on("request", (r) => {if(!requests.some(u=>new URL(u).hostname===new URL(r.url()).hostname))console.log("MAP HOST",new URL(r.url()).hostname);requests.push(r.url());});
    console.log("MAP QA: loading real basemap");
    await page.goto(base + "/admin/dashboard",{waitUntil:"domcontentloaded"});
    await expect(page.locator(".map-frame")).toHaveAttribute(
      "data-map-state",
      "ready",
      { timeout: 60000 },
    ).catch(async e=>{console.log("MAP STATE",await page.locator(".map-notice").allTextContents());console.log("MAP REQUEST HOSTS",[...new Set(requests.map(u=>new URL(u).hostname))]);await page.screenshot({path:".cache/maps-failure.png"});throw e;});
    assert.ok(
      requests.some((u) => u.includes("tiles.openfreemap.org/styles/liberty")),
    );
    assert.ok(
      !requests.some((u) => u.includes("cartocdn.com")),
      "No unconfigured CARTO request",
    );
    const marker = page.getByRole("button", {
      name: "Driver QA driver",
      exact: true,
    });
    await expect(marker).toBeVisible();
    const before = await marker.getAttribute("style");
    livePosition={lat:30.0454,lng:31.2377};
    socket.emit("driver:location", livePosition);
    // Keep the camera fixed: auto-fit can hold a moving driver at the same screen pixel.
    // A throttled GPS sample may wait for the five-second heartbeat plus animation.
    await expect.poll(() => marker.getAttribute("style"), { timeout: 12000 }).not.toBe(before);
    await marker.click();
    await expect(page.locator(".map-driver-popup")).toContainText("QA-ONLY");
    await expect(page.locator(".map-driver-popup")).toContainText(
      "Last GPS update",
    );
    await page.screenshot({
      path: "docs/qa/maps-admin-live-desktop.png",
      fullPage: true,
    });
    clearInterval(gpsTimer);socket.disconnect();
    await expect(marker).toHaveCount(0, { timeout: 10000 });
    await expect(
      page.getByText("No drivers online", { exact: true }),
    ).toBeVisible();
    // Stale stored positions cannot reappear through the initial snapshot.
    await redis.set(`h3:driver:cell:${driver._id}`, "qa-stale", "EX", 30);
    await redis.hset(`driver:loc:${driver._id}`, {
      lat: "30.0444",
      lng: "31.2357",
      ts: String(Date.now() - 120000),
      flushed: "1",
    });
    assert.equal(
      (await (await request("/api/admin/drivers/live", cookies.admin)).json())
        .drivers.length,
      0,
    );
    await redis.del(`h3:driver:cell:${driver._id}`, `driver:loc:${driver._id}`);
    await Driver.updateOne({ _id: driver._id }, { $set: { isOnline: false } });
    await page.goto(base + "/admin/settings",{waitUntil:"domcontentloaded"});
    const nav = page.getByRole("navigation", { name: "Settings sections" });
    await nav
      .getByRole("button", { name: "Maps & Service Zones", exact: true })
      .click();
    await page
      .getByLabel("Governorate", { exact: true })
      .selectOption("Alexandria");
    await expect(page.getByLabel("City", { exact: true })).toHaveValue(
      "Alexandria",
    );
    await page.getByLabel("Map style", { exact: true }).selectOption("light");
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(page.locator(".settings-save-confirmation")).toContainText(
      "Settings saved successfully",
    );
    await expect(page.locator(".settings-save-confirmation")).toContainText(
      "تم حفظ الإعدادات بنجاح",
    );
    await expect(
      page.locator(".settings-save-confirmation time"),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Save changes", exact: true }),
    ).toHaveCount(0);
    await page.screenshot({
      path: "docs/qa/maps-settings-desktop.png",
      fullPage: true,
    });
    await page.reload();
    await nav
      .getByRole("button", { name: "Maps & Service Zones", exact: true })
      .click();
    await expect(page.getByLabel("City", { exact: true })).toHaveValue(
      "Alexandria",
    );
    const config = await (
      await request("/api/maps/config", cookies.admin)
    ).json();
    assert.deepEqual(config.center, { lat: 31.2001, lng: 29.9187 });
    assert.equal(config.settings.mapStyle, "light");
    await page.goto(base + "/admin/dashboard");
    await expect(page.locator(".map-frame")).toHaveAttribute(
      "data-map-state",
      "ready",
      { timeout: 60000 },
    );
    assert.ok(requests.some((u) => u.includes("/styles/positron")));
    // A real failed style request exposes fallback, never a successful map state.
    await page.route("https://tiles.openfreemap.org/styles/positron", (route) =>
      route.abort(),
    );
    await page.reload();
    await expect(page.locator(".map-frame")).toHaveAttribute(
      "data-map-state",
      "error",
      { timeout: 40000 },
    );
    await page
      .getByRole("button", { name: "Use OpenFreeMap Standard" })
      .click();
    await expect(page.locator(".map-frame")).toHaveAttribute(
      "data-map-state",
      "ready",
      { timeout: 60000 },
    );
    await page.unroute("https://tiles.openfreemap.org/styles/positron");
    await page.goto(base + "/admin/settings");
    await nav
      .getByRole("button", { name: "Maps & Service Zones", exact: true })
      .click();
    await page.getByLabel("Map style", { exact: true }).selectOption("dark");
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(page.locator(".settings-save-confirmation")).toBeVisible();
    await page.goto(base + "/admin/dashboard");
    await expect(page.locator(".map-frame")).toHaveAttribute(
      "data-map-state",
      "ready",
      { timeout: 60000 },
    );
    assert.ok(requests.some((u) => u.includes("/styles/dark")));
    await page.goto(base + "/admin/settings");
    await nav
      .getByRole("button", { name: "Maps & Service Zones", exact: true })
      .click();
    await page.getByLabel("Governorate", { exact: true }).selectOption("Cairo");
    await page
      .getByLabel("Map style", { exact: true })
      .selectOption("standard");
    await page.route("**/api/admin/settings/platform", (route) =>
      route.request().method() === "PUT"
        ? route.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({ error: "Save unavailable. Please retry." }),
          })
        : route.continue(),
    );
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(
      page.getByText("Save unavailable. Please retry.", { exact: true }),
    ).toBeVisible();
    await expect(page.locator(".settings-save-confirmation")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Discard", exact: true }),
    ).toBeVisible();
    await page.unroute("**/api/admin/settings/platform");
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(page.locator(".settings-save-confirmation")).toBeVisible();
    for (const width of [768, 390, 360]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      await page.screenshot({
        path: `docs/qa/maps-settings-${width}.png`,
        fullPage: true,
      });
    }
    await page.goto(base + "/admin/dashboard");
    await expect(page.locator(".map-frame")).toHaveAttribute(
      "data-map-state",
      "ready",
      { timeout: 60000 },
    );
    await page.screenshot({
      path: "docs/qa/maps-admin-mobile.png",
      fullPage: true,
    });
    for(const [id,label,value] of [['fleet','Maximum trips in 24 hours (0 = unlimited)','99'],['dispatch','Driver search radius (km)','13'],['security','Session duration for new logins (hours)','718']]){
      await page.goto(base+'/admin/settings',{waitUntil:'domcontentloaded'});await page.getByLabel('Settings section',{exact:true}).selectOption(id);
      await page.getByLabel(label,{exact:true}).fill(value);await page.getByRole('button',{name:'Save changes',exact:true}).click();
      await expect(page.locator('.settings-save-confirmation:visible')).toContainText('Settings saved successfully');
    }
    await page.goto(base+'/admin/settings',{waitUntil:'domcontentloaded'});await page.getByLabel('Settings section',{exact:true}).selectOption('notifications');
    await page.getByRole('textbox',{name:'booking created',exact:true}).fill('Your booking is ready.');await page.getByRole('button',{name:'Save changes',exact:true}).click();await expect(page.locator('.settings-save-confirmation:visible')).toBeVisible();
    await page.goto(base+'/admin/settings',{waitUntil:'domcontentloaded'});await page.getByLabel('Settings section',{exact:true}).selectOption('integrations');await page.getByRole('button',{name:/Configure/}).first().click();await page.getByLabel('Provider display name',{exact:true}).fill('QA email channel');await page.getByRole('button',{name:'Save changes',exact:true}).click();await expect(page.locator('.settings-save-confirmation:visible')).toBeVisible();
    await stop();
    await start();
    const restarted = await (
      await request("/api/maps/config", cookies.admin)
    ).json();
    assert.equal(restarted.settings.city, "Cairo");
    assert.equal(restarted.settings.mapStyle, "standard");
    const routeRide=await makeRide("EGP","in_progress");
    routeRide.route={distanceMeters:1500,durationSeconds:300,geometry:[[31,30],[31.05,30.07],[31.1,30.1]]};await routeRide.save();
    await Driver.updateOne({_id:driver._id},{$set:{currentRideId:routeRide._id}});
    for (const [role, path] of [
      ["rider", "/dashboard"],
      ["driver", "/driver/dashboard"],
    ]) {
      const c = await browser.newContext({
        viewport: { width: 390, height: 844 },
        geolocation: { latitude: 30.0444, longitude: 31.2357 },
        permissions: ["geolocation"],
      });
      await c.addCookies(
        cookies[role]
          .split("; ")
          .filter(Boolean)
          .map((pair) => ({
            name: pair.split("=")[0],
            value: pair.slice(pair.indexOf("=") + 1),
            url: base,
          })),
      );
      const p = await c.newPage();
      await p.goto(base + path);
      await expect(p.locator(".map-frame")).toHaveAttribute(
        "data-map-state",
        "ready",
        { timeout: 60000 },
      );
      await p.screenshot({
        path: `docs/qa/maps-${role}-mobile.png`,
        fullPage: true,
      });
      if(role==='rider'){
        await p.goto(base+'/rides/'+routeRide._id,{waitUntil:'domcontentloaded'});
        await expect(p.locator('.map-frame')).toHaveAttribute('data-map-state','ready',{timeout:60000});
        await expect(p.locator('.marker-pin.pickup')).toBeVisible();await expect(p.locator('.marker-pin.dropoff')).toBeVisible();
        await p.screenshot({path:'docs/qa/maps-rider-route.png',fullPage:true});
      }
      await c.close();
    }
    assert.deepEqual(errors, []);
  } finally {
    clearInterval(gpsTimer);
    socket.disconnect();
    await browser.close();
  }
}
