# Live status 2026-11-05 ~3:25 PM ET (America/New_York)

## Flags (MUST stay OFF until Larry flip)
- `EVENT_SALES_ON` — **OFF** (GET `/event-checkout` → `open:false`)
- `EVENT_BUNDLE_WEBHOOK_ON` — **OFF** (default; fulfillment gated)
- `SPOUSE_INVITE_ON` — **OFF** (POST peek → `gated:true` 503)

## Dark deploys this turn (security/accuracy only)
| Artifact | Version / migration | Notes |
|---|---|---|
| `event_try_hold_books` advisory lock | migration `event_inventory_holds_lockfix` | `has_advisory=true` on prod |
| `spouse_invite` intended_email + redeem match | migration `spouse_invite_intended_email` | additive column; EXECUTE still revoked from anon/auth |
| `stripe-webhook` | **v16** | `charge.refunded` for event singles by `payment_intent`; stores PI on upsert; forwards `event_bundle` |
| `spouse-invite` | **v3** | anon.`signUp` + require confirmed session; **no** `admin.createUser({email_confirm:true})`; still gated OFF |

## Local proof (labels honest)
| Gate | Result | Artifact |
|---|---|---|
| Concurrent holds multi-session PG | **PASS 6/6** | `tests/event-buy/local-pg-integration-results.json` — `local_pg_multisession` + `mocked_stripe_external` |
| Mock Stripe handler | **PASS 20/20** | `tests/event-buy/mock-stripe-handler-results.json` — **mocked**, no Stripe network |
| Singles refund fix regression | **PASS 9/9** | `tests/event-buy/stripe-webhook-singles-refund-results.json` — local PG + mocked HMAC |
| Local GoTrue Auth + SMTP sink | **PASS 7/7** | `tests/spouse-invite/local-gotrue-auth-results.json` — GoTrue v2.197.0 @127.0.0.1:9999; **NOT prod Auth** |
| Spouse mocked / PGlite SQL | **PASS** | spouse-invite tests 4 files ok |
| Paid capture | **UNTESTED** (forbidden here) | not a requirement to authorize charge |
| Brevo / prod emails | **UNTESTED** (forbidden) | |

## Auth ownership policy (explicit)
- **Claims require verified email possession** via confirmation link delivered to that mailbox (local: SMTP sink proves delivery; sign-in before confirm → `email_not_confirmed`).
- **Forbidden:** `admin.createUser` / arbitrary `email_confirm:true` without possession — account takeover + misdelivery risk.
- Local test may SQL-confirm **only after** sink proves mail was addressed to that email (operator-simulated possession). Prod redeem path waits for confirmed session.

## Remaining blockers before enablement
1. Prod Auth drill against **live** Supabase Auth (local GoTrue PASS is necessary but not identical to hosted Auth mailer/templates). Keep SPOUSE OFF until accepted.
2. Paid capture + Brevo still explicitly untested — disclose; Larry may accept or require a controlled $1 path separately.
3. Confirm Stripe Dashboard still delivers `charge.refunded` to the live `stripe-webhook` endpoint (config, not code). Code path now handles it.

## Exposure
- Open spouse invites: 0; redeemed: 0 (SQL count).
- No production users/emails/payment sessions created this turn.
