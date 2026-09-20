-- AutoFair migration 0011 — real Trust Report (staff-entered inspections)
-- Run once in Supabase Dashboard → SQL Editor → New query → Run.
-- Safe to re-run. Without this, /api/staff/verify saves score/ratings but
-- the per-check breakdown (sections/items) uses the verified fallback.
--
-- What it adds:
-- 1. inspections.condition (jsonb: mechanical/exterior/interior/tyres labels),
--    accident_status + accident_note, docs_status + docs_note.
-- 2. inspection_items.photo_url + inspected_at + inspector_id (per-check
--    evidence + reviewer timestamp).
-- 3. Staff RLS for inspection_sections / inspection_items / documents so
--    assigned staff can write the report through their own JWT (no service
--    key needed). Public reads stay as-is (sections/items USING(true)).

-- ============ 1. columns ============
alter table public.inspections
  add column if not exists condition jsonb;
alter table public.inspections
  add column if not exists accident_status text not null default 'CLEAR';
alter table public.inspections
  add column if not exists accident_note text not null default '';
alter table public.inspections
  add column if not exists docs_status text not null default '1 PENDING';
alter table public.inspections
  add column if not exists docs_note text not null default '';

alter table public.inspection_items
  add column if not exists photo_url text not null default '';
alter table public.inspection_items
  add column if not exists inspected_at timestamptz;
alter table public.inspection_items
  add column if not exists inspector_id uuid references public.profiles(id) on delete set null;
create index if not exists inspection_items_section_idx2 on public.inspection_items (section_id);

-- ============ 2. staff write policies ============
-- Sections: staff creates/updates/deletes breakdown rows for assigned vehicles.
drop policy if exists "sections_staff_insert" on public.inspection_sections;
create policy "sections_staff_insert" on public.inspection_sections for insert
  with check (
    public.is_staff() and exists (
      select 1 from public.inspections i
      join public.vehicles v on v.id = i.vehicle_id
      where i.id = inspection_id and (v.assigned_staff_id = auth.uid() or v.assigned_staff_id is null)
    )
  );
drop policy if exists "sections_staff_update" on public.inspection_sections;
create policy "sections_staff_update" on public.inspection_sections for update
  using (
    public.is_staff() and exists (
      select 1 from public.inspections i
      join public.vehicles v on v.id = i.vehicle_id
      where i.id = inspection_sections.inspection_id and (v.assigned_staff_id = auth.uid() or v.assigned_staff_id is null)
    )
  )
  with check (public.is_staff());
drop policy if exists "sections_staff_delete" on public.inspection_sections;
create policy "sections_staff_delete" on public.inspection_sections for delete
  using (
    public.is_staff() and exists (
      select 1 from public.inspections i
      join public.vehicles v on v.id = i.vehicle_id
      where i.id = inspection_sections.inspection_id and (v.assigned_staff_id = auth.uid() or v.assigned_staff_id is null)
    )
  );
drop policy if exists "sections_staff_read" on public.inspection_sections;
create policy "sections_staff_read" on public.inspection_sections for select
  using (
    public.is_staff() and exists (
      select 1 from public.inspections i
      join public.vehicles v on v.id = i.vehicle_id
      where i.id = inspection_sections.inspection_id and (v.assigned_staff_id = auth.uid() or v.assigned_staff_id is null)
    )
  );

-- Items: staff writes per-check result + note (+ optional photo url).
drop policy if exists "items_staff_insert" on public.inspection_items;
create policy "items_staff_insert" on public.inspection_items for insert
  with check (
    public.is_staff() and exists (
      select 1 from public.inspection_sections s
      join public.inspections i on i.id = s.inspection_id
      join public.vehicles v on v.id = i.vehicle_id
      where s.id = section_id and (v.assigned_staff_id = auth.uid() or v.assigned_staff_id is null)
    )
  );
drop policy if exists "items_staff_update" on public.inspection_items;
create policy "items_staff_update" on public.inspection_items for update
  using (
    public.is_staff() and exists (
      select 1 from public.inspection_sections s
      join public.inspections i on i.id = s.inspection_id
      join public.vehicles v on v.id = i.vehicle_id
      where s.id = inspection_items.section_id and (v.assigned_staff_id = auth.uid() or v.assigned_staff_id is null)
    )
  )
  with check (public.is_staff());
drop policy if exists "items_staff_delete" on public.inspection_items;
create policy "items_staff_delete" on public.inspection_items for delete
  using (
    public.is_staff() and exists (
      select 1 from public.inspection_sections s
      join public.inspections i on i.id = s.inspection_id
      join public.vehicles v on v.id = i.vehicle_id
      where s.id = inspection_items.section_id and (v.assigned_staff_id = auth.uid() or v.assigned_staff_id is null)
    )
  );
drop policy if exists "items_staff_read" on public.inspection_items;
create policy "items_staff_read" on public.inspection_items for select
  using (
    public.is_staff() and exists (
      select 1 from public.inspection_sections s
      join public.inspections i on i.id = s.inspection_id
      join public.vehicles v on v.id = i.vehicle_id
      where s.id = inspection_items.section_id and (v.assigned_staff_id = auth.uid() or v.assigned_staff_id is null)
    )
  );

-- Documents: staff reads/writes doc checklist for assigned vehicles.
-- (Owner policies from 0001 stay; public still has no access.)
drop policy if exists "documents_staff_read" on public.documents;
create policy "documents_staff_read" on public.documents for select
  using (
    public.is_staff() and exists (
      select 1 from public.vehicles v
      where v.id = vehicle_id and (v.assigned_staff_id = auth.uid() or v.assigned_staff_id is null)
    )
  );
drop policy if exists "documents_staff_insert" on public.documents;
create policy "documents_staff_insert" on public.documents for insert
  with check (
    public.is_staff() and exists (
      select 1 from public.vehicles v
      where v.id = vehicle_id and (v.assigned_staff_id = auth.uid() or v.assigned_staff_id is null)
    )
  );
drop policy if exists "documents_staff_update" on public.documents;
create policy "documents_staff_update" on public.documents for update
  using (
    public.is_staff() and exists (
      select 1 from public.vehicles v
      where v.id = vehicle_id and (v.assigned_staff_id = auth.uid() or v.assigned_staff_id is null)
    )
  )
  with check (public.is_staff());
