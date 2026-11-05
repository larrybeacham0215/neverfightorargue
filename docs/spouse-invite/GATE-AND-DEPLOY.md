# Event + Spouse — gate evidence & deploy order (2026-11-05 ~3:15 PM ET)

Conditional Larry approval (via Michelangelo): publish/deploy/enable **after** security/integration gates. **No emails. No paid tests.**

## Gate results (concrete)

| Gate | Result | Evidence label |
|---|---|---|
| Mixed qty `books=2b+s`, guide iff bundles≥1 | PASS | unit + live `validate_only` → books_pickup=4, amount=9000 for 1b+2s |
| Server totals / ignore client money | PASS | unit `ignored_client_money_fields` |
| Live Stripe prices | PASS (read-only) | single `price_1UIqyG…` $20 active; bundle `price_1UYSsc…` $50 active |
| Singles-only routing | PASS (mocked) | `kind=preorder` ignored by event-bundle-webhook; legacy stripe-webhook `channel=event` |
| Idempotent session upsert | PASS (mocked_stripe_handler) | same `stripe_session` → one row |
| Refund without charge.metadata.kind | PASS (fixed + mocked) | lookup via `payment_intent` → `product=event_bundle`; keep entitlement if other paid bundle |
| Inventory oversell race | PASS (sql_pglite holds) | `event_try_hold_books` second concurrent hold blocked at cap; wired in event-checkout |
| Spouse SQL single-use / reissue / isolation / parent-revoke | PASS | sql_pglite **21/21** |
| Spouse GET non-consuming | PASS | sql_pglite peek + live peek invalid → 403 |
| Spouse no marketing/pickup | PASS | sql_pglite no sequence/preorder rows |
| Spouse Auth password ownership | PARTIAL | mocked_handler only (sign-in first, never overwrite). **No live Auth smoke** (would create users; no-email constraint). |
| Paid Stripe E2E | NOT RUN | Authorized no paid tests. `validate_only` + mocks ≠ payment E2E. |

## Live changes already made (dark — flags still OFF)

1. SQL migrations applied on NFOAA: `event_inventory_holds`, `spouse_guide_invite`
2. Edge functions deployed: `event-checkout` v7, `event-bundle-webhook` v10, `spouse-invite` v1
3. Verified: GET `open:false`; validate_only mixed cart OK; spouse peek rejects bad token

**NOT done:** `EVENT_SALES_ON=1`, `EVENT_BUNDLE_WEBHOOK_ON=1`, Pages publish of `/buy/` + `/guide/spouse/` + members invite UI (pending push), gift-email spouse block.

## Enablement (separate — do not claim done here)

Only after Pages cutover + ops ready:
1. Confirm Pages `/buy/?src=event_bundle` shows mixed UI
2. Set `EVENT_BUNDLE_WEBHOOK_ON=1` first (fulfillment)
3. Set `EVENT_SALES_ON=1` second (sessions)
4. Smoke: validate_only + one **ops-approved** paid path later (not under this turn)

## Deploy order / rollback (documented; flags flip is last)

**Order:** SQL additive → edge functions (dark) → Pages static → flip webhook flag → flip sales flag.

**Rollback:**
- Sales: set `EVENT_SALES_ON` unset/0 (stops new sessions immediately)
- Webhook: set `EVENT_BUNDLE_WEBHOOK_ON` unset/0 (new paid bundles ignored until re-enabled; existing paid rows remain)
- Functions: redeploy prior versions (event-checkout v6, event-bundle-webhook v9) from git `b39d856` / prior sha
- SQL: leave tables (additive); do not drop in panic — holds expire; spouse table unused if UI unpublished
- Pages: revert `/buy/`, `/guide/spouse/`, `members/` commits on `main`

## Limitation disclosure

No-charge local/PGlite + mocked Stripe + live `validate_only` **does not** prove end-to-end card capture, Brevo delivery, or Auth createUser against production Auth. Those need an ops-approved paid/no-email Auth drill outside this gate.
