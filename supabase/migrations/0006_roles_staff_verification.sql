-- AutoFair migration 0006 — roles + staff verification (MVP, 0-rupee friendly)
-- Run in Supabase Dashboard → SQL Editor after 0001-0005.
--
-- Goals (no breaking changes):
-- 1. Canonical roles ADMIN / CUSTOMER / STAFF while keeping legacy
--    buyer/seller/inspector/admin rows working.
-- 2. Staff assignment on vehicles (assigned_staff_id + verified_at).
-- 3. Configurable inspection ratings (inspections.ratings jsonb).
-- 4. Backend enforcement: customers cannot self-verify, users cannot
--    escalate their own role. RLS + triggers are source of truth;
--    Next API routes add a second check with safe errors.

-- ============ 1. roles ============
alter table public.profiles drop constraint if exists profiles_role_check;

-- Migrate legacy values to canonical (idempotent).
update public.profiles set role = 'CUSTOMER' where role in ('buyer', 'seller', 'customer');
update public.profiles set role = 'STAFF' where role in ('inspector', 'staff');
update public.profiles set role = 'ADMIN' where role in ('admin');

alter table public.profiles alter column role set default 'CUSTOMER';
alter table public.profiles
  add constraint profiles_role_check check (role in ('CUSTOMER', 'STAFF', 'ADMIN'));

-- Helper: is the calling user staff or admin?
create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('STAFF', 'ADMIN')
  );
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'ADMIN'
  );
$$;

-- Prevent role self-escalation: non-admins cannot change their own role.
-- Backend/service processes (SQL Editor as postgres, or service_role key)
-- may manage roles; triggers fire for all roles so this must be explicit.
create or replace function public.prevent_role_escalation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (coalesce(OLD.role, '') is distinct from coalesce(NEW.role, '')) then
    if (current_user in ('postgres', 'service_role')
        or coalesce((auth.jwt() ->> 'role'), '') = 'service_role') then
      return NEW;
    end if;
    if (not public.is_admin()) then
      raise exception 'role change not permitted' using errcode = '42501';
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists profiles_no_self_escalation on public.profiles;
create trigger profiles_no_self_escalation
  before update of role on public.profiles
  for each row execute function public.prevent_role_escalation();

-- ============ 2. staff assignment columns (minimal) ============
alter table public.vehicles
  add column if not exists assigned_staff_id uuid references public.profiles(id) on delete set null;
alter table public.vehicles
  add column if not exists verified_at timestamptz;
create index if not exists vehicles_assigned_staff_idx on public.vehicles (assigned_staff_id);

-- Configurable inspection ratings (categories not finalized; keep schema open).
alter table public.inspections
  add column if not exists ratings jsonb;

-- ============ 3. verification transition guard ============
-- Backend controls VERIFIED: only staff/admin (or service_role) may move a
-- vehicle into verified/published. Customers attempting a direct update get
-- a 403-style error (no schema details) instead of a silent success.
create or replace function public.enforce_verification_transition()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Backend/service processes (SQL Editor as postgres, service_role key)
  -- bypass role checks; triggers fire for every role so this is explicit.
  if (current_user in ('postgres', 'service_role')
      or coalesce((auth.jwt() ->> 'role'), '') = 'service_role') then
    if (NEW.status in ('verified', 'published')
        and coalesce(OLD.status, '') not in ('verified', 'published')) then
      NEW.verified_at = coalesce(NEW.verified_at, now());
    end if;
    return NEW;
  end if;
  if (NEW.status in ('verified', 'published')
      and coalesce(OLD.status, '') not in ('verified', 'published')) then
    if (not public.is_staff()) then
      raise exception 'verification requires staff role' using errcode = '42501';
    end if;
    NEW.verified_at = coalesce(NEW.verified_at, now());
  end if;
  -- Only staff/admin may change assignment.
  if (coalesce(OLD.assigned_staff_id::text, '') is distinct from coalesce(NEW.assigned_staff_id::text, '')) then
    if (not public.is_staff()) then
      raise exception 'assignment requires staff role' using errcode = '42501';
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists vehicles_verify_guard on public.vehicles;
create trigger vehicles_verify_guard
  before update on public.vehicles
  for each row execute function public.enforce_verification_transition();

-- ============ 4. RLS for staff workflow ============
-- Staff can read vehicles assigned to them (plus existing public/owner reads).
drop policy if exists "vehicles_staff_read" on public.vehicles;
create policy "vehicles_staff_read" on public.vehicles for select
  using (public.is_staff() and (assigned_staff_id = auth.uid() or assigned_staff_id is null));

-- Staff can update assigned vehicles (inspection flow). The trigger above
-- still blocks non-staff from flipping status to verified/published.
drop policy if exists "vehicles_staff_update" on public.vehicles;
create policy "vehicles_staff_update" on public.vehicles for update
  using (public.is_staff() and (assigned_staff_id = auth.uid() or assigned_staff_id is null))
  with check (public.is_staff());

-- Staff can attach inspection photos for assigned vehicles (storage bucket
-- already allows any authenticated upload; this covers the row insert).
drop policy if exists "photos_staff_insert" on public.vehicle_photos;
create policy "photos_staff_insert" on public.vehicle_photos for insert
  with check (
    public.is_staff() and exists (
      select 1 from public.vehicles v
      where v.id = vehicle_id and (v.assigned_staff_id = auth.uid() or v.assigned_staff_id is null)
    )
  );

-- Staff can read/write inspections for assigned vehicles.
drop policy if exists "inspections_staff_insert" on public.inspections;
create policy "inspections_staff_insert" on public.inspections for insert
  with check (
    public.is_staff() and exists (
      select 1 from public.vehicles v
      where v.id = vehicle_id and (v.assigned_staff_id = auth.uid() or v.assigned_staff_id is null)
    )
  );
drop policy if exists "inspections_staff_update" on public.inspections;
create policy "inspections_staff_update" on public.inspections for update
  using (
    public.is_staff() and exists (
      select 1 from public.vehicles v
      where v.id = vehicle_id and (v.assigned_staff_id = auth.uid() or v.assigned_staff_id is null)
    )
  )
  with check (public.is_staff());
drop policy if exists "inspections_staff_read" on public.inspections;
create policy "inspections_staff_read" on public.inspections for select
  using (
    public.is_staff() and exists (
      select 1 from public.vehicles v
      where v.id = vehicle_id and (v.assigned_staff_id = auth.uid() or v.assigned_staff_id is null)
    )
  );

-- Staff can read/update listings for assigned vehicles (price + publish).
drop policy if exists "listings_staff_read" on public.listings;
create policy "listings_staff_read" on public.listings for select
  using (
    public.is_staff() and exists (
      select 1 from public.vehicles v
      where v.id = vehicle_id and (v.assigned_staff_id = auth.uid() or v.assigned_staff_id is null)
    )
  );
drop policy if exists "listings_staff_insert" on public.listings;
create policy "listings_staff_insert" on public.listings for insert
  with check (
    public.is_staff() and exists (
      select 1 from public.vehicles v
      where v.id = vehicle_id and (v.assigned_staff_id = auth.uid() or v.assigned_staff_id is null)
    )
  );
drop policy if exists "listings_staff_update" on public.listings;
create policy "listings_staff_update" on public.listings for update
  using (
    public.is_staff() and exists (
      select 1 from public.vehicles v
      where v.id = vehicle_id and (v.assigned_staff_id = auth.uid() or v.assigned_staff_id is null)
    )
  )
  with check (public.is_staff());
