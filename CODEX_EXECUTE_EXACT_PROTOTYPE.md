# MAXRIDE — VERIFIED EXECUTION HANDOFF (DO NOT STOP AT PLANNING)

**Current target:** MX-036 exact prototype UI, MX-045 bilingual admin Hero/Explore, and **MX-046 correct DRIVER sound controls**.  
**User-confirmed regression:** GitHub commit `313831907cad25f45ef4738621d0cbf9d83c8683` only hid sound test controls from riders. Driver dashboard and driver NotificationControls still display them; this is NOT complete.  
**Expected location in local repository:** `D:\Kova\CODEX_EXECUTE_EXACT_PROTOTYPE.md` and `D:\Kova\design\reference\Maxride mobile app prototype.zip`.

## FIRST: verify inputs and implement—do not ask user to retype the spec

- Verify both files exist at their EXACT paths above. The complete source app lives inside the ZIP under `Maxride App.dc.html` with `assets/`; it must be inspected directly, not replaced by generated pictures.
- If installed from the handoff archive, verify the ZIP is valid, inspect `Maxride App.dc.html`, list and use all canonical assets required by screens, and proceed with source edits immediately.
- This is a SOURCE CODE and deployment task, not image-generation, a standalone demonstration or a proposal. Implement genuine Next.js/React pages in `D:\Kova`, with existing backend and signed-in routing unchanged.
- Work safely in the current repository and preserve any unrelated work in progress. Do not wipe user changes.
- Do not claim parity until actual screenshots against the reference and browser journeys pass.

## MX-046 — REMOVE THE SOUND TEST CONTROLS FROM THE *DRIVER*, NOT JUST THE RIDER

Current inspected GitHub source shows:

1. `src/app/driver/dashboard/page.js` renders a dedicated `<section aria-label="Incoming sound">` with `Enable Sound` and `Test Incoming Booking Sound` buttons.
2. `src/components/NotificationControls.jsx` renders `Enable Sound`, `Test sound`, and `Test Incoming Booking Sound` for `admin` and `driver` using `soundTools=['admin','driver'].includes(...)`.
3. `src/components/settings/PlatformForm.jsx` still renders unnecessary sound settings/test component in Admin Settings.

Requirements:
- Completely remove the visible **driver Incoming Sound diagnostic card** and the **Enable Sound, Test Sound and Test Incoming Booking Sound buttons** from the regular driver UI, driver profile/notification pane and any duplicate regular settings surface. Remove hidden/unused UI without breaking imports or accessibility. Do not merely hide the controls for riders.
- Do not require driver to open a settings page before hearing incoming Taxi or Delivery offers. **Enable intended audio behaviour by default**, and initialize/unlock `/sounds/new-ride.mp3` directly from the real Go Online user gesture, preserving browser autoplay restrictions. Ensure the offer ringtone repeats and stops on accept/decline/expiry/cancel/offline, with no doubles. Preserve Socket.IO and notification inbox.
- **Never claim OS/browser permission can be granted without user authorization.** If audio is blocked, show one compact user-facing status/action only in the exceptional blocked case; do not keep persistent test and enable cards in the normal UI. Keep actual accessibility needs and OS push-notification permission logic, but do not route normal users through test controls.
- Add browser assertions for **absence** of `Enable Sound`, `Test sound`, `Test Incoming Booking Sound`, and `Incoming sound` *on driver screens and driver notification controls*, not only on rider pages. Test a real incoming offer in local disposable browser and verify `new-ride.mp3` playback is attempted and audio time advances with `loop=true`, stops when expired. Disclose inability to verify physical-device audibility.
- MX-046 is an explicit bug fix in this delivery. It is NOT complete just because the rider sound controls are gone.

## Must-deliver checklist

