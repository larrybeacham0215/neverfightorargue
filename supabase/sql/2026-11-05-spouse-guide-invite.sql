-- Spouse Companion Guide invitation (additive).
-- Prep/local only until Larry approves deploy. No pickup rows. No sequence enrollment.
-- Token plaintext is never stored: only sha256 hex (64 chars) of the secret.

alter table public.entitlements
  add column if not exists parent_entitlement_id uuid references public.entitlements(id) on delete set null;

alter table public.entitlements
  add column if not exists role text;

create index if not exists entitlements_parent_idx
  on public.entitlements (parent_entitlement_id)
  where parent_entitlement_id is not null;

comment on column public.entitlements.parent_entitlement_id is
  'For source=spouse_claim: buyer companion_guide entitlement this spouse seat came from.';
comment on column public.entitlements.role is
  'Optional: buyer | spouse. Null on legacy rows.';

create table if not exists public.spouse_guide_invites (
  id uuid primary key default gen_random_uuid(),
  parent_entitlement_id uuid not null references public.entitlements(id) on delete cascade,
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'open'
    check (status in ('open', 'redeemed', 'revoked')),
  created_at timestamptz not null default now(),
  redeemed_at timestamptz,
  revoked_at timestamptz,
  spouse_entitlement_id uuid references public.entitlements(id) on delete set null,
  spouse_email_lower text check (spouse_email_lower = lower(spouse_email_lower)),
  created_by text not null default 'system'
    check (created_by in ('system', 'buyer', 'admin', 'reissue'))
);

create unique index if not exists spouse_guide_invites_token_hash_uidx
  on public.spouse_guide_invites (token_hash);

-- One live seat slot per parent: at most one open OR redeemed invite (revoked do not count).
create unique index if not exists spouse_guide_invites_one_live_per_parent_uidx
  on public.spouse_guide_invites (parent_entitlement_id)
  where status in ('open', 'redeemed');

create index if not exists spouse_guide_invites_parent_idx
  on public.spouse_guide_invites (parent_entitlement_id);

alter table public.spouse_guide_invites enable row level security;
-- No policies: service role / security definer only.

-- Parent entitlement must be an active companion_guide grant (qualifying purchase).
create or replace function public.spouse_parent_is_qualifying(p_parent_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.entitlements e
    where e.id = p_parent_id
      and e.product = 'companion_guide'
      and e.revoked_at is null
      and coalesce(e.role, 'buyer') <> 'spouse'
      and e.parent_entitlement_id is null
  );
$$;
revoke all on function public.spouse_parent_is_qualifying(uuid) from public, anon, authenticated;

-- Issue a new open invite. Fails if a live (open|redeemed) invite already exists.
-- p_token_hash is sha256 hex of the secret the caller will put in the forwardable URL.
create or replace function public.spouse_invite_issue(
  p_parent_entitlement_id uuid,
  p_token_hash text,
  p_created_by text default 'system'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'error', 'bad_token_hash');
  end if;
  if not public.spouse_parent_is_qualifying(p_parent_entitlement_id) then
    return jsonb_build_object('ok', false, 'error', 'parent_not_qualifying');
  end if;
  if exists (
    select 1 from public.spouse_guide_invites
    where parent_entitlement_id = p_parent_entitlement_id
      and status in ('open', 'redeemed')
  ) then
    return jsonb_build_object('ok', false, 'error', 'slot_taken');
  end if;

  insert into public.spouse_guide_invites (
    parent_entitlement_id, token_hash, status, created_by
  ) values (
    p_parent_entitlement_id, p_token_hash, 'open', coalesce(nullif(p_created_by, ''), 'system')
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'invite_id', v_id, 'status', 'open');
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'slot_taken');
end;
$$;
revoke all on function public.spouse_invite_issue(uuid, text, text) from public, anon, authenticated;

-- Reissue: revoke current OPEN invite only, then insert a new open invite.
-- Cannot reissue after redeemed (no extra spouse slots).
create or replace function public.spouse_invite_reissue(
  p_parent_entitlement_id uuid,
  p_new_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_open uuid;
  v_id uuid;
begin
  if p_new_token_hash is null or p_new_token_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'error', 'bad_token_hash');
  end if;
  if not public.spouse_parent_is_qualifying(p_parent_entitlement_id) then
    return jsonb_build_object('ok', false, 'error', 'parent_not_qualifying');
  end if;

  select id into v_open
  from public.spouse_guide_invites
  where parent_entitlement_id = p_parent_entitlement_id
    and status = 'open'
  for update;

  if v_open is null then
    if exists (
      select 1 from public.spouse_guide_invites
      where parent_entitlement_id = p_parent_entitlement_id and status = 'redeemed'
    ) then
      return jsonb_build_object('ok', false, 'error', 'already_redeemed');
    end if;
    -- No open invite: behave like issue (first invite or after prior revoke with no live slot)
    return public.spouse_invite_issue(p_parent_entitlement_id, p_new_token_hash, 'reissue');
  end if;

  update public.spouse_guide_invites
    set status = 'revoked', revoked_at = now()
    where id = v_open;

  insert into public.spouse_guide_invites (
    parent_entitlement_id, token_hash, status, created_by
  ) values (
    p_parent_entitlement_id, p_new_token_hash, 'open', 'reissue'
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'invite_id', v_id, 'status', 'open', 'revoked_invite_id', v_open);
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'slot_taken');
end;
$$;
revoke all on function public.spouse_invite_reissue(uuid, text) from public, anon, authenticated;

