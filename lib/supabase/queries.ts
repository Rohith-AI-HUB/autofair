import type { Car } from '@/types';
import type { DbInspection, DbInspectionItem, DbInspectionSection, DbListing, DbVehicle, DbVehiclePhoto } from '@/lib/supabase/db-types';
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
export interface ReportInput {
  ratings?: Record<string, number | null> | null;
  condition?: Record<string, string> | null;
  accidentStatus?: string | null;
  accidentNote?: string | null;
  docsStatus?: string | null;
  docsNote?: string | null;
  sections?: import('@/types').InspectionCategory[];
  isSample?: boolean;
  inspectedAt?: string | null;
  inspectorNote?: string | null;
}

function ratingToLabel(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return 'GOOD';
  if (n >= 9) return 'EXCELLENT';
  if (n >= 7.5) return 'VERY GOOD';
  if (n >= 6) return 'GOOD';
  if (n >= 4) return 'AVERAGE';
  return 'POOR';
}

function conditionLabel(
  key: 'mechanical' | 'exterior' | 'interior' | 'tyres',
  report?: ReportInput | null
): string {
  const raw = report?.condition?.[key];
  if (typeof raw === 'string' && raw.trim()) return raw.trim().toUpperCase().slice(0, 24);
  return ratingToLabel(report?.ratings?.[key]);
}

