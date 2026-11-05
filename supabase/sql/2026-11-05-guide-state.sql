-- Companion Guide per-buyer UI state (additive). Only the guide edge function (service role) reads or writes.
-- welcome_video_seen_at: set when the buyer closes the welcome video modal, so it does not reopen on another device.
create table if not exists public.guide_state (
  owner_key text primary key,          -- 'usr:<user id>', 'ent:<entitlement id>' or 'ord:<preorder id>'
  user_id uuid,
  entitlement_id uuid references public.entitlements(id) on delete cascade,
  preorder_id uuid references public.preorders(id) on delete cascade,
  welcome_video_seen_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.guide_state enable row level security;
revoke all on public.guide_state from anon, authenticated;
-- No policies: clients cannot read or write directly.
