-- Applied Nov 2, 2026 (migration book_card_detach_sweep). Additive only.
alter table public.book_orders add column if not exists card_detached_at timestamptz;
-- Sweep secret lives in Vault as nfoa_sweep_secret (generated in SQL, never printed).
-- public.nfoa_sweep_secret(): security definer, execute granted to service_role only.
-- pg_cron job nfoa-card-sweep, every 10 minutes: pg_net POST to book-upsell with header x-nfoa-sweep.
