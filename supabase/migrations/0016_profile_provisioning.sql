-- AutoFair migration 0016 — guarantee a profiles row for every auth user
--
-- Bug found from production: 6 of 10 auth.users rows had no public.profiles
-- row (every account created while signup provisioning was broken, i.e. before
-- migration 0014 restored the service_role bypass). requireAuth() treats a
-- missing profile as an invalid session and answers
-- 401 "Please sign in again to continue.", so those users looked signed in
-- (the header only reads the stored session) while every privileged API
-- rejected them — the Contact Seller button just re-opened the sign-in modal.
-- vehicles.seller_id also references profiles(id), so the same accounts could
-- not submit a listing either.
--
-- This migration backfills the missing rows and reinstalls the signup trigger,
-- because a trigger that is simply absent in the connected project produces
-- exactly this silent state. The profile INSERT is deliberately NOT wrapped in
-- an exception handler: if provisioning fails, signup fails loudly instead of
-- leaving an account that can never be authorized.

-- ============ 1. backfill accounts that predate provisioning ============
-- Role is always 'customer': this must never promote an existing row, and the
-- LEFT JOIN ... IS NULL guard keeps already-provisioned admins/staff intact.
insert into public.profiles (id, full_name, avatar_url, email, role, is_active)
select
  u.id,
  nullif(trim(coalesce(
    nullif(u.raw_user_meta_data->>'full_name', ''),
    nullif(u.raw_user_meta_data->>'name', ''),
    ''
  )), ''),
  nullif(coalesce(
    nullif(u.raw_user_meta_data->>'avatar_url', ''),
    nullif(u.raw_user_meta_data->>'picture', ''),
    ''
  ), ''),
  u.email,
  'customer',
  true
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;

-- ============ 2. hardened signup provisioning ============
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_avatar text;
  v_phone text;
begin
  v_name := nullif(trim(coalesce(
    nullif(new.raw_user_meta_data->>'full_name', ''),
    nullif(new.raw_user_meta_data->>'name', ''),
    ''
  )), '');

  v_avatar := nullif(coalesce(
    nullif(new.raw_user_meta_data->>'avatar_url', ''),
    nullif(new.raw_user_meta_data->>'picture', ''),
    ''
  ), '');

  v_phone := nullif(trim(coalesce(new.raw_user_meta_data->>'phone', '')), '');
  if v_phone is not null and v_phone !~ '^\+91[6-9][0-9]{9}$' then
    -- profiles_phone_in rejects anything else, so normalize raw 10-digit
    -- numbers and discard the rest rather than failing the whole signup.
    if v_phone ~ '^[6-9][0-9]{9}$' then
      v_phone := '+91' || v_phone;
    else
      v_phone := null;
    end if;
  end if;

  insert into public.profiles (id, full_name, avatar_url, email, role, is_active, phone)
  values (
    new.id,
    v_name,
    v_avatar,
    new.email,
    'customer',
    true,
    v_phone
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- ============ 3. (re)install the trigger ============
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
