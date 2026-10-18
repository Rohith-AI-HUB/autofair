# AutoFair — Supabase linter remediation handoff

Self-contained context. Assume the reader has no access to this repository's history and only
the live database plus the files referenced below.

Last updated: 2026-09-29.

---

## 1. What this project is

Single-operator used-car marketplace ("AutoFair"). Next.js (App Router) + Supabase
(Postgres, Auth, Storage) + Vercel. Solo owner/developer; free-tier budget bias.

- Schema is versioned as numbered SQL files in `supabase/migrations/0001_…0021_…`.
- **No `supabase` CLI and no `psql` on this machine.** `.env` holds only the project URL,
  the anon key and the service_role key. There is no direct connection string.
- **All DDL is applied by a human pasting SQL into the Supabase dashboard SQL Editor.**
  Reads of table data work from the CLI via `curl` against PostgREST with the service_role
  key, but **system catalogs (`pg_policies`, `pg_proc`, `pg_indexes`) are not reachable that
  way** — anything about schema shape needs the dashboard.
- Migrations are written idempotently (`create or replace`, `drop … if exists`) and are
  re-runnable in order, so a fresh database replayed 0001→0021 should match production.

### Roles and actors

`profiles.role` is the app authorisation source. Values are constrained to lowercase
`('admin','staff','customer')` by `0008_strict_role_rbac.sql:101-103`. An earlier migration,
`0006_roles_staff_verification.sql:17-23`, normalised them to UPPERCASE — the casing was
inverted by 0008 and the app writes lowercase (`app/api/admin/staff/route.ts:205`
uses `role: 'staff'`). Two `SECURITY DEFINER` helpers read it:

| Helper | Definition | Predicate |
| --- | --- | --- |
| `public.is_staff()` | `0008_strict_role_rbac.sql:192` | `role = 'staff' AND coalesce(is_active, true)` |
| `public.is_admin()` | `0008_strict_role_rbac.sql:213` | `role = 'admin'` |

Note `is_staff()` is **not** true for admins. Admin-facing screens go through Next.js API
route handlers that use the service-role client (`getServiceClient()`), which bypasses RLS
entirely, so admins never depended on these policies.

### Three Supabase roles matter here

- `anon` — signed-out visitors. The public `/cars` catalogue is readable by them.
- `authenticated` — any signed-in user, customer or staff.
- `service_role` — backend only, bypasses RLS. Used by `app/api/**` route handlers.

---

## 2. The input: 183 linter findings, actually ~20 problems

A `supabase db lint` / database-linter export produced 183 rows across 10 rules.

**First deduplicate, or the numbers mislead.** `multiple_permissive_policies` and the
`*_security_definer_function_executable` rules re-report one finding *per role* — `anon`,
`authenticated`, `authenticator`, `dashboard_user`, `supabase_privileged_role`. That inflates
counts roughly 5x. Deduplicate on the `cache_key` column.

| Rule | Rows | Real items | Verdict |
| --- | --- | --- | --- |
| `0006` multiple_permissive_policies | 99 | 20 | **Turned out to be a genuine leak** — see §4 |
| `0003` auth_rls_initplan | 42 | 42 | Mechanical fix, applied |
| `0029` authenticated security_definer | 12 | 12 | Mixed: 3 real, 9 by-design |
| `0028` anon security_definer | 11 | 11 | Mixed: 3 real, 8 by-design |
| `0001` unindexed_foreign_keys | 7 | 7 | INFO, deliberately deferred |
| `0005` unused_index | 7 | 7 | INFO, deliberately ignored |
| `0011` function_search_path_mutable | 2 | 2 | Mechanical fix, applied |
| `0025` public_bucket_allows_listing | 1 | 1 | Fix applied |
| `0009` duplicate_index | 1 | 1 | Fix applied |
| `auth_leaked_password_protection` | 1 | 1 | **Not SQL** — dashboard setting |

---

## 3. Finding A — the assignment RPCs were never locked down, and the fix that tried had silently failed

`0009_security_hardening.sql:4-9` did:

```sql
REVOKE EXECUTE ON FUNCTION public.assign_inspection_to_least_loaded(uuid, text, text, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.assign_inspection_to_least_loaded(uuid, text, text, uuid) TO service_role;
```

**`REVOKE … FROM PUBLIC` does not lock down a Supabase function.** `PUBLIC` is a pseudo-role;
revoking from it only removes privileges inherited *through* it. Supabase separately grants
`EXECUTE` on `public`-schema functions to `anon` and `authenticated` **directly**, and an
explicit grant is not removed by a revoke aimed at PUBLIC. The linter proved it: both roles
were still listed as able to call these over `/rest/v1/rpc/`.