- [ ] Canonical prototype extracted and inspected, original source images, SVG icons, proportions reused.
- [ ] All actual rider screens in the ZIP migrated to real Next.js app, no fake data.
- [ ] Hero banners and Explore (`Explore Jordan` / `استكشف الأردن`) editable independently in EN/AR from admin, stored persistently and scoped per country.
- [ ] Driver sound-test controls removed from driver dashboard and driver notification controls, without breaking actual ringtone.
- [ ] Screenshot comparisons to source states at 390 × 844; 360/768/1440 regression screens.
- [ ] Real booking, pricing, driver tracking, delivery, language, authorization, and admin CMS CRUD browser tests passed.
- [ ] No destructive migrations, no seed on production, no wallet/country changes, no fake GPS.
- [ ] Commit, push to existing deployment `main`, verify exact Render live SHA, `/api/health` and live rider pages. Show evidence for each.

---

# MAXRIDE — MANDATORY EXACT PROTOTYPE IMPLEMENTATION

**Project:** `D:\Kova`  
**Prototype:** `design/reference/Maxride mobile app prototype.zip`  
**Canonical layout source inside ZIP:** `Maxride App.dc.html`  
**Prototype assets:** `assets/` within the ZIP (source vehicle cards, map-top car icons, pins, service tiles, and UI icons)  
**Implementation scope:** MX-036 (full customer-facing UI faithfully implemented) and MX-045 (admin-managed bilingual Hero and Explore content)  
**Important:** This is an executable design-prototype reference, **not production backend code**. Do not bundle `support.js` into the production application, port any fake-map geometry, prices, users or timeouts as real app functionality.

## Objective and order of operations

Rebuild the existing MAXRIDE RIDER web/PWA UI directly from the provided ZIP with visually exact styling and interaction patterns. **DO NOT generate new designs, images, banners, style alternatives or concept screenshots.** There is no invitation to improve layout, adjust colors, add borders or spaces, change typography, or replace assets. Derive UI proportions, CSS geometry, colors, corner radii, icon placement, motion and transitions from the actual `Maxride App.dc.html`; reuse the exact original source assets and screen order. The current production app's authenticated ride/delivery/map/back-end functionality must keep working.

1. Read ZIP's entire `Maxride App.dc.html`, asset folders and `support.js` only as necessary to understand the prototype presentation. Extract ZIP safely inside the repo; avoid zip-slip. Preserve canonical ZIP and asset bytes.
2. Enumerate every design state (`isHome`, `isMap`, `isSearch`, `isOptions`, `isFinding`, `isDrive`, `isTrip`, `isRate`, `isPlace`, `isGrid`, cancellation, payment selector, account menu, SOS). Capture screenshot states on mobile. Note prototype view is drawn as a **390 × 844 phone shell**, with fixed sample state; adapt to actual viewport without embedding fake phone bezel/status bar in web/PWA page.
3. Implement production Next.js/React components reusing `assets/tile_car.png`, `assets/tile_delivery.png`, `assets/v/{economy,comfort,premium,xl}_card.png`, `assets/m/{economy,comfort,premium,xl}_top.svg`, pins and `assets/icons/*.svg`. Reuse exact aspect ratios and icon treatments.
4. Replace only hard-coded prototype mock data with existing MAXRIDE session, user profile, saved places, actual map/routing, real fares, real vehicle offerings, booking, status/socket events, driver details, wallet/payment method, chat, notifications, cancellation and safety review. **Never show a fake confirmed card payment, simulate driver's arrival, or fabricate location.** Preserve completed MX-033..035 and current locale/country work.
5. Keep customer experience working in Arabic RTL and English LTR; visual composition follows canonical reference with correct logical directional behavior and typography. Use existing i18n and responsive patterns. Any exact matching exception caused by truly variable data/map is documented and tested; no unrelated additions.
6. Integrate admin-editable Hero banners and Explore areas as detailed below; keep the prototype's **same display placement and layout**.
7. Test and iterate with Playwright screenshot comparisons against the original reference at 390 × 844, plus 360/768/1440 responsive checks. Capture every state, compare header/cards/tiles/sheets/bottom navigation/hero/explore. Do not declare 100% without measured visual comparisons and disclosed differences.

## Design-state mapping (extracted from canonical `sc-if` conditions)

