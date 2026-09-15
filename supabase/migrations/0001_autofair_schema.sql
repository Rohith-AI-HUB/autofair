-- AutoFair schema v1 — 0-rupee Supabase Free friendly
-- Run this in Supabase Dashboard → SQL Editor → New query → Paste → Run
-- Assumes: Postgres 15+, pgcrypto for gen_random_uuid (enabled by default on Supabase)
-- Tables: profiles, vehicles, vehicle_photos, inspections, inspection_sections,
--   inspection_items, documents, listings, inquiries, favorites
-- Buckets: vehicle-photos (public), vehicle-documents (private)

-- ============ helpers ============
create extension if not exists "pgcrypto";

create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Auto-create profile on signup (display name from metadata if present)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', null),
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture', null)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.generate_inspection_id()
returns text language plpgsql as $$
declare
  y text := to_char(now(), 'YYYY');
  r text := lpad(floor(random() * 1000000)::text, 6, '0');
begin
  return 'AF-' || y || '-' || r;
end;
$$;

create or replace function public.increment_listing_views(p_listing_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.listings set views_count = views_count + 1 where id = p_listing_id;
end;
$$;

-- ============ tables ============

-- profiles: 1 row per auth user
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  city text,
  role text not null default 'buyer' check (role in ('buyer','seller','admin','inspector')),
  avatar_url text,
  created_at timestamptz not null default now()
);

-- vehicles: core seller submission, one row per car
create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid references public.profiles(id) on delete set null,
  reg_number text not null unique,
  make text not null,
  model text not null,
  variant text not null default '',
  year int not null check (year between 2000 and 2030),
  fuel text not null check (fuel in ('Petrol','Diesel','CNG','Electric','Hybrid')),
  transmission text not null check (transmission in ('Manual','Automatic','AMT','CVT')),
  km_driven int not null check (km_driven >= 0),
  ownership text not null default 'First owner',
  location text not null default '',
  price_expected int not null check (price_expected >= 0),
  status text not null default 'submitted'
    check (status in ('draft','submitted','in_review','verified','rejected','published','sold')),
  inspection_id text not null unique default public.generate_inspection_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists vehicles_updated_at on public.vehicles;
create trigger vehicles_updated_at before update on public.vehicles
  for each row execute function public.handle_updated_at();

create index if not exists vehicles_seller_idx on public.vehicles (seller_id);
create index if not exists vehicles_status_idx on public.vehicles (status);
create index if not exists vehicles_make_idx on public.vehicles (make);
create index if not exists vehicles_location_idx on public.vehicles (location);

-- vehicle_photos: storage_path = vehicle-photos/{vehicle_id}/xxx.webp
create table if not exists public.vehicle_photos (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  storage_path text not null,
  public_url text not null default '',
  sort_order int not null default 0,
  is_cover boolean not null default false,
  created_at timestamptz not null default now(),
  unique (vehicle_id, storage_path)
);
create index if not exists vehicle_photos_vehicle_idx on public.vehicle_photos (vehicle_id, sort_order);

-- inspections: 1 per vehicle
create table if not exists public.inspections (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null unique references public.vehicles(id) on delete cascade,
  inspector_id uuid references public.profiles(id) on delete set null,
  score numeric(3,1) check (score is null or (score >= 0 and score <= 10)),
  overall_status text not null default 'attention' check (overall_status in ('pass','attention','fail')),
  inspected_at timestamptz,
  is_sample boolean not null default false,
  notes text not null default ''
);

-- inspection_sections: e.g. ENGINE & TRANSMISSION 14/14
create table if not exists public.inspection_sections (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  title text not null,
  passed int not null default 0 check (passed >= 0),
  total int not null default 0 check (total >= 0)
);
create index if not exists inspection_sections_inspection_idx on public.inspection_sections (inspection_id);

-- inspection_items
create table if not exists public.inspection_items (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.inspection_sections(id) on delete cascade,
  name text not null,
  result text not null default 'pass' check (result in ('pass','attention','fail')),
  note text not null default ''
);
create index if not exists inspection_items_section_idx on public.inspection_items (section_id);

