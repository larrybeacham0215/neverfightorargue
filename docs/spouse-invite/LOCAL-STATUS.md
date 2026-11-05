# Spouse Companion Guide invite — local status (2026-11-05 ~2:50 PM ET)

Larry approved **local-only** build/test. **No publish, push, production SQL, outbound mail, or live mutations.**

## Implemented locally
- SQL: `supabase/sql/2026-11-05-spouse-guide-invite.sql` (table + issue/reissue/peek/redeem RPCs; parent-revoke cascade; no sequence/preorder)
- Edge: `supabase/functions/spouse-invite/index.ts` (GET peek, POST issue/reissue/redeem) — `deno check` clean
- UI: `guide/spouse/index.html` redeem page (`?i=` token)
- Members: Invite spouse / reissue block for qualifying buyer `companion_guide` seats
- Tests: `tests/spouse-invite/mocked-handler.test.mjs` → **26/26** (`test-results.json`) labeled unit + mocked_handler

## Holds (not done — need separate Larry approval)
1. Apply SQL to production Supabase
2. Deploy `spouse-invite` function
3. Publish `/guide/spouse/` (+ members patch) to Pages
4. Wire invite creation into gift/backfill email copy
5. Any reply to Rebecca/Mark

## Not in this work
Outbound messages, production writes, Stripe, marketing enrollment.
