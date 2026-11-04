# One-time initialization of the existing Maxride demo wallets

This operation applies only to the six pinned original account IDs for `rider1` and `driver1`–`driver5` on `https://kova-dispatch-demo.onrender.com`. It never creates users or drivers and never calls the seed script.

## Storage and accounting

- The original `User.wallet` USD balance and currency remain unchanged.
- `User.egpWallet` becomes the operational account: rider1 receives 1,000 EGP of demo-only funds; drivers start at zero EGP.
- An immutable `DemoWalletInitialization` receipt preserves the original wallet objects, identities, operator, timestamp and per-account outcomes.
- Every initialized account receives one append-only `demo_initialization` ledger entry with a globally unique reference. Rider1's credit is demo funding, not a payment-provider transaction or an exchange of USD.
- The receipt, EGP balances, ledger and audit entries commit in one MongoDB transaction. User/driver write locks serialize concurrent wallet and online/assignment changes.
- The receipt's fixed primary key permanently closes the operation. Later POSTs only return the existing receipt, even after a ride spends funds. They cannot top up or reset an account.

## Safety gates

An account is blocked if its pinned identity/role or inspected USD balance differs, it is inactive, its driver is online/busy, an EGP account already exists, or any wallet transaction, Payment, ride history or nonzero driver trip/earnings statistics exist. Blocked accounts are untouched and their reasons are retained in the permanent receipt. A blocked account cannot be silently retried after this operation closes.

Administrator-only `GET /api/admin/demo-wallet-initialization` provides preflight eligibility or the closed receipt. POST requires a trusted Origin and exactly:

```json
{"confirmation":"INITIALIZE EXISTING MAXRIDE DEMO EGP WALLETS ONCE"}
```

No user IDs, amounts or currencies are accepted from the caller. Non-demo deployments fail closed. Local integration fixtures require an explicit test switch plus the hardcoded localhost QA MongoDB database pattern.

The legacy snapshot is also available as `legacyRecord` from the owner's `/api/wallet` and the administrator's `/api/admin/users/[id]/wallet`. The admin wallet page displays its timestamp and preserved USD balance.

## Verification

The isolated integration tests exercise authorization, hostile Origin rejection, financial/ride/online/existing-EGP blockers, concurrent requests, immutable receipts, identity/password/vehicle preservation, replay after spending, and a complete automatic dispatch → accept → arrive → PIN start → complete EGP ride. Demo GPS coordinates are simulated in Cairo; the test is not represented as physical travel.

Production initialization and ride verification results are reported after the deployed commit is confirmed. The completion test legitimately consumes part of the 1,000 EGP demo credit and credits the driver's EGP earnings; initialization must not be rerun to restore the starting balances. Real gateway payments remain disabled.

## Executed local checks — 2026-11-04

- Production build passed.
- 23 unit tests, 42 full integration groups and 19 HTTP checks passed.
- Lint: zero errors, 21 existing warnings. Production dependency audit: zero vulnerabilities.
- Test fixtures were corrected to isolate synthetic ride demand and driver supply; the map movement assertion now disables camera auto-fit and allows the GPS heartbeat interval. Failed browser checks also clear their heartbeat timer. The final full run passed.
- No production seed or user-creation operation is used by this initializer.
