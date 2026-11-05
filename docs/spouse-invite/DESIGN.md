# Spouse Companion Guide invite — design (prep only)

Prepared 2026-11-05 ~2:32 PM ET for Michelangelo / Larry. **No production mutations, no outbound mail, no repo publish.**

## Existing work inspected (no duplication)

| Area | Finding |
|---|---|
| Product model | `public.entitlements` one row per `(email_lower, product)` with `UNIQUE (email_lower, product)`. Product `companion_guide`. Live: 68 active rows (66 `past_buyer_gift`, 1 `book_order`, 1 `stripe`); 67 have `claim_token`. |
| Guide access | `/guide/?t=<uuid>` accepts **pickup_token** (preorder) **or** **claim_token** (past-buyer / book gift). `set_password` creates Auth user for that entitlement’s email. Answers keyed by `owner_key` (`usr:` / `ent:` / `ord:`). |
| Live edge functions | `guide` v7, `guide-backfill` v2, `guide-sequence` v3, `event-bundle-webhook`, `book-order-webhook`. **No spouse / invite / claim-invite tables or functions.** |
| Local trees | `/workspace/nfoa-site` (canonical site + SQL + guide with claim_token), `/workspace/checkouts/nfoa-guide-welcome-video` (older guide without claim_token path), marketing copy about “both spouses” in site HTML / guide content only. |
| Backfill rules to reuse | Past-buyer gift: claim_token link, **no** pickup email/QR/preorder row. Sequence enrollment is explicit for buyers; spouse flow must **not** auto-enroll. |

**Gap:** Today a buyer’s gift email says “Open my Companion Guide” with **their** claim link. Forwarding that link would make the spouse set a password on the **buyer’s** email / share the buyer’s answer set. Rebecca’s question (“own guide or share?”) is exactly this product gap.

## Requirements (Larry via Michelangelo)

1. Buyer can **forward a dedicated spouse-claim invitation** (not the buyer’s private auth/guide link).
2. Spouse redeems with **own email + password** and gets **independent answers**.
3. **One spouse per qualifying purchase**, single-use protected claim.
4. **No** pickup record/email; **no** automatic marketing enrollment.
5. Prepare/test locally; **hold** publish, production mutations, outbound messages.

## Proposed model

### New table `public.spouse_guide_invites` (additive)

- `id uuid pk`
- `token uuid unique not null` — used in forwardable URL `/guide/spouse/?i=<token>`
- `parent_entitlement_id uuid not null references entitlements(id)` — buyer’s `companion_guide` row
- `status text check in ('open','redeemed','revoked')`
- `created_at`, `redeemed_at`, `revoked_at`
- `spouse_entitlement_id uuid null references entitlements(id)`
- Partial unique: **at most one non-revoked invite per parent** (`unique(parent_entitlement_id) where status in ('open','redeemed')`) so one spouse per purchase.

### Entitlement for spouse

- New row: `email_lower` = spouse email, `product` = `companion_guide`, `source` = `spouse_claim`, `preorder_id` = null, own `claim_token`, `user_id` set on redeem.
- Optional columns (or keep linkage only on invites table): `parent_entitlement_id`, `role`.
- Respect existing `UNIQUE (email_lower, product)` — if spouse email already has guide access, redeem fails with a clear message (use members sign-in).

### Redeem API (new edge function or `guide` action)

`POST /guide/spouse` or `guide` with `{ invite, email, password, name }`:

1. Load invite `open` + parent entitlement active.
2. Reject if email equals buyer email; reject if spouse email already entitled.
3. `auth.admin.createUser` for spouse email; insert spouse entitlement; mark invite `redeemed`.
4. **Do not** insert `guide_sequence_state` / enqueue drip / Brevo list.
5. **Do not** create `preorders` or pickup tokens.

### Buyer UX

- In thank-you / gift email (and later members): a second block **“Invite your spouse”** with `/guide/spouse/?i=...` and plain text: “Forward this email to your spouse. Do not forward your own Open my Companion Guide link.”
- Issuing invite: create-or-return open invite for parent entitlement when gift/backfill/book grant runs (or on-demand from members). Never put buyer `claim_token` in the spouse block.

### Qualifying purchase

Any active `companion_guide` entitlement (past_buyer_gift, book_order, stripe/event_bundle). One spouse invite capacity per such entitlement.

## Local test evidence

Simulator: `/workspace/marriage-ministry/companion-guide/spouse-invite/spouse_invite_sim.py`  
Results: `/workspace/marriage-ministry/companion-guide/spouse-invite/test-results.json` — **12/12 passed** at 2026-11-05 14:31:52 EST (URL separation, single-use, one spouse, independent answers, no preorder, no marketing flag, same-email blocked).

## Sample forwardable copy (draft only — not sent)

Subject: Your spouse’s Companion Guide invite  

Body sketch:  
“[Buyer name] gifted you your own 12-week Companion Guide for Never Fight or Argue Again. This link is only for you. Create your password with **your** email. Your answers stay private from each other. Open: https://neverfightorargue.com/guide/spouse/?i=TOKEN”

## Hold / approval items

1. Larry go-ahead to implement in `neverfightorargue` (repo + SQL migration + edge function + email copy).
2. Confirm: spouse gets **no** guide-sequence emails by default (recommended).
3. Confirm: if spouse email already has access, show sign-in vs error.
4. Confirm: regenerate invite if lost before redeem (revoke old + new open) vs forever one token.
5. Who replies to Rebecca/Mark (ops, not this prep).
