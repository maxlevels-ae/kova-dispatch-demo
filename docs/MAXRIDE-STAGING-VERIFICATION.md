# Maxride staging verification — 4 November 2026

**Status: local staging preparation and functional verification complete; hosted staging is NOT deployed or approved for production.** No hosted staging URL exists yet. Render access was unavailable: no connected Render tool/API credential, and the computer-use browser host was unavailable. A staging CARTO basemap key is also missing.

Continued from `34700019942993affeeefc978a3ab0e2cbbd8e98` on `feat/maxride-egp-branding`. The feature branch is the deployment target; no merge to `main` or production data write is part of this work.

## Changes

- Added a schema-validated Render Blueprint for three new resources: a Node 22 web service, authenticated private MongoDB replica set with persistent disk, and isolated Redis. Automatic deployment is off. Existing production resources and environment groups are not reused.
- Added guarded staging build/start scripts and an idempotent transactional seed. New admin, rider and approved driver fixtures use EGP; the initial rider's EGP 5,000 test wallet has an opening ledger entry. Existing staging users, passwords, balances, prices and trips are preserved on subsequent starts.
- Kept card payments, payouts and top-up APIs disabled. Startup rejects production origin, inherited MongoDB URI and Stripe credentials; seeding rejects a nonempty unmarked database.
- Fixed active-ride subscription after rider refresh when socket connection precedes the active-ride response.
- Fixed private ride socket authorization failing open on Redis lookup errors. An actual Redis ACL fault reproduced unauthorized location delivery before the fix; the new regression passes after denying access on lookup failure.
- Fixed overlapping driver/vehicle details on the mobile receipt without changing the desktop design.
- Added build-time `NEXT_PUBLIC_CARTO_BASEMAP_KEY` support, preserving the existing CARTO style and map geography. No key was supplied or invented.
- Added repeatable Chromium browser QA, staging configuration tests, Blueprint validation, and screenshots.

## Executed results

Final runtime: **Node 22.23.4**, Chromium via Playwright 1.64.1, ANGLE Intel UHD Direct3D11. Desktop viewport 1365×900; mobile viewport 390×844. These are responsive browser checks, not physical-device or Safari coverage.

| Check | Actual result |
| --- | --- |
| Clean install | `npm ci --no-audit` passed, 493 packages installed. Automatic audit was separated after earlier stalled installs; the requested production audit ran independently. |
| Lint | Passed: 0 errors, 17 existing warnings. |
| Build | `npm run build` passed; the final Node 22 staging build script also passed and generated all 54 pages. |
| Existing unit regression suite | 11 passed. |
| Staging configuration guards | 9 passed. |
| Built HTTP suite | 21 passed. |
| Real MongoDB/Redis/API integration suite | 25 passed, including the Redis authorization fault regression. |
| Complete local browser suite | 22 passed; no browser JavaScript errors. [Machine-readable result](qa/staging/results.json). |
| Production dependency audit | `npm audit --omit=dev`: 0 vulnerabilities. |
| Render Blueprint | Passed Render's official JSON Schema validation. No resources were provisioned by validation. |

The complete browser run tested real password login/redirects for all roles, `/admin` redirect and refresh, denied non-admin settings writes, rejected payment/payout operations, logo upload/preview/replacement/reset, public header/footer/login/signup/dashboard branding, persistence after application restart, and responsive layouts. It then searched a real destination, calculated an EGP estimate, booked a ride, delivered/accepted the real dispatch offer, refreshed the rider, received live driver GPS over WebSocket, entered the rider PIN, completed the trip and reconciled settlement. It also inspected receipts, wallets, driver earnings and admin financial/pricing screens.

The final post-booking refresh received the dashboard response in **52 ms**; ride controls were ready in **746 ms**. Earlier software-rendered Chromium runs stalled on map navigation. The final verified run used the machine's native Intel Direct3D renderer; the application map was not mocked, replaced or disabled.

## Financial and persistence checks

The completed trip's rider debit, driver credit, platform fee, two ledger entries and single payment record reconciled in EGP. Repeated completion and cancellation are covered by concurrent integration tests. Seed reruns preserve balances and credential hashes. Synthetic historical USD and missing-currency wallets remained byte-for-byte unchanged; integration tests also verified historical pricing and currency-separated summaries. These synthetic historical fixtures are distinct from new operational EGP transactions.

Branding is stored in MongoDB, not Render's ephemeral filesystem. The replacement logo remained identical after stopping and restarting the application. Existing validation covers PNG/JPEG/WebP signatures, decoding and size limits, SVG/disguised/oversized rejection, admin authorization and cross-origin write rejection.

No production financial migration was run. Empty staging requires no historical conversion. Production promotion still requires its historical financial inventory, backup and reviewed migration plan; local fixture checks do not replace that review.

## Visual evidence and remaining blockers

The 21 screenshots in [qa/staging](qa/staging/) include [desktop settings](qa/staging/settings-desktop-custom.png), [mobile settings](qa/staging/settings-mobile-custom.png), [mobile login](qa/staging/login-mobile-custom.png), [mobile tracking](qa/staging/tracking-mobile.png), [mobile receipt](qa/staging/rider-receipt-mobile.png), [driver earnings](qa/staging/driver-earnings-mobile.png) and [admin pricing](qa/staging/admin-pricing-desktop.png). Representative screenshots were visually inspected, including the corrected receipt wrapping.

**Map visual QA is blocked:** CARTO currently returns “API key required” placeholder tiles. [CARTO documents the key requirement](https://www.carto.com/basemaps/apikey/index.html). Configure a staging-scoped key and rebuild, then repeat visual verification. The screenshots deliberately retain this visible defect.

**Hosted end-to-end verification is outstanding:** connect Render, deploy the new Blueprint resources, obtain the actual staging URL and repeat health/auth/branding/ride/settlement checks there. Local success does not establish hosted deployment success. The existing production health endpoint was checked read-only and returned HTTP 200 with MongoDB, Redis and Socket.IO all `up`; no production settings, accounts or trips were changed.

Production readiness remains **NO** until hosted staging and map visuals pass, and the financial promotion prerequisites are met. See [deployment instructions](MAXRIDE-STAGING.md) and [Blueprint](../deploy/staging/render.yaml).

## Files changed

Deployment: `deploy/staging/render.yaml`, `deploy/staging/mongo/{Dockerfile,bootstrap.sh,initialize.js}`. Tooling: `scripts/{build-staging,prepare-staging-qa,staging-config,staging-seed,start-staging,validate-staging-blueprint}.mjs`, `tests/{staging-browser.mjs,staging-config.test.mjs,integration.mjs}`, `package.json`, `package-lock.json`, `.gitattributes`, `.gitignore`, `eslint.config.mjs`. Application: `server.js`, `src/hooks/useRiderRide.js`, `src/components/maps/MapView.jsx`, `src/app/(rider)/rides/[id]/page.js`. Documentation/evidence: this report, `MAXRIDE-STAGING.md`, and `docs/qa/staging/`.
