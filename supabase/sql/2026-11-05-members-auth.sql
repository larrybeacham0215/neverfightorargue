-- Members area (additive). Supabase Auth email + password accounts for buyers.
-- Writes stay server side (service role in the guide and webhook functions).
-- Signed-in members can only READ their own rows.
alter table public.guide_answers add column if not exists user_id uuid references auth.users(id) on delete set null;
create index if not exists guide_answers_user_idx on public.guide_answers(user_id);
create index if not exists entitlements_user_idx on public.entitlements(user_id);

alter table public.entitlements enable row level security;
alter table public.guide_answers enable row level security;

drop policy if exists "members read own entitlements" on public.entitlements;
create policy "members read own entitlements" on public.entitlements
  for select to authenticated
  using (user_id = auth.uid() or email_lower = lower(coalesce(auth.jwt() ->> 'email', '')));

drop policy if exists "members read own guide answers" on public.guide_answers;
create policy "members read own guide answers" on public.guide_answers
  for select to authenticated
  using (user_id = auth.uid());

grant select on public.entitlements, public.guide_answers to authenticated;
