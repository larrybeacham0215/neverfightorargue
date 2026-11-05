# Event table QR / checkout — diagnosis + local test (2026-11-05)

**Scope:** Larry approved local build/test for $50 bundles + $20 singles with quantities. **No publish, no public sales flags, no sends, no live Stripe checkout creation.**

## Decoded QR (actual)

| Asset | Decoded URL |
|---|---|
| `NFOAA-bundle-sign-letter-landscape-600dpi-v1.png` | `https://neverfightorargue.com/buy/?src=event_bundle` |
| `NFOAA-bundle-sign-letter-landscape-300dpi-v1.png` | same |
| `NFOAA-bundle-sign-letter-landscape-white-300dpi-v1.png` | same |
| Michelangelo photo `01M6PKE2YEJ2JPYR6DXTE41Q5K.jpg` | same |
| Sign build scripts (`v4-build/build7.py`, `build_letter1*.py`) | encode same URL |

**Printed QR can stay.** Destination is already correct.

## Why the phone showed the old page

| Layer | Finding |
|---|---|
| Live `GET /buy/?src=event_bundle` | Same HTML as `/buy/` (~7009 bytes). Title “Get your signed copy tonight”. **Only** “How many books?”, **$20 per book**. Calls **`/functions/v1/checkout`** (old launch-night path). Ignores `src`. |
| Michelangelo phone shot `01M6PKE85XHS7NHKT7PBE24X7E.png` | Matches that live old page (“LAUNCH NIGHT · AT THE BOOK TABLE”). |
| Branch `feature/event-bundle` (this worktree) | `/buy/` already has Event Bundle $50 + Signed book $20, defaults to bundle when `src=event_bundle`, calls **`event-checkout`**. |
| Live `GET event-checkout` | Deployed; returns `open:false`, `books_left:100`, `bundles_left:50` (`EVENT_SALES_ON` off). |

**Root cause:** QR is fine; **GitHub Pages `/buy/` on main was never updated** to the bundle UI / `event-checkout` wiring.

## Local implementation (this branch)

Worktree: `/workspace/nfoa-event-buy` · branch: `feature/event-buy-bundle-fix` (from `feature/event-bundle`).

Changes beyond prior event-bundle work:
- `supabase/functions/event-checkout/order-math.ts` — server-enforced item/qty/totals/books_pickup/guide flag
- `event-checkout/index.ts` — uses order-math; `validate_only` plans without Stripe; ignores client money fields; bundle requires email
- Tests: `tests/event-buy/order-math.test.mjs` → **17/17 pass**
- Preview: `docs/event-buy/preview/buy-mobile-preview.html` (+ prior screenshots copied)

### Semantics

| Choice | Unit | Qty max | Books for pickup | Guide entitlement |
|---|---|---|---|---|
| Single | $20 | min(10, books_left) | = qty | No |
| Bundle | $50 | min(5, bundles_left) | = qty × 2 | Yes (`companion_guide` via event-bundle-webhook) |

Caps: 100 books total, 50 bundles. Webhook upserts `preorders` with `quantity = bundles*2`, `onConflict: stripe_session` (idempotent). Refund revokes guide unless another paid bundle remains.

## Test evidence (what is / isn’t real)

| Kind | Result |
|---|---|
| **True unit tests** (order math, tamper, inventory, buy HTML contracts, webhook source contracts) | 17/17 pass — `tests/event-buy/test-results.json` |
| **Live Stripe Checkout session creation** | **Not run** (held — Larry: no live checkout creation) |
| **End-to-end paid webhook against production** | **Not run** |
| **Prior preview screenshots** (simulated) | `docs/event-buy/preview/02-buy-src-event_bundle.png` etc. from event-bundle preview pack |
| **Spouse invite** | Secondary; checkpoint preserved at `/workspace/nfoa-spouse-invite` `cf74253` |

## Release requirements (held — need separate Larry approval)

1. **Publish** `/buy/` (and `/event-thank-you/` if not already) from this branch / `feature/event-bundle` to GitHub Pages **main**. That alone makes the printed QR show the bundle UI.
2. Confirm Stripe Price ID `EVENT_BUNDLE_PRICE_ID` (default already wired to live $50 price in code).
3. Stripe webhook endpoint for `event-bundle-webhook` + secret `EVENT_BUNDLE_WEBHOOK_SECRET` (or forward from live webhook).
4. Flip **`EVENT_SALES_ON=1`** only when doors open (public sales).
5. Flip **`EVENT_BUNDLE_WEBHOOK_ON=1`** for real bundle fulfillment.
6. Do **not** enable these flags in this task.

## Rollback

- Revert `/buy/` on Pages to previous single-book HTML (QR still lands on `/buy/?src=event_bundle` but old UI ignores src).
- Set `EVENT_SALES_ON` unset/`0` → checkout POSTs 503.
- Set `EVENT_BUNDLE_WEBHOOK_ON` off → new bundle sessions ignored after verify.

## Spouse work

Isolated worktree `/workspace/nfoa-spouse-invite` branch `feature/spouse-guide-invite` commit `cf74253` (SQL + edge function WIP). Untouched by this event work. Still needs UI/tests before any publish.
