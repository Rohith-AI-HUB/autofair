import type { Car } from '@/types';
import type { DbListing, DbVehicle, DbVehiclePhoto } from '@/lib/supabase/db-types';
import { getServerClient } from '@/lib/supabase/server';
import { getBrowserClient } from '@/lib/supabase/client';
import { fetchCurrentProfile } from '@/lib/auth/roles';
import {
  DbOperationError,
  SAFE_MESSAGES,
  classifyDbError,
  logDbError,
} from '@/lib/errors/db-error';

// Map DB rows → existing app Car type so UI keeps working with mock fallback.
export function dbToCar(
  vehicle: DbVehicle,
  photos: DbVehiclePhoto[],
  listing?: DbListing | null,
  score?: number | null
): Car {
  const images = photos.length
    ? [...photos].sort((a, b) => a.sort_order - b.sort_order).map((p) => p.public_url).filter(Boolean)
    : [];
  const slug =
    listing?.slug ??
    `${vehicle.year}-${vehicle.make}-${vehicle.model}-${vehicle.variant}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  return {
    id: vehicle.id,
    slug,
    make: vehicle.make,
    model: vehicle.model,
    variant: vehicle.variant || '—',
    year: vehicle.year,
    price: listing?.price ?? vehicle.price_expected,
    mileageKm: vehicle.km_driven,
    fuel: vehicle.fuel,
    transmission: vehicle.transmission,
    ownership: vehicle.ownership,
    location: vehicle.location,
    registration: vehicle.reg_number,
    images: images.length ? images : ['/icon.svg'],
    inspectionId: vehicle.inspection_id,
    score: score ?? 8.0,
    condition: { mechanical: 'GOOD', exterior: 'GOOD', interior: 'GOOD', tyres: 'GOOD' },
    verification: {
      verified: vehicle.status === 'verified' || vehicle.status === 'published',
      inspection: 'FILE AVAILABLE',
      documents: 'VERIFY ON CALL',
      accidentHistory: 'ASK SELLER',
    },
  };
}

export async function fetchLiveCars(): Promise<Car[] | null> {
  // Stale-while-revalidate cache: tab switches remount CarsExplorer, so return
  // cached cars instantly instead of flashing seed without AF-2026-460606 for ~1s.
  const TTL = 5 * 60 * 1000;
  const now = Date.now();
  if (typeof window !== 'undefined') {
    try {
      const raw = window.sessionStorage.getItem('autofair-live-cars');
      if (raw) {
        const parsed = JSON.parse(raw) as { at: number; cars: Car[] };
        if (parsed?.cars?.length && now - parsed.at < TTL) {
          // Revalidate in background, but return cache now.
          void refreshLiveCars();
          return parsed.cars;
        }
      }
    } catch {
      /* storage unavailable */
    }
  } else if (liveMem && now - liveMem.at < TTL) {
    return liveMem.cars;
  }
  return refreshLiveCars();
}

let liveMem: { at: number; cars: Car[] } | null = null;

async function refreshLiveCars(): Promise<Car[] | null> {
  // Returns null when DB not configured or tables missing → caller falls back to mock.
  // Failures are logged server-side (logDbError) but never thrown to the UI.
  try {
    const sb = getServerClient();
    if (!sb) return null;
    // Single query: listings + vehicle + photos + score. No N+1 per car.
    const { data: listings, error } = await sb
      .from('listings')
      .select('*, vehicle:vehicles(*, vehicle_photos(*), inspections(score))')
      .eq('status', 'LIVE')
      .order('published_at', { ascending: false })
      .limit(24);
    if (error) {
      logDbError('listings.fetchLive', error);
      return null;
    }
    if (!listings) return null;

    const out: Car[] = [];
    for (const row of listings as unknown as (DbListing & {
      vehicle: DbVehicle & { vehicle_photos: DbVehiclePhoto[]; inspections: { score: number | null } | { score: number | null }[] | null };
    })[]) {
      const v = row.vehicle;
      if (!v) continue;
      const photos = (v.vehicle_photos ?? []) as DbVehiclePhoto[];
      const insp = v.inspections;
      const score = Array.isArray(insp) ? insp[0]?.score ?? null : insp?.score ?? null;
      out.push(dbToCar(v, photos, row, score));
    }
    if (out.length) {
      liveMem = { at: Date.now(), cars: out };
      if (typeof window !== 'undefined') {
        try {
          window.sessionStorage.setItem('autofair-live-cars', JSON.stringify(liveMem));
        } catch {
          /* storage unavailable */
        }
      }
    }
    return out.length ? out : null;
  } catch (err) {
    logDbError('listings.fetchLive', err);
    return null;
  }
}

export function invalidateLiveCarsCache(): void {
  liveMem = null;
  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.removeItem('autofair-live-cars');
    } catch {
      /* storage unavailable */
    }
  }
}

// My garage: seller's own vehicles with cover + listing status. RLS owner policies apply.
export interface MyVehicleRow {
  vehicle: DbVehicle;
  coverUrl: string | null;
  listing: DbListing | null;
  inquiriesCount: number;
}

export async function fetchMyVehicles(): Promise<MyVehicleRow[] | null> {
  const TTL = 2 * 60 * 1000;
  const now = Date.now();
  if (typeof window !== 'undefined') {
    try {
      const raw = window.sessionStorage.getItem('autofair-my-vehicles');
      if (raw) {
        const parsed = JSON.parse(raw) as { at: number; rows: MyVehicleRow[] };
        if (parsed?.rows && now - parsed.at < TTL) {
          void refreshMyVehicles();
          return parsed.rows;
        }
      }
    } catch {
      /* storage unavailable */
    }
  } else if (myMem && now - myMem.at < TTL) {
    return myMem.rows;
  }
  return refreshMyVehicles();
}

let myMem: { at: number; rows: MyVehicleRow[] } | null = null;

async function refreshMyVehicles(): Promise<MyVehicleRow[] | null> {
  try {
    const sb = getBrowserClient('local') ?? getBrowserClient('session');
    if (!sb || typeof window === 'undefined') return null;
    const { data: sessionData } = await sb.auth.getSession();
    const uid = sessionData.session?.user?.id;
    if (!uid) return null;
    const { data: vehicles, error } = await sb
      .from('vehicles')
      .select('*')
      .eq('seller_id', uid)
      .order('created_at', { ascending: false });
    if (error) {
      logDbError('vehicles.fetchMine', error);
      return null;
    }
    if (!vehicles) return null;
    const out: MyVehicleRow[] = [];
    for (const v of vehicles as DbVehicle[]) {
      const [{ data: photos }, { data: listing }] = await Promise.all([
        sb.from('vehicle_photos').select('*').eq('vehicle_id', v.id).order('sort_order'),
        sb.from('listings').select('*').eq('vehicle_id', v.id).maybeSingle(),
      ]);
      const l = (listing ?? null) as DbListing | null;
      let inquiriesCount = 0;
      if (l) {
        const { count } = await sb.from('inquiries').select('id', { count: 'exact', head: true }).eq('listing_id', l.id);
        inquiriesCount = count ?? 0;
      }
      const sorted = ((photos ?? []) as DbVehiclePhoto[]).sort((a, b) => a.sort_order - b.sort_order);
      out.push({ vehicle: v, coverUrl: sorted[0]?.public_url ?? null, listing: l, inquiriesCount });
    }
    myMem = { at: Date.now(), rows: out };
    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage.setItem('autofair-my-vehicles', JSON.stringify(myMem));
      } catch {
        /* storage unavailable */
      }
    }
    return out;
  } catch (err) {
    logDbError('vehicles.fetchMine', err);
    return null;
  }
}

export function invalidateMyVehiclesCache(): void {
  myMem = null;
  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.removeItem('autofair-my-vehicles');
    } catch {
      /* storage unavailable */
    }
  }
}

export async function deleteMyVehicle(vehicleId: string): Promise<void> {
  const sb = getBrowserClient('local') ?? getBrowserClient('session');
  if (!sb) {
    throw new DbOperationError('vehicles.delete', new Error('Supabase not configured'), {
      status: 503,
      code: 'UNAVAILABLE',
      userMessage: SAFE_MESSAGES.UNAVAILABLE,
      context: { vehicleId },
    });
  }
  const { error } = await sb.from('vehicles').delete().eq('id', vehicleId);
  if (error) {
    const classified = classifyDbError(error);
    throw new DbOperationError('vehicles.delete', error, {
      // Keep specific mappings (409/422/403/401/503); only generic 500s
      // get the contextual delete message. Both are safe for users.
      ...(classified.code === 'INTERNAL'
        ? { status: 500 as const, code: 'INTERNAL' as const, userMessage: SAFE_MESSAGES.DELETE_FAILED }
        : {}),
      context: { vehicleId },
    });
  }
  invalidateMyVehiclesCache();
  invalidateLiveCarsCache();
}

// Post-login routing (trusted role first, never frontend-supplied).
// ADMIN -> /admin, STAFF -> /staff, CUSTOMER -> sellers with vehicles go to
// /my-listings else /cars. Used by AuthForm (email) + auth callback (Google).
// Falls back to /my-listings on error so login never blocks (customer-safe;
// never grants staff/admin on failure).
export async function getPostLoginDestination(): Promise<'/admin' | '/staff' | '/my-listings' | '/cars'> {
  try {
    const sb = getBrowserClient('local') ?? getBrowserClient('session');
    if (!sb || typeof window === 'undefined') return '/my-listings';
    const { data: sessionData } = await sb.auth.getSession();
    const uid = sessionData.session?.user?.id;
    if (!uid) return '/my-listings';
    // fetchCurrentProfile reads profiles.role from the backend (source of
    // truth). Unknown/missing safely maps to CUSTOMER, never staff/admin.
    const profile = await fetchCurrentProfile().catch(() => null);
    if (profile?.role === 'ADMIN') return '/admin';
    if (profile?.role === 'STAFF') return '/staff';
    const { count, error } = await sb
      .from('vehicles')
      .select('id', { count: 'exact', head: true })
      .eq('seller_id', uid);
    if (error) {
      logDbError('vehicles.countMine', error);
      return '/my-listings';
    }
    return (count ?? 0) > 0 ? '/my-listings' : '/cars';
  } catch (err) {
    logDbError('vehicles.countMine', err);
    return '/my-listings';
  }
}

export async function fetchCarBySlugFromDb(slug: string): Promise<Car | null> {
  try {
    const sb = getServerClient();
    if (!sb) return null;
    const { data: listing, error } = await sb.from('listings').select('*').eq('slug', slug).maybeSingle();
    if (error) {
      logDbError('listings.fetchBySlug', error, { slug });
      return null;
    }
    if (!listing) return null;
    const l = listing as DbListing;
    const { data: vehicle, error: vErr } = await sb.from('vehicles').select('*').eq('id', l.vehicle_id).maybeSingle();
    if (vErr) {
      logDbError('vehicles.fetchById', vErr);
      return null;
    }
    if (!vehicle) return null;
    const v = vehicle as DbVehicle;
    const { data: photos } = await sb.from('vehicle_photos').select('*').eq('vehicle_id', v.id).order('sort_order');
    const { data: insp } = await sb.from('inspections').select('score').eq('vehicle_id', v.id).maybeSingle();
    return dbToCar(v, (photos as DbVehiclePhoto[]) ?? [], l, (insp as { score: number | null } | null)?.score ?? null);
  } catch (err) {
    logDbError('listings.fetchBySlug', err);
    return null;
  }
}

// ---- seller: create vehicle row, upload photos, link them (called from SellForm, browser) ----
export interface SellInput {
  reg: string;
  make: string;
  model: string;
  variant?: string;
  year: number;
  fuel: DbVehicle['fuel'];
  transmission: DbVehicle['transmission'];
  km: number;
  location: string;
  priceExpected?: number;
}

export async function createVehicleRow(
  input: SellInput
): Promise<{ vehicleId: string; inspectionId: string }> {
  const sb = getBrowserClient('local') ?? getBrowserClient('session');
  if (!sb) {
    throw new DbOperationError('vehicles.create', new Error('Supabase not configured'), {
      status: 503,
      code: 'UNAVAILABLE',
      userMessage: SAFE_MESSAGES.UNAVAILABLE,
    });
  }
  const { data: sessionData } = await sb.auth.getSession();
  const sellerId = sessionData.session?.user?.id ?? null;
  if (!sellerId) {
    throw new DbOperationError('vehicles.create', new Error('Missing session'), {
      status: 401,
      code: 'UNAUTHORIZED',
      userMessage: 'Please sign in to list your car. Go to Sign in, then submit again — your form is kept.',
    });
  }

  // Self-heal: you signed up before the migration ran, so no profiles row exists yet.
  // Upsert is safe under RLS (own id).
  const userEmail = sessionData.session?.user?.email ?? null;
  const { error: profErr } = await sb.from('profiles').upsert(
    { id: sellerId, full_name: userEmail ? userEmail.split('@')[0] : null },
    { onConflict: 'id' }
  );
  if (profErr) {
    const classified = classifyDbError(profErr);
    throw new DbOperationError('profiles.upsert', profErr, {
      ...(classified.code === 'INTERNAL'
        ? { status: 500 as const, code: 'INTERNAL' as const, userMessage: SAFE_MESSAGES.PROFILE_SETUP_FAILED }
        : {}),
      context: { year: input.year, fuel: input.fuel },
    });
  }

  const normMake = input.make.trim().replace(/\s+/g, ' ');
  const normMakeTitle = normMake.charAt(0).toUpperCase() + normMake.slice(1).toLowerCase();
  const normLocation = input.location.trim().replace(/\s+/g, ' ');

  const { data: vehicle, error: vErr } = await sb
    .from('vehicles')
    .insert({
      seller_id: sellerId,
      reg_number: input.reg.toUpperCase().trim(),
      make: normMakeTitle,
      model: input.model.trim().replace(/\s+/g, ' '),
      variant: (input.variant ?? '').trim(),
      year: input.year,
      fuel: input.fuel,
      transmission: input.transmission,
      km_driven: input.km,
      ownership: 'First owner',
      location: normLocation,
      price_expected: input.priceExpected ?? 0,
      status: 'submitted',
    })
    .select('id, inspection_id')
    .single();
  if (vErr || !vehicle) {
    const raw = vErr ?? new Error('Vehicle insert returned no row');
    const classified = classifyDbError(raw);
    throw new DbOperationError('vehicles.create', raw, {
      ...(classified.code === 'INTERNAL'
        ? { status: 500 as const, code: 'INTERNAL' as const, userMessage: SAFE_MESSAGES.VEHICLE_SAVE_FAILED }
        : {}),
      context: { year: input.year, fuel: input.fuel, transmission: input.transmission },
    });
  }
  return {
    vehicleId: (vehicle as { id: string }).id,
    inspectionId: (vehicle as { inspection_id: string }).inspection_id,
  };
}

export async function addVehiclePhotoRows(
  vehicleId: string,
  uploaded: { storagePath: string; publicUrl: string }[]
): Promise<void> {
  if (!uploaded.length) return;
  const sb = getBrowserClient('local') ?? getBrowserClient('session');
  if (!sb) {
    throw new DbOperationError('vehicle_photos.insert', new Error('Supabase not configured'), {
      status: 503,
      code: 'UNAVAILABLE',
      userMessage: SAFE_MESSAGES.UNAVAILABLE,
      context: { vehicleId, photoCount: uploaded.length },
    });
  }
  const rows = uploaded.map((u, i) => ({
    vehicle_id: vehicleId,
    storage_path: u.storagePath,
    public_url: u.publicUrl,
    sort_order: i,
    is_cover: i === 0,
  }));
  const { error: pErr } = await sb.from('vehicle_photos').insert(rows);
  if (pErr) {
    const classified = classifyDbError(pErr);
    throw new DbOperationError('vehicle_photos.insert', pErr, {
      ...(classified.code === 'INTERNAL'
        ? { status: 500 as const, code: 'INTERNAL' as const, userMessage: SAFE_MESSAGES.PHOTOS_SAVE_FAILED }
        : {}),
      context: { vehicleId, photoCount: uploaded.length },
    });
  }
}

// Backwards-compat: old helper that accepted pre-uploaded URLs
export async function createVehicleWithPhotos(
  input: SellInput,
  uploaded: { storagePath: string; publicUrl: string }[]
): Promise<{ vehicleId: string; inspectionId: string }> {
  const { vehicleId, inspectionId } = await createVehicleRow(input);
  await addVehiclePhotoRows(vehicleId, uploaded);
  return { vehicleId, inspectionId };
}