-- documents: RC / insurance / PUC etc, files in private bucket vehicle-documents
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  doc_type text not null check (doc_type in ('rc','insurance','puc','service_history','challan','noc','other')),
  storage_path text not null default '',
  verification_status text not null default 'pending' check (verification_status in ('pending','verified','rejected')),
  verified_at timestamptz,
  note text not null default ''
);
create index if not exists documents_vehicle_idx on public.documents (vehicle_id);

-- listings: public facing, 1 per verified vehicle
create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null unique references public.vehicles(id) on delete cascade,
  slug text not null unique,
  title text not null,
  price int not null check (price >= 0),
  description text not null default '',
  status text not null default 'DRAFT' check (status in ('DRAFT','IN_REVIEW','LIVE','PAUSED','SOLD')),
  views_count int not null default 0 check (views_count >= 0),
  published_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists listings_status_idx on public.listings (status);
create index if not exists listings_slug_idx on public.listings (slug);

-- inquiries
create table if not exists public.inquiries (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  buyer_id uuid references public.profiles(id) on delete set null,
  buyer_contact text not null default '',
  message text not null default '',
  type text not null default 'general'
    check (type in ('test_drive','inspection_pdf','negotiate','general')),
  offered_price int check (offered_price is null or offered_price >= 0),
  status text not null default 'new' check (status in ('new','contacted','closed')),
  created_at timestamptz not null default now()
);
create index if not exists inquiries_listing_idx on public.inquiries (listing_id);

-- favorites
create table if not exists public.favorites (
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (buyer_id, listing_id)
);

-- ============ RLS ============
alter table public.profiles enable row level security;
alter table public.vehicles enable row level security;
alter table public.vehicle_photos enable row level security;
alter table public.inspections enable row level security;
alter table public.inspection_sections enable row level security;
alter table public.inspection_items enable row level security;
alter table public.documents enable row level security;
alter table public.listings enable row level security;
alter table public.inquiries enable row level security;
alter table public.favorites enable row level security;

-- profiles: public read limited columns via app, owner update, anyone insert own id
drop policy if exists "profiles_read_all" on public.profiles;
create policy "profiles_read_all" on public.profiles for select using (true);
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);

-- vehicles: anon can read verified/published, seller reads own, authed can insert, seller updates own
drop policy if exists "vehicles_public_read" on public.vehicles;
create policy "vehicles_public_read" on public.vehicles for select
  using (status in ('verified','published'));
drop policy if exists "vehicles_owner_read" on public.vehicles;
create policy "vehicles_owner_read" on public.vehicles for select
  using (auth.uid() = seller_id);
drop policy if exists "vehicles_insert" on public.vehicles;
create policy "vehicles_insert" on public.vehicles for insert
  with check (auth.uid() = seller_id or seller_id is null);
drop policy if exists "vehicles_owner_update" on public.vehicles;
create policy "vehicles_owner_update" on public.vehicles for update
  using (auth.uid() = seller_id);

-- vehicle_photos: public read if vehicle published/verified, owner manage
drop policy if exists "photos_public_read" on public.vehicle_photos;
create policy "photos_public_read" on public.vehicle_photos for select using (
  exists (select 1 from public.vehicles v where v.id = vehicle_id and v.status in ('verified','published'))
  or exists (select 1 from public.vehicles v where v.id = vehicle_id and v.seller_id = auth.uid())
);
drop policy if exists "photos_owner_insert" on public.vehicle_photos;
create policy "photos_owner_insert" on public.vehicle_photos for insert with check (
  exists (select 1 from public.vehicles v where v.id = vehicle_id and (v.seller_id = auth.uid() or v.seller_id is null))
);
drop policy if exists "photos_owner_delete" on public.vehicle_photos;
create policy "photos_owner_delete" on public.vehicle_photos for delete using (
  exists (select 1 from public.vehicles v where v.id = vehicle_id and v.seller_id = auth.uid())
);

-- inspections + sections + items: public read if vehicle published, inspector/admin write via service_role (bypasses RLS)
-- keep authed read for owner too
drop policy if exists "inspections_public_read" on public.inspections;
create policy "inspections_public_read" on public.inspections for select using (
  exists (select 1 from public.vehicles v where v.id = vehicle_id and v.status in ('verified','published'))
  or exists (select 1 from public.vehicles v where v.id = vehicle_id and v.seller_id = auth.uid())
);
drop policy if exists "sections_public_read" on public.inspection_sections;
create policy "sections_public_read" on public.inspection_sections for select using (true);
drop policy if exists "items_public_read" on public.inspection_items;
create policy "items_public_read" on public.inspection_items for select using (true);

