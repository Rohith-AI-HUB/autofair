-- 0021_drop_unscoped_staff_policies.sql
-- Follow-up to 0020 from the same linter run. Removes a live authorization leak that
-- 0020 could not fix, and brings one orphaned policy under version control.
--
-- FINDING (read from the live pg_policies, 2026-09-29):
--
--   tablename        | policyname            | cmd    | roles    | qual       | with_check
--   inspection_items  | items_staff_all       | ALL    | {public} | is_staff() | is_staff()
--   inspection_sections| sections_staff_all   | ALL    | {public} | is_staff() | is_staff()
--   inspections       | inspections_staff_all | ALL    | {public} | is_staff() | is_staff()
--   listings          | listings_staff_all    | ALL    | {public} | is_staff() | is_staff()
--   vehicle_photos    | photos_staff_read     | SELECT | {public} | is_staff() | null
--
-- None of these exist in any migration in this repo. They are leftovers from earlier
-- revisions of 0008/0011 that were renamed in place; each file only ever drops its own
-- NEW name, so the old broad one was never removed and stayed live.
--
-- Why they are a leak rather than harmless redundancy: every explicit staff policy
-- written in 0008/0011 is ASSIGNMENT-SCOPED, e.g. listings_staff_read (0008:461) is
--   USING (public.is_staff() AND EXISTS (SELECT 1 FROM public.vehicles v
--          WHERE v.id = vehicle_id AND v.assigned_staff_id = auth.uid()))
-- Permissive policies are OR-ed together, so a bare USING (is_staff()) on the same
-- table+command swallows all of them. Effect as of today: any staff account can read,
-- write and DELETE every row in inspection_items, inspection_sections, inspections and
-- listings regardless of assignment, plus read every photo of every vehicle.
--
-- Two distinct defects:
--   1. Cross-assignment access between staff. The app layer already rejects this
--      (app/api/staff/verify/route.ts:145 returns 403 when assigned_staff_id belongs to
--      someone else), so the database was strictly weaker than the code on top of it.
--   2. DELETE rights no migration ever granted. The explicit set is read/insert/update/
--      delete for items and sections, but only read/insert/update for inspections and
--      listings. FOR ALL added staff DELETE FROM listings, which bypasses the
--      "mark it sold first" control (0017:97-100 makes a LIVE listing deliberately
--      undeletable), and staff DELETE FROM inspections, which cascades the trust report
--      away via inspection_sections -> inspection_items.
--
-- 0020's auth_rls_initplan rewrite correctly left these alone: their expression is only
-- is_staff(), with no inline auth.uid(), so they never matched that rewrite's filter.
-- Deleting them is the fix, not rewriting them.

begin;

-- ============================================================
-- 1. Drop the four broad FOR ALL policies
-- ============================================================
-- Nothing intended is lost. Every command these cover is already covered, scoped to the
-- assigned staff member, by an explicit policy:
--   inspection_items     items_secure_read (0009:38) + items_staff_read/insert/update/
--                        delete (0011:77,87,98,108)
--   inspection_sections  sections_secure_read (0009:26) + sections_staff_read/insert/
--                        update/delete (0011:38,47,57,66)
--   inspections          inspections_public_read (0001:248) + inspections_staff_read/
--                        insert/update (0008:395,416,440)
--   listings             listings_public_read (0001:269) + listings_owner_read/insert/
--                        update (0001:271,275,279) + listings_staff_read/insert/update
--                        (0008:461,482,503)
-- The only capabilities that disappear are staff DELETE on listings and on inspections,
-- which is the point.
--
-- Safe on a fresh replay: these names are in no earlier migration, so each statement is
-- a no-op when 0001-0020 are run from scratch.
--
-- Rollback (exact live definitions, verified against pg_policies before writing this):
--   create policy "items_staff_all"        on public.inspection_items     for all to public using (public.is_staff()) with check (public.is_staff());
--   create policy "sections_staff_all"     on public.inspection_sections  for all to public using (public.is_staff()) with check (public.is_staff());
--   create policy "inspections_staff_all"  on public.inspections          for all to public using (public.is_staff()) with check (public.is_staff());
--   create policy "listings_staff_all"     on public.listings             for all to public using (public.is_staff()) with check (public.is_staff());

drop policy if exists "items_staff_all"       on public.inspection_items;
drop policy if exists "sections_staff_all"    on public.inspection_sections;
drop policy if exists "inspections_staff_all" on public.inspections;
drop policy if exists "listings_staff_all"    on public.listings;

-- ============================================================
-- 2. Narrow photos_staff_read instead of dropping it
-- ============================================================
-- Dropping this one would break the inspection UI, so it is tightened instead. It is the
-- ONLY staff read path for photos: photos_public_read (0001:232) exposes photos only for
-- vehicles already in ('verified','published') or owned by the reader, so a staff member
-- looking at a 'submitted'/'in_review' car has no read path without it.
--
-- It is also the policy that let any staff account browse photos of every car in the
-- system, including other sellers' unpublished listings. Same shape as the 0011 policies:
-- assignment-scoped, but allowing assigned_staff_id IS NULL so work that has not been
-- assigned yet stays claimable.
--
-- Written with (SELECT auth.uid()) rather than bare auth.uid() so this migration does not
-- re-introduce the auth_rls_initplan finding that 0020 just cleared.
--
-- This also closes a gap in the fresh-install path: no migration between 0001 and 0020
-- ever created photos_staff_read, so a database built from files alone has no staff photo
-- read at all. Replaying 0001-0021 fixes that.
--
-- Rollback (exact live definition, FOR SELECT, no WITH CHECK):
--   create policy "photos_staff_read" on public.vehicle_photos for select to public using (public.is_staff());

drop policy if exists "photos_staff_read" on public.vehicle_photos;

create policy "photos_staff_read" on public.vehicle_photos for select
  using (
    public.is_staff() and exists (
      select 1 from public.vehicles v
      where v.id = vehicle_id
        and (v.assigned_staff_id = (select auth.uid()) or v.assigned_staff_id is null)
    )
  );

commit;

-- ============================================================
-- 3. verify
-- ============================================================
-- Run after the commit.

-- 1. Must return exactly one row: photos_staff_read, with the assignment-scoped qual.
--    The four FOR ALL policies must be absent.
select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and policyname in ('items_staff_all', 'sections_staff_all', 'inspections_staff_all',
                     'listings_staff_all', 'photos_staff_read')
order by tablename;

-- 2. Must return zero rows: no policy on these five tables is still a bare role check
--    with no assignment or ownership scoping. Catches a re-introduction, and catches any
--    similar orphan the linter did not surface in this pass.
select tablename, policyname, cmd, qual
from pg_policies
where schemaname = 'public'
  and tablename in ('inspection_items','inspection_sections','inspections','listings',
                    'vehicle_photos')
  and trim(coalesce(qual, ''))      in ('is_staff()','true','public.is_staff()')
union all
select tablename, policyname, cmd, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('inspection_items','inspection_sections','inspections','listings',
                    'vehicle_photos')
  and trim(coalesce(with_check, '')) in ('is_staff()','true','public.is_staff()');

-- 3. Reference: what staff can now do on each table, by command. Spot-check that every
--    table still has a SELECT and an INSERT/UPDATE path, and that listings/inspections
--    have no DELETE.
select tablename, cmd, policyname, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('inspection_items','inspection_sections','inspections','listings',
                    'vehicle_photos')
order by tablename, cmd, policyname;
