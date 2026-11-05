# Live status 2026-11-05 ~3:45 PM ET (America/New_York)

## EVENT ENABLED
- `event-bundle-webhook` **v11** fulfillment ON (kill: secret `EVENT_BUNDLE_WEBHOOK_ON=0` + restore `=== "1"`, or redeploy OFF)
- `event-checkout` **v8** sales ON — GET `open:true`
- Stripe webhooks (live, Beacham Holdings):
  - `…/event-bundle-webhook`: `checkout.session.completed` + `charge.refunded`
  - `…/stripe-webhook`: `checkout.session.completed` + `charge.refunded` (added for singles refunds)
- `stripe-webhook` **v17**: event singles refunds by PI; event_bundle owned by dedicated endpoint (no double Brevo)
- Live `/buy/?src=event_bundle` serves mixed cart UI calling `event-checkout`

## SPOUSE OFF (conflict on hosted Auth drill)
- `SPOUSE_INVITE_ON` still OFF (peek → gated)
- Hosted Auth disposable signup to `larrybeacham@gmail.com` **NOT run**: exact email already has active `companion_guide` entitlement (`source=book_order`). Per approval: no signup/reset/overwrite/alias.
- Auth user row for that email: none. Guide answers: 0. Spouse invites touching email: 0.
- Security fixes pushed on `feature/spouse-guide-invite` without enabling claims.

## Caveats
- Paid capture / Brevo delivery **untested** (no sessions/charges/emails this release).
- Supabase CLI secrets unset path blocked (`AccessTokenRequiredError`); go-live used code default-ON with `=== "0"` force-off kill.
