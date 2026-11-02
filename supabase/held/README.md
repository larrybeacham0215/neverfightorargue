
## Round 2 (Nov 2, 2026)

Deployed: book-checkout v5, book-upsell v6 (production, TEST_TOKEN empty).
- Browser calls need an allowed Origin. Stripe-signed calls are exempt.
- The rate-limit IP comes from cf-connecting-ip, else the last X-Forwarded-For hop. A fail-open logs RATE_LIMIT_FAIL_OPEN.
- Signatures are compared in constant time.
- Upsell: an old pending fallback Checkout is expired before a new one is made. A paid one is recorded, and an open one that will not expire returns 409.
- The thank-you page needs the shipping ZIP before it shows names or adds anything. It locks after 5 misses in 30 minutes.

Held (in git, not deployed):
- book-order-webhook/index.ts: constant-time compare, test_quantity removed, optional_items add-ons split by Price ID.
- book-checkout/index.next.ts:
  - CARD_SAVE_MODE can be disclosed, opt_in or off.
  - The Pay button disclosure text.
  - optional_items, turned on only when OPTIONAL_ITEMS=on.
  - Prices: gift copy price_1UXTPSLCCdJWrOprt7wE8MTs ($15) and companion set price_1UXTQcLCCdJWrOprsG3rGD4a ($9).
- book-upsell/index.next.ts: detaches the saved card when both offers are used or the window closes, plus a SWEEP_SECRET sweep. The key needs PaymentMethods: Write.
- held/HELD_card_detach.sql: card_detached_at column and a pg_cron sweep.
