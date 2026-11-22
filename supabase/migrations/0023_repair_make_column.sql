-- AutoFair migration 0023 — one-off repair of `vehicles.make`.
--
-- The make box is free text, and five live files had something in it that is not a
-- brand: four sellers typed a model year ('2014' with model 'BMW 520d') and one typed
-- the brand and model together ('Jeep compass'). Two visible consequences:
--   * listings.title read '2014 2014 BMW 520d' (carTitle() is year + make + model),
--   * /cars had no BMW / Mercedes-Benz option in the Make filter.
--
-- The target values are not hand-typed: each is normalizeCarName() from
-- lib/data/car-names.ts re-run on the row once the brand sits in `make`, i.e. exactly
-- what a save through the current write path stores. Re-saving these rows changes
-- nothing further. Slugs are deliberately NOT touched: they are permanent public URLs.
--
-- STATUS: applied 2026-11-22 against project ueuutxpqgkjyubwaiall and verified from the
-- dashboard session — all 11 rows carry a brand in `make`, and every listings.title now
-- equals what carTitle() renders. Match is on the full old (make, model) pair, so this
-- is safe to re-run: after the repair nothing matches and it changes nothing.
--
-- WHY THE SCRIPT LOOKES LIKE THIS. The first version used
-- `create temp table ... on commit drop` plus a `do $$ ... $$` guard inside
-- begin;/commit;. Its UPDATEs ran and committed, and the script then died with
-- 42P01: relation "_make_fix" does not exist — the Supabase SQL editor does not carry a
-- session across the statements it sends, so an on-commit-drop temp table is gone before
-- the later statements see it. That also means begin;/commit; does NOT make such a script
-- all-or-nothing here. Everything below is therefore self-contained: one data-modifying
-- CTE, no temp table, no dollar-quoted block, no explicit transaction. A single statement
-- is atomic in Postgres on its own, which is the rollback guarantee the editor cannot give.

-- 1. Repair. Updates the five rows, then recomputes their titles from the updated values
--    using the same formula carTitle() uses. Run this statement on its own.
with f as (
  select * from (values
    ('2014',         'BMW 520d',            'BMW',           '520d',          ''),
    ('2018',         'BMW 530D Msport',     'BMW',           '530D Msport',   ''),
    ('2023',         'EQB 300',             'Mercedes-Benz', 'EQB 300',       ''),
    ('2025',         'Innova crysta zx(o)', 'Toyota',        'Innova Crysta', 'ZX(O)'),
    ('Jeep compass', '02 MT',               'Jeep',          'Compass',       '02 MT')
  ) as t(old_make, old_model, make, model, variant)
),
upd as (
  update vehicles v
     set make = f.make, model = f.model, variant = f.variant
    from f
   where v.make = f.old_make and v.model = f.old_model
  returning v.id, v.year, v.make, v.model, v.variant
)
update listings l
   set title = trim(concat_ws(' ', u.year, u.make, u.model, nullif(u.variant, '')))
  from upd u
 where l.vehicle_id = u.id;

-- 2. Verify. Read-only. Every row should read title_in_sync = true and
--    year_still_in_make = false. Run after step 1.
select v.year, v.make, v.model, v.variant, l.status, l.title,
       trim(concat_ws(' ', v.year, v.make, v.model, nullif(v.variant, ''))) = l.title
         as title_in_sync,
       v.make ~ '^[0-9]{4}$' as year_still_in_make
  from vehicles v
  left join listings l on l.vehicle_id = v.id
 order by v.created_at;
