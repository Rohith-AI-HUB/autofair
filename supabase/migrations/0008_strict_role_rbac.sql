-- ============================================================
-- AutoFair — Migration 0008
-- Strict Role-Based Access Control
-- ============================================================
-- Canonical roles:
--   admin
--   staff
--   customer
--
-- Historical roles:
--   inspector -> staff
--   buyer     -> customer
--   seller    -> customer
--
-- New Auth users:
--   customer
--
-- Browser users cannot promote themselves to admin/staff.
-- ============================================================


-- ============================================================
-- 1. VALIDATE EXISTING ROLES BEFORE CHANGING CONSTRAINTS
-- ============================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE role IS NULL
       OR lower(trim(role)) NOT IN (
         'admin',
         'staff',
         'customer',
         'buyer',
         'seller',
         'inspector'
       )
  ) THEN
    RAISE EXCEPTION
      'profiles contains an unknown or missing role. Fix it explicitly to admin, staff, or customer before applying migration 0008.';
  END IF;
END $$;


-- ============================================================
-- 2. REMOVE OLD / CONFLICTING ROLE CHECK CONSTRAINTS
-- ============================================================
-- Existing deployments may still enforce uppercase ADMIN/STAFF/CUSTOMER.
-- Drop those checks before writing the canonical lower-case values.

ALTER TABLE public.profiles
DROP CONSTRAINT IF EXISTS profiles_role_check;

DO $$
DECLARE
  constraint_record RECORD;
BEGIN
  FOR constraint_record IN
    SELECT con.conname
    FROM pg_constraint con
    WHERE con.conrelid = 'public.profiles'::regclass
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%role%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS %I',
      constraint_record.conname
    );
  END LOOP;
END $$;

-- ============================================================
-- 3. NORMALIZE HISTORICAL ROLE VALUES
-- ============================================================

UPDATE public.profiles
SET role =
  CASE lower(trim(role))
    WHEN 'admin'     THEN 'admin'
    WHEN 'staff'     THEN 'staff'
    WHEN 'inspector' THEN 'staff'
    WHEN 'customer'  THEN 'customer'
    WHEN 'buyer'     THEN 'customer'
    WHEN 'seller'    THEN 'customer'
  END;


-- ============================================================
-- 4. ENFORCE CANONICAL ROLE VALUES
-- ============================================================

ALTER TABLE public.profiles
ALTER COLUMN role SET DEFAULT 'customer';

ALTER TABLE public.profiles
ALTER COLUMN role SET NOT NULL;

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_role_check
CHECK (
  role IN ('admin', 'staff', 'customer')
);


-- ============================================================
-- 5. NEW AUTH USER -> CUSTOMER PROFILE
-- ============================================================
-- Every newly registered user starts as customer.
--
-- Admin/staff accounts must be promoted server-side.
-- User metadata and browser storage cannot determine roles.
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN

  INSERT INTO public.profiles (
    id,
    full_name,
    avatar_url,
    email,
    role,
    is_active
  )
  VALUES (
    new.id,

    COALESCE(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      NULL
    ),

    COALESCE(
      new.raw_user_meta_data->>'avatar_url',
      new.raw_user_meta_data->>'picture',
      NULL
    ),

    new.email,

    'customer',

    TRUE
  )

  ON CONFLICT (id) DO NOTHING;

  RETURN new;
END;
$$;


-- ============================================================
-- 6. AUTH USER CREATION TRIGGER
-- ============================================================

DROP TRIGGER IF EXISTS on_auth_user_created
ON auth.users;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();


-- ============================================================
-- 7. BACKFILL PROFILE EMAILS
-- ============================================================
-- Only fills missing email.
-- Does not modify roles.
-- ============================================================

UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE u.id = p.id
  AND (p.email IS NULL OR p.email = '');


-- ============================================================
-- 8. STAFF AUTHORIZATION HELPER
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'staff'
      AND COALESCE(p.is_active, TRUE) = TRUE
  );
$$;


-- ============================================================
-- 9. ADMIN AUTHORIZATION HELPER
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
  );
$$;


-- ============================================================
-- 10. PREVENT ROLE ESCALATION
-- ============================================================
-- Browser users cannot change their own role.
--
-- Only:
--   postgres
--   service_role
--
-- may change roles.
-- ============================================================

CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN

  IF COALESCE(old.role, '') IS DISTINCT FROM COALESCE(new.role, '') THEN

    IF current_user IN ('postgres', 'service_role')
       OR COALESCE((auth.jwt() ->> 'role'), '') = 'service_role'
    THEN
      RETURN new;
    END IF;

    RAISE EXCEPTION
      'role change not permitted'
      USING errcode = '42501';

  END IF;

  RETURN new;
END;
$$;


-- ============================================================
-- 11. ROLE ESCALATION TRIGGER
-- ============================================================

DROP TRIGGER IF EXISTS profiles_no_self_escalation
ON public.profiles;

CREATE TRIGGER profiles_no_self_escalation
BEFORE UPDATE OF role
ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_role_escalation();


-- ============================================================
-- 12. PROFILE READ POLICY
-- ============================================================
-- Customer/staff:
--   Can read their own profile.
--
-- Admin:
--   Can read all profiles.
-- ============================================================

DROP POLICY IF EXISTS "profiles_read_all"
ON public.profiles;

DROP POLICY IF EXISTS "profiles_admin_read"
ON public.profiles;

DROP POLICY IF EXISTS "profiles_read_own_or_admin"
ON public.profiles;

CREATE POLICY "profiles_read_own_or_admin"
ON public.profiles
FOR SELECT
USING (
  id = auth.uid()
  OR public.is_admin()
);


-- ============================================================
-- 13. ADMIN PROFILE UPDATE POLICY
-- ============================================================
-- Admin can update operational profile fields.
-- Role changes are still protected by the trigger above.
-- ============================================================

DROP POLICY IF EXISTS "profiles_admin_update"
ON public.profiles;

CREATE POLICY "profiles_admin_update"
ON public.profiles
FOR UPDATE
USING (
  public.is_admin()
)
WITH CHECK (
  public.is_admin()
);


-- ============================================================
-- 14. VEHICLE STAFF READ
-- ============================================================

DROP POLICY IF EXISTS "vehicles_staff_read"
ON public.vehicles;

CREATE POLICY "vehicles_staff_read"
ON public.vehicles
FOR SELECT
USING (
  public.is_staff()
  AND assigned_staff_id = auth.uid()
);


-- ============================================================
-- 15. VEHICLE STAFF UPDATE
-- ============================================================

DROP POLICY IF EXISTS "vehicles_staff_update"
ON public.vehicles;

CREATE POLICY "vehicles_staff_update"
ON public.vehicles
FOR UPDATE
USING (
  public.is_staff()
  AND assigned_staff_id = auth.uid()
)
WITH CHECK (
  public.is_staff()
  AND assigned_staff_id = auth.uid()
);


-- ============================================================
-- 16. VEHICLE PHOTO STAFF INSERT
-- ============================================================

DROP POLICY IF EXISTS "photos_staff_insert"
ON public.vehicle_photos;

CREATE POLICY "photos_staff_insert"
ON public.vehicle_photos
FOR INSERT
WITH CHECK (
  public.is_staff()
  AND EXISTS (
    SELECT 1
    FROM public.vehicles v
    WHERE v.id = vehicle_id
      AND v.assigned_staff_id = auth.uid()
  )
);


-- ============================================================
-- 17. INSPECTION STAFF INSERT
-- ============================================================

DROP POLICY IF EXISTS "inspections_staff_insert"
ON public.inspections;

CREATE POLICY "inspections_staff_insert"
ON public.inspections
FOR INSERT
WITH CHECK (
  public.is_staff()
  AND EXISTS (
    SELECT 1
    FROM public.vehicles v
    WHERE v.id = vehicle_id
      AND v.assigned_staff_id = auth.uid()
  )
);


-- ============================================================
-- 18. INSPECTION STAFF UPDATE
-- ============================================================

DROP POLICY IF EXISTS "inspections_staff_update"
ON public.inspections;

CREATE POLICY "inspections_staff_update"
ON public.inspections
FOR UPDATE
USING (
  public.is_staff()
  AND EXISTS (
    SELECT 1
    FROM public.vehicles v
    WHERE v.id = vehicle_id
      AND v.assigned_staff_id = auth.uid()
  )
)
WITH CHECK (
  public.is_staff()
);


-- ============================================================
-- 19. INSPECTION STAFF READ
-- ============================================================

