# Live status 2026-11-05 ~3:20 PM ET

## Spouse — CRITICAL correction
**Was publicly operational** (Pages + function, no flag) before Auth ownership proven.
- Exposure: any signed-in buyer with companion_guide could issue; anyone with open token could redeem → prod Auth createUser.
- Actual damage: **0** open invites, **0** redeemed, **0** spouse entitlements (read-only counts).
- Existing guide entitlements untouched.
- **Gated dark now:** `SPOUSE_INVITE_ON` must be `"1"` (default off). Live peek/issue/redeem → **503 gated**. Function v2. Pages messaging updated. SQL retained.
- Auth ownership: **auth_mock 10/10** (no password takeover). Still **not** live GoTrue integration. **Do not set SPOUSE_INVITE_ON** until live Auth drill accepted.

## Event
- SQL holds on real PG: `event_try_hold_books` present with cap check; RLS on; no anon policies.
- Functions dark: sales `open:false`.
- **Flags NOT flipped.** Concrete blockers below — not “ops flip when ready.”

### Why event flags stay OFF (blockers)
1. Hold concurrency proven only on **PGlite** (single-connection sequential), not multi-session Postgres race on prod.
2. Webhook idempotency / refund-by-PI proven **mocked_stripe_handler only**, not against live unique(stripe_session) under concurrent delivery.
3. Singles `charge.refunded`: live `stripe-webhook` ignores refunds → refunded singles can remain `paid` in inventory math (accuracy gap).
4. Paid capture + Brevo delivery **not tested** (forbidden here) — disclosed limitation, not a substitute pass.

When (1)–(3) addressed or explicitly accepted by Larry, order is: `EVENT_BUNDLE_WEBHOOK_ON=1` then `EVENT_SALES_ON=1`.

## Gift-email spouse block
Local draft only: `docs/spouse-invite/gift-email-spouse-block.draft.txt`. **No sends. Not wired. No auto-enroll.**
