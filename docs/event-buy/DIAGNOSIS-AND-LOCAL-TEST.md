# Event table QR / mixed checkout — local status (2026-11-05 ~2:46 PM ET)

## Decoded QR
All horizontal sign assets + Michelangelo photo decode to:
`https://neverfightorargue.com/buy/?src=event_bundle`
**Printed QR can stay.**

## Prior bug in summary
Earlier note “books_pickup = 2×bundles” was **incomplete**. Correct formula:
**`books_pickup = 2 * bundle_qty + single_qty`**. Guide entitlement **only if `bundle_qty >= 1`**.

## What was wrong in code (fixed locally)
UI + `event-checkout` were **XOR** (bundle *or* single per order). Now mixed cart:
- `/buy/` has Bundles + Singles qty selectors; total and pickup count update live
- POST `{ bundles, singles, name, email }` (legacy `{ item, quantity }` still works)
- Stripe session can have two line items; metadata carries `bundles`, `singles`, `books`
- Webhook saves `quantity: booksPickup` (not only `bundles*2`); grants `companion_guide` only when `bundleQty >= 1`
- Idempotency: upsert `onConflict: stripe_session`
- Refund: revoke guide only if no other paid `event_bundle` for that email
- Flags: `EVENT_SALES_ON` (checkout), `EVENT_BUNDLE_WEBHOOK_ON` (fulfillment) — both stay off

## Tests
`/workspace/nfoa-event-buy/tests/event-buy/mixed-cart-test-results.json` — **16/16**
- **unit**: pure math
- **mocked_handler**: in-memory webhook/refund — **not** live Stripe/DB
- **source_contract**: local file asserts
**Not run:** live Checkout sessions, production writes, live webhook delivery.

## Screenshot
**Full path:** `/workspace/nfoa-event-buy/docs/event-buy/preview/02-buy-src-event_bundle.png`  
**Provenance:** existing prior preview (copy of `marriage-ministry/event-bundle/screenshots/02-buy-src-event_bundle.png`, byte-identical). **Not generated this session.** Shows **old XOR** UI with Event Bundle selected.  
**New mixed UI:** open `/workspace/nfoa-event-buy/docs/event-buy/preview/buy-mobile-preview.html` (parent-arranged desktop; no Playwright here).

## Gaps blocking safe release (nothing here is release approval)
1. Publish `/buy/` (+ thank-you if needed) from this branch to Pages — live still serves old single-book `checkout` page.
2. Deploy updated `event-checkout` + `event-bundle-webhook` with mixed metadata/quantity mapping.
3. Confirm Stripe bundle price ID + webhook endpoint/secret.
4. Larry flip **`EVENT_SALES_ON=1`** and **`EVENT_BUNDLE_WEBHOOK_ON=1`** separately when doors open.
5. Fresh mobile screenshot of **mixed** UI (parent desktop) — current PNG is stale XOR.
6. Known race: last-book double checkout can oversell by 1–2 (documented earlier); optional DB reservation not done.
7. Singles-only still go `kind=preorder` through **live** stripe-webhook path — confirm that path remains correct after Pages cutover.
8. No live paid E2E under this approval.

## Branch
`/workspace/nfoa-event-buy` · `feature/event-buy-bundle-fix` — local commits only, no push.
