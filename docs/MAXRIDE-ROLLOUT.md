# Maxride rollout and financial migration gate

This change is not authorized for production rollout until the inventory and reconciliation below are approved. No migration runs at application startup. Do not run the demo seed against production.

## Historical records

Existing balances, users, passwords, trips and pricing documents are not converted or reset. Model defaults apply EGP only to new documents; hydrated legacy documents without currency remain unverified. UI displays each stored currency; missing metadata is explicitly labeled unverified. Completed-trip revenue/earnings summaries include EGP only. Historic rides and ledgers remain accessible.

New EGP rides require an EGP wallet. Existing USD or unverified wallets cannot be debited/credited as EGP. Existing active rides can settle only when both wallets have matching, explicit currencies. Unknown currency blocks settlement without changing the ride or wallets. Legacy USD late-cancel terms are retained. New EGP late-cancel fee is EGP 30.

The new EGP default tariffs are proposed demo tariffs, not converted USD prices. Review commercial suitability before rollout. Existing legacy pricing is ignored by EGP fare estimation and cannot be overwritten through the admin editor. The current unique city/vehicle index is preserved: introducing currency-versioned stored pricing requires a reviewed index migration or an approved explicit replacement of a backed-up legacy rule. No automatic index removal is included.

## Required migration preparation

1. Configure read-only production MongoDB access through the environment, never chat or source control. Run `npm run audit:currency`. It emits grouped counts and totals only, not user records or connection strings. This workspace originally had no MongoDB or Redis credentials.
2. Take an encrypted, access-controlled MongoDB snapshot with a timestamp and verify restoration to an isolated environment. Export wallet balances and ledgers per currency with stable record IDs for reconciliation; do not commit exports.
3. Identify missing currency using authoritative evidence (payment-provider session currency, original pricing contract, ledger origin). Do not infer currency from geography, current defaults, or account age. Unresolvable records remain quarantined for financial review.
4. Reconcile every wallet opening balance plus credits/debits to closing balance in its original currency, and every ride charge to driver earnings plus platform commission. Investigate pre-existing differences before any conversion.
5. Prefer retaining original-currency wallets and creating separate currency accounts. This release retains the current single-wallet schema and blocks incompatible new activity. A multi-currency wallet migration is a separate approved change. Never rewrite an existing nonzero wallet currency in place.
6. If conversion is explicitly approved, record source amount/currency, target amount/currency, approved FX rate and timestamp, rounding adjustment, migration ID, and paired immutable ledger entries. Use transactions and a unique conversion ID so retries cannot double-convert. Dry-run against the restored snapshot; reconcile totals before and after; prepare a compensating-entry rollback.
7. Drain or separately reconcile active rides and in-flight card payments before cutover. Require MongoDB replica-set/sharded deployment supporting transactions. Verify ledger `ref` unique index before payment processing.
8. Approve EGP pricing and the stored-pricing/index migration; then rerun the inventory and financial integration tests. Only then consider rollout.

## Payments

EGP uses two decimal places; new balances are updated with two-decimal atomic rounding. Ride completion, cancellation, demo credits, and card webhook credits commit wallet deltas and ledgers in MongoDB transactions. Concurrent completion/cancellation and duplicate card delivery are integration-tested.

New Stripe checkout and Connect onboarding/payout initiation are disabled pending merchant/country-specific verification. Disabling card payments does not enable free production credits. Demo top-ups require `DEMO_WALLET_TOPUPS=true` and a non-production runtime, and only affect EGP wallets. Existing signed Stripe webhooks and checkout-return verification remain available when credentials are configured; original session currency must match the wallet, otherwise processing fails for reconciliation/retry.

Stripe distinguishes presentment currency from merchant availability and settlement currencies. Egypt is not listed on the standard merchant availability page reviewed for this change. Do not enable real Egyptian driver payouts by changing a currency string or by creating a US account for an Egyptian driver. Sources: https://stripe.com/global and https://docs.stripe.com/currencies .

## Branding

The singleton `brandings` document (`_id: public`) stores the display name and up to two sanitized WebP data URLs in MongoDB. There are no persistent local uploads or required S3 credentials. Each input and sanitized output is limited to 256 KiB; request body is bounded to 720 KiB. PNG/JPEG/WebP signatures and decoder output are verified; SVG, disguised files, oversized images and animations are rejected. Images are decoded/re-encoded, metadata removed, and dimensions bounded. Public GET returns only name/logo/loginLogo; admin PUT requires an authenticated admin and same origin. Responses are not cached. Shared branding refreshes on load and window focus. Restore default retains the original graphical mark with Maxride text.

## Reproducible verification

- `npm ci`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run test:http` (starts its own built server on port 3187; signed test sessions, no production services)
- For integration: start disposable MongoDB 7 replica set on localhost:27028 and Redis 7 on localhost:6389; initialize replica set `rs0`; run `npm run test:integration`. The script hardcodes localhost and a fresh `maxride_qa_` database and cannot use production MongoDB credentials. It tests real credentials login, role protection, Socket.IO authentication and health, driver online/offline, stored branding across restart, EGP tariffs, concurrent settlement/cancellation and duplicate card credit. Stop/remove only the named disposable containers after testing.
- `npm audit --omit=dev`

This machine runs Node 20; an existing mapping dependency declares Node >=22. Validate the deployment runtime against supported dependency engines before release.

## Deployment

The checkout originally points `origin` at a different upstream repository. Preserve it; use a separate `maxride-deploy` remote for https://github.com/maxlevels-ae/kova-dispatch-demo.git. Do not push a branch connected to Render auto-deploy while migration review is incomplete. Never change MongoDB/Redis credentials to deploy this change.

After approved rollout verify `/api/health` (mongo, redis and socket all up), `/admin` redirects correctly, `/admin/dashboard`, `/admin/settings`, `/login`, `/dashboard`, and `/driver/dashboard`, with real accounts and role isolation. Verify branding on desktop/mobile and across logout/restart/device changes. No production readiness claim is justified by local tests alone.
