# Admin accounts, wallets and profile verification

## Implemented
- Searchable, paginated account directories; shared responsive profile, vehicle, documents, wallet and activity detail tabs.
- Atomic rider/driver creation, administrator-only updates, approval/suspension controls, account deactivation and audit history.
- Manual credits/debits require review and confirmation. A MongoDB transaction updates the selected currency balance and creates an append-only ledger entry with administrator, reason, reference, before/after balances and a unique idempotency reference. No gateway Payment record is created.
- Existing `wallet` records retain their original currency and balance. For legacy users, `egpWallet` is a separate lazily created subdocument. EGP booking, acceptance, settlement, cancellation, wallet views and driver debt checks use the EGP account. No migration or reseed is needed.
- Administrator profile editing, normalized photo uploads and bcrypt password rotation with current-password verification, Redis rate limiting, trusted-origin checks and session-version revocation for APIs and sockets.

## Executed checks (2026-11-04)
- `npm test`: 23 tests passed.
- `npm run test:integration`: 38 groups passed against a unique disposable localhost MongoDB database and existing local Redis. Includes real basemaps, existing settings and finance regressions, user/driver creation and editing, concurrent duplicate wallet posting, negative/precision/currency validation, immutable ledger, USD preservation, EGP booking and settlement, deactivation, browser saves, profile changes, wrong password, rate limiting and session revocation.
- `npm run test:http`: 19 checks passed.
- `npm run lint`: zero errors; 21 warnings (existing React effect/image warnings plus the new account role initialization effect).
- `npm run build`: passed.
- `npm audit --omit=dev`: zero vulnerabilities.
- Browser widths: 360, 390, 768 and 1440. Screenshots in this directory under `accounts-*`. No horizontal overflow or page errors in the account browser checks.
- The initial sandboxed map regression encountered external tile loading failure. The complete suite passed when rerun with network access.

## Boundaries
- Driver document evidence is managed through HTTPS links and verification decisions; this change does not add a document storage service.
- Account activity shows the most recent 30 trips and audit events. Wallet history is paginated.
- Password rotation invalidates the current session as well as other sessions; the administrator must sign in again.
- Real payment processing and payouts remain disabled under the existing verification restrictions.
- Production deployment and live checks are recorded separately after release verification.
