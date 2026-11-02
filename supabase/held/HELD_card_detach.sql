-- HELD (not applied). Ray Round 2 must-fix 1, "disclosed" mode. Additive only.
alter table public.book_orders add column if not exists card_detached_at timestamptz;

-- Sweep every 10 minutes. Requires pg_cron and pg_net, and SWEEP_SECRET set on book-upsell.
-- Replace <SWEEP_SECRET> with the same value (store it in Vault rather than inline if possible).
-- select cron.schedule('nfoa-card-sweep', '*/10 * * * *', $$
--   select net.http_post(
--     url := 'https://zojsascliwlqgxcrqqlo.supabase.co/functions/v1/book-upsell',
--     headers := jsonb_build_object('content-type','application/json','x-nfoa-sweep','<SWEEP_SECRET>'),
--     body := '{}'::jsonb);
-- $$);
