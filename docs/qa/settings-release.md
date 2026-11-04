# Maxride settings release — 2026-11-04

## Implemented surfaces

- General & Branding: existing validated raster upload and persistence preserved; save audit metadata added.
- Bookings & Dispatch: automatic/admin-initiated dispatch, manual fallback, radius, offer timeout, total attempt cap, scheduled booking window, trip distance and Cairo service hours. Manual dispatch uses the existing offer/accept flow; it does not force a driver to accept.
- Drivers & Fleet: existing four categories, verified-document requirements, rolling 24-hour trip limit, debt limit and optional suspension reasons. Approval stays admin-only; suspension preserves active trip settlement.
- Payment Gateways: provider registry and persisted inactive configurations for Paymob, Fawry and Stripe, managed-secret presence flags, mode, account, EGP currency, planned methods and webhook URL. Activation is rejected by the API.
- Notifications: editable event templates/triggers, persisted inbox, read state, per-user preference, idempotent jobs, retry backoff, delivery/failure logs and a background reconciler. Global triggers default off; tests explicitly enable them only in the disposable local database.
- Pricing & Commission: existing EGP rule editor with wider EGP validation bounds and configurable late cancellation fees. New rides snapshot the cancellation fee; existing EGP/USD bookings retain their previous fallback fees. No conversion or financial migration.
- Maps & Service Zones: operating city/country, rectangular pickup/dropoff boundaries and OSRM/estimate routing selection. Existing map rendering is preserved. OSRM endpoint stays managed server-side, avoiding arbitrary URL access.
- Users & Security: admin API authorization rechecks the database role and active flag; new-login session lifetime, revision conflicts, bounded request parsing and settings save history.
- Integrations: inactive managed-secret configuration for email, SMS, WhatsApp and push.
- System & Monitoring: MongoDB/Redis/Socket.IO state, build commit/version, notification queue/deliveries, transaction status grouped by currency and method, and dispatch/notification operational error codes.

## External integration gates and limits

No payment, payout or external-message adapter has been newly activated. Paymob/Fawry and external notification sending require provider-specific adapter implementation, account eligibility, credentials and verified sandbox flows. Saving an inactive plan is not proof of a working connection. Managed secret values are never included in API responses. The existing Stripe processing restrictions remain unchanged.

Official provider references: https://developers.paymob.com/ and https://developer.fawrystaging.com/ .

Audit history retains the most recent 100 saves per configuration record. Session lifetime changes apply to new logins. Notification timeline reconciliation covers the latest 50 rides for each affected user, scans changed rides/drivers in batches, and retries failed inbox writes up to five times. Terminal failures remain visible for operator review. Templates currently contain plain notification text.

The existing local staging configuration reports a missing CARTO basemap key. This is a pre-existing map asset configuration limitation, not a new routing provider integration. No production credentials were changed.

## Verification

- npm ci: passed (existing Node 20 / transitive Node >=22 engine warning).
- npm run lint: passed, 0 errors and 17 pre-existing warnings.
- npm test: 21 tests passed.
- npm run build: passed.
- npm audit --omit=dev: 0 vulnerabilities.
- npm run test:http: 19 checks passed, including fail-closed admin authorization without MongoDB.
- npm run test:integration: 30 checks passed; includes database/API persistence, roles, concurrent financial settlement, legacy USD preservation, settings conflicts, inactive providers, inbox isolation, scheduled/manual dispatch and desktop/mobile Chromium settings tests.
- npm run test:staging: 22 checks passed on the existing isolated local services, including a complete real browser ride, live GPS, PIN start and settlement.
- npm run test:staging-config: 9 tests passed.
- npm run validate:staging: passed against Render's official schema.

Initial external-network checks were denied by the execution sandbox. They passed after rerunning with network access. All database writes during verification used existing isolated localhost QA infrastructure; no production seeds or customer messages were sent.

## Settings UX refactor — 2026-11-04

Replaced wrapped tabs and database-key forms with a shared settings workspace. The existing Maxride admin sidebar remains intact. Company, Operations, Finance and Platform navigation contains all ten sections; mobile uses a labelled native selector. Shared layout, navigation, header, section, field, toggle, select, checkbox group, status, save bar and empty-state components use the existing neutral brand palette and Lucide icons.

Operational forms explicitly group supported fields. Branding separates identity, regional context, logos, preview and restoration. Pricing edits one EGP service tier at a time with separate fare, surge, commission and cancellation sections. Payment and notification providers use compact directories and individual configuration panels. Monitoring uses four compact service indicators, queue summaries and operational errors; raw diagnostic JSON is collapsed by default.

