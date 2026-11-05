-- Companion Guide follow-up email sequence (Day 1 + weeks 1-12).
-- Additive only. Gated off by GUIDE_SEQUENCE_ON in the edge function.

create table if not exists public.guide_sequence_state (
  entitlement_id uuid primary key references public.entitlements(id) on delete cascade,
  email_lower text not null check (email_lower = lower(email_lower)),
  unsub_token uuid not null default gen_random_uuid() unique,
  is_test boolean not null default false,
  enrolled_at timestamptz not null default now(),
  stopped_at timestamptz,
  stop_reason text
);

create table if not exists public.guide_email_queue (
  id uuid primary key default gen_random_uuid(),
  entitlement_id uuid not null references public.entitlements(id) on delete cascade,
  preorder_id uuid references public.preorders(id) on delete set null,
  email_lower text not null check (email_lower = lower(email_lower)),
  step text not null,
  step_num integer not null,
  due_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'skipped', 'stopped')),
  skip_reason text,
  sent_at timestamptz,
  brevo_message_id text,
  is_test boolean not null default false,
  created_at timestamptz not null default now(),
  unique (entitlement_id, step)
);

create index if not exists guide_email_queue_due_idx
  on public.guide_email_queue (status, due_at)
  where status = 'pending';

create index if not exists guide_email_queue_sent_day_idx
  on public.guide_email_queue (sent_at)
  where status = 'sent';

alter table public.guide_sequence_state enable row level security;
alter table public.guide_email_queue enable row level security;
-- No policies: service role only (edge functions).

-- Count sends since midnight America/New_York (shared Brevo daily budget).
create or replace function public.guide_sequence_sent_today()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.guide_email_queue
  where status = 'sent'
    and sent_at >= (date_trunc('day', now() at time zone 'America/New_York') at time zone 'America/New_York');
$$;
revoke all on function public.guide_sequence_sent_today() from public, anon, authenticated;

-- Enroll one entitlement into all 13 steps. Idempotent (ignoreDuplicates on unique).
create or replace function public.enroll_guide_sequence(p_entitlement_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  e record;
  p record;
  v_is_test boolean := false;
  v_purchased timestamptz;
  v_count int := 0;
  step_rec record;
  v_inserted int;
begin
  select id, email_lower, preorder_id, granted_at, revoked_at
    into e from public.entitlements where id = p_entitlement_id;
  if e.id is null or e.revoked_at is not null then
    return 0;
  end if;

  v_purchased := e.granted_at;
  if e.preorder_id is not null then
    select id, test_run, created_at, status into p from public.preorders where id = e.preorder_id;
    if p.id is not null then
      if p.status = 'refunded' then return 0; end if;
      v_is_test := p.test_run is not null;
      v_purchased := coalesce(p.created_at, v_purchased);
    end if;
  end if;

  insert into public.guide_sequence_state (entitlement_id, email_lower, is_test)
  values (e.id, e.email_lower, v_is_test)
  on conflict (entitlement_id) do nothing;

  for step_rec in
    select * from (values
      ('day1', 0, 1),
      ('week1', 1, 7),
      ('week2', 2, 14),
      ('week3', 3, 21),
      ('week4', 4, 28),
      ('week5', 5, 35),
      ('week6', 6, 42),
      ('week7', 7, 49),
      ('week8', 8, 56),
      ('week9', 9, 63),
      ('week10', 10, 70),
      ('week11', 11, 77),
      ('week12', 12, 84)
    ) as t(step, step_num, offset_days)
  loop
    insert into public.guide_email_queue (
      entitlement_id, preorder_id, email_lower, step, step_num, due_at, is_test
    ) values (
      e.id, e.preorder_id, e.email_lower, step_rec.step, step_rec.step_num,
      v_purchased + (step_rec.offset_days || ' days')::interval, v_is_test
    )
    on conflict (entitlement_id, step) do nothing;
    get diagnostics v_inserted = row_count;
    v_count := v_count + v_inserted;
  end loop;

  return v_count;
end;
$$;
revoke all on function public.enroll_guide_sequence(uuid) from public, anon, authenticated;
