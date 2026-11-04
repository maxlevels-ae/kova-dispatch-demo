# Maxride Delivery

Delivery uses its own `Delivery` collection, state machine, fare calculation,
dispatch worker, settings record and histories. Taxi records and tariffs are
unchanged. Customer routes are `/deliveries`, `/deliveries/new` and
`/deliveries/[id]`; driver and administrator routes use their respective prefixes.

## Configuration

`/admin/settings/services` provides independent owner switches for Taxi and
Delivery: either service, both, or a temporary pause of both. The switches save
atomically with revision checks and an administrator history. Delivery uses the
same stored enable flag as Delivery > General. Taxi defaults to enabled for
backward compatibility. Disabled services reject new bookings server-side and
disappear from the customer service chooser; existing bookings, assignments and
histories remain available. Fare estimation also rejects a disabled service.

`/admin/settings/delivery` contains General, Packages, Pricing, Dispatch,
Eligibility, Notifications, Proof & security, and Monitoring. Settings use the
existing MongoDB PlatformSettings model under the `delivery` key, with revision
checks. Delivery defaults to disabled. An administrator can enable it without a
seed or migration. Orders retain the configuration accepted at booking.

Operating regions use the project's explicit Egyptian city catalogue, with a
50 km boundary around each configured city. Courier search radius is separately
configurable. Routing uses the existing OSRM/estimate implementation. Pickup ETA
is an estimate from an eligible courier's recent location, not a promised time.

## Assignment and money

Couriers opt into Ride, Delivery, or both. A single driver can hold only one
assignment across both services. The existing Redis infrastructure provides the
dispatch lease; MongoDB transactions and conditional driver claims provide the
authoritative assignment exclusion. Manual assignment sends an expiring offer
that the courier must accept. Reassignment is forbidden after pickup arrival.

The EGP wallet pays the delivery quote at booking. Waiting charges, if any, are
posted at package pickup. Verified completion credits the courier's EGP earnings
once. Unassigned cancellation/no-courier and verified returns refund the payment;
assigned cancellation applies the snapshotted cancellation fee. Immutable ledger
entries use unique delivery references. Historical USD wallets are neither
converted nor relabelled. No external payment, COD or payout is activated.

## Verified handover and privacy

Guest recipients use a private, expiring link manually shared by the sender.
Registered recipients continue to read their code through their authenticated
account. Neither flow sends SMS; link access does not verify phone ownership.
Codes are never returned through courier or administrator APIs. Codes use cryptographic
randomness, authenticated encryption at rest, expiration, attempt limits and
rate-limited renewal. `AUTH_SECRET` (or `NEXTAUTH_SECRET`) supplies the server key;
rotating it requires active participants to renew outstanding codes.

Recipient OTP is mandatory. Pickup OTP and proof photo requirements are
configurable. A failed delivery remains assigned until a verified return; it is
not silently marked completed or refunded. Only the assigned courier can record
physical handover events.

Package/proof images are validated, re-encoded to WebP, and stored privately in
MongoDB. Access requires an authorized participant or administrator. Evidence
expires after the configured 7–365 days; unattached uploads expire after one day.
Chat is bounded to 500 messages per order. Events record responsible actors and
timestamps; no historical GPS trail is fabricated. Live GPS is withheld after
closure. Administrative detail/evidence access is audited.

## Notifications and language

Delivery reuses the notification inbox, job worker, Socket.IO channels, sound
player and Web Push subscriptions. Browser audio requires user interaction.
Push remains disabled without the existing VAPID configuration; no closed-browser
or mobile-device delivery guarantee is implied.

Customer language is stored in `User.language` (`en` or `ar`). Profile settings
apply it immediately, with document `lang`/`dir`, a central Arabic dictionary,
localized amounts/dates and bidi isolation. The geographical map remains LTR.
Administrative free-form content, names and addresses are preserved verbatim.
Arabic uses installed system fallback fonts; no unlicensed Dubai font is added.

## Verification

`npm run test:integration -- --delivery-only` exercises a disposable localhost
MongoDB replica set and Redis, plus real Chromium. It cannot target production.
The complete integration command also covers Taxi, accounts, wallets, settings
and existing notification flows. Screenshots are in `docs/qa/delivery-*.png`.
Tests create only disposable local accounts; production seed scripts must never
be run for this feature.

