# Ride notifications and investigation

The existing NotificationJob worker, Notification inbox and Socket.IO channels deliver ride updates. Important ride transitions and chat are reconciled from persisted rides; current offers are persisted with a server expiry so reconnecting drivers can recover an active request. Stable keys prevent duplicate inbox entries. New chat requests accept an idempotency UUID and record the sender's user ID. Legacy messages retain their original role and timestamp; the investigation view does not guess a missing sender identity.

Audio uses the supplied `docs/new-ride.mp3` and `docs/all-notify.mp3`, copied to `/sounds/`. The incoming offer loops only after a user gesture unlocks audio and stops on accept, decline, expiry, withdrawal or cancellation. Browser/OS policies may still block audio; Enable notifications and Test sound provide explicit controls. No audio is promised while the browser is closed.

## Optional Web Push

Set these server-only environment variables on the existing Render service:

- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT` — a monitored `mailto:` contact or HTTPS contact URL

Generate a persistent key pair once using the installed Web Push CLI (`npx web-push generate-vapid-keys`). Store the private key in Render secrets, never in the repository or a `NEXT_PUBLIC_*` variable. Rotating the key pair requires browsers to resubscribe. Missing configuration explicitly disables push without disabling foreground alerts.

The authenticated `/api/notifications/push` endpoint registers only the current user's subscription, checks the trusted request Origin, restricts push-service hosts, bounds payload size, and never returns subscription keys/endpoints. A browser may register up to five subscriptions per account; stale subscriptions expire after 180 days. HTTP 404/410 responses remove an invalid subscription. Delivery failures are visible in Settings and do not imply successful delivery. The service worker permits only same-origin ride links. Push carries generic event text, not chat message bodies, credentials or payment details.

Browser notification permission, OS notification settings and subscription are separate. iOS may require an installed Home Screen web app. Closed-browser and mobile push delivery must be verified on an actual supported device with configured VAPID; a local browser permission grant does not establish that result.

## Historical records and privacy

`/admin/rides/[id]` is admin-only and logs sensitive access to AdminAudit. It has no mutation actions. It shows original stored route geometry, discrete timeline positions, persisted messages and financial records; it never fabricates GPS trails, delivery/read receipts or absent timestamps.

New accepted rides snapshot the vehicle, including the immutable photo URL. Older rides explicitly identify the vehicle as the current driver profile when no snapshot exists. Uploaded PNG/JPEG/WebP images are decoded, limited to 2 MB/16 million pixels, stripped of metadata and re-encoded as WebP in MongoDB. Driver ownership/admin authorization and trusted Origin are required. Updating vehicle text fields preserves its uploaded photo.

New operational offer/approaching events use a separate TripEvent collection with 90-day TTL retention and a bounded investigation result. Financial records, original trip timelines and existing messages are not migrated or deleted. New chat is bounded at 500 messages per trip. No continuous location history is introduced.

## Verification

`tests/ride-notifications.mjs` runs only against the integration harness's disposable localhost database. It uses full Chromium because the headless shell cannot display native OS notifications. It exercises real media playback and service-worker notifications, the booking/accept/arrive/chat/start/complete flow, reconnect, duplicate-message prevention, validated vehicle photo storage, admin links, permission denial and persisted preferences. Synthetic test images and GPS are QA fixtures, never representations of an actual vehicle or physical journey.

Executed on 2026-11-04: production build passed; 28 unit tests, 19 HTTP checks and 50 database/API integration checks passed. ESLint completed with no errors and 25 warnings. `npm audit --omit=dev` reported zero vulnerabilities. Browser evidence is in `docs/qa/ride-notification-*.png` and `docs/qa/trip-investigation-*.png`. The offer lifecycle tests cover accept, decline, expiry and rider cancellation. Missing VAPID configuration is tested as disabled; actual closed-browser and mobile Web Push delivery remains unverified.