-- Non-consuming peek by token hash (safe for GET / email scanners).
create or replace function public.spouse_invite_peek(p_token_hash text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  inv record;
  parent record;
  buyer_name text;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  select * into inv from public.spouse_guide_invites where token_hash = p_token_hash;
  if inv.id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  select * into parent from public.entitlements where id = inv.parent_entitlement_id;
  select g.buyer_name into buyer_name
    from public.guide_sequence_state g where g.entitlement_id = inv.parent_entitlement_id;

  return jsonb_build_object(
    'ok', true,
    'status', inv.status,
    'parent_active', (parent.id is not null and parent.revoked_at is null and parent.product = 'companion_guide'),
    'buyer_first_name', split_part(coalesce(buyer_name, ''), ' ', 1)
  );
end;
$$;
revoke all on function public.spouse_invite_peek(text) from public, anon, authenticated;

-- Atomic redeem. Caller must have already proven auth (new user created OR existing password verified).
-- Does NOT enroll guide_sequence / marketing. Does NOT create preorders.
create or replace function public.spouse_invite_redeem(
  p_token_hash text,
  p_spouse_email text,
  p_user_id uuid,
  p_spouse_name text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inv record;
  parent record;
  v_email text;
  v_ent uuid;
  v_claim uuid := gen_random_uuid();
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if p_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'missing_user');
  end if;

  v_email := lower(trim(coalesce(p_spouse_email, '')));
  if v_email = '' or position('@' in v_email) = 0 then
    return jsonb_build_object('ok', false, 'error', 'bad_email');
  end if;

  select * into inv
  from public.spouse_guide_invites
  where token_hash = p_token_hash
  for update;

  if inv.id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if inv.status = 'redeemed' then
    return jsonb_build_object('ok', false, 'error', 'already_used');
  end if;
  if inv.status = 'revoked' then
    return jsonb_build_object('ok', false, 'error', 'revoked');
  end if;

  select * into parent
  from public.entitlements
  where id = inv.parent_entitlement_id
  for update;

  if parent.id is null or parent.revoked_at is not null or parent.product <> 'companion_guide' then
    return jsonb_build_object('ok', false, 'error', 'parent_inactive');
  end if;
  if coalesce(parent.role, 'buyer') = 'spouse' or parent.parent_entitlement_id is not null then
    return jsonb_build_object('ok', false, 'error', 'parent_not_qualifying');
  end if;
  if v_email = parent.email_lower then
    return jsonb_build_object('ok', false, 'error', 'same_as_buyer');
  end if;

  if exists (
    select 1 from public.entitlements
    where email_lower = v_email and product = 'companion_guide' and revoked_at is null
  ) then
    return jsonb_build_object('ok', false, 'error', 'email_already_entitled');
  end if;

  insert into public.entitlements (
    email_lower, product, source, claim_token, user_id,
    parent_entitlement_id, role, granted_at
  ) values (
    v_email, 'companion_guide', 'spouse_claim', v_claim, p_user_id,
    parent.id, 'spouse', now()
  )
  returning id into v_ent;

  update public.spouse_guide_invites
    set status = 'redeemed',
        redeemed_at = now(),
        spouse_entitlement_id = v_ent,
        spouse_email_lower = v_email
    where id = inv.id
      and status = 'open';

  if not found then
    -- Lost race after lock (should be rare); roll back entitlement
    delete from public.entitlements where id = v_ent;
    return jsonb_build_object('ok', false, 'error', 'already_used');
  end if;

  -- Explicit: never enroll guide_sequence_state / queue from here.
  return jsonb_build_object(
    'ok', true,
    'entitlement_id', v_ent,
    'claim_token', v_claim,
    'email', v_email,
    'user_id', p_user_id
  );
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'email_already_entitled');
end;
$$;
revoke all on function public.spouse_invite_redeem(text, text, uuid, text) from public, anon, authenticated;

-- When a buyer entitlement is revoked, revoke open invites and spouse seats under it.
create or replace function public.spouse_on_parent_revoke()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.revoked_at is not null
     and (OLD.revoked_at is null)
     and NEW.product = 'companion_guide'
     and coalesce(NEW.role, 'buyer') <> 'spouse'
     and NEW.parent_entitlement_id is null
  then
    update public.spouse_guide_invites
      set status = 'revoked', revoked_at = coalesce(revoked_at, now())
      where parent_entitlement_id = NEW.id and status = 'open';

    update public.entitlements
      set revoked_at = coalesce(revoked_at, now()),
          revoke_reason = coalesce(revoke_reason, 'parent_revoked')
      where parent_entitlement_id = NEW.id
        and product = 'companion_guide'
        and revoked_at is null;
  end if;
  return NEW;
end;
$$;

drop trigger if exists spouse_on_parent_revoke_trg on public.entitlements;
create trigger spouse_on_parent_revoke_trg
  after update of revoked_at on public.entitlements
  for each row execute function public.spouse_on_parent_revoke();

-- Access helper: spouse (or any) entitlement is usable only if not revoked and parent (if any) still active.
create or replace function public.companion_guide_access_ok(p_entitlement_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.entitlements e
    left join public.entitlements p on p.id = e.parent_entitlement_id
    where e.id = p_entitlement_id
      and e.product = 'companion_guide'
      and e.revoked_at is null
      and (e.parent_entitlement_id is null or (p.id is not null and p.revoked_at is null))
  );
$$;
revoke all on function public.companion_guide_access_ok(uuid) from public, anon, authenticated;
