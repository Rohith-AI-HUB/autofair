-- AutoFair migration 0015 — complete inspections stuck in active load
--
-- Bug: POST /api/staff/verify set vehicles.status='verified' + published the
-- listing, but never set inspection_status='Completed'. Admin overview counts
-- CURRENT LOAD / UPCOMING from inspection_status IN
-- ('Pending','Assigned','In Progress'), so verified files kept showing as
-- active staff load forever. The route now sets Completed; this backfills
-- rows verified before the fix.

update public.vehicles
set inspection_status = 'Completed',
    updated_at = now()
where status in ('verified', 'published', 'sold')
  and inspection_status in ('Pending', 'Assigned', 'In Progress');
