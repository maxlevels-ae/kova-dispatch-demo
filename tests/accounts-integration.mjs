import { cityCenter } from '../src/lib/map-config.js';
import { createRide, cancelRide } from '../src/lib/services/ride-service.js';
import { getSettings } from '../src/lib/settings.js';
import redis from '../src/lib/db/redis.js';
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chromium, expect } from "@playwright/test";
export async function accountsChecks({
  request,
  cookies,
  User,
  Driver,
  WalletTransaction,
  check,
  password,
  base,
  completeRide,
  Ride,
}) {
  const send = (path, body, method = "POST", cookie = cookies.admin) =>
    request(path, cookie, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  let riderId, driverId;
  const person = {
    name: "Managed Rider",
    username: "managed_rider",
    email: "",
    phone: "",
    role: "rider",
    password,
  };
  await check(
    "admin account creation, linked driver transaction, editing and access restrictions",
    async () => {
      assert.equal(
        (await send("/api/admin/users", person, "POST", cookies.rider)).status,
        403,
      );
      const created = await send("/api/admin/users", person);
      assert.equal(created.status, 201, await created.clone().text());
      riderId = (await created.json()).id;
      const d = await send("/api/admin/users", {
        ...person,
        role: "driver",
        name: "Managed Driver",
        username: "managed_driver",
      });
      assert.equal(d.status, 201);
      driverId = (await d.json()).id;
      assert.equal(await Driver.countDocuments({ userId: driverId }), 1);
      assert.equal(
        (await send("/api/admin/users", { ...person, role: "driver" })).status,
        409,
      );
      assert.equal(await Driver.countDocuments({ userId: riderId }), 0);
      const edited = await send(
        `/api/admin/users/${riderId}`,
        {
          name: "Edited Rider",
          username: person.username,
          phone: "",
          email: "",
          isActive: true,
        },
        "PATCH",
      );
      assert.equal(edited.status, 200, await edited.text());
      const details = await (
        await request(`/api/admin/users/${riderId}`, cookies.admin)
      ).json();
      assert.equal(details.user.name, "Edited Rider");
      assert.equal("passwordHash" in details.user, false);
      const driverEdit = {
        name: "Managed Driver",
        username: "managed_driver",
        phone: "",
        email: "",
        isActive: true,
        driver: {
          vehicle: {
            make: "Toyota",
            model: "Corolla",
            color: "Black",
            plate: "QA-ADMIN",
            year: 2024,
            type: "economy",
          },
          license: { number: "QA123", expiry: "2028-01-01", verified: true },
          documents: [
            {
              type: "license",
              url: "https://example.com/licence.pdf",
              verified: true,
            },
          ],
          isApproved: true,
          suspensionReason: "",
        },
      };
      assert.equal(
        (await send(`/api/admin/users/${driverId}`, driverEdit, "PATCH"))
          .status,
        200,
      );
      assert.equal(
        (await Driver.findOne({ userId: driverId })).vehicle.plate,
        "QA-ADMIN",
      );
      driverEdit.driver.isApproved = false;
      driverEdit.driver.suspensionReason = "QA suspension";
      assert.equal(
        (await send(`/api/admin/users/${driverId}`, driverEdit, "PATCH"))
          .status,
        200,
      );
      assert.equal(
        (await Driver.findOne({ userId: driverId })).isApproved,
        false,
      );
      driverEdit.driver.isApproved = true;
      assert.equal(
        (await send(`/api/admin/users/${driverId}`, driverEdit, "PATCH"))
          .status,
        200,
      );
    },
  );
  await check(
    "wallet atomic credit/debit, duplicate protection, audit and currency separation",
    async () => {
      await User.updateOne(
        { _id: riderId },
        { $set: { wallet: { currency: "USD", balance: 53.25 } } },
      );
      const payload = {
        currency: "EGP",
        direction: "credit",
        amount: 100,
        reason: "Integration funding",
        reference: "QA",
        idempotencyKey: randomUUID(),
        confirmed: true,
      };
      const url = `/api/admin/users/${riderId}/wallet`;
      assert.equal(
        (await send(url, payload, "POST", cookies.driver)).status,
        403,
      );
      assert.equal(
        (
          await request(url, "", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          })
        ).status,
        401,
      );
      assert.equal(
        (
          await request(url, cookies.admin, {
            method: "POST",
            headers: {
              origin: "https://evil.example",
              "content-type": "application/json",
            },
            body: JSON.stringify(payload),
          })
        ).status,
        403,
      );
      const responses = await Promise.all([
        send(url, payload),
        send(url, payload),
      ]);
      for (const r of responses) assert.equal(r.status, 200, await r.text());
      assert.equal(
        await WalletTransaction.countDocuments({
          ref: `admin:${payload.idempotencyKey}`,
        }),
        1,
      );
      assert.equal((await send(url, { ...payload, amount: 101 })).status, 409);
      assert.equal(
        (
          await send(url, {
            ...payload,
            direction: "debit",
            amount: 200,
            idempotencyKey: randomUUID(),
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await send(url, {
            ...payload,
            amount: 1.001,
            idempotencyKey: randomUUID(),
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await send(url, {
            ...payload,
            balanceAfter: 10000,
            idempotencyKey: randomUUID(),
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await send(url, {
            ...payload,
            direction: "debit",
            amount: 10.01,
            idempotencyKey: randomUUID(),
          })
        ).status,
        200,
      );
      const user = await User.findById(riderId).lean();
      assert.equal(user.wallet.balance, 53.25);
      assert.equal(user.wallet.currency, "USD");
      assert.equal(user.egpWallet.balance, 89.99);
      const data = await (await request(url, cookies.admin)).json();
      assert.equal(data.accounts.length, 2);
      assert.ok(
        data.transactions.every(
          (t) => t.actorId && t.actorName && t.reason && t.currency === "EGP",
        ),
      );
      await assert.rejects(
        WalletTransaction.updateOne(
          { userId: riderId },
          { $set: { amount: 99 } },
        ),
        /immutable/,
      );
    },
  );
  await check(
    "EGP settlement uses separate accounts and leaves legacy USD balances untouched",
    async () => {
      await User.updateOne(
        { _id: driverId },
        { $set: { wallet: { currency: "USD", balance: 72 } } },
      );
      const profile = await Driver.findOne({ userId: driverId });
      const ride = await Ride.create({
        riderId,
        driverId,
        driverProfileId: profile._id,
        status: "in_progress",
        startedAt: new Date(Date.now() - 60000),
        vehicleType: "economy",
        pickup: {
          address: "Cairo",
          location: { type: "Point", coordinates: [31.23, 30.04] },
        },
        dropoff: {
          address: "Giza",
          location: { type: "Point", coordinates: [31.22, 30.03] },
        },
        fare: {
          currency: "EGP",
          total: 10.01,
          platformFee: 0.8,
          driverEarnings: 9.21,
        },
        payment: { method: "wallet", status: "pending" },
        pin: "1234",
      });
      await completeRide({ rideId: ride._id, driverUserId: driverId });
      const r = await User.findById(riderId),
        d = await User.findById(driverId);
      assert.equal(r.wallet.balance, 53.25);
      assert.equal(r.egpWallet.balance, 79.98);
      assert.equal(d.wallet.balance, 72);
      assert.equal(d.egpWallet.balance, 9.21);
    },
  );
  await check('EGP booking from a legacy USD user and inactive account rejection', async()=>{
    assert.equal((await send(`/api/admin/users/${riderId}/wallet`,{currency:'EGP',direction:'credit',amount:500,reason:'Funding isolated booking regression',reference:'QA booking',idempotencyKey:randomUUID(),confirmed:true})).status,200);
    const settings=await getSettings();
    const pickup={...cityCenter(settings.maps),address:'QA Cairo pickup'};
    const booked=await createRide({riderId,pickup,dropoff:{lat:pickup.lat+0.005,lng:pickup.lng+0.005,address:'QA Cairo destination'},vehicleType:'economy'});
    assert.equal(booked.fare.currency,'EGP');
    await cancelRide({rideId:booked._id,userId:riderId,role:'rider',reason:'QA booking verification'});
    assert.equal((await User.findById(riderId)).wallet.balance,53.25);
    const rider=await User.findOne({username:'qa_rider'});
    const data={name:rider.name,username:rider.username,email:'',phone:'',isActive:false};
    assert.equal((await send(`/api/admin/users/${rider._id}`,data,'PATCH')).status,200);
    assert.equal((await request('/api/wallet',cookies.rider)).status,403);
    assert.equal((await send(`/api/admin/users/${rider._id}`,{...data,isActive:true},'PATCH')).status,200);
    assert.equal((await request('/api/wallet',cookies.rider)).status,200);
  });
  await check("account browser workflows and responsive layouts", async () => {
    process.env.PLAYWRIGHT_BROWSERS_PATH ||= "D:\\Kova\\.cache\\playwright";
    const browser = await chromium.launch({
      headless: true,
      args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    });
    try {
      const context = await browser.newContext();
      await context.addCookies(
        cookies.admin
          .split("; ")
          .map((v) => ({
            name: v.slice(0, v.indexOf("=")),
            value: v.slice(v.indexOf("=") + 1),
            url: base,
          })),
      );
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(base + `/admin/users/${riderId}`);
      await page.getByLabel("Full name", { exact: true }).fill("Browser Rider");
      await page
        .getByRole("button", { name: "Save changes", exact: true })
        .click();
      await expect(
        page
          .locator(".account-saved")
          .filter({ hasText: "Account saved successfully" }),
      ).toBeVisible();
      await page.reload();
      await expect(page.getByLabel("Full name", { exact: true })).toHaveValue(
        "Browser Rider",
      );
      await page.getByRole("button", { name: "Wallet", exact: true }).click();
      await page.getByLabel("Amount", { exact: true }).fill("1");
      await page
        .getByLabel("Reason", { exact: true })
        .fill("Browser adjustment");
      await page.getByRole("button", { name: "Review adjustment" }).click();
      await page.getByRole("button", { name: "Confirm and post" }).click();
      await expect(
        page
          .locator(".account-saved")
          .filter({ hasText: "Wallet adjustment posted successfully" }),
      ).toBeVisible();
      await page.waitForTimeout(5000);
      for (const width of [1440, 768, 390, 360]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.evaluate(()=>window.scrollTo(0,0));
        await page.screenshot({
          path: `docs/qa/accounts-wallet-${width}.png`,
          fullPage: true,
        });
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          `wallet overflow at ${width}`,
        );
      }
      await page.goto(base + "/admin/drivers");
      await expect(
        page.getByRole("link", { name: /Managed Driver/ }),
      ).toBeVisible();
      await page.getByRole("link", { name: /Managed Driver/ }).click();
      await page.getByRole("button", { name: "Vehicle", exact: true }).click();
      await expect(page.getByLabel("Make", { exact: true })).toHaveValue(
        "Toyota",
      );
      await page.screenshot({
        path: "docs/qa/accounts-driver-360.png",
        fullPage: true,
      });
      await page.goto(base + "/admin/profile");
      await expect(page.getByLabel("Full name", { exact: true })).toBeVisible();
      await page.screenshot({
        path: "docs/qa/accounts-profile-360.png",
        fullPage: true,
      });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  });
  await check(
    "admin profile, password validation, current-password check and session invalidation",
    async () => {
      assert.equal(
        (
          await send(
            "/api/admin/profile",
            { name: "QA admin", username: "qa_admin", phone: "", email: "" },
            "PATCH",
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await send("/api/admin/profile", {
            currentPassword: "wrong",
            newPassword: password + "new",
            confirmation: password + "new",
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await send("/api/admin/profile", {
            currentPassword: password,
            newPassword: password + "new",
            confirmation: "mismatch",
          })
        ).status,
        400,
      );
      for(let i=0;i<3;i++) assert.equal((await send('/api/admin/profile',{currentPassword:'wrong',newPassword:password+'new',confirmation:password+'new'})).status,400);
      assert.equal((await send('/api/admin/profile',{currentPassword:password,newPassword:password+'new',confirmation:password+'new'})).status,429);
      // Reset only this disposable fixture's limiter to test successful rotation.
      const admin=await User.findOne({username:'qa_admin'});await redis.del(`password-change:${admin._id}`);
      assert.equal(
        (
          await send("/api/admin/profile", {
            currentPassword: password,
            newPassword: password + "new",
            confirmation: password + "new",
          })
        ).status,
        200,
      );
      assert.equal(
        (await request("/api/admin/profile", cookies.admin)).status,
        403,
      );
      assert.equal(
        (await request("/api/admin/users", cookies.admin)).status,
        403,
      );
    },
  );
}
