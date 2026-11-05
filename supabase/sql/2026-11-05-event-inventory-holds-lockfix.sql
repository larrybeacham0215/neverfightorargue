-- Serialize event holds: advisory lock prevents double-accept under concurrent checkouts.
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
  -- Global event-inventory lock for this transaction (key = hashtext('nfoa_event_holds')).
  perform pg_advisory_xact_lock(87201405);

  if p_books is null or p_books < 1 or p_books > 20 then
    return jsonb_build_object('ok', false, 'error', 'bad_books');
  end if;
  if p_hold_token is null or length(p_hold_token) < 16 then
    return jsonb_build_object('ok', false, 'error', 'bad_token');
  end if;

  delete from public.event_checkout_holds where expires_at <= now();

  select coalesce(sum(quantity),0)::int into v_sold
  from public.preorders
  where channel = 'event' and status = 'paid' and created_at >= p_since and test_run is null;

  select coalesce(sum(books),0)::int into v_held
  from public.event_checkout_holds
  where expires_at > now() and created_at >= p_since;

  if v_sold + v_held + p_books > p_book_cap then
    return jsonb_build_object(
      'ok', false, 'error', 'not_enough',
      'sold', v_sold, 'held', v_held,
      'left', greatest(0, p_book_cap - v_sold - v_held)
    );
  end if;

  insert into public.event_checkout_holds (hold_token, books, bundles, expires_at)
  values (p_hold_token, p_books, coalesce(p_bundles, 0), now() + make_interval(mins => greatest(5, least(p_ttl_minutes, 120))))
  on conflict (hold_token) do update
    set books = excluded.books, bundles = excluded.bundles, expires_at = excluded.expires_at
  returning id into v_id;

  return jsonb_build_object(
    'ok', true, 'hold_id', v_id, 'sold', v_sold,
    'held', v_held + p_books, 'left', p_book_cap - v_sold - v_held - p_books
  );
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'token_conflict');
end;
$$;
revoke all on function public.event_try_hold_books(integer, integer, text, timestamptz, integer, integer) from public, anon, authenticated;