DROP POLICY IF EXISTS "inspections_staff_read"
ON public.inspections;

CREATE POLICY "inspections_staff_read"
ON public.inspections
FOR SELECT
USING (
  public.is_staff()
  AND EXISTS (
    SELECT 1
    FROM public.vehicles v
    WHERE v.id = vehicle_id
      AND v.assigned_staff_id = auth.uid()
  )
);


-- ============================================================
-- 20. LISTINGS STAFF READ
-- ============================================================

DROP POLICY IF EXISTS "listings_staff_read"
ON public.listings;

CREATE POLICY "listings_staff_read"
ON public.listings
FOR SELECT
USING (
  public.is_staff()
  AND EXISTS (
    SELECT 1
    FROM public.vehicles v
    WHERE v.id = vehicle_id
      AND v.assigned_staff_id = auth.uid()
  )
);


-- ============================================================
-- 21. LISTINGS STAFF INSERT
-- ============================================================

DROP POLICY IF EXISTS "listings_staff_insert"
ON public.listings;

CREATE POLICY "listings_staff_insert"
ON public.listings
FOR INSERT
WITH CHECK (
  public.is_staff()
  AND EXISTS (
    SELECT 1
    FROM public.vehicles v
    WHERE v.id = vehicle_id
      AND v.assigned_staff_id = auth.uid()
  )
);


-- ============================================================
-- 22. LISTINGS STAFF UPDATE
-- ============================================================

DROP POLICY IF EXISTS "listings_staff_update"
ON public.listings;

CREATE POLICY "listings_staff_update"
ON public.listings
FOR UPDATE
USING (
  public.is_staff()
  AND EXISTS (
    SELECT 1
    FROM public.vehicles v
    WHERE v.id = vehicle_id
      AND v.assigned_staff_id = auth.uid()
  )
)
WITH CHECK (
  public.is_staff()
);


-- ============================================================
-- 23. AUTOMATIC STAFF ASSIGNMENT
-- ============================================================