| Canonical prototype state | Required real UI |
|---|---|
| `isHome` | greeting/profile, `Where to?`, `Now`, Home/Work/Saved Places, Taxi/Delivery tiles, Hero slider, Explore section, bottom nav |
| `isMap` | real location map with same sheet/form surface |
| `isSearch` | current pickup, destination search, saved/suggested places and optional stop if backend supports it; implement real stop semantics rather than a fake control |
| `isOptions` | route line + real distance/time, actual vehicle categories and card artwork, current fare and payment selector |
| `showPay` | payment method drawer with only actually supported/authorized methods; disabled gateways cannot be selected |
| `isFinding` | actual dispatch/searching state, no fixed timeout pretending driver accepted |
| `isDrive`, `isArriving`, `isTrip` | live driver/vehicle card and GPS map, ETA, chat, cancellation, SOS where implemented, trip status and safe completion |
| `showCancel`, `isCancelled` | real reason collection, cancellation rules and backend record |
| `isRate` | completed ride/receipt and real rating submission |
| `isPlace`, `isGrid` | Explore listing/detail and booking-to-location using saved admin content, same layout |
| `menu`, `showSos` | existing actual account, safety and notification operations with exact design treatment |

### Fixed visual rules

- Mobile prototype foreground and all UI placements follow `Maxride App.dc.html` exactly. Maintain overall warm off-white palette, black typography/buttons, white cards, radii, row alignment, spacings and slide animations, with genuine uploaded images in the original placement. Do not substitute a separate design system.
- Use real MapLibre for actual map layers. **Do not copy decorative mock map roads and hard-coded driver dots** from the prototype as real GPS evidence. Match visible overlays, route colors, markers and sheet proportions.
- Use actual `assets/m/*_top.svg` and `assets/v/*_card.png`. Display electric and additional service categories only if the backend pricing, service eligibility and vehicle data genuinely support them.
- Keep bottom navigation and card positions consistent with the reference. RTL mirrors directional UI where appropriate but never mirrors geographic coordinates.
- The source prototype does **not** define a separate login design state. Preserve working existing sign-in flow and style it consistently; use configurable admin background/hero image requested previously, without claiming an exact login screenshot exists in this ZIP.

## MX-045 — Admin-managed Hero AND Explore content (MANDATORY)

The source prototype hardcodes `SL` Hero slides and a heading `Explore Jordan`, plus `PL` attraction cards. These must become real editable content managed through the ADMIN, **without moving or redesigning their presentation**.

Create an admin UX in the existing Settings / Content area, e.g. `Admin > Content > Rider Home` with 2 independent sections: `Hero banners` and `Explore destinations`, plus `Login background` if an existing appearance/admin field does not provide it. Reuse existing auth, company branding, settings persistence, audit and upload patterns. A business administrator can fully edit the following:

**Hero banner management:**
- Add, upload/replace/remove image, edit, preview, activate/deactivate, change order, scheduled publish (optional if implemented correctly), and remove/archive entries. Each slide has `headlineAr`, `headlineEn`, `subtitleAr`, `subtitleEn`, `image`, optional safe internal action/URL, display order, active state, and country scope.
- Preserve exact prototype hero proportions, slide motion, arrows, gradient readability overlay, indicator/dots and location on Home; changing content must not change layout.
- Upload images persistently through existing media backend (not local ephemeral Render filesystem); validate content type, dimensions and size, avoid XSS/unsafe URLs, expose public display URLs only for approved public banner media. Keep binary assets out of ordinary tiny setting documents when possible. Offer consistent crop preview matching the hero's actual aspect ratio.
- Country-scoped content resolves against the operating country's `activeCountry`, but **the copy remains manually editable**, not forced by the code.

