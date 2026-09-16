-- AutoFair migration 0007 — admin assignment automation (backend source of truth)
-- Run in Supabase Dashboard → SQL Editor after 0001-0006. Safe to re-run (idempotent).
--
-- Adds:
-- 1. profiles.email / is_active / last_assignment_at (staff management)
-- 2. vehicles.scheduled_at / inspection_status / assigned_at (upcoming inspections)
-- 3. staff_assignment_logs audit table
-- 4. assign_inspection_to_least_loaded() + manual_assign_inspection() + reassign_staff_inspections()
--    Backend calculates real workload, lowest-load wins, deterministic tie-breakers,
--    advisory xact lock for atomicity under concurrency.
-- 5. Auto-assign trigger on vehicle INSERT (new inspection → auto staff, never blocks sell flow)
-- 6. Admin RLS policies (admin can read/update all; function is SECURITY DEFINER so automation bypasses RLS)

-- ============ 1. profiles columns ============
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists is_active boolean not null default true;
alter table public.profiles add column if not exists last_assignment_at timestamptz;

-- Backfill email from auth.users where missing (best effort, may be null if no access)
-- Runs as postgres in SQL Editor so it can read auth.users.
do $$
begin
  begin
    update public.profiles p set email = u.email
    from auth.users u where u.id = p.id and (p.email is null or p.email = '');
  exception when others then
    -- If auth schema not visible, skip silently; admin API will fill on create.
    null;
  end;
end $$;

-- ============ 2. vehicles columns ============
alter table public.vehicles add column if not exists scheduled_at timestamptz not null default now();
alter table public.vehicles add column if not exists inspection_status text not null default 'Pending'
  check (inspection_status in ('Pending','Assigned','In Progress','Completed','Cancelled'));
alter table public.vehicles add column if not exists assigned_at timestamptz;

-- Backfill scheduled_at from created_at (keeps existing cars sensible)
update public.vehicles set scheduled_at = created_at where scheduled_at is null or scheduled_at > now() + interval '1 year';

-- Backfill inspection_status from legacy status + assignment (only where still default Pending but legacy says otherwise)
update public.vehicles
set inspection_status = case
  when status in ('verified','published','sold') then 'Completed'
  when status = 'rejected' then 'Cancelled'
  when assigned_staff_id is null then 'Pending'
  when status = 'in_review' then 'In Progress'
  else 'Assigned'
end
where inspection_status = 'Pending'
  and (status in ('verified','published','sold','rejected','in_review') or assigned_staff_id is not null);

-- Backfill assigned_at from updated_at where assigned but timestamp missing
update public.vehicles set assigned_at = updated_at where assigned_staff_id is not null and assigned_at is null;

create index if not exists vehicles_inspection_status_idx on public.vehicles (inspection_status);
create index if not exists vehicles_scheduled_at_idx on public.vehicles (scheduled_at);
create index if not exists vehicles_assigned_at_idx on public.vehicles (assigned_at);
create index if not exists profiles_is_active_idx on public.profiles (is_active) where role in ('STAFF','staff','inspector');

