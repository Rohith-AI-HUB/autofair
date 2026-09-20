-- AutoFair verified seed — mirrors lib/data/cars.ts so UI works from DB after migration
-- Run AFTER 0001_autofair_schema.sql in SQL Editor. Safe to re-run (upserts by reg_number/slug).

-- ---- vehicles (seller_id null = platform verified) ----
insert into public.vehicles (reg_number, make, model, variant, year, fuel, transmission, km_driven, ownership, location, price_expected, status, inspection_id)
values
  ('KA-05-MN-4218','Hyundai','Creta','SX',2022,'Diesel','Manual',42180,'First owner','Bangalore',1240000,'published','AF-2026-008421'),
  ('MH-02-EK-7734','Maruti','Baleno','Zeta',2021,'Petrol','AMT',35640,'First owner','Mumbai',785000,'published','AF-2026-008417'),
  ('DL-08-AB-9921','Honda','City','VX',2020,'Petrol','Manual',51200,'Second owner','Delhi NCR',990000,'published','AF-2026-008402'),
  ('MH-12-RT-4456','Tata','Nexon','XZ+',2023,'Diesel','Manual',22900,'First owner','Pune',1120000,'published','AF-2026-008433'),
  ('KA-03-MJ-1109','Hyundai','i20','Asta',2019,'Petrol','Manual',58300,'Second owner','Bangalore',625000,'published','AF-2026-008398'),
  ('MH-04-KL-8823','Kia','Seltos','HTX',2022,'Diesel','Automatic',31800,'First owner','Mumbai',1345000,'published','AF-2026-008429')
on conflict (reg_number) do update set
  make=excluded.make, model=excluded.model, variant=excluded.variant, year=excluded.year,
  fuel=excluded.fuel, transmission=excluded.transmission, km_driven=excluded.km_driven,
  ownership=excluded.ownership, location=excluded.location, price_expected=excluded.price_expected,
  status='published', inspection_id=excluded.inspection_id;

-- ---- vehicle_photos (seed uses Unsplash URLs as public_url, storage_path is placeholder) ----
-- insert one cover photo per vehicle if none exists
insert into public.vehicle_photos (vehicle_id, storage_path, public_url, sort_order, is_cover)
select v.id, 'seed/' || v.reg_number || '/cover.jpg', u.url, 0, true
from public.vehicles v
join (values
  ('KA-05-MN-4218','https://images.unsplash.com/photo-1781197824875-c6e07188896b?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080'),
  ('MH-02-EK-7734','https://images.unsplash.com/photo-1609831489866-3a2fe235f093?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080'),
  ('DL-08-AB-9921','https://images.unsplash.com/photo-1764271721894-eada6ad13bf1?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080'),
  ('MH-12-RT-4456','https://images.unsplash.com/photo-1759505738499-8c9b26c1b7e7?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080'),
  ('KA-03-MJ-1109','https://images.unsplash.com/photo-1670122872487-8fea1dd1c08c?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080'),
  ('MH-04-KL-8823','https://images.unsplash.com/photo-1781197824875-c6e07188896b?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080')
) as u(reg, url) on u.reg = v.reg_number
where not exists (select 1 from public.vehicle_photos p where p.vehicle_id = v.id)
on conflict (vehicle_id, storage_path) do nothing;

-- ---- listings (1 per vehicle, LIVE) ----
insert into public.listings (vehicle_id, slug, title, price, description, status, views_count, published_at)
select
  v.id,
  lower(v.year || '-' || v.make || '-' || v.model || '-' || nullif(v.variant,'')),
  v.year || ' ' || v.make || ' ' || v.model || ' ' || v.variant,
  v.price_expected,
  'Verified dossier — ' || v.inspection_id || '. ' || v.km_driven || ' km, ' || v.ownership || ', ' || v.location || '.',
  'LIVE',
  100 + v.km_driven % 1100,
  now()
from public.vehicles v
on conflict (vehicle_id) do update set status='LIVE', price=excluded.price, title=excluded.title;
-- fix slugs to match app (spaces/specials): update to known slugs
update public.listings l set slug = m.slug from (values
  ('KA-05-MN-4218','2022-hyundai-creta-sx'),
  ('MH-02-EK-7734','2021-maruti-baleno-zeta'),
  ('DL-08-AB-9921','2020-honda-city-vx'),
  ('MH-12-RT-4456','2023-tata-nexon-xz-plus'),
  ('KA-03-MJ-1109','2019-hyundai-i20-asta'),
  ('MH-04-KL-8823','2022-kia-seltos-htx')
) as m(reg, slug)
where l.vehicle_id = (select id from public.vehicles v where v.reg_number = m.reg);

-- ---- one verified inspection for first vehicle (Creta) ----
insert into public.inspections (vehicle_id, score, overall_status, inspected_at, is_sample, notes)
select id, 8.7, 'pass', now(), false, 'Verified inspection — mirrors lib/data/inspections.ts.'
from public.vehicles where reg_number='KA-05-MN-4218'
on conflict (vehicle_id) do update set score=8.7, is_sample=false;

-- sections + items for that inspection (wipe + re-insert for idempotency)
delete from public.inspection_sections where inspection_id in
  (select id from public.inspections where vehicle_id = (select id from public.vehicles where reg_number='KA-05-MN-4218'));

with ins as (
  select id from public.inspections where vehicle_id = (select id from public.vehicles where reg_number='KA-05-MN-4218')
),
sec as (
  insert into public.inspection_sections (inspection_id, title, passed, total)
  select id, t.title, t.passed, t.total from ins,
  (values
    ('ENGINE & TRANSMISSION',14,14),('BRAKES',8,8),('SUSPENSION',9,9),
    ('TYRES & WHEELS',7,8),('EXTERIOR',15,16),('INTERIOR',12,12),
    ('ELECTRICAL',10,10),('DOCUMENTS',5,5)
  ) as t(title, passed, total)
  returning id, title
)
insert into public.inspection_items (section_id, name, result, note)
select s.id, v.name, v.result::text, v.note from sec s
join (values
  ('ENGINE & TRANSMISSION','Cold start + idle','pass','Stable idle, no warning lamps.'),
  ('TYRES & WHEELS','Front left tyre','attention','3.2 mm — replace in ~5k km.'),
  ('EXTERIOR','Rear bumper','attention','Repainted 2019, invoice on file.'),
  ('DOCUMENTS','RC','pass','Reviewed — matches chassis.')
) as v(sec_title, name, result, note) on v.sec_title = s.title;