**Explore section management:**
- Entire section heading, including the exact words **`Explore Jordan` / `استكشف الأردن`**, must be editable independently in English **and** Arabic: `exploreTitleEn`, `exploreTitleAr`.
- Edit CTA text independently in both languages, e.g. `Explore all` / `استكشف الكل`, AND its navigation action.
- Admin can create/update/archive/reorder Explore destination items, set image, `nameAr/nameEn`, short description, detailed description, province/region, pickup/destination coordinates (verified), display metadata with real travel estimates rather than fabricated static travel times, active visibility, and linked destination page/booking action.
- **Maintain the exact existing carousel circles, item size, spacing, cards, heading alignment, Explore all placement, full listing and detail page design**. Never move Explore above hero or turn it into generic category cards.
- On country switch, load that country's saved content. A country with no configured Explore data must not display `Explore Jordan` erroneously. Show a neutral localized title or hide empty entries while preserving surrounding layout; allow admin to configure each market. Do not overwrite per-country content when switching active country.
- Do not bake translated text into images. Use localization controlled by user (`ar`, `en`) independent of operating country.

**Admin content quality:**
- Responsive organized UI, drag sort or up/down controls, Save / Discard, show `Saved successfully` only after authoritative MongoDB write, optimistic revision checking, same-origin/admin-only APIs, audit history, no broken images, preview AR and EN without publishing, empty states and media upload errors.
- Provide content APIs, durable schemas and server validation; no hardcoded content arrays in the production rider page.
- Once saved, user Home should reflect content immediately on refresh and update in a predictable manner without cached old-country hero or Explore data. Verify persistence across Render restart.

### Acceptance tests specific to CMS

1. From admin switch operating-country preview to JO; enter title `Explore Jordan` and `استكشف الأردن`, save. English client displays English, Arabic client shows Arabic, both at exact prototype coordinates and styling.
2. Edit title to `Discover Jordan` and `اكتشف الأردن`, save, reload customer page: **text changes only**, no spacing/reflow surprise. Revert to desired production text at end of test if using production.
3. Upload two real Hero banners with distinct AR/EN headlines; reorder, disable one, save. Customer slider shows exactly the active ordered banners, correct image crop, dots count, slide content and click action.
4. Add/disable/reorder Explore destinations and verify list/detail behavior and image rendering; no stale content on client after refresh.
5. Switch preview to EG; JO Explore title and content must **not** leak into EG unless explicitly configured as fallback.
6. Persistence verified after refresh/restart and responsive 360/390/768/1440. Admin without privileges cannot modify content.

## Technical safeguards

- Inspect current `src/app/(rider)/dashboard/page.js`, `src/app/(auth)/login/page.js`, `src/components/delivery/ServiceChoices.jsx`, `src/components/maps/MapView.jsx`, `src/components/ride/AssignedVehicleCard.jsx`, current Providers/Auth and the current admin settings API before modifying.
- Reuse the existing ride booking endpoints, state hooks, driver locations, safety checks, currency accounts and country/zone policies. No new fake data, mock receipts or incorrect service declarations.
- If the prototype includes `Cash (COD)` and `Visa` UI but the production provider is not connected, display only methods supported and explicitly enabled, without altering canonical payment drawer placement; do not claim card transactions occurred.
- Maintain account security and privacy; no unaudited modifications of active trips or payments.
- Do not silently alter the `Maxride App.dc.html`, `support.js` or source assets; copy needed files into app static assets with original data.

## Done criteria / deployment

Run `npm ci`, `npm run lint`, `npm test`, `npm run test:http`, applicable `npm run test:integration`, `npm run build`, and relevant Playwright visual and behavioural flows. The project has previously hit Render OOM while collecting page data; preserve constrained build concurrency and validate Docker build within Render's available memory. Confirm existing admin/driver/taxi/delivery maps and settlement regressions. Commit and push via the configured GitHub deployment remote to `main`, verify actual Render Live SHA and `/api/health`, verify on production in customer AR/EN and admin CMS. **Do not report a successful visual match or publication until independently verified.**

Report: route/screens migrated; screenshots and mismatch summary; which fields are admin-editable; actual CMS CRUD tests; production SHA; QA pass/fail; deferred features (only if backend incapable without separate changes). Avoid vague 'implemented' or fake screenshots.
