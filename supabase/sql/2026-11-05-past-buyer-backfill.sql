-- Past-buyer Companion Guide gift backfill support.
-- Additive only. Does NOT create preorders or pickup tokens.
-- Gated off by GUIDE_BACKFILL_ON in the guide-backfill edge function.

-- Claim token: past buyers open /guide/?t=<claim_token> without a preorder/pickup row.
-- First visit can set a password the same way as a pickup-token link.
alter table public.entitlements
  add column if not exists claim_token uuid;

create unique index if not exists entitlements_claim_token_uidx
  on public.entitlements (claim_token)
  where claim_token is not null;

-- Buyer display name for sequence emails when there is no preorder row.
alter table public.guide_sequence_state
  add column if not exists buyer_name text;

alter table public.guide_sequence_state
  add column if not exists cohort text;

-- Log of gift emails (and dry-run decisions) for pacing + audit.
create table if not exists public.guide_backfill_log (
  id uuid primary key default gen_random_uuid(),
  email_lower text not null check (email_lower = lower(email_lower)),
  name text,
  source text,
  entitlement_id uuid references public.entitlements(id) on delete set null,
  claim_token uuid,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'dry_run', 'skipped', 'failed', 'test')),
  skip_reason text,
  brevo_message_id text,
  is_test boolean not null default false,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists guide_backfill_log_sent_day_idx
  on public.guide_backfill_log (sent_at)
  where status = 'sent';

create unique index if not exists guide_backfill_log_email_sent_uidx
  on public.guide_backfill_log (email_lower)
  where status = 'sent' and is_test = false;

alter table public.guide_backfill_log enable row level security;
-- No policies: service role only.

-- Combined send count for guide sequence + gift backfill (America/New_York day).
create or replace function public.guide_mail_sent_today()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select (
    (select count(*)::int from public.guide_email_queue
      where status = 'sent'
        and sent_at >= (date_trunc('day', now() at time zone 'America/New_York') at time zone 'America/New_York'))
    +
    (select count(*)::int from public.guide_backfill_log
      where status = 'sent'
        and sent_at >= (date_trunc('day', now() at time zone 'America/New_York') at time zone 'America/New_York'))
  );
$$;
revoke all on function public.guide_mail_sent_today() from public, anon, authenticated;
