-- AutoFair fix 0003 — require sign-in for selling (prevents anon RLS + storage failures, protects 1GB free quota)
-- Run in SQL Editor after 0001 + 0002. Safe to re-run.

-- vehicles: only signed-in sellers can insert their own row
drop policy if exists "vehicles_insert" on public.vehicles;
create policy "vehicles_insert" on public.vehicles
  for insert to authenticated
  with check (auth.uid() = seller_id);

-- vehicle_photos rows: only owner
drop policy if exists "photos_owner_insert" on public.vehicle_photos;
create policy "photos_owner_insert" on public.vehicle_photos
  for insert to authenticated
  with check (
    exists (select 1 from public.vehicles v where v.id = vehicle_id and v.seller_id = auth.uid())
  );

-- documents rows: only owner
drop policy if exists "documents_owner_insert" on public.documents;
create policy "documents_owner_insert" on public.documents
  for insert to authenticated
  with check (
    exists (select 1 from public.vehicles v where v.id = vehicle_id and v.seller_id = auth.uid())
  );

-- storage buckets already require authenticated — keep as is (no change needed).
-- public reads stay open for LIVE/published cars (no login needed to browse).
