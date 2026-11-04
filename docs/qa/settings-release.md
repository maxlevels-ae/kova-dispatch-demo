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
