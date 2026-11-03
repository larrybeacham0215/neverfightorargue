# Merge notes: feature/book-orders into main (Nov 3, 2026)

Do not merge to main without Larry's go-ahead. When this branch meets refresh/post-launch (438690b or later):

## refresh/post-launch wins for these (Ray Round 2 fixes, not on this branch)
- Docs moved to `_docs/`, and `_config.yml` excludes README, supabase, src and the rest from Pages. Keep refresh's `_config.yml`, `_docs/` and root layout.
- Old checkout pages (`book/checkout/`, `gift/`, `sponsor/checkout/`) are noindex redirects to `/book/`. Keep refresh's versions.
- `/program/` robots noindex meta. Keep refresh's version.
- `/express/` PIN limit (`supabase/sql/2026-11-02-express-pin-limit.sql`, pickup function). Keep refresh's. Not deployed yet (Ray Round 3 item 4, left as is).

A trial `git merge-tree origin/refresh/post-launch feature/book-orders` resolves all of the above to the refresh versions automatically.

## This branch wins for these
- `supabase/functions/book-checkout`, `book-upsell`, `book-order-webhook`: these copies match what is deployed (book-checkout v7, book-upsell v8, book-order-webhook v9).
- `supabase/sql/book_card_detach_sweep.sql`.

## The one conflict: `order-thank-you/index.html`
Resolve by hand: keep refresh's Venture copy and layout, and keep from this branch:
- `<meta name="robots" content="noindex,nofollow">` and `<meta name="referrer" content="no-referrer">`
- the ZIP check box (`#zipbox`), the gift copy offer first (`#o1`), the companion set offer second (`#o2`, shown only while "open"; it shows as added when bought at Checkout)
- the sessionStorage handling of `session_id` and the full script block
- the privacy line in "What happens next" (Stripe card on file about 30 minutes, Stripe customer record)
