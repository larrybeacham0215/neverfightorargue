-- =====================================================================
-- Never Fight or Argue Again — database schema
--
-- Run this once in Supabase: SQL Editor > New query > paste > Run.
-- Safe to re-run; everything is "if not exists".
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- SUBSCRIBERS — everyone who asked for the two free chapters
-- ---------------------------------------------------------------------
create table if not exists public.subscribers (
  id                uuid primary key default gen_random_uuid(),
  email             text not null,
  first_name        text,
  source            text default 'website',      -- which form they came from
  chapters_sent_at  timestamptz,                 -- null = delivery email failed
  unsubscribed_at   timestamptz,
  unsubscribe_token uuid not null default gen_random_uuid(),
  ip_hash           text,                        -- for abuse throttling, not identification
  created_at        timestamptz not null default now()
);

-- one row per address, case-insensitive
create unique index if not exists subscribers_email_key
  on public.subscribers (lower(email));

create index if not exists subscribers_created_idx
  on public.subscribers (created_at desc);

-- ---------------------------------------------------------------------
-- INQUIRIES — church/curriculum and speaking requests
-- ---------------------------------------------------------------------
create table if not exists public.inquiries (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in ('church','speaking')),
  first_name   text,
  last_name    text,
  email        text not null,
  organization text,
  details      jsonb default '{}'::jsonb,   -- interest, group size, format, date, notes
  handled      boolean not null default false,
  created_at   timestamptz not null default now()
);

create index if not exists inquiries_created_idx
  on public.inquiries (created_at desc);

-- ---------------------------------------------------------------------
-- SECURITY
--
-- RLS is ON with no public policies. That means the browser can never
-- read or write these tables directly, even though the anon key is
-- visible in the website's source. All writes go through the Edge
-- Function, which uses the service role key that stays on the server.
-- ---------------------------------------------------------------------
alter table public.subscribers enable row level security;
alter table public.inquiries   enable row level security;

revoke all on public.subscribers from anon, authenticated;
revoke all on public.inquiries   from anon, authenticated;

-- ---------------------------------------------------------------------
-- A convenience view for exporting your list later
-- (Table Editor > SQL Editor > select * from active_subscribers)
-- ---------------------------------------------------------------------
create or replace view public.active_subscribers as
  select email, first_name, created_at
  from public.subscribers
  where unsubscribed_at is null
  order by created_at desc;