Drafts survive section/provider/tier navigation. Dirty markers, sticky Save/Discard controls, duplicate-submit locks, field validation and unload warnings protect edits. Managed credentials, inactive-provider enforcement, MongoDB persistence, revision checks and existing legacy currency protections are preserved. Location is edited under Maps; timezone and EGP remain platform constraints. External channels remain unconfigured; this release does not implement or activate external adapters.

All four settings mutation routes (branding, platform, providers and pricing) now use one origin validator. Only configured SETTINGS_PUBLIC_ORIGINS, NEXT_PUBLIC_APP_URL, AUTH_URL, NEXTAUTH_URL or RENDER_EXTERNAL_URL establish trust. HTTPS public origins work when the internal request URL is HTTP. Host and forwarded headers cannot add trusted origins. Missing/null/malicious origins and cross-site Fetch Metadata are rejected. Production without trusted configuration fails closed; localhost development is the only implicit fallback.

Executed verification: 22 unit tests; 19 HTTP smoke checks; 31 integration groups including MongoDB persistence/restart, every platform section, all provider configurations, all EGP tiers, authorization, revision conflicts, origin protection and browser tests at 360/390/768/1440. Browser checks cover all ten sections, draft retention, validation, discard and persisted branding/provider/pricing/dispatch changes. Production build passed. ESLint has zero errors and 18 warnings. Production dependency audit reports zero vulnerabilities. Test writes target disposable localhost databases only.

Screenshots are stored in docs/qa/settings-{branding,dispatch,payment,monitoring}-{360,390,768,1440}.png, plus the provider detail and mobile save-bar captures. Live verification results are recorded separately after deployment.

## Maps and save confirmation release — 2026-11-04

OpenFreeMap Standard (Liberty) is the default; Light (Positron) and Dark are supported. CARTO vector styles are available only with a browser-scoped NEXT_PUBLIC_CARTO_BASEMAP_KEY supplied at build time. No unconfigured CARTO requests are issued. Map loading errors and timeouts expose an explicit OpenFreeMap Standard fallback. Attribution remains visible.

MapLibre 6 requires a separately served module worker and matching shared runtime. scripts/prepare-map-worker.mjs copies the installed, locked MapLibre version and license into generated public assets before development/build. The deployment image copies these public assets. This fixes the vector-tile worker resolution issue hidden by the previous raster-only implementation.

The existing maps MongoDB record now supports provider/style, a controlled Egypt catalogue (27 governorates with capital cities and selected additional cities), derived city center, initial zoom, auto-fit, marker/name toggles, driver/category filters and refresh interval. Cairo defaults to 30.0444,31.2357. Older records receive new defaults in memory; there is no database migration. OSRM/estimate routing and service restrictions remain intact.

Admin live drivers come from an admin-authorized MongoDB/Redis snapshot followed by Socket.IO updates and periodic reconciliation. Only active approved online drivers with fresh GPS and live Redis membership appear. GPS expires after 90 seconds. Disconnects remove markers, except when another socket for the same driver remains connected. Marker animation, auto-fit and name/vehicle/status/GPS-time popups use actual authorized data. Socket handshakes recheck active users and roles; GPS relays require an approved online driver. Rider nearby-driver payloads remain anonymous, and private ride relays retain membership checks.

All Settings editors now share the existing Toast system and a persistent, accessible confirmation panel: "Settings saved successfully" / "تم حفظ الإعدادات بنجاح", with check icon and last-saved time. Confirmation appears only after server success; failed saves preserve drafts and show errors. Revision checks, save locks and discard behavior remain intact.

Executed checks: production build passed; 23 unit tests passed; 32 full database/API/browser integration groups passed; lint zero errors (20 warnings); production dependency audit zero vulnerabilities. Browser tests used real OpenFreeMap tiles for all three styles, verified failure/fallback, initial driver snapshot, GPS movement, marker detail, disconnect removal, stale exclusion, controlled selections, city-center persistence after restart, all Settings save confirmations and failure feedback. Rider/driver maps and rider pickup/dropoff/route rendering were visually verified. Screenshots: docs/qa/maps-*.png, including 360/390/768 mobile/tablet Settings captures and desktop tracking. Test data was confined to disposable localhost databases; no production seed, migration, payment activation or external notification occurred.

Provider references: https://openfreemap.org/quick_start/ and https://carto.com/basemaps/apikey/ . The Egypt catalogue is explicitly curated in src/lib/map-config.js; it is not a complete gazetteer of every Egyptian settlement. CARTO credentialed operation remains untested because no key was configured; unconfigured-provider rejection and the working OpenFreeMap fallback were tested.
