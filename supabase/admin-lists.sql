-- =====================================================================
-- Password gate for the /guests/ and /readers/ lists
-- Applied to the NFOAA project on Oct 3, 2026.
--
-- The password itself is NEVER stored in this repo. Only a bcrypt hash is
-- kept, in private.admin_secrets (a schema the public API can't reach).
-- To set or change it, run this once in the Supabase SQL editor
-- (replace the placeholder; don't commit the real value anywhere):
--
--   insert into private.admin_secrets (name, hash)
--   values ('lists_password', extensions.crypt('<NEW PASSWORD>', extensions.gen_salt('bf', 10)))
--   on conflict (name) do update set hash = excluded.hash, updated_at = now();
-- =====================================================================

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.admin_secrets (
  name       text primary key,
  hash       text not null,
  updated_at timestamptz not null default now()
);

create table if not exists private.admin_attempts (
  id    bigserial primary key,
  scope text not null,
  ip    text not null,
  ok    boolean not null,
  at    timestamptz not null default now()
);
create index if not exists admin_attempts_at_idx on private.admin_attempts (at);

-- Returns 'ok', 'wrong', 'locked' or 'unset'.
-- Brute-force friction: 5 wrong tries per IP per 15 minutes, and 30 wrong
-- tries in total per hour, after which every attempt is refused until the
-- window passes. Callable only by the service role (the Edge Functions).
create or replace function public.nfoa_admin_check(p_password text, p_ip text, p_scope text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  h text;
  ip_fails int;
  all_fails int;
  who text := coalesce(nullif(p_ip, ''), 'unknown');
begin
  delete from private.admin_attempts where at < now() - interval '1 day';
  select count(*) into ip_fails from private.admin_attempts
    where not ok and ip = who and at > now() - interval '15 minutes';
  select count(*) into all_fails from private.admin_attempts
    where not ok and at > now() - interval '1 hour';
  if ip_fails >= 5 or all_fails >= 30 then
    return 'locked';
  end if;
  select s.hash into h from private.admin_secrets s where s.name = 'lists_password';
  if h is null then
    return 'unset';
  end if;
  if extensions.crypt(left(coalesce(p_password, ''), 200), h) = h then
    insert into private.admin_attempts (scope, ip, ok) values (coalesce(p_scope, '?'), who, true);
    return 'ok';
  end if;
  insert into private.admin_attempts (scope, ip, ok) values (coalesce(p_scope, '?'), who, false);
  return 'wrong';
end
$$;

revoke all on function public.nfoa_admin_check(text, text, text) from public, anon, authenticated;
grant execute on function public.nfoa_admin_check(text, text, text) to service_role;

-- The active_subscribers view (name + email of every subscriber) was readable
-- and writable through the public API with the anon key. It's only used from
-- the SQL editor, so the public roles lose all access. The service role and
-- the SQL editor are unaffected.
revoke all on public.active_subscribers from anon, authenticated;
