-- 0022_photo_cap.sql
-- Moves the "10 photos per car" rule out of the browser and into the database.
--
-- WHY A TRIGGER AND NOT A CHECK:
--   A CHECK constraint cannot count rows in another table, so it can never
--   express "at most 10 per vehicle". A BEFORE INSERT trigger is the normal
--   way to enforce a per-parent row limit.
--
--   The existing guard in lib/supabase/queries.ts (appendVehiclePhotoRows)
--   runs in the browser, so it is bypassed by anything that talks to PostgREST
--   directly, including the service-role key. Triggers run regardless of RLS
--   and regardless of which role connects, so this closes that hole.
--
-- Idempotent: safe to run more than once.

BEGIN;

-- Refuse to install over data that would already violate the cap, so a
-- successful run always means the table is consistent with the rule.
DO $$
DECLARE
  v_max integer;
BEGIN
  SELECT max(c) INTO v_max
  FROM (SELECT count(*) AS c FROM public.vehicle_photos GROUP BY vehicle_id) AS per_car;

  IF coalesce(v_max, 0) > 10 THEN
    RAISE EXCEPTION 'Cannot install the 10-photo cap: one car already has % photos', v_max
      USING hint = 'Delete the extras first, then re-run this migration.';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.enforce_photo_cap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  -- Serialize inserts per vehicle so two concurrent uploads cannot both
  -- pass the count. An advisory lock is used instead of SELECT ... FOR UPDATE
  -- on the parent vehicles row because that would require UPDATE rights on
  -- vehicles, which the staff role does not have.
  PERFORM pg_advisory_xact_lock(hashtext(NEW.vehicle_id::text));

  SELECT count(*)
    INTO v_count
    FROM public.vehicle_photos
   WHERE vehicle_id = NEW.vehicle_id;

  IF v_count >= 10 THEN
    RAISE EXCEPTION 'A car can have at most 10 photos; this one already has %', v_count
      USING errcode = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_photo_cap() IS
  'BEFORE INSERT trigger on vehicle_photos: rejects the insert once a vehicle '
  'already holds 10 photos. Keeps the limit from supabase/migrations/0022 in sync '
  'with MAX_VEHICLE_PHOTOS in lib/supabase/queries.ts.';

DROP TRIGGER IF EXISTS vehicle_photos_cap ON public.vehicle_photos;

CREATE TRIGGER vehicle_photos_cap
  BEFORE INSERT ON public.vehicle_photos
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_photo_cap();

COMMIT;