Correct form names the roles: `REVOKE … FROM PUBLIC, anon, authenticated;`

### Why that was exploitable

`public.manual_assign_inspection(p_vehicle_id uuid, p_target_staff_id uuid, p_reason text, p_actor_id uuid)`
(`0008_strict_role_rbac.sql:698`) is `SECURITY DEFINER`. It validates the **target** staff member:

```sql
IF v_role != 'staff' THEN RAISE EXCEPTION 'target is not inspection staff' USING errcode = '42501';
```

It never validates the **caller**. There is no `auth.uid()` check anywhere in it, and
`p_actor_id` is a caller-supplied parameter with a `DEFAULT NULL`, so it cannot be trusted as
an identity. The same gap applies to `assign_inspection_to_least_loaded` (`0008:524`) and
`reassign_staff_inspections` (`0007:218`). So an unauthenticated `POST /rest/v1/rpc/manual_assign_inspection`
using only the public anon key could reassign the inspection queue and write rows into
`staff_assignment_logs` with a forged actor.

### Why revoking EXECUTE is safe

All six call sites already use the service-role client, which is unaffected by EXECUTE grants:

- `app/api/admin/assignments/run/route.ts:33`
- `app/api/admin/assignments/override/route.ts:36`
- `app/api/admin/inspections/route.ts:165`
- `app/api/admin/staff/[id]/route.ts:54,118`
- `app/api/inspections/assign/route.ts:47`

Those routes authorise at the application layer first — e.g. `run/route.ts:14-15` is
`requireAuth(req)` then `requireRoles(ctx, ['ADMIN'])`. The DB grant was the only thing that
let a request skip that layer.

One internal caller exists: `trigger_auto_assign_vehicle` (`0007:247`) calls
`assign_inspection_to_least_loaded` from an `AFTER INSERT` trigger on `vehicles`. It is itself
`SECURITY DEFINER`, so the nested call is checked as its owner rather than as the end user —
but see §6, this is the unverified regression risk.

### Deliberately NOT revoked

- **`is_admin()` / `is_staff()`** are evaluated *inside* RLS policy expressions. Revoking
  EXECUTE from `anon`/`authenticated` breaks every staff and admin policy at once. They must
  stay `SECURITY DEFINER` because they read `profiles.role` while bypassing RLS — which is
  what prevents the read-your-own-row recursion that would otherwise deadlock the policy.
  These linter rows are permanent and correct.
- **`increment_listing_views(p_listing_id uuid)`** — called by `components/cars/ViewCounter.tsx:20`
  via `getAuthedBrowserClient()`, which per `lib/supabase/client.ts:103-109` returns a working
  client when there is *no* session. So anon EXECUTE is required by design. Consequence nobody
  has fixed: anyone can inflate the public "TOTAL VIEWS" metric. That is an abuse question about
  the number, not an authorisation boundary.
- **`set_listing_availability(uuid, text)`** (`0017_listing_availability.sql:22`) is already
  correct and needs no change. It self-authorises — `raise exception 'authentication required'`
  when `auth.uid() is null`, then `if v_vehicle.seller_id is distinct from auth.uid() then raise
  exception 'not the owner of this vehicle'` — and `0017:94-95` revokes from `PUBLIC, anon`
  *by name* rather than only PUBLIC, then grants to `authenticated`. This is the pattern the
  three assignment RPCs should have followed.

---

## 4. Finding B — five orphan policies, and why "multiple permissive policies" was not noise

The linter named five RLS policies attached to live tables that appear in **no migration file
and nowhere else in the repo**:

`items_staff_all`, `sections_staff_all`, `inspections_staff_all`, `listings_staff_all`,
`photos_staff_read`.

**Why they exist:** migrations use a `drop policy if exists "<name>"; create policy "<name>"`
pattern and several policies were renamed in place across revisions of `0008`/`0011`. Each file
only ever drops *its own new* name, so the old broad one was never removed. **Consequence:
`supabase/migrations/` does not fully describe the live database.** Any RLS work must read
`pg_policies` first; restating expressions from the SQL files can silently revert a manual change.

Live definitions, read from `pg_policies` on 2026-09-29:

