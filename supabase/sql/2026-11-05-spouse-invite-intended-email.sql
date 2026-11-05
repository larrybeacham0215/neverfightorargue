-- Bind invite to an intended spouse email (additive). Redeem must match.
alter table public.spouse_guide_invites
  add column if not exists intended_email_lower text
  check (intended_email_lower is null or intended_email_lower = lower(intended_email_lower));

create or replace function public.spouse_invite_issue(
  p_parent_entitlement_id uuid,
  p_token_hash text,
  p_created_by text default 'system',
  p_intended_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_email text;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'error', 'bad_token_hash');
  end if;
  if not public.spouse_parent_is_qualifying(p_parent_entitlement_id) then
    return jsonb_build_object('ok', false, 'error', 'parent_not_qualifying');
  end if;
  v_email := nullif(lower(trim(coalesce(p_intended_email, ''))), '');
  if v_email is not null and position('@' in v_email) = 0 then
    return jsonb_build_object('ok', false, 'error', 'bad_intended_email');
  end if;
  if exists (
    select 1 from public.spouse_guide_invites
    where parent_entitlement_id = p_parent_entitlement_id
      and status in ('open', 'redeemed')
  ) then
    return jsonb_build_object('ok', false, 'error', 'slot_taken');
  end if;

  insert into public.spouse_guide_invites (
    parent_entitlement_id, token_hash, status, created_by, intended_email_lower
  ) values (
    p_parent_entitlement_id, p_token_hash, 'open', coalesce(nullif(p_created_by, ''), 'system'), v_email
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'invite_id', v_id, 'status', 'open', 'intended_email', v_email);
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'slot_taken');
end;
$$;
revoke all on function public.spouse_invite_issue(uuid, text, text, text) from public, anon, authenticated;

-- Keep 3-arg overload for compatibility by wrapping
create or replace function public.spouse_invite_issue(
  p_parent_entitlement_id uuid,
  p_token_hash text,
  p_created_by text default 'system'
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.spouse_invite_issue(p_parent_entitlement_id, p_token_hash, p_created_by, null);
$$;

-- Redeem: if intended_email set, require match
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

  select * into inv from public.spouse_guide_invites where token_hash = p_token_hash for update;
  if inv.id is null then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  if inv.status = 'redeemed' then return jsonb_build_object('ok', false, 'error', 'already_used'); end if;
  if inv.status = 'revoked' then return jsonb_build_object('ok', false, 'error', 'revoked'); end if;

  if inv.intended_email_lower is not null and inv.intended_email_lower <> v_email then
    return jsonb_build_object('ok', false, 'error', 'email_mismatch');
  end if;

  select * into parent from public.entitlements where id = inv.parent_entitlement_id for update;
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
  ) returning id into v_ent;

  update public.spouse_guide_invites
    set status = 'redeemed', redeemed_at = now(), spouse_entitlement_id = v_ent, spouse_email_lower = v_email
    where id = inv.id and status = 'open';
  if not found then
    delete from public.entitlements where id = v_ent;
    return jsonb_build_object('ok', false, 'error', 'already_used');
  end if;

  return jsonb_build_object('ok', true, 'entitlement_id', v_ent, 'claim_token', v_claim, 'email', v_email, 'user_id', p_user_id);
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'email_already_entitled');
end;
$$;
revoke all on function public.spouse_invite_redeem(text, text, uuid, text) from public, anon, authenticated;
