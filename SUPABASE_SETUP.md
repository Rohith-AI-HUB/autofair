# AutoFair Supabase setup (0 rupees)

You already have `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env`.
Now run the DB migration once:

1. Open https://supabase.com/dashboard → your project `ueuutxpqgkjyubwaiall` → SQL Editor → New query
2. Paste `supabase/migrations/0001_autofair_schema.sql` → Run
   - Creates 10 tables: profiles, vehicles, vehicle_photos, inspections, inspection_sections, inspection_items, documents, listings, inquiries, favorites
   - Enables RLS + policies (public reads LIVE/published only, sellers manage own, docs private)
   - Creates buckets: `vehicle-photos` (public, 2MB, jpg/png/webp), `vehicle-documents` (private, 5MB)
   - Creates helpers: `handle_new_user()`, `generate_inspection_id()`, `increment_listing_views()`
3. Paste `supabase/migrations/0002_seed_sample.sql` → Run
   - Inserts 6 sample vehicles (Creta, Baleno, City, Nexon, i20, Seltos) as `published`
   - 1 cover photo each (Unsplash URL), LIVE listings, 1 sample inspection for Creta
4. Wait ~30s for PostgREST to reload schema cache, then refresh `/cars`
   - Header under count switches from `SAMPLE DATA` to `LIVE FROM SUPABASE`
   - `/` featured section also comes from DB
   - `/cars/[slug]` tries DB first, falls back to mock

## Sell flow (now live)

`/sell-your-car` → validates → `vehicles(status=submitted)` → compresses photos in browser to WebP 1280px → uploads to `vehicle-photos/{vehicleId}/` → inserts `vehicle_photos` rows.
- Needs sign-in for `seller_id`, but works guest too (seller_id null) so you can test with 0 friction.
- If RLS blocks guest inserts, sign in first via `/auth`.
- Quote returned `inspectionId` (AF-YYYY-XXXXXX) to buyer.

## Staying free

- 500MB DB, 1GB storage, 5GB egress. Photos ~150-200KB WebP, 10/car ≈ 2MB → ~500 cars in 1GB.
- `listings.views_count` counter, not per-view rows.
- Docs bucket stays private, use signed URLs (60s) when you build doc viewer.
- Free project pauses after 7 days idle → Dashboard → Restore. Data stays.
- Only 2 free projects per org — keep 1 prod + 1 dev max.

## Files added

- `supabase/migrations/0001_autofair_schema.sql` — schema + RLS + buckets
- `supabase/migrations/0002_seed_sample.sql` — 6-car seed mirroring `lib/data/cars.ts`
- `lib/supabase/server.ts` — anon read client (server components)
- `lib/supabase/db-types.ts` — DB row types
- `lib/supabase/storage.ts` — browser WebP compress + upload
- `lib/supabase/queries.ts` — `fetchLiveCars`, `fetchCarBySlugFromDb`, `createVehicleRow`, `addVehiclePhotoRows`
- Wired: `CarsExplorer` (live with sample fallback), `FeaturedCars` (async live), `CarDetailPage` (DB first), `SellForm` (real save), `next.config.js` (supabase image host)