export function dbToCar(
  vehicle: DbVehicle,
  photos: DbVehiclePhoto[],
  listing?: DbListing | null,
  score?: number | null,
  report?: ReportInput | null
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
    condition: {
      mechanical: conditionLabel('mechanical', report),
      exterior: conditionLabel('exterior', report),
      interior: conditionLabel('interior', report),
      tyres: conditionLabel('tyres', report),
    },
    verification: {
      verified: true,
      inspection: 'FILE AVAILABLE',
      documents: (report?.docsStatus?.trim() || 'VERIFY ON CALL').toUpperCase().slice(0, 32),
      accidentHistory: (report?.accidentStatus?.trim() || 'ASK SELLER').toUpperCase().slice(0, 32),
    },
    sections: report?.sections,
    isSample: false,
    inspectedAt: report?.inspectedAt ?? null,
    inspectorNote: report?.inspectorNote ?? '',
    accidentNote: report?.accidentNote ?? '',
    docsNote: report?.docsNote ?? '',
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
    const seenLive = new Set<string>();
    for (const row of listings as unknown as (DbListing & {
      vehicle: DbVehicle & { vehicle_photos: DbVehiclePhoto[]; inspections: { score: number | null } | { score: number | null }[] | null };
    })[]) {
      const v = row.vehicle;
      if (!v) continue;
      // Dedupe by vehicle id: one LIVE listing per vehicle (unique constraint),
      // guard against stale/duplicate rows or slug collisions.
      if (seenLive.has(v.id)) continue;
      seenLive.add(v.id);
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

export interface InquiryRow {
  id: string;
  listing_id: string;
  buyer_contact: string;
  message: string;
  type: string;
  offered_price: number | null;
  status: string;
  created_at: string;
}

export async function fetchMyInquiries(listingId: string): Promise<InquiryRow[]> {
  const sb = getBrowserClient('local') ?? getBrowserClient('session');
  if (!sb) {
    throw new DbOperationError('inquiries.fetchMine', new Error('Supabase not configured'), {
      status: 503,
      code: 'UNAVAILABLE',
      userMessage: SAFE_MESSAGES.UNAVAILABLE,
      context: { listingId },
    });
  }
  const { data, error } = await sb
    .from('inquiries')
    .select('id, listing_id, buyer_contact, message, type, offered_price, status, created_at')
    .eq('listing_id', listingId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) {
    const classified = classifyDbError(error);
    throw new DbOperationError('inquiries.fetchMine', error, {
      ...(classified.code === 'INTERNAL'
        ? { status: 500 as const, code: 'INTERNAL' as const, userMessage: 'Could not load inquiries. Please try again later.' }
        : {}),
      context: { listingId },
    });
  }
  return (data ?? []) as InquiryRow[];
}

export interface UpdateVehiclePatch {
  price_expected?: number;
  km_driven?: number;
  location?: string;
  make?: string;
  model?: string;
  variant?: string;
  year?: number;
  fuel?: DbVehicle['fuel'];
  transmission?: DbVehicle['transmission'];
  reg_number?: string;
}

export async function fetchMyVehicleById(vehicleId: string): Promise<MyVehicleRow | null> {
  const sb = getBrowserClient('local') ?? getBrowserClient('session');
  if (!sb || typeof window === 'undefined') return null;
  try {
    const { data: sessionData } = await sb.auth.getSession();
    const uid = sessionData.session?.user?.id;
    if (!uid) return null;
    const { data: vehicle, error: vErr } = await sb.from('vehicles').select('*').eq('id', vehicleId).maybeSingle();
    if (vErr || !vehicle) {
      if (vErr) logDbError('vehicles.fetchOne', vErr, { vehicleId });
      return null;
    }
    const v = vehicle as DbVehicle;
    if (v.seller_id !== uid) return null;
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
    return { vehicle: v, coverUrl: sorted[0]?.public_url ?? null, listing: l, inquiriesCount };
  } catch (err) {
    logDbError('vehicles.fetchOne', err, { vehicleId });
    return null;
  }
}

export async function updateMyVehicle(vehicleId: string, patch: UpdateVehiclePatch): Promise<void> {
  const sb = getBrowserClient('local') ?? getBrowserClient('session');
  if (!sb) {
    throw new DbOperationError('vehicles.update', new Error('Supabase not configured'), {
      status: 503,
      code: 'UNAVAILABLE',
      userMessage: SAFE_MESSAGES.UNAVAILABLE,
      context: { vehicleId },
    });
  }
  // Only owner-editable columns. Status / assignment / inspection_id are never
  // customer-writable (backend trigger enforces verification transitions).
  const allowed: Record<string, unknown> = {};
  if (patch.price_expected !== undefined) {
    const n = Math.round(Number(patch.price_expected));
    if (!Number.isFinite(n) || n < 0) {
      throw new DbOperationError('vehicles.update', new Error('Invalid price'), {
        status: 422,
        code: 'VALIDATION',
        userMessage: 'Enter a valid expected price.',
        context: { vehicleId },
      });
    }
    allowed.price_expected = n;
  }
  if (patch.km_driven !== undefined) {
    const n = Math.round(Number(patch.km_driven));
    if (!Number.isFinite(n) || n < 0) {
      throw new DbOperationError('vehicles.update', new Error('Invalid km'), {
        status: 422,
        code: 'VALIDATION',
        userMessage: 'Enter valid kilometres.',
        context: { vehicleId },
      });
    }
    allowed.km_driven = n;
  }
  if (patch.location !== undefined) allowed.location = patch.location.trim().replace(/\s+/g, ' ');
  if (patch.make !== undefined) {
    const m = patch.make.trim().replace(/\s+/g, ' ');
    if (m) allowed.make = m.charAt(0).toUpperCase() + m.slice(1).toLowerCase();
  }
  if (patch.model !== undefined) {
    const m = patch.model.trim().replace(/\s+/g, ' ');
    if (m) allowed.model = m;
  }
  if (patch.variant !== undefined) allowed.variant = patch.variant.trim();
  if (patch.year !== undefined) {
    const y = Number(patch.year);
    if (!Number.isInteger(y) || y < 2005 || y > 2026) {
      throw new DbOperationError('vehicles.update', new Error('Invalid year'), {
        status: 422,
        code: 'VALIDATION',
        userMessage: 'Year must be 2005–2026.',
        context: { vehicleId },
      });
    }
    allowed.year = y;
  }
  if (patch.fuel !== undefined) allowed.fuel = patch.fuel;
  if (patch.transmission !== undefined) allowed.transmission = patch.transmission;
  if (patch.reg_number !== undefined) {
    const r = patch.reg_number.toUpperCase().trim().replace(/\s+/g, ' ');
    if (!r) {
      throw new DbOperationError('vehicles.update', new Error('Invalid reg'), {
        status: 422,
        code: 'VALIDATION',
        userMessage: 'Registration number is required.',
        context: { vehicleId },
      });
    }
    allowed.reg_number = r;
  }
  if (Object.keys(allowed).length === 0) return;

  const { error } = await sb.from('vehicles').update(allowed).eq('id', vehicleId);
  if (error) {
    const classified = classifyDbError(error);
    throw new DbOperationError('vehicles.update', error, {
      ...(classified.code === 'INTERNAL'
        ? { status: 500 as const, code: 'INTERNAL' as const, userMessage: 'Could not save changes. Please try again later.' }
        : {}),
      context: { vehicleId },
    });
  }
  // Keep public price in sync when the owner edits expectation. Listing update
  // is best-effort: vehicle row is source of truth for drafts.
  if (allowed.price_expected !== undefined) {
    try {
      await sb.from('listings').update({ price: allowed.price_expected }).eq('vehicle_id', vehicleId);
    } catch (err) {
      logDbError('listings.syncPrice', err, { vehicleId });
    }
  }
  invalidateMyVehiclesCache();
  invalidateLiveCarsCache();
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
    const seen = new Set<string>();
    for (const v of vehicles as DbVehicle[]) {
      // Dedupe guard: same vehicle id must appear once even if the API
      // returns duplicates or cache layers merge.
      if (seen.has(v.id)) continue;
      seen.add(v.id);
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
  // Best-effort storage cleanup first: DB rows cascade, storage.objects do not.
  // Allowed by photos_bucket_vehicle_delete (owner of vehicle). Failures are
  // logged but do not block the row delete.
  try {
    const { data: photos } = await sb.from('vehicle_photos').select('storage_path').eq('vehicle_id', vehicleId);
    const paths = ((photos ?? []) as { storage_path: string }[])
      .map((p) => p.storage_path)
      .filter(Boolean);
    if (paths.length) {
      const { error: storageErr } = await sb.storage.from('vehicle-photos').remove(paths);
      if (storageErr) logDbError('storage.deleteVehiclePhotos', storageErr, { vehicleId });
    }
  } catch (err) {
    logDbError('storage.deleteVehiclePhotos', err, { vehicleId });
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

export type ListingAvailabilityAction = 'sold' | 'pause' | 'resume';

// Mirrors the guard messages the 0017 RPC raises as P0001. Kept here so the
// user sees why a transition was refused instead of a generic failure.
const AVAILABILITY_CONFLICT: Record<ListingAvailabilityAction, string> = {
  sold: 'Only a live or paused file can be marked as sold.',
  pause: 'Only a live file can be paused.',
  resume: 'Only a paused or sold file can be relisted.',
};

const AVAILABILITY_FAILED: Record<ListingAvailabilityAction, string> = {
  sold: 'Could not mark this file as sold. Please try again.',
  pause: 'Could not pause this file. Please try again.',
  resume: 'Could not relist this file. Please try again.',
};

/**
 * Seller-side availability change. The three row writes (vehicle, listing,
 * buyer requests) happen atomically inside set_listing_availability, because a
 * partial failure would leave a car publicly visible while staff treat it as
 * done. Deliberately separate from updateMyVehicle, which must never accept a
 * status field from the client.
 */
export async function setMyListingAvailability(
  vehicleId: string,
  action: ListingAvailabilityAction
): Promise<void> {
  const sb = getBrowserClient('local') ?? getBrowserClient('session');
  if (!sb) {
    throw new DbOperationError('listings.setAvailability', new Error('Supabase not configured'), {
      status: 503,
      code: 'UNAVAILABLE',
      userMessage: SAFE_MESSAGES.UNAVAILABLE,
      context: { vehicleId, action },
    });
  }
  const { error } = await sb.rpc('set_listing_availability', {
    p_vehicle_id: vehicleId,
    p_action: action,
  });
  if (error) {
    const classified = classifyDbError(error);
    const rawCode = (error as { code?: unknown }).code;
    throw new DbOperationError('listings.setAvailability', error, {
      // 42501 (not the owner) and 401 are already mapped by classifyDbError;
      // P0001 is the RPC's own transition guard, which would otherwise read
      // as a generic 500.
      ...(rawCode === 'P0001'
        ? { status: 422 as const, code: 'VALIDATION' as const, userMessage: AVAILABILITY_CONFLICT[action] }
        : classified.code === 'INTERNAL'
          ? { status: 500 as const, code: 'INTERNAL' as const, userMessage: AVAILABILITY_FAILED[action] }
          : {}),
      context: { vehicleId, action },
    });
  }
  invalidateMyVehiclesCache();
  invalidateLiveCarsCache();
}

// Post-login routing (trusted role first, never frontend-supplied).
// ADMIN -> /admin, STAFF -> /staff, CUSTOMER -> /. Used by AuthForm (email)
// and auth callback (Google). The role is read from profiles, never storage.
export async function getPostLoginDestination(): Promise<'/' | '/admin' | '/staff'> {
  try {
    // fetchCurrentProfile reads profiles.role from the backend. A missing or
    // invalid profile is not promoted to any internal role.
    const profile = await fetchCurrentProfile().catch(() => null);
    if (profile?.role === 'ADMIN') return '/admin';
    if (profile?.role === 'STAFF') return '/staff';
    return '/';
  } catch (err) {
    logDbError('vehicles.countMine', err);
    return '/';
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
    // Verified Trust Report: full inspection row + breakdown. Anon server client
    // can read these for verified/published vehicles (public RLS).
    let report: ReportInput = { isSample: false };
    let scoreNum: number | null = null;
    try {
      const { data: insp } = await sb.from('inspections').select('*').eq('vehicle_id', v.id).maybeSingle();
      const ins = insp as DbInspection | null;
      if (ins) {
        scoreNum = typeof ins.score === 'number' ? ins.score : null;
        const { data: sections } = await sb.from('inspection_sections').select('*').eq('inspection_id', ins.id);
        const secs = ((sections ?? []) as DbInspectionSection[]).sort((a, b) =>
          a.title.localeCompare(b.title)
        );
        let categories: import('@/types').InspectionCategory[] | undefined;
        if (secs.length) {
          const ids = secs.map((s) => s.id);
          const { data: items } = await sb.from('inspection_items').select('*').in('section_id', ids);
          const grouped = new Map<string, DbInspectionItem[]>();
          for (const it of (items ?? []) as DbInspectionItem[]) {
            const arr = grouped.get(it.section_id) ?? [];
            arr.push(it);
            grouped.set(it.section_id, arr);
          }
          categories = secs.map((s, i) => {
            const list = (grouped.get(s.id) ?? []).map((it) => ({
              name: it.name,
              result: it.result,
              note: it.note,
            }));
            const passed = list.filter((x) => x.result === 'pass').length;
            return {
              id: `sec-${i}-${s.id.slice(0, 6)}`,
              title: s.title,
              passed,
              total: list.length || s.total || 0,
              items: list,
            };
          });
        }
        const hasBreakdown = Boolean(categories?.length && categories.some((c) => c.items.length));
        report = {
          ratings: (ins.ratings ?? null) as Record<string, number | null> | null,
          condition: (ins as { condition?: Record<string, string> | null }).condition ?? null,
          accidentStatus: (ins as { accident_status?: string | null }).accident_status ?? null,
          accidentNote: (ins as { accident_note?: string | null }).accident_note ?? '',
          docsStatus: (ins as { docs_status?: string | null }).docs_status ?? null,
          docsNote: (ins as { docs_note?: string | null }).docs_note ?? '',
          sections: hasBreakdown ? categories : undefined,
          isSample: false,
          inspectedAt: ins.inspected_at,
          inspectorNote: ins.notes ?? '',
        };
      }
    } catch (err) {
      logDbError('inspections.fetchReport', err, { vehicleId: v.id });
    }
    return dbToCar(v, (photos as DbVehiclePhoto[]) ?? [], l, scoreNum, report);
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
): Promise<{ vehicleId: string; inspectionId: string; autoAssigned: boolean }> {
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

  // Profiles are created by the trusted Auth trigger (handle_new_user).
  // If the trigger never ran for this user (signed up before migrations,
  // trigger broken by out-of-order migrations), self-heal by inserting the
  // caller's own row — allowed by profiles_insert_own (auth.uid() = id).
  // Only id is inserted; role defaults apply, operational fields untouched.
  const { data: profile, error: profErr } = await sb.from('profiles').select('id').eq('id', sellerId).maybeSingle();
  if (profErr || !profile) {
    const classified = classifyDbError(profErr ?? new Error('Profile missing'));
    // Verified RLS denial: surface it, don't mask as setup failure.
    if (profErr && classified.code === 'FORBIDDEN') {
      throw new DbOperationError('profiles.fetchForVehicle', profErr, {
        context: { year: input.year, fuel: input.fuel },
      });
    }
    if (!profErr && !profile) {
      const { error: selfHealErr } = await sb.from('profiles').insert({ id: sellerId });
      if (!selfHealErr) {
        const { data: retry, error: retryErr } = await sb.from('profiles').select('id').eq('id', sellerId).maybeSingle();
        if (!retryErr && retry) {
          // Self-heal succeeded — fall through to vehicle insert.
        } else {
          const cause = retryErr ?? new Error('Profile missing after self-heal');
          throw new DbOperationError('profiles.fetchForVehicle', cause, {
            status: 500 as const,
            code: 'INTERNAL' as const,
            userMessage: SAFE_MESSAGES.PROFILE_SETUP_FAILED,
            context: { year: input.year, fuel: input.fuel },
          });
        }
      } else {
        const cause = selfHealErr;
        const healClassified = classifyDbError(cause);
        throw new DbOperationError('profiles.fetchForVehicle', cause, {
          ...(healClassified.code === 'INTERNAL'
            ? { status: 500 as const, code: 'INTERNAL' as const, userMessage: SAFE_MESSAGES.PROFILE_SETUP_FAILED }
            : {}),
          context: { year: input.year, fuel: input.fuel },
        });
      }
    } else {
      const cause = profErr ?? new Error('Profile missing');
      throw new DbOperationError('profiles.fetchForVehicle', cause, {
        ...(classified.code === 'INTERNAL'
          ? { status: 500 as const, code: 'INTERNAL' as const, userMessage: SAFE_MESSAGES.PROFILE_SETUP_FAILED }
          : {}),
        context: { year: input.year, fuel: input.fuel },
      });
    }
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
  const vehicleId = (vehicle as { id: string }).id;
  let autoAssigned = false;
  try {
    // The protected server endpoint supplies the fallback for deployments
    // where the DB insert trigger has not yet been applied. It verifies the
    // customer owns this vehicle before running the atomic assignment logic.
    const assignment = await fetch('/api/inspections/assign', {
      method: 'POST',
      headers: { Authorization: `Bearer ${sessionData.session?.access_token ?? ''}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ vehicleId }),
    });
    const payload = (await assignment.json().catch(() => null)) as { data?: { assigned?: boolean } } | null;
    autoAssigned = Boolean(assignment.ok && payload?.data?.assigned);
  } catch {
    // Submission succeeds even if no staff is active or an assignment retry is
    // required. The admin-only bulk action remains a safe recovery path.
  }
  return { vehicleId, inspectionId: (vehicle as { inspection_id: string }).inspection_id, autoAssigned };
}

/**
 * Recovery lookup for the phantom-failure loop: the vehicle row was created
 * but a later stage (photo upload / photo rows) failed, so a retry hits the
 * reg_number unique constraint. Returns the caller's own row so the UI can
 * resume instead of showing "already exists".
 */
export async function fetchMyVehicleByReg(reg: string): Promise<{ vehicleId: string; inspectionId: string } | null> {
  const sb = getBrowserClient('local') ?? getBrowserClient('session');
  if (!sb || typeof window === 'undefined') return null;
  try {
    const { data: sessionData } = await sb.auth.getSession();
    const uid = sessionData.session?.user?.id;
    if (!uid) return null;
    const { data, error } = await sb
      .from('vehicles')
      .select('id, inspection_id')
      .eq('reg_number', reg.toUpperCase().trim())
      .eq('seller_id', uid)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as { id: string; inspection_id: string };
    if (!row?.id) return null;
    return { vehicleId: row.id, inspectionId: row.inspection_id };
  } catch (err) {
    logDbError('vehicles.fetchMineByReg', err);
    return null;
  }
}

export async function addVehiclePhotoRows(  vehicleId: string,
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

// Edit-dialog photo pipeline: owner can view / append / remove photos.
// Display order is sort_order (cover = smallest). Uses only INSERT + DELETE
// (no UPDATE) so existing owner RLS policies apply.
export async function fetchVehiclePhotos(vehicleId: string): Promise<DbVehiclePhoto[]> {
  const sb = getBrowserClient('local') ?? getBrowserClient('session');
  if (!sb || typeof window === 'undefined') return [];
  try {
    const { data, error } = await sb
      .from('vehicle_photos')
      .select('*')
      .eq('vehicle_id', vehicleId)
      .order('sort_order');
    if (error) {
      logDbError('vehicle_photos.fetchMine', error, { vehicleId });
      return [];
    }
    return ((data ?? []) as DbVehiclePhoto[]).sort((a, b) => a.sort_order - b.sort_order);
  } catch (err) {
    logDbError('vehicle_photos.fetchMine', err, { vehicleId });
    return [];
  }
}

export async function appendVehiclePhotoRows(
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
  // Offset after existing photos so cover (sort_order 0) is preserved.
  let base = 0;
  let hasExisting = false;
  try {
    const { data } = await sb
      .from('vehicle_photos')
      .select('sort_order')
      .eq('vehicle_id', vehicleId)
      .order('sort_order', { ascending: false })
      .limit(1);
    const top = (data ?? []) as { sort_order: number }[];
    if (top.length) {
      hasExisting = true;
      base = (top[0]?.sort_order ?? -1) + 1;
    }
  } catch {
    /* fall through with base 0 */
  }
  const rows = uploaded.map((u, i) => ({
    vehicle_id: vehicleId,
    storage_path: u.storagePath,
    public_url: u.publicUrl,
    sort_order: base + i,
    is_cover: !hasExisting && i === 0,
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
  invalidateMyVehiclesCache();
  invalidateLiveCarsCache();
}

export async function deleteVehiclePhotoRows(
  vehicleId: string,
  photos: { id: string; storage_path: string }[]
): Promise<void> {
  if (!photos.length) return;
  const sb = getBrowserClient('local') ?? getBrowserClient('session');
  if (!sb) {
    throw new DbOperationError('vehicle_photos.delete', new Error('Supabase not configured'), {
      status: 503,
      code: 'UNAVAILABLE',
      userMessage: SAFE_MESSAGES.UNAVAILABLE,
      context: { vehicleId, photoCount: photos.length },
    });
  }
  // Storage cleanup first (best-effort), then DB rows (RLS photos_owner_delete).
  try {
    const paths = photos.map((p) => p.storage_path).filter(Boolean);
    if (paths.length) {
      const { error: storageErr } = await sb.storage.from('vehicle-photos').remove(paths);
      if (storageErr) logDbError('storage.deleteVehiclePhotos', storageErr, { vehicleId });
    }
  } catch (err) {
    logDbError('storage.deleteVehiclePhotos', err, { vehicleId });
  }
  const { error } = await sb
    .from('vehicle_photos')
    .delete()
    .eq('vehicle_id', vehicleId)
    .in('id', photos.map((p) => p.id));
  if (error) {
    const classified = classifyDbError(error);
    throw new DbOperationError('vehicle_photos.delete', error, {
      ...(classified.code === 'INTERNAL'
        ? { status: 500 as const, code: 'INTERNAL' as const, userMessage: 'Could not remove photos. Please try again later.' }
        : {}),
      context: { vehicleId, photoCount: photos.length },
    });
  }
  invalidateMyVehiclesCache();
  invalidateLiveCarsCache();
}