| tablename | policyname | cmd | roles | qual | with_check |
| --- | --- | --- | --- | --- | --- |
| inspection_items | items_staff_all | ALL | {public} | `is_staff()` | `is_staff()` |
| inspection_sections | sections_staff_all | ALL | {public} | `is_staff()` | `is_staff()` |
| inspections | inspections_staff_all | ALL | {public} | `is_staff()` | `is_staff()` |
| listings | listings_staff_all | ALL | {public} | `is_staff()` | `is_staff()` |
| vehicle_photos | photos_staff_read | SELECT | {public} | `is_staff()` | null |

### The mechanism that makes this a leak

Every explicit staff policy in this project is **assignment-scoped**. `listings_staff_read`
(`0008:461`):

```sql
USING (
  public.is_staff()
  AND EXISTS (SELECT 1 FROM public.vehicles v
              WHERE v.id = vehicle_id AND v.assigned_staff_id = auth.uid())
)
```

Postgres **OR-s permissive policies together**. A bare `USING (is_staff())` on the same
table+command therefore swallows every scoped one. The narrow policies were still being
evaluated; they just never mattered.

Effect before `0021`: any staff account could read, write **and delete every row** in
`inspection_items`, `inspection_sections`, `inspections` and `listings`, regardless of who the
work was assigned to, plus read every photo of every vehicle including other sellers'
unpublished cars.

Two distinct defects:

1. **Cross-assignment access between staff.** The app layer already rejected this
   — `app/api/staff/verify/route.ts:145` returns 403 when
   `v.assigned_staff_id && v.assigned_staff_id !== ctx.userId`. The database was strictly
   weaker than the code sitting on top of it.
2. **DELETE rights no migration ever granted.** The explicit set is read/insert/update/delete
   for items and sections, but only read/insert/update for `inspections` and `listings`
   (`0008:395,416,440` and `0008:461,482,503`). `FOR ALL` added staff
   `DELETE FROM listings`, which bypasses the deliberate "a LIVE car is never directly
   deletable" control (`0017:97-107` makes the seller's route *mark it sold first*), and staff
   `DELETE FROM inspections`, which cascades the trust report away
   (`inspections → inspection_sections → inspection_items`).

**Why `0020` could not fix this:** its `auth.uid()` rewrite filtered on expressions containing
`auth.uid()`. These policies contain only `is_staff()`, so they correctly never matched.
Deleting them is the fix, not rewriting them.

### Why `photos_staff_read` is tightened, not dropped

It is the only staff read path for photos. `photos_public_read` (`0001:232`) exposes photos only
where the vehicle is already `status in ('verified','published')` or owned by the reader — so a
staff member inspecting a `submitted`/`in_review` car has no read path without it. Dropping it
would blank the inspection UI.

### Why the change is low-risk for the happy path

`vehicles` has **no** orphan `*_all` policy, so assignment scoping was already enforced on the
parent table. That also means the self-claim branch at `app/api/staff/verify/route.ts:153-156`
was already unreachable: `vehicles_staff_update` (`0008:354`) requires
`assigned_staff_id = auth.uid()`, which cannot match a NULL assignee, so unassigned cars get
assigned through the service-role admin routes instead. The real flow is
admin-assigns → staff-works, and `0021` leaves it intact.

Also, `0011`'s items/sections policies deliberately allow `assigned_staff_id is null` so
unassigned work stays claimable — that allowance is preserved in the rewritten
`photos_staff_read`.

---

## 5. What was changed

### `0020_lint_hardening.sql` — APPLIED 2026-09-29

Single file; nothing earlier was edited, so replaying 0001→0021 lands the same state.

1. `REVOKE … FROM PUBLIC, anon, authenticated` + explicit `GRANT … TO service_role` on the
   three assignment RPCs.
2. `SET search_path = public` added to the only two functions missing it — `handle_updated_at`
   (`0001:11`) and `generate_inspection_id` (`0001:39`). Both bodies reference only
   `pg_catalog` (`now`, `to_char`, `lpad`, `floor`, `random`, always implicitly in search_path)
   and `public.*`, so pinning cannot change behaviour. `CREATE OR REPLACE` preserves the ACL and
   the `vehicles_updated_at` trigger binding.
3. `drop index if exists public.inspection_items_section_idx2` — `0011:33` created it as an exact
   column-for-column duplicate of `0001:142`.
4. `drop policy if exists "photos_bucket_public_read" on storage.objects` (`0001:319`,
   `USING (bucket_id = 'vehicle-photos')`). Nothing lists storage: `lib/supabase/storage.ts:61,76`
   only uploads and builds public URLs, `lib/supabase/queries.ts:512,992` deletes by exact path.
   A public bucket serves object URLs without consulting any policy, so this SELECT policy added
   exactly one capability — enumerating every path in `vehicle-photos`.
