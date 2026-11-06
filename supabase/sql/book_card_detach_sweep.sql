-- Applied Nov 2, 2026 (migration book_card_detach_sweep). Additive only.
alter table public.book_orders add column if not exists card_detached_at timestamptz;
-- Sweep secret lives in Vault as nfoa_sweep_secret (generated in SQL, never printed).
-- public.nfoa_sweep_secret(): security definer, execute granted to service_role only.
-- pg_cron job nfoa-card-sweep, every 10 minutes: pg_net POST to book-upsell with header x-nfoa-sweep.
--
-- Nov 5, 2026: Edge STRIPE_SECRET_KEY is a restricted rk_live without PaymentIntent expand or
-- PaymentMethods write, so sweep returned 401 and alerted. Vault nfoa_stripe_secret holds the
-- existing full sk_live (same Stripe account). public.nfoa_stripe_secret() is service_role-only;
-- book-upsell prefers it when the env key is not sk_*. Alerts are once per order (30 days).
