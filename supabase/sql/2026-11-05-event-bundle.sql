-- Event bundle (Nov 6-7, 2026). Additive only: new columns default to values
-- that leave every existing row and the live functions unchanged.
alter table public.preorders add column if not exists bundles integer not null default 0;
alter table public.preorders add column if not exists product text;
alter table public.preorders add column if not exists payment_intent text;
alter table public.preorders add column if not exists refunded_at timestamptz;
alter table public.preorders add column if not exists test_run text;
create index if not exists preorders_payment_intent_idx on public.preorders (payment_intent);

-- Digital entitlements: the base for a Supabase Auth "My Library" later.
-- One row per (lower(email), product). user_id gets filled when the buyer
-- signs in with Supabase Auth using the same email.
create table if not exists public.entitlements (
  id uuid primary key default gen_random_uuid(),
  email_lower text not null check (email_lower = lower(email_lower)),
  product text not null,
  source text not null default 'stripe',
  stripe_session text,
  preorder_id uuid references public.preorders(id) on delete set null,
  user_id uuid,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoke_reason text,
  unique (email_lower, product)
);
alter table public.entitlements enable row level security;
-- No policies: only the service role (edge functions) can read or write.
-- Later, for My Library:  create policy "own" on entitlements for select
--   using (email_lower = lower(auth.jwt()->>'email') and revoked_at is null);

-- Books sold at the event (singles + 2 per bundle), paid and not refunded.
create or replace function public.event_books_sold(p_since timestamptz)
returns table(books integer, bundles integer)
language sql stable security definer set search_path = public as $$
  select coalesce(sum(quantity),0)::int, coalesce(sum(bundles),0)::int
  from preorders
  where channel = 'event' and status = 'paid' and created_at >= p_since and test_run is null;
$$;
revoke all on function public.event_books_sold(timestamptz) from public, anon, authenticated;