-- documents: owner only, no anon
drop policy if exists "documents_owner_read" on public.documents;
create policy "documents_owner_read" on public.documents for select using (
  exists (select 1 from public.vehicles v where v.id = vehicle_id and v.seller_id = auth.uid())
);
drop policy if exists "documents_owner_insert" on public.documents;
create policy "documents_owner_insert" on public.documents for insert with check (
  exists (select 1 from public.vehicles v where v.id = vehicle_id and (v.seller_id = auth.uid() or v.seller_id is null))
);

-- listings: public reads LIVE, seller reads own
drop policy if exists "listings_public_read" on public.listings;
create policy "listings_public_read" on public.listings for select using (status = 'LIVE');
drop policy if exists "listings_owner_read" on public.listings;
create policy "listings_owner_read" on public.listings for select using (
  exists (select 1 from public.vehicles v where v.id = vehicle_id and v.seller_id = auth.uid())
);
drop policy if exists "listings_owner_insert" on public.listings;
create policy "listings_owner_insert" on public.listings for insert with check (
  exists (select 1 from public.vehicles v where v.id = vehicle_id and (v.seller_id = auth.uid() or v.seller_id is null))
);
drop policy if exists "listings_owner_update" on public.listings;
create policy "listings_owner_update" on public.listings for update using (
  exists (select 1 from public.vehicles v where v.id = vehicle_id and v.seller_id = auth.uid())
);

-- inquiries: anyone authed can create, seller of listing can read, buyer reads own
drop policy if exists "inquiries_owner_read" on public.inquiries;
create policy "inquiries_owner_read" on public.inquiries for select using (
  auth.uid() = buyer_id
  or exists (
    select 1 from public.listings l
    join public.vehicles v on v.id = l.vehicle_id
    where l.id = listing_id and v.seller_id = auth.uid()
  )
);
drop policy if exists "inquiries_insert" on public.inquiries;
create policy "inquiries_insert" on public.inquiries for insert with check (true);

-- favorites: owner only
drop policy if exists "favorites_owner_all" on public.favorites;
create policy "favorites_owner_all" on public.favorites for all using (auth.uid() = buyer_id) with check (auth.uid() = buyer_id);

-- ============ storage buckets ============
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'vehicle-photos', 'vehicle-photos', true, 2097152,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update set public = true, file_size_limit = 2097152,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'vehicle-documents', 'vehicle-documents', false, 5242880,
  array['application/pdf','image/jpeg','image/png','image/webp']
)
on conflict (id) do update set public = false, file_size_limit = 5242880,
  allowed_mime_types = array['application/pdf','image/jpeg','image/png','image/webp'];

-- storage.objects policies
drop policy if exists "photos_bucket_public_read" on storage.objects;
create policy "photos_bucket_public_read" on storage.objects for select
  using (bucket_id = 'vehicle-photos');

drop policy if exists "photos_bucket_auth_insert" on storage.objects;
create policy "photos_bucket_auth_insert" on storage.objects for insert
  with check (bucket_id = 'vehicle-photos' and auth.role() = 'authenticated');

drop policy if exists "photos_bucket_owner_update" on storage.objects;
create policy "photos_bucket_owner_update" on storage.objects for update
  using (bucket_id = 'vehicle-photos' and auth.role() = 'authenticated');

drop policy if exists "photos_bucket_owner_delete" on storage.objects;
create policy "photos_bucket_owner_delete" on storage.objects for delete
  using (bucket_id = 'vehicle-photos' and auth.role() = 'authenticated');

drop policy if exists "docs_bucket_owner_read" on storage.objects;
create policy "docs_bucket_owner_read" on storage.objects for select
  using (bucket_id = 'vehicle-documents' and auth.role() = 'authenticated');

drop policy if exists "docs_bucket_auth_insert" on storage.objects;
create policy "docs_bucket_auth_insert" on storage.objects for insert
  with check (bucket_id = 'vehicle-documents' and auth.role() = 'authenticated');

drop policy if exists "docs_bucket_owner_delete" on storage.objects;
create policy "docs_bucket_owner_delete" on storage.objects for delete
  using (bucket_id = 'vehicle-documents' and auth.role() = 'authenticated');
