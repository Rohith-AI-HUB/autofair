-- AutoFair fix 0005 — normalize make/location casing (fixes duplicate Kia / KIA pills)
-- Run in SQL Editor. Safe to re-run.

update public.vehicles
set make = initcap(lower(trim(make))),
    location = trim(location)
where make <> initcap(lower(trim(make)));

-- Optional: check remaining duplicates case-insensitively
-- select lower(make), count(*) from public.vehicles group by 1 having count(*) > 1;
