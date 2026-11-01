-- Applied live Nov 1, 2026 (NFOAA). Downloads page opt-in.
alter table public.subscribers add column if not exists tags text[] not null default '{}';
alter table public.subscribers add column if not exists last_seen_source text;
create or replace function public.nfoa_downloads_signup(p_email text, p_first_name text, p_ip_hash text, p_tag text default 'downloads-qr')
returns table(inserted boolean, subscriber_id uuid)
language sql security definer set search_path = public as $$
  insert into subscribers(email, first_name, source, tags, last_seen_source, ip_hash)
  values (lower(trim(p_email)), nullif(trim(p_first_name),''), p_tag, array[p_tag], p_tag, p_ip_hash)
  on conflict (email) do update set
    tags = case when p_tag = any(subscribers.tags) then subscribers.tags else subscribers.tags || p_tag end,
    last_seen_source = p_tag,
    first_name = coalesce(nullif(subscribers.first_name,''), excluded.first_name)
  returning (xmax = 0), id;
$$;
revoke all on function public.nfoa_downloads_signup(text,text,text,text) from public, anon, authenticated;
grant execute on function public.nfoa_downloads_signup(text,text,text,text) to service_role;