5. A `DO` block that rewrites all 42 `auth_rls_initplan` policies by reading `pg_policies` and
   replacing inline `auth.uid()` with `(SELECT auth.uid())`, wrapping in an uncorrelated scalar
   subquery so Postgres computes it once per query as an InitPlan instead of once per row.
   Catalog-driven rather than restated from files, deliberately, because of the drift in §4.
   It decides **per clause** (`USING` and `WITH CHECK` independently), emits only the clauses that
   exist so `cmd`/`roles`/permissiveness are untouched, and skips any clause already wrapped so a
   re-run cannot double-wrap. `auth.jwt()` occurs only in function bodies (`0006:52,89`,
   `0008:252`, `0014:21`), never in a policy expression, so `auth.uid()` was the only call site.

### `0021_drop_unscoped_staff_policies.sql` — WRITTEN, NOT YET CONFIRMED APPLIED

1. Drops the four `*_staff_all` policies. Exact recreate DDL for all four is in a rollback
   comment inside the file.
2. Drops and recreates `photos_staff_read` assignment-scoped:

```sql
create policy "photos_staff_read" on public.vehicle_photos for select
  using (
    public.is_staff() and exists (
      select 1 from public.vehicles v
      where v.id = vehicle_id
        and (v.assigned_staff_id = (select auth.uid()) or v.assigned_staff_id is null)
    )
  );
```

Written with `(SELECT auth.uid())` so it does not re-introduce the finding 0020 cleared. This
also closes a fresh-install gap: no migration between 0001 and 0020 ever created
`photos_staff_read`, so a database built from files alone had no staff photo read at all.

---

## 6. Verification status — what is proven and what is only reasoned

**Proven.** `select indexname from pg_indexes where indexname in
('inspection_items_section_idx','inspection_items_section_idx2')` returned one row, so 0020 ran
and §5.3 landed.

**Not proven.** 0020 has five verification queries and only #3 was ever returned. Still unknown:

- Whether the three assignment RPCs actually became service-role-only — the headline security
  fix, in the migration whose *previous* attempt at this exact fix failed silently.
- Whether the 42 policy rewrites happened without error.
- Whether the storage policy drop and `search_path` fixes landed.
- Whether `0021` applied at all. Until it does, the staff cross-access leak and the unintended
  `DELETE FROM listings` are live.

**The failure mode most likely to be missed.** `trigger_auto_assign_vehicle` (`0007:247`) wraps
its call in `begin … perform public.assign_inspection_to_least_loaded(…); exception when others
then null; end`. If the revoke affected it, **nothing errors** — inspections quietly stop being
auto-assigned and the symptom is a backlog appearing days later. No SQL result can rule this
out; it needs a new draft vehicle created and a staff member observed being picked.

**One risk checked and dismissed.** `profiles.role` casing could have made `is_staff()` always
false, which would mean `*_staff_all` granted nobody anything and dropping it changed nothing.
Confirmed `is_staff()` does match live rows (app writes lowercase `'staff'`, constraint enforces
lowercase), so the leak was real. A stale uppercase row would have `is_staff()` false and so
would gain nothing from `*_staff_all` either — the change cannot reduce its access.

### Tests that must be run by a human

1. Create a draft vehicle with no assignee → confirm a staff member gets auto-assigned.
2. Staff A saves a trust report on a car assigned to A → must still succeed.
3. Staff A attempts the same on a car assigned to B → expect 403 or zero rows. **Today it
   silently succeeds. This is the whole point of 0021.**
4. Staff member views photos of their own assigned `submitted` car → must still render.
   This is the path the `photos_staff_read` rewrite could break.
5. Confirm an admin can no longer be reached via `POST /rest/v1/rpc/manual_assign_inspection`
   with the anon key alone.

---

## 7. Deliberately not fixed

- **`multiple_permissive_policies` will never reach zero**, and should not. Once the five orphans
  are gone, the remaining overlaps are owner + staff + admin policies OR-ing on the same
  command, which is how Postgres RLS is designed to work. Collapsing them into single
  `USING (a OR b)` blobs would be harder to audit, not easier. Expect the next scan to drop from
  183 to roughly 120 — that is the honest target, not zero.
