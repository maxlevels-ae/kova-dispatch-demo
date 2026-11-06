import test from "node:test";
import assert from "node:assert/strict";
import { arabicMapStyle } from "../src/lib/map-labels.js";
import { createExpression } from "@maplibre/maplibre-gl-style-spec";
test("map labels prefer Arabic, retain original names, and preserve route shields", () => {
  const field = ["coalesce", ["get", "name_en"], ["get", "name"]];
  const style = {version:8, sources:{}, layers:[
    {id:"street",type:"symbol",layout:{"text-field":field,"text-font":["Noto Sans Regular"]}},
    {id:"shield",type:"symbol",layout:{"text-field":["get","ref"]}},
  ]};
  const result=arabicMapStyle(null,style);
  const compiled=createExpression(result.layers[0].layout["text-field"], 'layers[0].layout.text-field');
  assert.equal(compiled.result,"success");
  const evaluate=properties=>compiled.value.evaluate({}, {properties});
  assert.equal(evaluate({"name:ar":"شارع التحرير",name:"Tahrir"}),"شارع التحرير");
  assert.equal(evaluate({"name:ar":"",name:"شارع الهرم"}),"شارع الهرم");
  assert.equal(evaluate({name_en:"Original English"}),"Original English");
  assert.equal(evaluate({name:"شارع التحرير / Tahrir 12"}),"شارع التحرير / Tahrir 12");
  assert.deepEqual(result.layers[1],style.layers[1]);
  assert.deepEqual(style.layers[0].layout["text-field"],field);
  assert.deepEqual(result.layers[0].layout["text-font"],["Noto Sans Regular"]);
});
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

import {
  egyptLocations,
  cityCenter,
  mapDefaults,
  basemapStyle,
} from "../src/lib/map-config.js";
test("map catalogue validates dependent cities, backward-compatible defaults and supported controls", () => {
  assert.equal(Object.keys(egyptLocations).length, 27);
  assert.deepEqual(cityCenter(mapDefaults), { lat: 30.0444, lng: 31.2357 });
  assert.equal(
    basemapStyle("openfreemap", "standard"),
    "https://tiles.openfreemap.org/styles/liberty",
  );
  for (const mapStyle of ["standard", "light", "dark"])
    assert.equal(
      schemas.maps.safeParse({ ...defaults.maps, mapStyle }).success,
      true,
    );
  for (const patch of [
    { governorate: "Alexandria", city: "Cairo" },
    { country: "US" },
    { basemapProvider: "unknown" },
    { initialZoom: 100 },
    { locationRefreshSeconds: 1 },
    { driverStatusFilter: "offline" },
    { vehicleCategoryFilter: "unknown" },
  ])
    assert.equal(
      schemas.maps.safeParse({ ...defaults.maps, ...patch }).success,
      false,
    );
  const old = {
    routingMode: "osrm",
    city: "Cairo",
    country: "Egypt",
    south: 22,
    north: 32,
    west: 25,
    east: 37,
    restrictPickup: false,
    restrictDropoff: false,
  };
  assert.equal(schemas.maps.parse(old).basemapProvider, "openfreemap");
  for (const [governorate, cities] of Object.entries(egyptLocations))
    for (const city of Object.keys(cities))
      assert.equal(
        schemas.maps.safeParse({ ...defaults.maps, governorate, city }).success,
        true,
      );
});

import {emptyRiderContent,riderContentSchema,visibleRiderContent,contentImages} from '../src/lib/rider-content-policy.js';
test('rider content validates bilingual published items and forbids arbitrary image URLs',()=>{
 const draft=emptyRiderContent();assert.ok(riderContentSchema.safeParse(draft).success);
 const hero={id:'00000000-0000-4000-8000-000000000001',active:true,archived:false,image:'/api/rider-content/media/123456789012345678901234',headlineEn:'Ride',headlineAr:'رحلة',subtitleEn:'',subtitleAr:'',action:'ride'};
 assert.ok(riderContentSchema.safeParse({...draft,heroes:[hero]}).success);
 for(const patch of [{image:'https://evil.test/track'},{headlineAr:''},{action:'javascript:alert(1)'}])assert.equal(riderContentSchema.safeParse({...draft,heroes:[{...hero,...patch}]}).success,false);
 assert.equal(riderContentSchema.safeParse({...draft,heroes:[hero,hero]}).success,false);
});
test('customer content excludes archived/inactive items and deduplicates media references',()=>{
 const value={...emptyRiderContent(),loginImage:'/api/rider-content/media/123456789012345678901234',heroes:[{active:true,archived:false,image:'/api/rider-content/media/123456789012345678901234'},{active:false,archived:false},{active:true,archived:true}]};
 assert.equal(visibleRiderContent(value).heroes.length,1);assert.equal(contentImages(value).length,1);
});

test('Jordanian landmark catalog contains twelve stable bilingual inactive drafts with source coordinates',async()=>{
 const {jordanLandmarkDrafts}=await import('../src/lib/jordan-landmarks.js');
 assert.equal(jordanLandmarkDrafts.length,12);assert.equal(new Set(jordanLandmarkDrafts.map(x=>x.id)).size,12);
 assert.ok(riderContentSchema.safeParse({...emptyRiderContent(),destinations:jordanLandmarkDrafts}).success);
 for(const row of jordanLandmarkDrafts){assert.ok(row.nameEn&&row.nameAr&&row.descriptionEn&&row.descriptionAr&&row.regionEn&&row.cityEn);assert.equal(row.active,false);assert.equal(row.image,'');assert.match(row.sourceUrl,/^https:\/\//);assert.ok(row.lat>29&&row.lat<34&&row.lng>34&&row.lng<40);}
 assert.equal(visibleRiderContent({...emptyRiderContent(),destinations:jordanLandmarkDrafts}).destinations.length,0);
});

test('place normalization supports Arabic variants, aliases and stable nearby saved-place ranking',async()=>{
 const {normalizePlaceName,expandedPlaceQuery,matchesPlace,rankPlaces}=await import('../src/lib/place-search.js');
 assert.equal(normalizePlaceName('الصُّوَيْفِيَّة'),'الصويفيه');assert.equal(expandedPlaceQuery('الصويفية'),'Sweifieh');assert.equal(expandedPlaceQuery('وادي رم'),'Wadi Rum');assert.ok(matchesPlace('Pet','Petra','البتراء'));
 const rows=rankPlaces([{name:'remote',lat:32,lng:36},{name:'saved',lat:32.2,lng:36.2,priority:0},{name:'near',lat:31.95,lng:35.91},{name:'duplicate',lat:31.95,lng:35.91},{name:'invalid',lat:91,lng:0}],{lat:31.95,lng:35.91});assert.deepEqual(rows.map(x=>x.name),['saved','near','remote']);
});
