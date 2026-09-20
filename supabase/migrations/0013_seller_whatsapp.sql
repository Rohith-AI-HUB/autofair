-- AutoFair migration 0013 — seller WhatsApp (Contact Seller → number)
--
-- Collect: profiles.phone (E.164 +91...). Reveal: server API only, never public read.
-- 1. Phone format guard
-- 2. Self contact-update policy (0009 dropped self-update; re-add scoped to contact)
-- 3. Anti-escalation trigger (role/is_active/email/last_assignment_at stay admin-only)
-- 4. phone_reveals audit (rate-limit + abuse review)
-- 5. handle_new_user copies phone from signup metadata when valid

-- ============ 1. phone format ============
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_phone_in') then
    alter table public.profiles
      add constraint profiles_phone_in
      check (phone is null or phone ~ '^\+91[6-9][0-9]{9}$');
  end if;
end $$;

create index if not exists profiles_phone_idx on public.profiles (phone) where phone is not null;

-- ============ 2. self contact update (authenticated owners only) ============
drop policy if exists "profiles_update_own_contact" on public.profiles;
create policy "profiles_update_own_contact" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ============ 3. anti-escalation: contact update must not change privileged cols ============
create or replace function public.prevent_contact_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Admins / service_role bypass (is_admin checks JWT role claim).
  if public.is_admin() then
    return NEW;
  end if;
  if NEW.role is distinct from OLD.role
     or NEW.is_active is distinct from OLD.is_active
     or NEW.last_assignment_at is distinct from OLD.last_assignment_at
     or NEW.email is distinct from OLD.email then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return NEW;
end;
$$;

drop trigger if exists profiles_prevent_contact_escalation on public.profiles;
create trigger profiles_prevent_contact_escalation
  before update on public.profiles
  for each row execute function public.prevent_contact_escalation();

-- ============ 4. phone reveal audit ============
create table if not exists public.phone_reveals (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  seller_id uuid null references public.profiles(id) on delete set null,
  revealer_id uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists phone_reveals_vehicle_idx on public.phone_reveals (vehicle_id, created_at desc);
create index if not exists phone_reveals_revealer_idx on public.phone_reveals (revealer_id, created_at desc);
alter table public.phone_reveals enable row level security;
drop policy if exists "phone_reveals_admin_read" on public.phone_reveals;
create policy "phone_reveals_admin_read" on public.phone_reveals for select using (public.is_admin());

-- ============ 5. copy signup phone into profile ============
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text := null;
begin
  begin
    v_phone := nullif(trim(coalesce(new.raw_user_meta_data->>'phone', '')), '');
    if v_phone is not null and v_phone !~ '^\+91[6-9][0-9]{9}$' then
      -- Accept raw 10-digit starting 6-9 and normalize to +91.
      if v_phone ~ '^[6-9][0-9]{9}$' then
        v_phone := '+91' || v_phone;
      else
        v_phone := null;
      end if;
    end if;
  exception when others then
    v_phone := null;
  end;

  insert into public.profiles (id, full_name, avatar_url, email, role, is_active, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', null),
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture', null),
    new.email,
    'customer',
    true,
    v_phone
  )
  on conflict (id) do nothing;

  return new;
end;
$$;
