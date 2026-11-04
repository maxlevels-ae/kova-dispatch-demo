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

Recipient verification currently requires an existing, active Maxride customer
account whose username and phone match the booking. The recipient reads their
code while authenticated. **SMS delivery is not integrated.** Sender and recipient
codes are never exposed to the courier or administrator. Codes use cryptographic
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