CREATE OR REPLACE FUNCTION public.assign_inspection_to_least_loaded(
  p_vehicle_id uuid,
  p_assignment_type text DEFAULT 'Automatic',
  p_reason text DEFAULT NULL,
  p_actor_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$

DECLARE
  v_prev uuid;
  v_status text;
  v_pick uuid;
  v_type text :=
    COALESCE(
      NULLIF(TRIM(p_assignment_type), ''),
      'Automatic'
    );

BEGIN

  IF v_type NOT IN ('Automatic', 'Manual Override') THEN
    v_type := 'Automatic';
  END IF;


  PERFORM pg_advisory_xact_lock(
    hashtextextended('autofair_assign_lock', 0)
  );


  SELECT
    assigned_staff_id,
    inspection_status
  INTO
    v_prev,
    v_status
  FROM public.vehicles
  WHERE id = p_vehicle_id
  FOR UPDATE;


  IF NOT FOUND THEN
    RAISE EXCEPTION
      'vehicle not found'
      USING errcode = 'P0002';
  END IF;


  IF v_status IN ('Completed', 'Cancelled')
     AND v_type = 'Automatic'
  THEN
    RETURN v_prev;
  END IF;


  SELECT p.id
  INTO v_pick
  FROM public.profiles p

  LEFT JOIN LATERAL (
    SELECT COUNT(*)::int AS load
    FROM public.vehicles v
    WHERE v.assigned_staff_id = p.id
      AND v.inspection_status IN (
        'Pending',
        'Assigned',
        'In Progress'
      )
  ) w ON TRUE

  LEFT JOIN LATERAL (
    SELECT COUNT(*)::int AS today
    FROM public.vehicles v
    WHERE v.assigned_staff_id = p.id
      AND v.assigned_at::date = CURRENT_DATE
  ) t ON TRUE

  WHERE p.role = 'staff'
    AND COALESCE(p.is_active, TRUE) = TRUE

  ORDER BY
    w.load ASC,
    t.today ASC,
    p.last_assignment_at ASC NULLS FIRST,
    p.created_at ASC NULLS LAST,
    p.id ASC

  LIMIT 1;


  IF v_pick IS NULL THEN

    INSERT INTO public.staff_assignment_logs (
      vehicle_id,
      previous_staff_id,
      new_staff_id,
      assignment_type,
      reason,
      created_by
    )
    VALUES (
      p_vehicle_id,
      v_prev,
      NULL,
      v_type,
      COALESCE(
        NULLIF(TRIM(COALESCE(p_reason, '')), ''),
        'No active staff available'
      ),
      p_actor_id
    );

    RETURN NULL;

  END IF;


  UPDATE public.vehicles
  SET
    assigned_staff_id = v_pick,
    assigned_at = NOW(),

    inspection_status =
      CASE
        WHEN inspection_status = 'Pending'
        THEN 'Assigned'
        ELSE inspection_status
      END,

    updated_at = NOW()

  WHERE id = p_vehicle_id;


  UPDATE public.profiles
  SET last_assignment_at = NOW()
  WHERE id = v_pick;


  INSERT INTO public.staff_assignment_logs (
    vehicle_id,
    previous_staff_id,
    new_staff_id,
    assignment_type,
    reason,
    created_by
  )
  VALUES (
    p_vehicle_id,
    v_prev,
    v_pick,
    v_type,
    COALESCE(
      NULLIF(TRIM(COALESCE(p_reason, '')), ''),
      'Auto-assigned by workload'
    ),
    p_actor_id
  );


  RETURN v_pick;

END;
$$;


-- ============================================================
-- 24. MANUAL STAFF ASSIGNMENT
-- ============================================================

CREATE OR REPLACE FUNCTION public.manual_assign_inspection(
  p_vehicle_id uuid,
  p_target_staff_id uuid,
  p_reason text DEFAULT NULL,
  p_actor_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$

DECLARE
  v_prev uuid;
  v_is_active boolean;
  v_role text;

BEGIN

  PERFORM pg_advisory_xact_lock(
    hashtextextended('autofair_assign_lock', 0)
  );


  SELECT assigned_staff_id
  INTO v_prev
  FROM public.vehicles
  WHERE id = p_vehicle_id
  FOR UPDATE;


  IF NOT FOUND THEN
    RAISE EXCEPTION
      'vehicle not found'
      USING errcode = 'P0002';
  END IF;


  SELECT
    is_active,
    role
  INTO
    v_is_active,
    v_role
  FROM public.profiles
  WHERE id = p_target_staff_id;


  IF NOT FOUND THEN
    RAISE EXCEPTION
      'staff not found'
      USING errcode = 'P0002';
  END IF;


  IF v_role != 'staff' THEN
    RAISE EXCEPTION
      'target is not inspection staff'
      USING errcode = '42501';
  END IF;


  IF COALESCE(v_is_active, TRUE) = FALSE THEN
    RAISE EXCEPTION
      'staff is inactive'
      USING errcode = '23514';
  END IF;


  IF p_reason IS NULL
     OR TRIM(p_reason) = ''
  THEN
    RAISE EXCEPTION
      'reason required for manual override'
      USING errcode = '23514';
  END IF;


  UPDATE public.vehicles
  SET
    assigned_staff_id = p_target_staff_id,
    assigned_at = NOW(),

    inspection_status =
      CASE
        WHEN inspection_status = 'Pending'
        THEN 'Assigned'
        ELSE inspection_status
      END,

    updated_at = NOW()

  WHERE id = p_vehicle_id;


  UPDATE public.profiles
  SET last_assignment_at = NOW()
  WHERE id = p_target_staff_id;


  INSERT INTO public.staff_assignment_logs (
    vehicle_id,
    previous_staff_id,
    new_staff_id,
    assignment_type,
    reason,
    created_by
  )
  VALUES (
    p_vehicle_id,
    v_prev,
    p_target_staff_id,
    'Manual Override',
    TRIM(p_reason),
    p_actor_id
  );


  RETURN p_target_staff_id;

END;
$$;


-- ============================================================
-- 25. FINAL VERIFICATION
-- ============================================================
-- This should return:
--
-- CHECK ((role = ANY (ARRAY['admin','staff','customer'])))
-- ============================================================

SELECT
  conname,
  pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'public.profiles'::regclass
  AND conname = 'profiles_role_check';


-- ============================================================
-- 26. VERIFY CURRENT ROLES
-- ============================================================

SELECT
  role,
  COUNT(*) AS total
FROM public.profiles
GROUP BY role
ORDER BY role;