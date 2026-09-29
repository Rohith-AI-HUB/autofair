-- AutoFair migration 0019 — one-off repair of car names.
--
-- Sellers type make, model and trim into a single free-text MODEL box, so
-- `vehicles.model` holds strings like 'Creta E plus' and `variant` is empty.
-- lib/data/car-names.ts now splits and canonicalises that on every write; this
-- migrates the rows saved before it existed.
--
-- Apply in the Supabase SQL editor. The final guard aborts (rolling the whole
-- thing back) if any mapped row failed to match, so a half-applied rename is
-- not possible. Safe to re-run: once applied, no row matches the old values.

begin;

-- Values produced by normalizeCarName() for the strings currently in `vehicles`.
create temp table _car_name_fix (
  old_model text primary key,
  make      text not null,
  model     text not null,
  variant   text not null
) on commit drop;

insert into _car_name_fix (old_model, make, model, variant) values
  ('Creta E plus',          'Hyundai',  'Creta', 'E+'),
  ('Nexon xz +',            'Tata',     'Nexon', 'XZ+'),
  ('Nexon, XT plus',        'Tata',     'Nexon', 'XT+'),
  ('Thar LX P MT 4WD 4S',   'Mahindra', 'Thar',  'LX P MT 4WD 4S');

update vehicles v
   set make = f.make, model = f.model, variant = f.variant
  from _car_name_fix f
 where v.model = f.old_model;

-- listings.title was written once at publish time and never refreshed, so it
-- drifts from the car it names (one live row reads 'Hyndai'). Recompute all of
-- them from the source row. Slugs are deliberately NOT touched: they are
-- permanent public URLs.
update listings l
   set title = trim(concat_ws(' ', v.year, v.make, v.model, nullif(v.variant, '')))
  from vehicles v
 where l.vehicle_id = v.id;

do $$
begin
  if exists (
    select 1 from _car_name_fix f join vehicles v on v.model = f.old_model
  ) then
    raise exception 'a mapped model string was not matched; rolling back';
  end if;
end $$;

-- Check the result before it becomes visible: run this script with `rollback;`
-- instead of `commit;` for a dry run, then re-run with commit.
select v.year, v.make, v.model, v.variant,
       trim(concat_ws(' ', v.year, v.make, v.model, nullif(v.variant, ''))) = l.title as title_in_sync
  from vehicles v
  left join listings l on l.vehicle_id = v.id
 order by v.created_at;

commit;
