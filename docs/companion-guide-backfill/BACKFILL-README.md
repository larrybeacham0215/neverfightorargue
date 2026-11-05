# Past-buyer Companion Guide gift backfill

BUILD + DRY RUN. No emails to real buyers. No live entitlements or enrollments for real buyers until Larry approves the recipient list, the count, and flips `GUIDE_BACKFILL_ON=1`.

## Larry corrections (Nov 5, 2026)

1. **Gift email copy approved**: `emails/past-buyer-gift-email-v1.md`, subject "A thank-you gift from Larry & Ro". Loaded into `guide-backfill/gift-email.ts`. Sending still waits on list + count approval.
2. **Full 13-step sequence**: past buyers get Day 1 ("Pick up where you left off") and weeks 1-12, timed from the gift send. There is **no Day 1 skip**.
3. **No pickup artifacts**: backfill must NOT send the buyer pickup email ("Your books are ready at the table"), create a pickup QR/token, or insert a preorders/pickup row. Books were already delivered.
4. **Guide link without pickup token**: entitlement gets a `claim_token`. Gift + Day 1 links use `/guide/?t=<claim_token>` so first-visit set-password works. Fallback: `/members/`.

Backfill does only: grant `companion_guide` entitlement + send gift email + enroll full sequence.

## Dry-run inventory (America/New_York)

CSV: `backfill/past-buyers-dryrun.csv`

| Decision | Count |
| --- | --- |
| include | 66 |
| exclude | 3 |
| needs_review | 0 |
| unique emails scanned | 69 |

Include by source (deduped; book_orders mirrors preorders/event, so sources are canonicalized):

| Source | Include |
| --- | --- |
| preorder | 33 |
| event_table (launch day) | 33 |

Excluded (do not gift): Larry addresses (`larrybeacham@`, `virtualceoworld@`), test_mode / test_run / $1 tests, event_bundle buyers, existing `companion_guide` entitlement, placeholder emails.

`larrysmithryu@proton.me` moved to **include** per Larry (was needs_review).

## Pacing

- Shared Brevo cap with KDM: 300/day.
- Guide mail budget: `GUIDE_SEQUENCE_DAILY_BUDGET` default **100**/America/New_York day (gift sends + sequence sends counted together via `guide_mail_sent_today()`).
- Day 1 is offset **+1 day** from gift send, so gift-day and Day 1 do not collide on the same calendar day.
- At 100 gifts/day: **66 includes need ~1 day(s)** of gift sending after go-live. Then Day 1 and weeklies follow on their due dates under the same budget.

## Gate

| Secret | Default | Notes |
| --- | --- | --- |
| `GUIDE_BACKFILL_ON` | off | Must be `1` for real sends. Dry-run always allowed. |
| `GUIDE_SEQUENCE_ON` | off | Real sequence sends still gated separately. Throwaway/test rows can send while off. |
| `GUIDE_SEQUENCE_DAILY_BUDGET` | 100 | Shared by sequence + backfill gift sends. |

## Function

- `guide-backfill` actions: `dry_run` (default), `render_sample`, `test_throwaway`, `cleanup_throwaway`, `run` (requires flag + recipients).
- SQL: `supabase/sql/2026-11-05-past-buyer-backfill.sql` (claim_token, buyer_name, cohort, guide_backfill_log, guide_mail_sent_today).
- Guide API accepts pickup_token **or** claim_token on `?t=`.
- Sequence emails for past buyers use claim_token URL (or `/members/` if missing).

## Sample renders (dry run)

- `backfill/sample-gift-email.html` / `.txt` (with first name)
- `backfill/sample-gift-email-no-name.html` / `.txt` (greeting becomes `Hi,`)

## Throwaway test (done, cleaned up)

Created entitlement for `guide-backfill-throwaway@neverfightorargue.com` with claim_token, no preorder_id, enrolled all 13 steps including day1, cohort `past_buyer_gift`. Called guide API with `?t=<claim_token>`: `ok=true`, `can_set_password=true`, guide HTML returned. Random token rejected. Row cleaned up afterward. **No Brevo email sent** (still dry-run for real mail).

## Still needs Larry

1. Approve the include list + count (**66**; needs_review cleared).
2. Confirm gift email (copy already approved).
3. Set `GUIDE_BACKFILL_ON=1` (and usually `GUIDE_SEQUENCE_ON=1`) when ready to send.
