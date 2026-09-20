-- AutoFair migration 0010 — customer delete for My Listings (Delete button)
-- Run once in Supabase Dashboard → SQL Editor → New query → Run.
-- Safe to re-run. Without this, deleteMyVehicle() RLS-fails and the UI
-- restores the row with a safe error message.
--
-- What it adds:
-- 1. vehicles_owner_delete — seller can delete own draft/submitted/in_review
--    rows only. Verified/published/sold stay staff-controlled.
-- 2. listings_owner_delete — seller can delete own listing row for the same
--    vehicle (DB cascade would handle it, but explicit policy is clearer).
-- Storage files are removed by the app (storage.from('vehicle-photos').remove)
-- under the existing photos_bucket_vehicle_delete policy (0009).

-- 1. vehicles delete for owners (drafts only)
drop policy if exists "vehicles_owner_delete" on public.vehicles;
create policy "vehicles_owner_delete" on public.vehicles for delete
  using (
    auth.uid() = seller_id
    and status in ('draft', 'submitted', 'in_review')
  );

-- 2. listings delete for owners (same vehicle guard)
drop policy if exists "listings_owner_delete" on public.listings;
create policy "listings_owner_delete" on public.listings for delete
  using (
    exists (
      select 1 from public.vehicles v
      where v.id = vehicle_id and v.seller_id = auth.uid()
    )
  );
