# Maxride staging deployment

This branch must not be merged or deployed over the live Kova Render service. Use `deploy/staging/render.yaml` to create three **new** Render resources: `maxride-staging-web`, `maxride-staging-mongo`, and `maxride-staging-redis`. The Blueprint explicitly tracks `feat/maxride-egp-branding` with automatic deployment off. It uses paid Starter resources and a persistent MongoDB disk; review the workspace's displayed costs before provisioning.

## Hosted deployment

1. Connect Render to `maxlevels-ae/kova-dispatch-demo` and create a new Blueprint from the feature branch with Blueprint path `deploy/staging/render.yaml`.
2. Confirm every resource is new. Do not select or import the existing production service, environment groups, databases, disks, Redis, or secrets.
3. Provide a staging-scoped `NEXT_PUBLIC_CARTO_BASEMAP_KEY` when prompted, then deploy MongoDB and Redis, followed by the web service. CARTO now requires this key; without it the existing basemap returns watermarked placeholder tiles. This is a browser-visible key: restrict it to staging origins using the provider's controls and rebuild after changes. No basemap, map position, or route geography is changed by this branch. Render generates independent database, session, and staging demo secrets. MongoDB exposes an authenticated private listener; its application user has read/write access only to `maxride_staging`. Initialization listens on loopback without authentication, creates a single-node replica set and users, then enables authenticated networking. The disk persists database and branding data across restarts.
4. Use the **actual** web-service URL from Render. The build and startup derive origins from `RENDER_EXTERNAL_URL`; no staging URL is assumed or fabricated.
5. Staging usernames are `staging_admin`, `staging_rider`, `staging_driver`. Retrieve `STAGING_DEMO_PASSWORD` through Render's protected environment UI; do not put it in chat, screenshots, git, or reports. The initial rider receives EGP 5,000 test funds with a matching opening ledger entry; driver/admin start at zero. The driver is approved with a staging-only vehicle. Fresh EGP tariffs are inserted. Startup never resets existing users, passwords, balances, pricing or trips.
6. Verify health and all role dashboards, branding uploads/replacements/reset, a full ride and its reconciled settlement on the hosted service before considering production. The local suite is not proof of hosted deployment.

No Stripe credentials should exist in this environment. Card payments, payouts and free top-up APIs are disabled. Staging startup rejects inherited `MONGODB_URI`, payment credentials, production origin, and nonempty unmarked databases. It never converts historical balances or pricing. Seed and settlement use MongoDB transactions. Single-node MongoDB is suitable for this staging fixture environment, not a production high-availability design.

## Repeat local verification (PowerShell)

Use Node 22, Docker, and outbound access to the real geocoding/routing services. The final verified runtime was Node 22.23.4. If npm's automatic full-tree audit stalls, run `npm ci --no-audit` and then the explicit `npm audit --omit=dev` shown below; do not omit that separate security check.

Windows browser QA uses ANGLE/Direct3D11 on the native GPU. The default SwiftShader software renderer on this host stalled during repeated MapLibre page reloads; the native renderer completed the focused post-booking refresh in under one second. This changes only the test browser launch flags, not the application's map design or geography. Diagnostic `--ride-only` and `--resume-gps` runs write separate results files; `results.json` is reserved for the full suite.

```powershell
npm ci
node scripts/prepare-staging-qa.mjs
$env:PLAYWRIGHT_BROWSERS_PATH='D:\Kova\.cache\playwright'
npx playwright install chromium
docker build -t maxride-staging-mongo-qa deploy/staging/mongo
docker run --name maxride-staging-qa-mongo-v2 --detach --env-file .env.staging.qa --publish 127.0.0.1:27029:27017 maxride-staging-mongo-qa
docker run --name maxride-staging-qa-redis --detach --publish 127.0.0.1:6390:6379 redis:7-alpine
# Wait for MongoDB initialization/authenticated listener to become ready.
npm run test:staging-config
npm run validate:staging
npm run lint
npm run build
npm test
npm run test:http
npm run test:staging
npm audit --omit=dev
```

Do not regenerate the ignored `.env.staging.qa` while keeping its initialized database: generated passwords must continue to match stored accounts. The preparation script preserves an existing file. Keep secrets local and never commit it. If these named containers already exist, start/reuse them instead of creating duplicates. The browser suite requires port 3190 to be free and verifies only the hardcoded isolated local endpoints. It uses real APIs, real Photon/OSRM requests, Socket.IO, Chromium's geolocation emulation, MongoDB and Redis. No application API is mocked. An interrupted searching/accepted QA trip is cancelled through the authenticated rider API on the next run; records and any normal cancellation ledger entries are preserved.

The independent `npm run test:integration` suite requires a disposable MongoDB replica set on port 27028 and Redis on 6389. It uses a new `maxride_qa_<timestamp>` database for each run. This is separate from both staging and production.

That suite temporarily denies Redis's membership command on the disposable instance, verifies that private ride-location access fails closed, and restores the permission in `finally`. Do not point this suite at a shared Redis instance. Its endpoints are deliberately hardcoded to the isolated local ports.

Screenshots and the latest browser results are in `docs/qa/staging/`. These contain only staging fixture users and test logos. `npm run validate:staging` downloads Render's official JSON schema and checks the Blueprint; this does not provision resources.

## Production gate

Do not promote until hosted staging is successfully verified, production's historical financial inventory has an approved migration/backup plan, and gateway/country support has been independently verified before enabling payments. No production data migration is included or executed by this staging work.
