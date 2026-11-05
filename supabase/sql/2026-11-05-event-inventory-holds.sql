-- Soft inventory holds for event checkout (additive). Prevents double-sell races
-- between concurrent Checkout Sessions. Holds expire; paid preorders remain source of truth.
-- Safe while EVENT_SALES_ON is off (no sessions created).

create table if not exists public.event_checkout_holds (
  id uuid primary key default gen_random_uuid(),
  hold_token text not null unique,
  books integer not null check (books > 0 and books <= 20),
  bundles integer not null default 0 check (bundles >= 0),
  expires_at timestamptz not null,
  stripe_session text,
  created_at timestamptz not null default now()
);
create index if not exists event_checkout_holds_exp_idx on public.event_checkout_holds (expires_at);
alter table public.event_checkout_holds enable row level security;
-- service role only

create or replace function public.event_active_held_books(p_since timestamptz)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(books), 0)::int
  from public.event_checkout_holds
  where expires_at > now()
    and created_at >= p_since;
$$;
revoke all on function public.event_active_held_books(timestamptz) from public, anon, authenticated;

-- Atomically place a hold if sold + active holds + requested <= book_cap (default 100).
create or replace function public.event_try_hold_books(
  p_books integer,
  p_bundles integer,
  p_hold_token text,
  p_since timestamptz,
  p_book_cap integer default 100,
  p_ttl_minutes integer default 35
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sold int;
  v_held int;
  v_id uuid;
begin
  if p_books is null or p_books < 1 or p_books > 20 then
    return jsonb_build_object('ok', false, 'error', 'bad_books');
  end if;
  if p_hold_token is null or length(p_hold_token) < 16 then
    return jsonb_build_object('ok', false, 'error', 'bad_token');
  end if;

  -- purge expired (cheap)
  delete from public.event_checkout_holds where expires_at <= now();

  select coalesce(sum(quantity),0)::int into v_sold
  from public.preorders
  where channel = 'event' and status = 'paid' and created_at >= p_since and test_run is null;

  select coalesce(sum(books),0)::int into v_held
  from public.event_checkout_holds
  where expires_at > now() and created_at >= p_since;

  if v_sold + v_held + p_books > p_book_cap then
    return jsonb_build_object(
      'ok', false,
      'error', 'not_enough',
      'sold', v_sold,
      'held', v_held,
      'left', greatest(0, p_book_cap - v_sold - v_held)
    );
  end if;

  insert into public.event_checkout_holds (hold_token, books, bundles, expires_at)
  values (p_hold_token, p_books, coalesce(p_bundles, 0), now() + make_interval(mins => greatest(5, least(p_ttl_minutes, 120))))
  on conflict (hold_token) do update
    set books = excluded.books,
        bundles = excluded.bundles,
        expires_at = excluded.expires_at
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'hold_id', v_id,
    'sold', v_sold,
    'held', v_held + p_books,
    'left', p_book_cap - v_sold - v_held - p_books
  );
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'token_conflict');
end;
$$;
revoke all on function public.event_try_hold_books(integer, integer, text, timestamptz, integer, integer) from public, anon, authenticated;

create or replace function public.event_attach_hold_session(p_hold_token text, p_stripe_session text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.event_checkout_holds
    set stripe_session = p_stripe_session
    where hold_token = p_hold_token and expires_at > now();
  return found;
end;
$$;
revoke all on function public.event_attach_hold_session(text, text) from public, anon, authenticated;

-- After paid upsert, drop the hold so sold count (preorders) is sole truth.
create or replace function public.event_release_hold(p_hold_token text default null, p_stripe_session text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_stripe_session is not null then
    delete from public.event_checkout_holds where stripe_session = p_stripe_session;
  end if;
  if p_hold_token is not null then
    delete from public.event_checkout_holds where hold_token = p_hold_token;
  end if;
end;
$$;
revoke all on function public.event_release_hold(text, text) from public, anon, authenticated;
