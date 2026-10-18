-- 0020_lint_hardening.sql
-- Applies the database-linter findings that are real defects, plus the two
-- mechanical rewrites. Run as one transaction in the dashboard SQL editor.
--
-- Deliberately NOT applied:
--   multiple_permissive_policies  owner/staff/admin policies OR-ing together is how
--       RLS is designed to work. 99 reported rows are 20 table+command combos
--       re-listed once per role (anon, authenticated, authenticator, dashboard_user,
--       supabase_privileged_role). Collapsing them into single USING (a OR b)
--       blobs would be harder to audit, not easier.
--   is_admin() / is_staff() EXECUTE  these are evaluated INSIDE RLS policy
--       expressions; revoking EXECUTE from anon/authenticated breaks every staff
--       and admin policy at once. They stay SECURITY DEFINER because they must
--       read profiles.role while bypassing RLS, which is what prevents the
--       read-your-own-role recursion.
--   increment_listing_views  ViewCounter calls it signed-out by design, so anon
--       EXECUTE is required. getAuthedBrowserClient returns a working client when
--       there is no session (lib/supabase/client.ts:103-109).
--   unused_index (7)  idx_scan counters are not meaningful at this traffic level;
--       the planner correctly seq-scans a table this size.

begin;

-- ============================================================
-- 1. The assignment RPCs were never actually locked down
-- ============================================================
-- 0009:4-6 did REVOKE EXECUTE ... FROM PUBLIC. That only removes the privilege
-- inherited through the PUBLIC pseudo-role. Supabase ALSO grants EXECUTE on
-- public-schema functions to anon and authenticated directly, and an explicit
-- grant is not removed by revoking from PUBLIC. The linter confirms both roles
-- can still reach these over /rest/v1/rpc/.
--
-- Exploitable today: manual_assign_inspection (0008:698) validates its TARGET
-- staff member (v_role != 'staff') but never the CALLER, and p_actor_id is a
-- caller-supplied parameter with a default. An unauthenticated POST can rewrite
-- the inspection queue and forge staff_assignment_logs rows. The same gap applies
-- to assign_inspection_to_least_loaded and reassign_staff_inspections.
--
-- Safe to revoke: all three are called only from route handlers that already hold
-- the service role (app/api/admin/assignments/override:36, run:33,
-- admin/inspections:165, admin/staff/[id]:54, app/api/inspections/assign), and
-- service_role bypasses EXECUTE grants. The one internal caller,
-- trigger_auto_assign_vehicle (0007:246), is SECURITY DEFINER, so its nested call
-- is checked as the owner, not as the end user.

revoke execute on function public.assign_inspection_to_least_loaded(uuid, text, text, uuid)
  from public, anon, authenticated;
revoke execute on function public.manual_assign_inspection(uuid, uuid, text, uuid)
  from public, anon, authenticated;
revoke execute on function public.reassign_staff_inspections(uuid, text, uuid)
  from public, anon, authenticated;

-- Idempotent restatement of 0009:7-9 so the intended grant is explicit, not just
-- whatever survived the revoke above.
grant execute on function public.assign_inspection_to_least_loaded(uuid, text, text, uuid) to service_role;
grant execute on function public.manual_assign_inspection(uuid, uuid, text, uuid) to service_role;
grant execute on function public.reassign_staff_inspections(uuid, text, uuid) to service_role;

-- set_listing_availability (0017) needs no change: it already self-authorizes with
-- an auth.uid() null check and an owner check, and 0017:94-95 revokes PUBLIC+anon
-- by name rather than only PUBLIC. Its lint row is expected.

-- ============================================================
-- 2. function_search_path_mutable
-- ============================================================
-- These are the only two functions missing SET search_path; every other function
-- in the schema already pins it. Both bodies reference only pg_catalog (now,
-- to_char, lpad, floor, random - always implicitly in search_path) and public.*,
-- so pinning to public cannot change behaviour. CREATE OR REPLACE preserves the
-- existing ACL and leaves the trigger bindings on vehicles_updated_at (0001:91)
-- and the inspection-id default intact.

create or replace function public.handle_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.generate_inspection_id()
returns text
language plpgsql
set search_path = public
as $$
declare
  y text := to_char(now(), 'YYYY');
  r text := lpad(floor(random() * 1000000)::text, 6, '0');
begin
  return 'AF-' || y || '-' || r;
end;
$$;

-- ============================================================
-- 3. duplicate_index + public_bucket_allows_listing
-- ============================================================

-- inspection_items_section_idx2 (0011:33) is column-for-column identical to
-- inspection_items_section_idx (0001:142). Dropping the later duplicate.
drop index if exists public.inspection_items_section_idx2;

-- Nothing lists storage objects: lib/supabase/storage.ts only uploads and builds
-- public URLs (:61, :76) and lib/supabase/queries.ts deletes by exact path
-- (:512, :992). A public bucket serves object URLs without consulting any policy,
-- so this SELECT policy adds exactly one capability on top of what the app needs -
-- the ability for anyone to enumerate every path in vehicle-photos.
-- Rollback: create policy "photos_bucket_public_read" on storage.objects
--            for select using (bucket_id = 'vehicle-photos');
drop policy if exists "photos_bucket_public_read" on storage.objects;

