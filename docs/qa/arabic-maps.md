# Arabic maps and header notifications

MapLibre is pinned to 6.16.0. Its native Arabic shaping and bidi implementation is used without an RTL plugin. The shared MapView applies an Arabic-first label expression on initial load and subsequent style changes, falling back to the original name. Route shields, fonts, sources, markers and tracking are preserved.

The worker preparation script copies the installed worker and shared companion and generates a version/hash manifest. Production uses Node 22 to satisfy the dependency tree's engine requirements and installs the locked dependencies with npm ci.

OpenFreeMap Liberty, Positron and Dark retain their supplied multilingual Noto font stacks and glyph endpoint. Browser captures show joined Arabic text and mixed English/Arabic text. The four large street labels in the fixture screenshots are synthetic rendering fixtures, not assertions about those streets' actual positions. The Cairo-only screenshot contains actual basemap features.

The existing notification inbox now sits in the shared application header for administrators, riders and drivers. Existing preference, refresh and mark-read behavior is retained; keyboard opening, Escape/close focus restoration and mobile popover bounds are covered by browser tests.

Validation commands:

- `npm ci`
- `npm run lint` (zero errors; 21 existing warnings)
- `npm test` (24 tests)
- `npm run test:http` (19 checks)
- `npm run test:integration` (42 checks against disposable localhost MongoDB/Redis)
- `npm run build`
- `npm audit --omit=dev` (zero vulnerabilities)
- `node tests/arabic-maps-browser.mjs` with Playwright Chromium (real OpenFreeMap assets)

Screenshots: `arabic-cairo-real.png`, `arabic-labels-z14.png`, `arabic-labels-z15.png`, `arabic-labels-z16.png`, `arabic-positron.png`, `arabic-dark.png`, and `notifications-header-{admin,rider,driver}.png`.

No production wallets, settings, credentials or payment providers are changed by this release. Production verification must independently confirm the deployed Git commit, health, worker hashes and actual authenticated map pages; a successful local build alone does not establish deployment success.