-- ============ 3. audit log ============
create table if not exists public.staff_assignment_logs (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  previous_staff_id uuid references public.profiles(id) on delete set null,
  new_staff_id uuid references public.profiles(id) on delete set null,
  assignment_type text not null default 'Automatic' check (assignment_type in ('Automatic','Manual Override')),
  reason text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists assignment_logs_vehicle_idx on public.staff_assignment_logs (vehicle_id, created_at desc);
create index if not exists assignment_logs_new_staff_idx on public.staff_assignment_logs (new_staff_id, created_at desc);
alter table public.staff_assignment_logs enable row level security;

-- ============ 4. assignment functions (backend source of truth) ============
-- Workload = count of vehicles assigned to staff where inspection_status IN ('Pending','Assigned','In Progress').
-- Never trusts frontend value. Tie-breakers: (1) active only, (2) fewest assigned today, (3) earliest last_assignment_at.
-- Atomicity: pg_advisory_xact_lock serializes concurrent assignments in the same DB so two
-- inspections arriving together never pick staff from the same stale snapshot. Vehicle row is
-- locked FOR UPDATE. Function is SECURITY DEFINER so trigger + admin API bypass RLS safely.

create or replace function public.assign_inspection_to_least_loaded(
  p_vehicle_id uuid,
  p_assignment_type text default 'Automatic',
  p_reason text default null,
  p_actor_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev uuid;
  v_status text;
  v_pick uuid;
  v_type text := coalesce(nullif(trim(p_assignment_type), ''), 'Automatic');
begin
  if v_type not in ('Automatic','Manual Override') then
    v_type := 'Automatic';
  end if;
  -- Serialize concurrent assignments.
  perform pg_advisory_xact_lock(hashtextextended('autofair_assign_lock', 0));

  select assigned_staff_id, inspection_status into v_prev, v_status
  from public.vehicles where id = p_vehicle_id for update;
  if not found then
    raise exception 'vehicle not found' using errcode = 'P0002';
  end if;

  -- Completed/Cancelled are terminal for automatic flow; leave untouched.
  if v_status in ('Completed','Cancelled') and v_type = 'Automatic' then
    return v_prev;
  end if;

  -- Pick least-loaded active STAFF. Locks staff rows to keep workload fresh.
  -- Workload subqueries count only active/upcoming inspections (backend-computed).
  select p.id into v_pick
  from public.profiles p
  left join lateral (
    select count(*)::int as load
    from public.vehicles v
    where v.assigned_staff_id = p.id
      and v.inspection_status in ('Pending','Assigned','In Progress')
  ) w on true
  left join lateral (
    select count(*)::int as today
    from public.vehicles v
    where v.assigned_staff_id = p.id
      and v.assigned_at::date = current_date
  ) t on true
  where upper(coalesce(p.role,'')) = 'STAFF'
    and coalesce(p.is_active, true) = true
  order by w.load asc, t.today asc, p.last_assignment_at asc nulls first, p.created_at asc nulls last, p.id asc
  limit 1;

  if v_pick is null then
    -- No active staff: leave unassigned but audit the attempt.
    insert into public.staff_assignment_logs (vehicle_id, previous_staff_id, new_staff_id, assignment_type, reason, created_by)
    values (p_vehicle_id, v_prev, null, v_type, coalesce(nullif(trim(coalesce(p_reason,'')), ''), 'No active staff available'), p_actor_id);
    return null;
  end if;

  update public.vehicles
  set assigned_staff_id = v_pick,
      assigned_at = now(),
      inspection_status = case when inspection_status = 'Pending' then 'Assigned' else inspection_status end,
      updated_at = now()
  where id = p_vehicle_id;

  update public.profiles set last_assignment_at = now() where id = v_pick;

  insert into public.staff_assignment_logs (vehicle_id, previous_staff_id, new_staff_id, assignment_type, reason, created_by)
  values (p_vehicle_id, v_prev, v_pick, v_type,
    coalesce(nullif(trim(coalesce(p_reason,'')), ''), 'Auto-assigned by workload'),
    p_actor_id);

  return v_pick;
end;
$$;

create or replace function public.manual_assign_inspection(
  p_vehicle_id uuid,
  p_target_staff_id uuid,
  p_reason text default null,
  p_actor_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev uuid;
  v_is_active boolean;
  v_role text;
begin
  perform pg_advisory_xact_lock(hashtextextended('autofair_assign_lock', 0));

  select assigned_staff_id into v_prev from public.vehicles where id = p_vehicle_id for update;
  if not found then
    raise exception 'vehicle not found' using errcode = 'P0002';
  end if;

  select is_active, role into v_is_active, v_role from public.profiles where id = p_target_staff_id;
  if not found then
    raise exception 'staff not found' using errcode = 'P0002';
  end if;
  if upper(coalesce(v_role,'')) != 'STAFF' then
    raise exception 'target is not inspection staff' using errcode = '42501';
  end if;
  if coalesce(v_is_active, true) = false then
    raise exception 'staff is inactive' using errcode = '23514';
  end if;
  if p_reason is null or trim(p_reason) = '' then
    raise exception 'reason required for manual override' using errcode = '23514';
  end if;

  update public.vehicles
  set assigned_staff_id = p_target_staff_id,
      assigned_at = now(),
      inspection_status = case when inspection_status = 'Pending' then 'Assigned' else inspection_status end,
      updated_at = now()
  where id = p_vehicle_id;

  update public.profiles set last_assignment_at = now() where id = p_target_staff_id;

  insert into public.staff_assignment_logs (vehicle_id, previous_staff_id, new_staff_id, assignment_type, reason, created_by)
  values (p_vehicle_id, v_prev, p_target_staff_id, 'Manual Override', trim(p_reason), p_actor_id);

  return p_target_staff_id;
end;
$$;

-- Reassign all active inspections of one staff member (used when staff deactivates).
-- Caller must set is_active=false first so the departing staff is excluded from picks.
create or replace function public.reassign_staff_inspections(
  p_staff_id uuid,
  p_reason text default 'Staff deactivated',
  p_actor_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_count int := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended('autofair_assign_lock', 0));
  for r in select id from public.vehicles
           where assigned_staff_id = p_staff_id
             and inspection_status in ('Pending','Assigned','In Progress')
           order by scheduled_at asc, created_at asc
           for update skip locked
  loop
    perform public.assign_inspection_to_least_loaded(r.id, 'Automatic', coalesce(p_reason,'Staff deactivated') || ' (reassigned)', p_actor_id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- ============ 5. auto-assign trigger on new vehicle ============
create or replace function public.trigger_auto_assign_vehicle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only upcoming inspections with no staff yet.
  if NEW.assigned_staff_id is null
     and coalesce(NEW.inspection_status, 'Pending') in ('Pending','Assigned')
     and coalesce(NEW.status,'submitted') in ('draft','submitted','in_review') then
    begin
      perform public.assign_inspection_to_least_loaded(NEW.id, 'Automatic', 'Auto-assigned on creation', null);
    exception when others then
      -- Never block the sell flow because assignment failed (e.g. no staff yet).
      null;
    end;
  end if;
  return NEW;
end;
$$;

drop trigger if exists vehicles_auto_assign on public.vehicles;
create trigger vehicles_auto_assign
  after insert on public.vehicles
  for each row execute function public.trigger_auto_assign_vehicle();

-- ============ 6. admin RLS ============
-- Admin reads all vehicles (upcoming + history) for monitoring.
drop policy if exists "vehicles_admin_read" on public.vehicles;
create policy "vehicles_admin_read" on public.vehicles for select using (public.is_admin());
drop policy if exists "vehicles_admin_update" on public.vehicles;
create policy "vehicles_admin_update" on public.vehicles for update using (public.is_admin()) with check (public.is_admin());
drop policy if exists "vehicles_admin_insert" on public.vehicles;
create policy "vehicles_admin_insert" on public.vehicles for insert with check (public.is_admin());

-- Admin manages staff profiles (edit name, activate/deactivate).
drop policy if exists "profiles_admin_update" on public.profiles;
create policy "profiles_admin_update" on public.profiles for update using (public.is_admin()) with check (public.is_admin());
drop policy if exists "profiles_admin_read" on public.profiles;
create policy "profiles_admin_read" on public.profiles for select using (true);

-- Audit log: admin reads; writes go through SECURITY DEFINER functions (bypass RLS).
drop policy if exists "assignment_logs_admin_read" on public.staff_assignment_logs;
create policy "assignment_logs_admin_read" on public.staff_assignment_logs for select using (public.is_admin());
drop policy if exists "assignment_logs_admin_insert" on public.staff_assignment_logs;
create policy "assignment_logs_admin_insert" on public.staff_assignment_logs for insert with check (public.is_admin());