- **`unused_index` (7)**: `vehicles_make_idx`, `vehicles_location_idx`,
  `vehicles_inspection_status_idx`, `vehicles_scheduled_at_idx`, `vehicles_assigned_at_idx`,
  `profiles_is_active_idx`, `profiles_phone_idx`. `pg_stat_user_indexes.idx_scan` counters are
  meaningless at this traffic level on a table this size — the planner correctly seq-scans.
  Dropping `vehicles_assigned_at_idx` would bite as data grows.
- **`unindexed_foreign_keys` (7)**: worth adding, INFO-level, deferred by explicit decision —
  `favorites_listing_id_fkey`, `inquiries_buyer_id_fkey`, `inspection_items_inspector_id_fkey`,
  `inspections_inspector_id_fkey`, `phone_reveals_seller_id_fkey`,
  `staff_assignment_logs_created_by_fkey`, `staff_assignment_logs_previous_staff_id_fkey`.
- **`auth_leaked_password_protection`**: not SQL. Dashboard → Authentication → Advanced →
  enable "Leaked password protection". It is a project setting and cannot ship in a migration.

## 8. Pre-existing open defects, unrelated to this lint run

- Storage bucket size cap and the photo-less LIVE publish path, both left open by the photo-loss
  incident.
- `0019_normalize_car_names.sql` — backfill written but never run.
- Inquiry routing: production env vars and deploy still pending; staff notification to
  `OFFICE_EMAIL` awaiting approval.
- `npm run lint` is not usable (Next treats `lint` as a directory; ESLint 10 finds no flat
  config). `npm test` fails (`node --test tests/` on Node 24). Run **`node --test tests/*.test.mjs`**.
  Working gates are `npm run typecheck` and `npm run build`.

---

## 9. One paste-able verification block

Read-only. Run in the dashboard SQL Editor and return all six result sets.

```sql
-- 1. Must show anon=false, authenticated=false, service_role=true for the three assignment
--    RPCs. is_admin/is_staff/increment_listing_views/set_listing_availability staying true is
--    correct by design.
select pr.proname as function,
       has_function_privilege('anon', pr.oid, 'execute')          as anon,
       has_function_privilege('authenticated', pr.oid, 'execute') as authenticated,
       has_function_privilege('service_role', pr.oid, 'execute')  as service_role
from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
where n.nspname = 'public'
  and pr.proname in ('assign_inspection_to_least_loaded','manual_assign_inspection',
                     'reassign_staff_inspections','set_listing_availability',
                     'increment_listing_views','is_admin','is_staff')
order by pr.proname;

-- 2. Zero rows = every public function pins search_path.
select pr.proname, pr.proconfig
from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
where n.nspname = 'public' and pr.prokind = 'f'
  and coalesce(array_to_string(pr.proconfig, ','), '') !~ 'search_path='
order by pr.proname;

-- 3. Exactly one row: inspection_items_section_idx, not the _idx2 twin.
select indexname, indexdef from pg_indexes
where schemaname = 'public'
  and indexname in ('inspection_items_section_idx','inspection_items_section_idx2');

-- 4. Zero rows = no public-schema policy clause still calls auth.uid() inline.
select policyname, tablename from pg_policies
where schemaname = 'public'
  and ( (qual ~* 'auth\.uid\(\)'          and qual !~* '\(\s*select auth\.uid\(\)')
     or (with_check ~* 'auth\.uid\(\)' and with_check !~* '\(\s*select auth\.uid\(\)') );

-- 5. Zero rows = the broad storage SELECT policy is gone.
select policyname from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and policyname = 'photos_bucket_public_read';

-- 6. POST-0021 ONLY. One row = the tightened photos_staff_read; the four FOR ALL policies must
--    be absent. Then: zero rows = no policy on these tables is a bare unscoped role check.
select tablename, policyname, cmd, qual, with_check from pg_policies
where schemaname = 'public'
  and policyname in ('items_staff_all','sections_staff_all','inspections_staff_all',
                     'listings_staff_all','photos_staff_read')
order by tablename;

select tablename, policyname, cmd, qual as clause from pg_policies
where schemaname = 'public'
  and tablename in ('inspection_items','inspection_sections','inspections','listings',
                    'vehicle_photos')
  and trim(coalesce(qual,'')) in ('is_staff()','public.is_staff()','true')
union all
select tablename, policyname, cmd, with_check from pg_policies
where schemaname = 'public'
  and tablename in ('inspection_items','inspection_sections','inspections','listings',
                    'vehicle_photos')
  and trim(coalesce(with_check,'')) in ('is_staff()','public.is_staff()','true');
```
