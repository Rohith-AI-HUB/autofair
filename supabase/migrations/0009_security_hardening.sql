-- AutoFair migration 0009 — security hardening. Apply after 0008.

-- Browser clients must never execute privileged assignment routines directly.
REVOKE EXECUTE ON FUNCTION public.assign_inspection_to_least_loaded(uuid, text, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.manual_assign_inspection(uuid, uuid, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reassign_staff_inspections(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_inspection_to_least_loaded(uuid, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.manual_assign_inspection(uuid, uuid, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reassign_staff_inspections(uuid, text, uuid) TO service_role;

-- Prevent users from editing operational profile values and audit history.
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "assignment_logs_admin_insert" ON public.staff_assignment_logs;

-- Do not accept anonymous/unattributed inquiry rows from direct PostgREST calls.
DROP POLICY IF EXISTS "inquiries_insert" ON public.inquiries;
DROP POLICY IF EXISTS "inquiries_insert_authenticated" ON public.inquiries;
CREATE POLICY "inquiries_insert_authenticated" ON public.inquiries FOR INSERT TO authenticated WITH CHECK (
  buyer_id::text = auth.uid()::text
  AND EXISTS (SELECT 1 FROM public.listings l WHERE l.id::text = listing_id::text AND l.status = 'LIVE')
);

-- Inspection detail is public only after the vehicle has been verified.
DROP POLICY IF EXISTS "sections_public_read" ON public.inspection_sections;
DROP POLICY IF EXISTS "sections_secure_read" ON public.inspection_sections;
CREATE POLICY "sections_secure_read" ON public.inspection_sections FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.inspections i JOIN public.vehicles v ON v.id::text = i.vehicle_id::text
    WHERE i.id::text = inspection_id::text AND (
      v.status IN ('verified', 'published') OR v.seller_id::text = auth.uid()::text
      OR (public.is_staff() AND v.assigned_staff_id::text = auth.uid()::text) OR public.is_admin()
    )
  )
);

DROP POLICY IF EXISTS "items_public_read" ON public.inspection_items;
DROP POLICY IF EXISTS "items_secure_read" ON public.inspection_items;
CREATE POLICY "items_secure_read" ON public.inspection_items FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.inspection_sections s
    JOIN public.inspections i ON i.id::text = s.inspection_id::text
    JOIN public.vehicles v ON v.id::text = i.vehicle_id::text
    WHERE s.id::text = section_id::text AND (
      v.status IN ('verified', 'published') OR v.seller_id::text = auth.uid()::text
      OR (public.is_staff() AND v.assigned_staff_id::text = auth.uid()::text) OR public.is_admin()
    )
  )
);

-- Private document objects may be read only by the owner, assigned staff, or admin.
DROP POLICY IF EXISTS "docs_bucket_owner_read" ON storage.objects;
DROP POLICY IF EXISTS "docs_bucket_authorized_read" ON storage.objects;
CREATE POLICY "docs_bucket_authorized_read" ON storage.objects FOR SELECT USING (
  bucket_id = 'vehicle-documents' AND EXISTS (
    SELECT 1 FROM public.documents d JOIN public.vehicles v ON v.id::text = d.vehicle_id::text
    WHERE d.storage_path = name AND (
      v.seller_id::text = auth.uid()::text OR (public.is_staff() AND v.assigned_staff_id::text = auth.uid()::text) OR public.is_admin()
    )
  )
);
DROP POLICY IF EXISTS "docs_bucket_auth_insert" ON storage.objects;
DROP POLICY IF EXISTS "docs_bucket_owner_insert" ON storage.objects;
CREATE POLICY "docs_bucket_owner_insert" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'vehicle-documents'
);
DROP POLICY IF EXISTS "docs_bucket_owner_delete" ON storage.objects;
CREATE POLICY "docs_bucket_owner_delete" ON storage.objects FOR DELETE USING (
  bucket_id = 'vehicle-documents' AND EXISTS (
    SELECT 1 FROM public.documents d JOIN public.vehicles v ON v.id::text = d.vehicle_id::text
    WHERE d.storage_path = name AND (
      v.seller_id::text = auth.uid()::text OR (public.is_staff() AND v.assigned_staff_id::text = auth.uid()::text) OR public.is_admin()
    )
  )
);

-- Marketplace photos remain publicly viewable, but writes are tied to the
-- seller's vehicle or its assigned staff member, never just authentication.
DROP POLICY IF EXISTS "photos_bucket_auth_insert" ON storage.objects;
DROP POLICY IF EXISTS "photos_bucket_vehicle_insert" ON storage.objects;
CREATE POLICY "photos_bucket_vehicle_insert" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'vehicle-photos' AND EXISTS (
    SELECT 1 FROM public.vehicles v
    WHERE v.id::text = split_part(name, '/', 1)
    AND (v.seller_id::text = auth.uid()::text OR (public.is_staff() AND v.assigned_staff_id::text = auth.uid()::text))
  )
);
DROP POLICY IF EXISTS "photos_bucket_owner_update" ON storage.objects;
DROP POLICY IF EXISTS "photos_bucket_vehicle_update" ON storage.objects;
CREATE POLICY "photos_bucket_vehicle_update" ON storage.objects FOR UPDATE USING (
  bucket_id = 'vehicle-photos' AND EXISTS (
    SELECT 1 FROM public.vehicles v
    WHERE v.id::text = split_part(name, '/', 1)
    AND (v.seller_id::text = auth.uid()::text OR (public.is_staff() AND v.assigned_staff_id::text = auth.uid()::text))
  )
) WITH CHECK (bucket_id = 'vehicle-photos');
DROP POLICY IF EXISTS "photos_bucket_owner_delete" ON storage.objects;
DROP POLICY IF EXISTS "photos_bucket_vehicle_delete" ON storage.objects;
CREATE POLICY "photos_bucket_vehicle_delete" ON storage.objects FOR DELETE USING (
  bucket_id = 'vehicle-photos' AND EXISTS (
    SELECT 1 FROM public.vehicles v
    WHERE v.id::text = split_part(name, '/', 1)
    AND (v.seller_id::text = auth.uid()::text OR (public.is_staff() AND v.assigned_staff_id::text = auth.uid()::text))
  )
);

DROP POLICY IF EXISTS "documents_staff_read" ON public.documents;
CREATE POLICY "documents_staff_read" ON public.documents FOR SELECT USING (
  public.is_staff() AND EXISTS (SELECT 1 FROM public.vehicles v WHERE v.id::text = vehicle_id::text AND v.assigned_staff_id::text = auth.uid()::text)
);
DROP POLICY IF EXISTS "documents_admin_read" ON public.documents;
CREATE POLICY "documents_admin_read" ON public.documents FOR SELECT USING (public.is_admin());