Verification executed on 2026-11-04:

- `npm ci` completed (503 packages).
- `npm run lint`: no errors; 36 warnings remain.
- `npm test`: 32 passed.
- `npm run build`: passed; matching MapLibre 6.16.0 worker prepared.
- `npm run test:http`: 19 passed against the final build.
- A broader regression run passed 63 checks before the final owner switches and
  alert refinements. Subsequent runs exposed browser-readiness and chat recovery
  issues, which were corrected.
- Final `npm run test:integration -- --notifications-only --delivery-only`:
  25 passed, covering native browser alerts, reconnect, the complete parcel flow,
  GPS, Arabic persistence, private proof, OTP attempts, verified returns, quiet
  offers, immutable EGP settlement, and all owner service-switch modes.
- `npm audit --omit=dev`: zero vulnerabilities. Installation reported 16
  moderate development-dependency advisories; no forced dependency upgrade was
  applied.
- Customer screenshots and overflow checks cover 360, 390, 768 and 1440 px.

SMS recipient codes and closed-browser/mobile Web Push remain unverified and
disabled without their required integrations. No production ride or delivery
was created by these local suites.


## MX-026 / MX-029 guest recipients and early routing

New customer bookings require recipient name, phone and destination, with optional instructions. They do not require a username or create a user account. The API still accepts the existing recipient username field for registered-recipient clients and historical orders retain their recipientId. Each new order records recipientType and verificationMethod, with a creation audit note.

Senders can issue, renew or revoke a private recipient link from the order detail. A 256-bit random bearer token is returned once, placed in a URL fragment and stored only as SHA-256 in MongoDB. Links expire after the shorter of 60 minutes and the order's OTP expiry policy. Issuance is limited to five operations per 15 minutes per order. Revocation or renewal atomically invalidates the previous link and handover code, including previously verified codes. Completed orders cannot be changed through these actions.

The public recipient page uses a scoped Authorization header, no-referrer policy, no indexing and no caching. It exposes only order reference/status, destination, courier/vehicle summary, fresh courier location during the final delivery leg, confirmation time and the recipient code. It does not expose sender details, chats, evidence, wallet information or unrelated orders. Token and IP rate limits fail closed if Redis is unavailable. Guest access does not verify phone ownership; SMS remains disabled. Anyone holding the private link can read its code, so the sender must share it only with the intended recipient. The recipient page supports English and Arabic without an account.

Couriers still enter the recipient-provided code server-side at AT_DROPOFF. Existing attempt limits, pickup code and proof-photo requirements remain enforced. Guest completion additionally requires a live, unrevoked link. Rejected code attempts and link issuance/revocation are audited; admin investigation shows verification method and attempt counts. No phone or SMS delivery is claimed.

POST /api/deliveries/route-preview accepts only pickup and dropoff coordinates. The booking map requests it immediately after both endpoints are selected, aborts obsolete requests and recalculates on either endpoint change. It uses the existing OSRM routing service and configured routing mode. When only an estimate is available it shows an explicit warning and does not draw a straight line as a road route. Egypt coordinates, Cairo service-region validation, operating hours and dispatch radius are unchanged.

Production physical collection/delivery and courier GPS must not be simulated. Local integration fixtures may use synthetic locations and proof images only in the hardcoded disposable localhost database.


MX-026/MX-029 release checks (2026-11-05): lint exited 0 with 38 warnings; 33 unit tests, 21 HTTP checks and all 66 full database/API/browser integration checks passed. Production build succeeded and npm audit --omit=dev found zero vulnerabilities. An initial full run timed out at the existing Taxi Accept browser step; request diagnostics were added, and the complete rerun passed including native alerts, acceptance and expiry. Guest screenshots cover English/Arabic at 360, 390, 768 and 1440 pixels. The immediate-route screenshot uses a deterministic routing fixture to test endpoint changes; production road routing is checked separately, without substituting courier GPS or claiming a physical handover.

Live visual review found a shared MapView timing issue: a first route arriving while tiles streamed could miss source creation. The renderer now retries pending geometry on idle without repeatedly rewriting an already drawn source, resets readiness on style reload, and exposes route readiness for browser assertions. The correction passed a fresh build, lint (0 errors, 38 warnings), 33 unit tests, 4 map integration checks and 19 complete delivery integration checks.
