-- AutoFair migration 0012 — dedupe assignment audit (1 record per creation is enough)
--
-- Root cause of "2 records shown" on admin Assignment history:
--   INSERT vehicles fires trigger vehicles_auto_assign (reason 'Auto-assigned on creation')
--   AND the app fallback also calls assign_inspection_to_least_loaded
--     (/api/inspections/assign reason 'Customer vehicle submission',
--      /api/admin/inspections reason 'Auto-assigned on creation').
--   With no active staff both calls insert Unassigned → Unassigned within the same
--   minute, so AF-2026-792797 shows the same no-op twice.
--
-- Fix: make the function idempotent for back-to-back duplicate calls, and clean
-- up historical no-op duplicates (keep newest per vehicle).

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
  v_assigned_at timestamptz;
  v_type text := coalesce(nullif(trim(p_assignment_type), ''), 'Automatic');
  v_reason text := coalesce(nullif(trim(coalesce(p_reason,'')), ''), 'Auto-assigned by workload');
begin
  if v_type not in ('Automatic','Manual Override') then
    v_type := 'Automatic';
  end if;
  -- Serialize concurrent assignments.
  perform pg_advisory_xact_lock(hashtextextended('autofair_assign_lock', 0));

  select assigned_staff_id, inspection_status, assigned_at into v_prev, v_status, v_assigned_at
  from public.vehicles where id = p_vehicle_id for update;
  if not found then
    raise exception 'vehicle not found' using errcode = 'P0002';
  end if;

  -- Completed/Cancelled are terminal for automatic flow; leave untouched.
  if v_status in ('Completed','Cancelled') and v_type = 'Automatic' then
    return v_prev;
  end if;

  -- Idempotency guard: trigger + app fallback race within minutes must not
  -- produce a second identical audit row. Skip if the same transition was
  -- already logged very recently (creation double-fire window).
  if exists (
    select 1 from public.staff_assignment_logs
    where vehicle_id = p_vehicle_id
      and coalesce(previous_staff_id::text, '') = coalesce(v_prev::text, '')
      and assignment_type = v_type
      and coalesce(reason, '') = v_reason
      and created_at > now() - interval '10 minutes'
  ) then
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
    -- No active staff: leave unassigned but audit the attempt (once per window).
    insert into public.staff_assignment_logs (vehicle_id, previous_staff_id, new_staff_id, assignment_type, reason, created_by)
    values (p_vehicle_id, v_prev, null, v_type, v_reason, p_actor_id);
    return null;
  end if;

  -- Same-staff re-fire within a minute (trigger + fallback both assigning to
  -- the same person) is a no-op: keep assignment, skip the second audit row.
  if v_prev is not null and v_prev = v_pick and v_assigned_at is not null
     and v_assigned_at > now() - interval '2 minutes' then
    return v_pick;
  end if;

  update public.vehicles
  set assigned_staff_id = v_pick,
      assigned_at = now(),
      inspection_status = case when inspection_status = 'Pending' then 'Assigned' else inspection_status end,
      updated_at = now()
  where id = p_vehicle_id;

  update public.profiles set last_assignment_at = now() where id = v_pick;

  insert into public.staff_assignment_logs (vehicle_id, previous_staff_id, new_staff_id, assignment_type, reason, created_by)
  values (p_vehicle_id, v_prev, v_pick, v_type, v_reason, p_actor_id);

  return v_pick;
end;
$$;

-- One-time cleanup: collapse historical Unassigned → Unassigned duplicates
-- created within 10 minutes of each other (creation double-fire). Keep newest.
delete from public.staff_assignment_logs a
using public.staff_assignment_logs b
where a.vehicle_id = b.vehicle_id
  and a.id <> b.id
  and a.previous_staff_id is null
  and a.new_staff_id is null
  and b.previous_staff_id is null
  and b.new_staff_id is null
  and a.assignment_type = b.assignment_type
  and a.created_at < b.created_at
  and b.created_at - a.created_at < interval '10 minutes';
