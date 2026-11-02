-- /express/ PIN attempt limit (for the pickup function, v3).
-- NOT APPLIED. Apply in the SQL editor only with Larry's OK, then deploy pickup v3.
-- Reuses private.admin_attempts from supabase/admin-lists.sql.
-- Locked when an IP has 5 wrong tries in 15 minutes, or 30 wrong tries in total
-- in the last hour, for the given scope.
create or replace function public.nfoa_attempt_locked(p_ip text, p_scope text)
returns boolean language sql security definer set search_path = '' as $$
  select (select count(*) from private.admin_attempts
           where not ok and scope = p_scope and ip = coalesce(nullif(p_ip, ''), 'unknown')
             and at > now() - interval '15 minutes') >= 5
      or (select count(*) from private.admin_attempts
           where not ok and scope = p_scope and at > now() - interval '1 hour') >= 30;
$$;

create or replace function public.nfoa_attempt_log(p_ip text, p_scope text, p_ok boolean)
returns void language sql security definer set search_path = '' as $$
  insert into private.admin_attempts (scope, ip, ok)
  values (coalesce(p_scope, '?'), coalesce(nullif(p_ip, ''), 'unknown'), coalesce(p_ok, false));
$$;

revoke all on function public.nfoa_attempt_locked(text, text) from public, anon, authenticated;
revoke all on function public.nfoa_attempt_log(text, text, boolean) from public, anon, authenticated;
grant execute on function public.nfoa_attempt_locked(text, text) to service_role;
grant execute on function public.nfoa_attempt_log(text, text, boolean) to service_role;
