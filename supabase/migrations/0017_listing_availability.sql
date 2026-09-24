-- AutoFair migration 0017 — seller-controlled listing availability
--
-- Gap: vehicles.status 'sold' and listings.status 'SOLD'/'PAUSED' exist in the
-- 0001 CHECK constraints, and staff read-side code already treats 'sold' as a
-- completed file (0007, StaffWorkspace), but nothing ever WROTE them. A seller
-- who sold a car off-platform had no way to stop the listing: buyers kept
-- viewing a car that was gone and kept sending inquiries forever.
--
-- This adds the missing write path. No new columns — the enum values already exist.
--
-- Why a SECURITY DEFINER function instead of three client-side updates:
-- the three writes must be atomic. A partial failure leaving vehicles.status
-- = 'sold' against listings.status = 'LIVE' keeps the car publicly visible
-- (listings_public_read only checks listings) while staff count it as done.
-- Client-side it is also unachievable: no policy gives a seller UPDATE on
-- public.inquiries (only inquiries_owner_read and inquiries_insert exist), so
-- the inquiry close would silently no-op.
--
-- Safe to re-run.

-- ============ 1. set_listing_availability ============
create or replace function public.set_listing_availability(
  p_vehicle_id uuid,
  p_action text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vehicle public.vehicles%rowtype;
  v_listing public.listings%rowtype;
  v_has_listing boolean;
begin
  -- Runs as the function owner, which bypasses RLS, so it must self-authorize:
  -- Postgres grants EXECUTE to `public` by default and this migration revokes
  -- it below, but a definer function that trusts its caller is not a boundary.
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into v_vehicle from public.vehicles where id = p_vehicle_id;
  if not found then
    raise exception 'vehicle not found' using errcode = 'P0002';
  end if;
  if v_vehicle.seller_id is distinct from auth.uid() then
    raise exception 'not the owner of this vehicle' using errcode = '42501';
  end if;

  select * into v_listing from public.listings where vehicle_id = p_vehicle_id;
  v_has_listing := found;

  if p_action = 'sold' then
    if not v_has_listing or v_listing.status not in ('LIVE', 'PAUSED') then
      raise exception 'only a live or paused listing can be marked sold' using errcode = 'P0001';
    end if;
    update public.listings set status = 'SOLD' where id = v_listing.id;
    update public.vehicles set status = 'sold' where id = p_vehicle_id;
    -- Open buyer inquiries are answered by the sale; reopening a listing does
    -- not un-close them, they are history.
    update public.inquiries
      set status = 'closed'
      where listing_id = v_listing.id and status <> 'closed';

  elsif p_action = 'pause' then
    if not v_has_listing or v_listing.status <> 'LIVE' then
      raise exception 'only a live listing can be paused' using errcode = 'P0001';
    end if;
    -- vehicles.status is deliberately left alone: 'paused' is not in the
    -- vehicles CHECK enum (0001) and no consumer reads such a value. Pause is
    -- a listings-table concern only.
    update public.listings set status = 'PAUSED' where id = v_listing.id;

  elsif p_action = 'resume' then
    if not v_has_listing or v_listing.status not in ('PAUSED', 'SOLD') then
      raise exception 'only a paused or sold listing can be resumed' using errcode = 'P0001';
    end if;
    update public.listings set status = 'LIVE' where id = v_listing.id;
    -- Only 'sold' moved vehicles.status, so only it needs restoring. A car
    -- paused while published stays 'published' and returns unchanged.
    if v_vehicle.status = 'sold' then
      update public.vehicles set status = 'published' where id = p_vehicle_id;
    end if;

  else
    raise exception 'unknown action: %', p_action using errcode = 'P0002';
  end if;
end;
$$;

-- vehicles_updated_at (0001) keeps updated_at correct; the function never sets it.

revoke execute on function public.set_listing_availability(uuid, text) from PUBLIC, anon;
grant execute on function public.set_listing_availability(uuid, text) to authenticated;

-- ============ 2. owners may delete an ended file ============
-- 0010 allowed delete for pre-verification statuses only, which left a sold
-- car undeletable forever. Deleting a LIVE listing stays staff-controlled:
-- it is public and has live buyer inquiries. Marking it sold first is the
-- seller's route to a deletable file.
drop policy if exists "vehicles_owner_delete" on public.vehicles;
create policy "vehicles_owner_delete" on public.vehicles for delete
  using (
    auth.uid() = seller_id
    and status in ('draft', 'submitted', 'in_review', 'sold')
  );
