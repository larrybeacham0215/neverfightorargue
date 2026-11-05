do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
create schema if not exists public;

create table if not exists public.preorders (
  id uuid primary key default gen_random_uuid(),
  email text, status text default 'paid', channel text, quantity int default 1,
  created_at timestamptz default now()
);

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
  claim_token uuid,
  unique (email_lower, product)
);

create table if not exists public.guide_sequence_state (
  entitlement_id uuid primary key references public.entitlements(id) on delete cascade,
  email_lower text,
  buyer_name text,
  stopped_at timestamptz,
  stop_reason text
);

create table if not exists public.guide_answers (
  id bigint generated always as identity primary key,
  owner_key text not null,
  entitlement_id uuid references public.entitlements(id) on delete cascade,
  field_id text not null,
  value text not null default '',
  updated_at timestamptz not null default now(),
  unique (owner_key, field_id)
);

create table if not exists public.guide_email_queue (
  id uuid primary key default gen_random_uuid(),
  entitlement_id uuid references public.entitlements(id) on delete cascade,
  status text default 'pending',
  skip_reason text
);
