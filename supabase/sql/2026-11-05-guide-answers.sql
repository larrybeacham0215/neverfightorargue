-- Companion Guide answers (additive). Only the guide edge function (service role) reads or writes.
create table if not exists public.guide_answers (
  id bigint generated always as identity primary key,
  owner_key text not null,            -- 'ent:<entitlement id>' or 'ord:<preorder id>'
  entitlement_id uuid references public.entitlements(id) on delete cascade,
  preorder_id uuid references public.preorders(id) on delete cascade,
  field_id text not null check (field_id ~ '^[a-z0-9-]{1,60}$'),
  value text not null default '' check (length(value) <= 4000),
  updated_at timestamptz not null default now(),
  unique (owner_key, field_id)
);
create index if not exists guide_answers_owner on public.guide_answers(owner_key);
alter table public.guide_answers enable row level security;
revoke all on public.guide_answers from anon, authenticated;
-- No policies: clients cannot read or write. Later, a My Library page can add
-- a policy matching entitlements.user_id = auth.uid().