-- ============================================================
-- 4. auth_rls_initplan
-- ============================================================
-- A policy that calls auth.uid() inline re-evaluates it for every row scanned.
-- Wrapping it in an uncorrelated scalar subquery makes Postgres compute it once
-- per query as an InitPlan. No semantic change.
--
-- The rewrite is driven from pg_policies, NOT restated from the migration files,
-- because the files no longer describe the live database: items_staff_all,
-- sections_staff_all, inspections_staff_all, listings_staff_all and
-- photos_staff_read all appear in the linter output but in no migration and
-- nowhere in the repo - they are leftovers from earlier revisions of 0008/0011
-- that were renamed in place, and each file only ever drops the NEW name. Reading
-- the catalog rewrites what is actually running and skips anything that drifted.
--
-- auth.jwt() occurs only inside function bodies (0006:52, 0006:89, 0008:252,
-- 0014:21), never in a policy expression, so auth.uid() is the only call site
-- that needs wrapping.

do $$
declare
  r       record;
  v_using text;
  v_check text;
begin
  for r in
    select p.schemaname, p.tablename, p.policyname, p.qual, p.with_check
    from pg_policies p
    where p.schemaname = 'public'
      and (p.qual like '%auth.uid()%' or p.with_check like '%auth.uid()%')
  loop
    -- Decided per clause, not per policy: USING and WITH CHECK are independent, so
    -- a policy that is already fixed in one clause must still get the other.
    -- ALTER POLICY with only one clause leaves the other untouched.
    --
    -- The guard is what keeps a re-run idempotent. Once wrapped, pg_get_expr
    -- deploys the call as "( SELECT auth.uid())", which still contains the literal
    -- 'auth.uid()', so without the guard a second pass would replace inside the
    -- wrapper and produce garbage.
    if r.qual is not null and r.qual !~* '\(\s*select auth\.uid\(\)' then
      v_using := ' USING (' || replace(r.qual, 'auth.uid()', '(SELECT auth.uid())') || ')';
    else
      v_using := '';
    end if;

    if r.with_check is not null and r.with_check !~* '\(\s*select auth\.uid\(\)' then
      v_check := ' WITH CHECK ('
        || replace(r.with_check, 'auth.uid()', '(SELECT auth.uid())') || ')';
    else
      v_check := '';
    end if;

    if v_using = '' and v_check = '' then
      continue;
    end if;

    execute format('ALTER POLICY %I ON %I.%I%s%s',
      r.policyname, r.schemaname, r.tablename, v_using, v_check);

    raise notice 'wrapped auth.uid(): %.%', r.tablename, r.policyname;
  end loop;
end;
$$;

commit;

-- ============================================================
-- 5. verify
-- ============================================================
-- These queries are the proof for sections 1-4. Run them after the commit.

-- 1. The three assignment RPCs must be service_role only.
--    is_admin/is_staff/increment_listing_views/set_listing_availability stay
--    true for anon/authenticated on purpose (see header).
select pr.proname as function,
       has_function_privilege('anon', pr.oid, 'execute')          as anon,
       has_function_privilege('authenticated', pr.oid, 'execute') as authenticated,
       has_function_privilege('service_role', pr.oid, 'execute')  as service_role
from pg_proc pr
join pg_namespace n on n.oid = pr.pronamespace
where n.nspname = 'public'
  and pr.proname in ('assign_inspection_to_least_loaded', 'manual_assign_inspection',
                     'reassign_staff_inspections', 'set_listing_availability',
                     'increment_listing_views', 'is_admin', 'is_staff')
order by pr.proname;

-- 2. Must return zero rows: every public function pins search_path. No owner
--    filter, because the linter flagged exactly two and both are fixed above -
--    so an empty result is the assertion. If a row does appear it is a function
--    Supabase manages, not one of ours.
select pr.proname, pr.proconfig
from pg_proc pr
join pg_namespace n on n.oid = pr.pronamespace
where n.nspname = 'public'
  and pr.prokind = 'f'
  and coalesce(array_to_string(pr.proconfig, ','), '') !~ 'search_path='
order by pr.proname;

-- 3. Must return one row: inspection_items_section_idx, and not the _idx2 twin.
select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and indexname in ('inspection_items_section_idx', 'inspection_items_section_idx2');

-- 4. Must return zero rows: no public-schema policy clause still calls
--    auth.uid() inline. Checked per clause, matching the rewrite's granularity.
select policyname, tablename
from pg_policies
where schemaname = 'public'
  and (
    (qual ~* 'auth\.uid\(\)'          and qual !~* '\(\s*select auth\.uid\(\)')
    or (with_check ~* 'auth\.uid\(\)' and with_check !~* '\(\s*select auth\.uid\(\)')
  );

-- 5. Must return zero rows: the broad storage SELECT policy is gone.
select policyname from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and policyname = 'photos_bucket_public_read';
