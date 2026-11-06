# MX-047–MX-053 verification notes

Production is preserved: no seed, country switch, wallet conversion, synthetic GPS or payment-provider activation is part of this deployment.

## Implemented

- Delivery uses locations, compact package sheet, existing vehicle assets, and payment confirmation. Send and Bring modes reuse account contacts and real GPS with manual overrides.
- Vehicle availability uses the same server-side courier readiness policy as dispatch. Optional category surcharges are independently configurable in country Delivery pricing and inherit the saved default when absent. The selected surcharge is snapshotted for settlement. No Taxi tariff is borrowed.
- Search supports saved/recent account places, bilingual landmark names, Arabic normalization and common aliases, cached Photon results, stale-request cancellation and visible outside-zone results.
- Wallet/profile responses select the active country's currency account. Historical balances remain separate and unchanged.
- Drivers request a fresh GPS fix on reconnect, focus and online activity. Stale GPS remains ineligible; the delivery dashboard explains it.
- Hero and Landmarks have separate routes, scoped draft/publish operations, revision protection, previews, archive and ordering.
- Jordan landmark import adds only missing inactive drafts. It never publishes or overwrites published entries.

## Landmark source provenance

The coordinate is an identified visitor/meeting location where the source provides one, not an invented official geographic boundary. Administrators must check access suitability before publishing. Images are intentionally empty.

| Landmark | Source |
| --- | --- |
| Petra | https://international.visitjordan.com/wheretogo/petra/ |
| Wadi Rum | https://whc.unesco.org/en/list/1377/maps |
| Dead Sea / Amman Tourist Beach | https://en.wikivoyage.org/wiki/Dead_Sea_(Jordan) |
| Jerash | https://international.visitjordan.com/wheretogo/jerash/ |
| Ajloun Castle | https://international.visitjordan.com/wheretogo/ajloun/ |
| Amman Citadel | https://international.visitjordan.com/wheretogo/amman/ |
| Aqaba meeting area | https://international.visitjordan.com/wheretogo/aqaba/ |
| Madaba | https://international.visitjordan.com/wheretogo/madaba/ |
| Mount Nebo | https://international.visitjordan.com/wheretogo/madaba/ |
| Dana visitor village | https://international.visitjordan.com/wheretogo/dana-feynan/ |
| Umm Qais | https://international.visitjordan.com/wheretogo/umm-qais/ |
| Wadi Mujib visitor centre | https://international.visitjordan.com/wheretogo/wadi-mujib/ |

## Evidence

`docs/qa/mx053/` contains the prior Delivery screenshot, original Taxi reference, new Send/Bring stages, Arabic/English layouts and Admin editors. Test names distinguish disposable simulated journeys from production read-only verification. No physical handover or audible device test is claimed.

Production's online courier was excluded for stale GPS during diagnosis. Online status alone is insufficient; this change does not fabricate a fresh location or relax dispatch safety.
The actual demo NO_COURIER order closed about 1.5 seconds after creation with zero offers. Its latest stored driver GPS timestamp was about 40 seconds after creation; this does not reconstruct earlier GPS history. New automatic searches now retry within the saved acceptance-time × maximum-offer budget, with a single waiting audit event. Eligibility is never bypassed, and refund remains atomic at exhaustion.

## Executed verification

- Unit suite: 62 passed, 0 failed.
- Full integration suite: 104 passed against a disposable local MongoDB replica set, including accounts, wallets, countries, notifications, map behavior, contact handling and ride safety.
- Original rider/CMS regression: 9 passed; original assets remain byte-identical.
- Lint: 0 errors, 113 existing warnings.
- Production dependency audit: 0 vulnerabilities.
- Production build: passed; page collection and generation use 2 workers.

Production verification is reported separately against the exact deployed SHA; this document records local evidence. The previous production wallet endpoint already selected JOD; the inconsistent profile response still selected EGP. The fix aligns that response and removes misleading EGP-only labels and quick amounts without changing stored balances.

## Limits

- Real card payments remain unavailable without a verified provider. No payment credentials or gateway activation changed.
- Cash, COD, wallet debit/refund, OTP and GPS scenarios use disposable QA accounts and funds. No real physical handover, real cash collection, or device-speaker audibility is claimed.
- Online production drivers still need fresh permission-backed GPS, correct opt-in, approval, vehicle and wallet eligibility. No safety condition is bypassed.
- Search and routing depend on configured upstream providers; failures and approximate route fallbacks are labelled.

Latest build targeted verification: 15 experience checks passed, including stale-GPS search recovery, one-refund accounting, both Send/Bring browser journeys, category pricing snapshots, secure handover, independent CMS scopes, JOD wallet/profile selection and all four bilingual responsive widths.

Final-build smart-delivery regressions: 20 passed, including independent zone enforcement, country containment, wallet/cash/COD isolation, cash reconciliation, duplicate protection, GPS denial, tracking/reconnect/staleness, responsive Arabic/English UI, and persistence across restart.


Final-build legacy delivery/security suite: 20 passed, including guest links, OTP attempts, original ringtone playback, exclusive assignment, participant-only GPS, proof, exactly-once settlement, chat, service switches and settings persistence. Final HTTP smoke suite: 21 passed.
