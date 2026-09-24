'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Container } from '@/components/shared/Container';
import { listings as seed, type Listing, type ListingStatus } from '@/lib/data/listings';
import { getSessionFromAnyStore, isSupabaseConfigured } from '@/lib/supabase/client';
import {
  fetchMyVehicles,
  deleteMyVehicle,
  fetchMyInquiries,
  updateMyVehicle,
  fetchVehiclePhotos,
  deleteVehiclePhotoRows,
  appendVehiclePhotoRows,
  setMyListingAvailability,
  type InquiryRow,
  type ListingAvailabilityAction,
  type MyVehicleRow,
} from '@/lib/supabase/queries';
import type { DbVehiclePhoto } from '@/lib/supabase/db-types';
import { uploadVehiclePhotos } from '@/lib/supabase/storage';
import { getSafeErrorMessage } from '@/lib/errors/db-error';
import { openAuthModal } from '@/lib/auth/modal';
import { cn } from '@/lib/utils';

function formatLakh(n: number): string {
  return `₹${(n / 100000).toFixed(2)} Lakh`;
}

function mapRow(r: MyVehicleRow): Listing {
  const v = r.vehicle;
  const l = r.listing;
  // listings.status owns SOLD / PAUSED / LIVE, vehicles.status owns the
  // pre-listing review states. Listing is checked first so each state has
  // exactly one authority.
  const status: ListingStatus =
    l?.status === 'SOLD'
      ? 'SOLD'
      : l?.status === 'PAUSED'
        ? 'PAUSED'
        : l?.status === 'LIVE'
          ? 'LIVE'
          : v.status === 'draft'
            ? 'DRAFT'
            : v.status === 'submitted' || v.status === 'in_review' || v.status === 'verified' || l?.status === 'IN_REVIEW'
              ? 'IN REVIEW'
              : 'DRAFT';
  const title = `${v.year} ${v.make} ${v.model}${v.variant ? ` ${v.variant}` : ''}`;
  const priceNum = l?.price ?? v.price_expected;
  const price = formatLakh(priceNum);
  const viewsNum = l?.views_count ?? 0;
  const createdAt = v.created_at ? new Date(v.created_at).getTime() || 0 : 0;
  const publishedAt = l?.published_at ? new Date(l.published_at).getTime() || null : null;
  return {
    id: v.id,
    slug: l?.slug ?? v.id,
    title,
    price,
    priceNum,
    createdAt,
    publishedAt,
    priceLabel:
      status === 'LIVE'
        ? `VIEW INQUIRIES (${r.inquiriesCount}) →`
        : status === 'IN REVIEW'
          ? 'WHAT HAPPENS NEXT?'
          : status === 'SOLD'
            ? 'SOLD — HIDDEN FROM BUYERS'
            : status === 'PAUSED'
              ? 'PAUSED — HIDDEN FROM BUYERS'
              : 'EXPECTED PRICE',
    spec: `${v.year}  •  ${v.fuel.toUpperCase()}  •  ${Math.round(v.km_driven / 1000)}K KM  •  ${v.reg_number}`,
    inspectionId: v.inspection_id,
    status,
    meta:
      status === 'LIVE'
        ? `✓ Verified  •  ${viewsNum} views  •  ${r.inquiriesCount} inquiries`
        : status === 'SOLD'
          ? `○ Sold  •  ${viewsNum} views  •  ${r.inquiriesCount} inquiries`
          : status === 'PAUSED'
            ? `◷ Paused  •  ${viewsNum} views`
            : status === 'IN REVIEW'
              ? `◷ Pending Verification  •  ${v.inspection_id}`
              : `○ Draft  •  ${v.inspection_id}`,
    metaTone: status === 'LIVE' ? 'teal' : 'muted',
    views: `${viewsNum} views`,
    viewsNum,
    inquiries: r.inquiriesCount,
    image: r.coverUrl ?? '/icon.svg',
    primaryAction:
      status === 'LIVE'
        ? 'Open file →'
        : status === 'IN REVIEW'
          ? 'Preview →'
          : status === 'SOLD' || status === 'PAUSED'
            ? 'Relist →'
            : 'Resume draft →',
    // A sold file is an ended file, so it becomes deletable; a live one stays
    // staff-controlled (0017).
    secondaryAction: status === 'DRAFT' || status === 'SOLD' ? 'Delete' : 'Edit',
    inquiriesSample: [],
  };
}

function dedupeListings(list: Listing[]): Listing[] {
  const seen = new Set<string>();
  return list.filter((c) => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });
}

type Filter = 'ALL' | ListingStatus;
type SortKey = 'newest' | 'price-asc' | 'price-desc' | 'views-desc';

const FILTERS: { key: Filter; label: (n: number) => string }[] = [
  { key: 'ALL', label: (n) => `All · ${n}` },
  { key: 'LIVE', label: (n) => `Live · ${n}` },
  { key: 'IN REVIEW', label: (n) => `In review · ${n}` },
  { key: 'PAUSED', label: (n) => `Paused · ${n}` },
  { key: 'SOLD', label: (n) => `Sold · ${n}` },
  { key: 'DRAFT', label: (n) => `Draft · ${n}` },
];

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'newest', label: 'Newest ↓' },
  { key: 'price-asc', label: 'Price: low → high' },
  { key: 'price-desc', label: 'Price: high → low' },
  { key: 'views-desc', label: 'Most viewed' },
];

function formatCompact(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n);
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

function StatusPill({ status }: { status: ListingStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-[10px] py-[5px] font-mono text-[10px] font-bold tracking-[0.04em]',
        status === 'LIVE' && 'bg-teal text-white',
        status === 'IN REVIEW' && 'bg-amber text-navy',
        status === 'SOLD' && 'bg-navy text-white',
        status === 'PAUSED' && 'border border-line bg-off-white text-muted',
        status === 'DRAFT' && 'border border-line bg-white text-muted'
      )}
    >
      {status}
    </span>
  );
}

export function MyListingsExperience() {
  const [auth, setAuth] = useState<'loading' | 'authed' | 'guest'>('loading');
  const [email, setEmail] = useState('');
  const [rows, setRows] = useState<Listing[]>([]);
  const [rawMap, setRawMap] = useState<Record<string, MyVehicleRow>>({});
  const [loadingRows, setLoadingRows] = useState(true);
  const [usingSample, setUsingSample] = useState(false);
  const [filter, setFilter] = useState<Filter>('ALL');
  const [sort, setSort] = useState<SortKey>('newest');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [openInquiries, setOpenInquiries] = useState<string | null>(null);
  const [inquiriesById, setInquiriesById] = useState<Record<string, InquiryRow[]>>({});
  const [inqLoading, setInqLoading] = useState<string | null>(null);
  const [inqError, setInqError] = useState<Record<string, string>>({});
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [availError, setAvailError] = useState<string | null>(null);
  const [availBusy, setAvailBusy] = useState<string | null>(null);
  const [confirmSold, setConfirmSold] = useState<string | null>(null);
  const [showNextFor, setShowNextFor] = useState<string | null>(null);
  const [previewFor, setPreviewFor] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editReg, setEditReg] = useState('');
  const [editMake, setEditMake] = useState('');
  const [editModel, setEditModel] = useState('');
  const [editYear, setEditYear] = useState('');
  const [editFuel, setEditFuel] = useState('');
  const [editTransmission, setEditTransmission] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editKm, setEditKm] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editPhotos, setEditPhotos] = useState<DbVehiclePhoto[]>([]);
  const [editPhotosLoading, setEditPhotosLoading] = useState(false);
  const [editDeleteIds, setEditDeleteIds] = useState<string[]>([]);
  const [editNewFiles, setEditNewFiles] = useState<{ id: string; url: string; file: File }[]>([]);
  const [editPhotoError, setEditPhotoError] = useState<string | null>(null);
  const editFileRef = useRef<HTMLInputElement>(null);
  const editPhotoSeq = useRef(0);

const FUEL_OPTIONS = ['Petrol', 'Diesel', 'CNG', 'Electric', 'Hybrid'];
const TRANSMISSION_OPTIONS = ['Manual', 'Automatic', 'AMT', 'CVT'];

  useEffect(() => {
    getSessionFromAnyStore().then(({ session }) => {
      if (session?.user?.email) {
        setAuth('authed');
        setEmail(session.user.email);
        // Real garage: own vehicles only. Never show seed demo to signed-in users.
        if (!isSupabaseConfigured()) {
          setRows(dedupeListings(seed));
          setUsingSample(true);
          setLoadingRows(false);
          return;
        }
        fetchMyVehicles().then((mine) => {
          if (mine && mine.length) {
            const map: Record<string, MyVehicleRow> = {};
            for (const r of mine) map[r.vehicle.id] = r;
            setRawMap(map);
            setRows(dedupeListings(mine.map(mapRow)));
            setUsingSample(false);
          } else if (mine) {
            setRows([]);
            setRawMap({});
            setUsingSample(false);
          } else {
            setRows(dedupeListings(seed));
            setUsingSample(true);
          }
          setLoadingRows(false);
        });
      } else {
        setAuth('guest');
        setLoadingRows(false);
      }
    });
  }, []);

  const counts = useMemo(() => {
    const live = rows.filter((r) => r.status === 'LIVE').length;
    const review = rows.filter((r) => r.status === 'IN REVIEW').length;
    const inquiries = rows.reduce((s, r) => s + r.inquiries, 0);
    const views = rows.reduce((s, r) => s + r.viewsNum, 0);
    return { total: rows.length, live, review, inquiries, views };
  }, [rows]);

  const visible = useMemo(() => {
    const filtered = rows.filter((r) => filter === 'ALL' || r.status === filter);
    const deduped = dedupeListings(filtered);
    const sorted = [...deduped];
    switch (sort) {
      case 'price-asc':
        sorted.sort((a, b) => a.priceNum - b.priceNum);
        break;
      case 'price-desc':
        sorted.sort((a, b) => b.priceNum - a.priceNum);
        break;
      case 'views-desc':
        sorted.sort((a, b) => b.viewsNum - a.viewsNum);
        break;
      default:
        sorted.sort((a, b) => b.createdAt - a.createdAt);
        break;
    }
    return sorted;
  }, [rows, filter, sort]);

  function remove(id: string) {
    const target = rows.find((r) => r.id === id);
    setDeleteError(null);
    // Optimistic removal; restore + show a safe message if the DB delete fails.
    // DbOperationError already logs the raw error server-side via logDbError.
    if (target && !usingSample) {
      setRows((rs) => rs.filter((r) => r.id !== id));
      setRawMap((m) => {
        const next = { ...m };
        delete next[id];
        return next;
      });
      setConfirmDelete(null);
      deleteMyVehicle(id).catch((err: unknown) => {
        setRows((rs) => (rs.some((r) => r.id === id) ? rs : [...rs, target]));
        setRawMap((m) => ({ ...m }));
        setDeleteError(getSafeErrorMessage(err, 'Could not delete this vehicle. If this keeps happening, run migration 0010_my_listings_delete.sql in Supabase SQL Editor, then try again.'));
      });
      return;
    }
    setRows((rs) => rs.filter((r) => r.id !== id));
    setConfirmDelete(null);
  }

  /**
   * Sold / pause / relist. The row is re-derived through mapRow from the
   * updated rawMap entry rather than patched directly, so card labels can
   * never drift from what the fetch path would have rendered.
   */
  function applyAvailability(id: string, action: ListingAvailabilityAction) {
    const cur = rawMap[id];
    setAvailError(null);
    setConfirmSold(null);
    if (!cur) return;
    setAvailBusy(id);
    setMyListingAvailability(id, action)
      .then(() => {
        const next: MyVehicleRow = {
          ...cur,
          vehicle:
            action === 'sold'
              ? { ...cur.vehicle, status: 'sold' as const }
              : action === 'resume' && cur.vehicle.status === 'sold'
                ? { ...cur.vehicle, status: 'published' as const }
                : cur.vehicle,
          listing: cur.listing
            ? {
                ...cur.listing,
                status:
                  action === 'sold'
                    ? ('SOLD' as const)
                    : action === 'pause'
                      ? ('PAUSED' as const)
                      : ('LIVE' as const),
              }
            : cur.listing,
        };
        setRawMap((m) => ({ ...m, [id]: next }));
        setRows((rs) => rs.map((r) => (r.id === id ? mapRow(next) : r)));
        if (action === 'sold' && cur.listing?.id) {
          // The RPC closes outstanding buyer requests, so any cached list for
          // this file is now stale.
          const lid = cur.listing.id;
          setInquiriesById((m) => {
            const nextMap = { ...m };
            delete nextMap[lid];
            return nextMap;
          });
        }
      })
      .catch((err: unknown) => {
        setAvailError(getSafeErrorMessage(err, 'Could not update this file. Please try again.'));
      })
      .finally(() => setAvailBusy(null));
  }

  async function loadInquiries(car: Listing) {
    const raw = rawMap[car.id];
    const listingId = raw?.listing?.id;
    if (!listingId) return;
    if (inquiriesById[listingId]) return;
    setInqLoading(car.id);
    setInqError((e) => {
      const next = { ...e };
      delete next[car.id];
      return next;
    });
    try {
      const items = await fetchMyInquiries(listingId);
      setInquiriesById((m) => ({ ...m, [listingId]: items }));
      // Sync count if drifted from head-count.
      if (items.length !== car.inquiries) {
        setRows((rs) =>
          rs.map((r) =>
            r.id === car.id
              ? {
                  ...r,
                  inquiries: items.length,
                  priceLabel: r.status === 'LIVE' ? `VIEW INQUIRIES (${items.length}) →` : r.priceLabel,
                  meta: r.status === 'LIVE' ? `✓ Verified  •  ${r.viewsNum} views  •  ${items.length} inquiries` : r.meta,
                }
              : r
          )
        );
      }
    } catch (err) {
      setInqError((e) => ({ ...e, [car.id]: getSafeErrorMessage(err, 'Could not load inquiries. Please try again later.') }));
    } finally {
      setInqLoading(null);
    }
  }

  function toggleInquiries(car: Listing) {
    const next = openInquiries === car.id ? null : car.id;
    setOpenInquiries(next);
    if (next) void loadInquiries(car);
  }

  function closeEdit() {
    for (const p of editNewFiles) {
      try { URL.revokeObjectURL(p.url); } catch { /* noop */ }
    }
    setEditNewFiles([]);
    setEditDeleteIds([]);
    setEditPhotos([]);
    setEditPhotoError(null);
    setEditingId(null);
  }

  function addEditFiles(list: FileList | null) {
    if (!list) return;
    setEditPhotoError(null);
    const MAX_PHOTOS = 10;
    const MAX_MB = 5;
    const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];
    const remaining = editPhotos.filter((p) => !editDeleteIds.includes(p.id)).length + editNewFiles.length;
    const room = MAX_PHOTOS - remaining;
    if (room <= 0) {
      setEditPhotoError(`Maximum ${MAX_PHOTOS} photos. Remove one to add another.`);
      return;
    }
    const problems: string[] = [];
    const accepted: { id: string; url: string; file: File }[] = [];
    for (const file of Array.from(list)) {
      if (!ACCEPTED.includes(file.type)) {
        problems.push(`${file.name}: only JPG / PNG / WebP.`);
        continue;
      }
      if (file.size > MAX_MB * 1024 * 1024) {
        problems.push(`${file.name}: over ${MAX_MB}MB.`);
        continue;
      }
      accepted.push({ id: `edit-${++editPhotoSeq.current}`, url: URL.createObjectURL(file), name: file.name, file } as unknown as { id: string; url: string; file: File });
    }
    const take = accepted.slice(0, room);
    if (accepted.length > room) problems.push(`Maximum ${MAX_PHOTOS} photos — extras skipped.`);
    if (problems.length) setEditPhotoError(problems.join(' '));
    if (take.length) setEditNewFiles((ps) => [...ps, ...take]);
    else {
      for (const t of accepted) {
        try { URL.revokeObjectURL(t.url); } catch { /* noop */ }
      }
    }
  }

  function removeNewEditPhoto(id: string) {
    setEditNewFiles((ps) => {
      const target = ps.find((p) => p.id === id);
      if (target) {
        try { URL.revokeObjectURL(target.url); } catch { /* noop */ }
      }
      return ps.filter((p) => p.id !== id);
    });
  }

  function toggleDeleteExisting(id: string) {
    setEditDeleteIds((ds) => (ds.includes(id) ? ds.filter((d) => d !== id) : [...ds, id]));
  }

  function openEdit(car: Listing) {
    const raw = rawMap[car.id];
    setEditError(null);
    setEditingId(car.id);
    if (raw) {
      const v = raw.vehicle;
      setEditReg(v.reg_number ?? '');
      setEditMake(v.make ?? '');
      setEditModel(v.model ?? '');
      setEditYear(v.year ? String(v.year) : '');
      setEditFuel(v.fuel ?? '');
      setEditTransmission(v.transmission ?? '');
      setEditPrice(String(v.price_expected || raw.listing?.price || car.priceNum || ''));
      setEditKm(String(v.km_driven ?? ''));
      setEditLocation(v.location ?? '');
    } else {
      // Fallback: best-effort parse from title + spec so all 9 fields are editable.
      const titleParts = car.title.trim().split(/\s+/);
      const yearGuess = /^(19|20)\d{2}$/.test(titleParts[0] ?? '') ? titleParts[0] : '';
      const makeGuess = yearGuess ? (titleParts[1] ?? '') : '';
      const modelGuess = yearGuess ? titleParts.slice(2).join(' ') : car.title;
      const specParts = car.spec.split('•').map((s) => s.trim());
      const fuelGuessRaw = specParts[1] ?? '';
      const fuelGuess = fuelGuessRaw
        ? fuelGuessRaw.charAt(0).toUpperCase() + fuelGuessRaw.slice(1).toLowerCase()
        : '';
      const kmGuessRaw = specParts[2] ?? '';
      const kmMatch = kmGuessRaw.match(/([\d,.]+)\s*K/i);
      const kmGuess = kmMatch ? String(Math.round(Number(kmMatch[1].replace(/,/g, '')) * 1000)) : '';
      const regGuessRaw = specParts[3] ?? '';
      const regGuess = regGuessRaw && !/DOCS PENDING/i.test(regGuessRaw) ? regGuessRaw : '';
      setEditReg(regGuess);
      setEditMake(makeGuess);
      setEditModel(modelGuess);
      setEditYear(yearGuess);
      setEditFuel(FUEL_OPTIONS.includes(fuelGuess) ? fuelGuess : '');
      setEditTransmission('');
      setEditPrice(String(car.priceNum || ''));
      setEditKm(kmGuess);
      setEditLocation('');
    }
    // Photos: reset pending state, then load existing DB photos (cover = sort_order 0).
    for (const p of editNewFiles) {
      try { URL.revokeObjectURL(p.url); } catch { /* noop */ }
    }
    setEditNewFiles([]);
    setEditDeleteIds([]);
    setEditPhotoError(null);
    setEditPhotos([]);
    if (raw && !usingSample) {
      setEditPhotosLoading(true);
      fetchVehiclePhotos(car.id).then((photos) => {
        setEditPhotos(photos);
        setEditPhotosLoading(false);
      });
    } else {
      setEditPhotosLoading(false);
    }
  }

  async function saveEdit() {
    if (!editingId) return;
    const reg = editReg.trim().toUpperCase();
    const make = editMake.trim();
    const model = editModel.trim();
    const yearStr = editYear.trim();
    const fuel = editFuel.trim();
    const transmission = editTransmission.trim();
    const price = Number(String(editPrice).replace(/,/g, '').trim());
    const km = Number(String(editKm).replace(/,/g, '').trim());
    const location = editLocation.trim().replace(/\s+/g, ' ');
    if (!reg) {
      setEditError('Registration number is required.');
      return;
    }
    if (!make) {
      setEditError('Make is required.');
      return;
    }
    if (!model) {
      setEditError('Model is required.');
      return;
    }
    if (!yearStr) {
      setEditError('Year is required.');
      return;
    }
    if (!/^(19|20)\d{2}$/.test(yearStr)) {
      setEditError('Use YYYY, e.g. 2021.');
      return;
    }
    const year = Number(yearStr);
    if (year < 2005 || year > 2026) {
      setEditError('Year must be 2005–2026.');
      return;
    }
    if (!fuel) {
      setEditError('Choose fuel.');
      return;
    }
    if (!FUEL_OPTIONS.includes(fuel)) {
      setEditError('Choose a valid fuel.');
      return;
    }
    if (!transmission) {
      setEditError('Choose transmission.');
      return;
    }
    if (!TRANSMISSION_OPTIONS.includes(transmission)) {
      setEditError('Choose a valid transmission.');
      return;
    }
    if (!String(editKm).trim()) {
      setEditError('Kilometres required.');
      return;
    }
    if (!/^\d+$/.test(String(editKm).replace(/,/g, '').trim())) {
      setEditError('Kilometres: digits only.');
      return;
    }
    if (!Number.isFinite(km) || km < 0) {
      setEditError('Enter valid kilometres.');
      return;
    }
    if (!location) {
      setEditError('City is required.');
      return;
    }
    if (!String(editPrice).trim()) {
      setEditError('Expected price required.');
      return;
    }
    if (!/^\d+$/.test(String(editPrice).replace(/,/g, '').trim())) {
      setEditError('Price: digits only, e.g. 1240000.');
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      setEditError('Enter a valid expected price.');
      return;
    }
    const remainingExisting = editPhotos.filter((p) => !editDeleteIds.includes(p.id));
    const photoTotal = remainingExisting.length + editNewFiles.length;
    const isDbEdit = !usingSample && !!rawMap[editingId];
    if (isDbEdit && !editPhotosLoading && photoTotal === 0) {
      setEditError('Add at least 1 photo.');
      return;
    }
    setEditSaving(true);
    setEditError(null);
    setEditPhotoError(null);
    try {
      const roundedPrice = Math.round(price);
      const roundedKm = Math.round(km);
      const patch = {
        reg_number: reg,
        make,
        model,
        year,
        fuel: fuel as 'Petrol' | 'Diesel' | 'CNG' | 'Electric' | 'Hybrid',
        transmission: transmission as 'Manual' | 'Automatic' | 'AMT' | 'CVT',
        price_expected: roundedPrice,
        km_driven: roundedKm,
        location,
      };
      let nextCover: string | null = null;
      if (isDbEdit) {
        await updateMyVehicle(editingId, patch);
        if (editDeleteIds.length) {
          const toDelete = editPhotos
            .filter((p) => editDeleteIds.includes(p.id))
            .map((p) => ({ id: p.id, storage_path: p.storage_path }));
          await deleteVehiclePhotoRows(editingId, toDelete);
        }
        let newPublicUrls: string[] = [];
        if (editNewFiles.length) {
          const uploaded = await uploadVehiclePhotos(
            editingId,
            editNewFiles.map((f) => f.file)
          );
          await appendVehiclePhotoRows(editingId, uploaded);
          newPublicUrls = uploaded.map((u) => u.publicUrl);
        }
        const remainingUrls = remainingExisting
          .slice()
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((p) => p.public_url)
          .filter(Boolean);
        nextCover = remainingUrls[0] ?? newPublicUrls[0] ?? null;
      } else if (editNewFiles.length) {
        nextCover = editNewFiles[0].url;
      }
      const nextTitle = `${year} ${make} ${model}`;
      const kmLabel = `${Math.round(roundedKm / 1000)}K KM`;
      const nextSpec = `${year}  •  ${fuel.toUpperCase()}  •  ${kmLabel}  •  ${reg}`;
      setRows((rs) =>
        rs.map((r) =>
          r.id === editingId
            ? {
                ...r,
                title: nextTitle,
                price: formatLakh(roundedPrice),
                priceNum: roundedPrice,
                spec: nextSpec,
                ...(nextCover ? { image: nextCover } : {}),
              }
            : r
        )
      );
      setRawMap((m) => {
        const cur = m[editingId];
        if (!cur) return m;
        return {
          ...m,
          [editingId]: {
            ...cur,
            coverUrl: nextCover ?? cur.coverUrl,
            vehicle: {
              ...cur.vehicle,
              reg_number: reg,
              make: make.charAt(0).toUpperCase() + make.slice(1).toLowerCase(),
              model,
              year,
              fuel: fuel as 'Petrol' | 'Diesel' | 'CNG' | 'Electric' | 'Hybrid',
              transmission: transmission as 'Manual' | 'Automatic' | 'AMT' | 'CVT',
              price_expected: roundedPrice,
              km_driven: roundedKm,
              location,
            },
            listing: cur.listing ? { ...cur.listing, price: roundedPrice } : cur.listing,
          },
        };
      });
      for (const p of editNewFiles) {
        try { URL.revokeObjectURL(p.url); } catch { /* noop */ }
      }
      setEditNewFiles([]);
      setEditDeleteIds([]);
      setEditPhotos([]);
      setEditPhotoError(null);
      setEditingId(null);
    } catch (err) {
      setEditError(getSafeErrorMessage(err, 'Could not save changes. Please try again later.'));
    } finally {
      setEditSaving(false);
    }
  }

  if (auth === 'loading') {
    return (
      <Container className="py-16">
        <p className="font-mono text-[11px] text-muted" role="status">
          OPENING GARAGE…
        </p>
      </Container>
    );
  }

  if (auth === 'guest') {
    return (
      <Container className="py-16">
        <div className="max-w-[560px] border border-line bg-white p-8">
          <p className="font-mono text-[11px] tracking-[0.06em] text-teal-dark">
            GARAGE&nbsp;&nbsp;•&nbsp;&nbsp;LOCKED
          </p>
          <h1 className="mt-2 font-sans text-[30px] font-extrabold text-navy">
            Sign in to open your garage.
          </h1>
          <p className="mt-2 font-sans text-[14px] text-muted">
            Your listed cars live behind your account.
          </p>
          <button
            type="button"
            onClick={() => openAuthModal({ mode: 'signin' })}
            className="mt-5 inline-block bg-navy px-6 py-3 font-sans text-[14px] font-bold text-white hover:bg-navy-2"
          >
            Sign in&nbsp;&nbsp;→
          </button>
        </div>
      </Container>
    );
  }

  return (
    <Container className="pb-16 pt-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-[10px] tracking-[0.04em] text-muted" role="status" aria-live="polite">
          {counts.total} FILE{counts.total === 1 ? '' : 'S'}&nbsp;&nbsp;•&nbsp;&nbsp;
          {email.toUpperCase()}
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-center">
        <div className="min-w-0 flex-1">
          <h1 className="font-sans text-[38px] font-extrabold leading-[1.05] tracking-[-0.02em] text-navy md:text-[52px]">
            Your listed cars.
          </h1>
          <div className="mt-4 h-[5px] w-14 bg-amber" aria-hidden />
          <p className="mt-4 max-w-[560px] font-sans text-[15px] leading-relaxed text-muted">
            Every file you published, with live status, views and buyer inquiries.
          </p>
        </div>
        <Link
          href="/sell-your-car"
          className="inline-flex shrink-0 items-center gap-[10px] bg-teal px-7 py-4 font-sans text-[15px] font-bold text-navy hover:bg-[#12a295]"
        >
          <span aria-hidden className="text-[18px] font-extrabold leading-none">+</span>
          List new car
        </Link>
      </div>

      <section
        aria-label="Garage summary"
        className="mt-8 flex flex-col gap-6 bg-navy p-6 text-white lg:flex-row lg:items-center lg:gap-10"
      >
        <p className="shrink-0 font-mono text-[10px] tracking-[0.06em] text-teal-bright lg:w-[200px]">{email.toUpperCase()}</p>
        <dl className="flex flex-1 flex-wrap gap-x-10 gap-y-4 lg:justify-between">
          {[
            [String(counts.live), 'LIVE FILE'],
            [String(counts.review), 'IN REVIEW'],
            [String(counts.inquiries), 'INQUIRIES'],
            [formatCompact(counts.views), 'TOTAL VIEWS'],
          ].map(([v, l]) => (
            <div key={l}>
              <dt className="sr-only">{l}</dt>
              <dd className="font-sans text-[24px] font-extrabold">{v}</dd>
              <dd className="mt-1 font-mono text-[9px] tracking-[0.06em] text-[#9FB2C5]">
                {l}
              </dd>
            </div>
          ))}
        </dl>
        <p className="shrink-0 font-sans text-[13px] leading-relaxed text-[#D6E2EC] lg:max-w-[280px]">
          Tip: files with full 82/82 checks get 3× more inquiries.
        </p>
      </section>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-0 bg-[#EFEAE3] p-1">
          {FILTERS.map((f) => {
            const n = f.key === 'ALL' ? counts.total : rows.filter((r) => r.status === f.key).length;
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(f.key)}
                className={
                  active
                    ? 'bg-navy px-4 py-[10px] font-sans text-[13px] font-bold text-white'
                    : 'px-4 py-[10px] font-sans text-[13px] font-semibold text-navy hover:underline'
                }
              >
                {f.label(n)}
              </button>
            );
          })}
        </div>
        <label className="flex items-center gap-2 border border-line bg-white px-3 py-2.5">
          <span className="font-sans text-[12px] font-bold tracking-wide text-navy">SORT:</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            aria-label="Sort my listings"
            className="min-w-[160px] cursor-pointer bg-transparent font-sans text-[13px] font-semibold text-navy outline-none"
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {(deleteError || availError) && (
        <p role="alert" className="mt-4 border border-coral/50 bg-[#FDECEC] px-4 py-3 font-sans text-[13px] font-semibold text-[#9B2C2C]">
          {deleteError ?? availError}
        </p>
      )}

      {loadingRows ? (
        <div className="mt-4 border border-line bg-white p-10 text-center">
          <p className="font-mono text-[11px] text-muted" role="status">OPENING GARAGE…</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-4 border border-line bg-white p-10 text-center">
          <p className="font-mono text-[11px] tracking-[0.06em] text-teal-dark">GARAGE EMPTY</p>
          <p className="mt-2 font-sans text-[18px] font-bold text-navy">You have not listed any car yet.</p>
          <p className="mt-2 font-sans text-[14px] text-muted">List your first car, or browse verified cars.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <Link href="/sell-your-car" className="bg-navy px-6 py-3 font-sans text-[13px] font-bold text-white">
              List your car →
            </Link>
            <Link href="/cars" className="border border-navy/30 px-6 py-3 font-sans text-[13px] font-bold text-navy">
              Browse cars
            </Link>
          </div>
        </div>
      ) : visible.length === 0 ? (
        <div className="mt-4 border border-line bg-white p-10 text-center">
          <p className="font-sans text-[18px] font-bold text-navy">No files with this status.</p>
          <button
            type="button"
            onClick={() => setFilter('ALL')}
            className="mt-4 bg-navy px-6 py-3 font-sans text-[13px] font-bold text-white"
          >
            Show all
          </button>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-[18px]">
          {visible.map((car) => {
            const raw = rawMap[car.id];
            const listingId = raw?.listing?.id;
            const inquiries = listingId ? (inquiriesById[listingId] ?? null) : null;
            return (
            <article
              key={car.id}
              className="flex flex-col gap-5 border border-line bg-white p-5 sm:flex-row sm:flex-wrap"
            >
              <div className="relative h-40 w-full shrink-0 overflow-hidden bg-off-white sm:h-[96px] sm:w-[132px]">
                <Image
                  src={car.image}
                  alt={`${car.title}`}
                  fill
                  className="object-cover"
                  sizes="(max-width: 640px) 100vw, 132px"
                  loading="lazy"
                />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <p className="flex flex-wrap items-center gap-[10px]">
                  <StatusPill status={car.status} />
                  <span className="font-mono text-[11px] text-teal-dark">
                    {car.inspectionId}
                  </span>
                </p>
                <h2 className="font-sans text-[18px] font-extrabold text-navy">
                  {car.title}
                </h2>
                <p className="font-mono text-[11px] tracking-[0.02em] text-muted">
                  {car.spec}
                </p>
                <p
                  className={cn(
                    'font-sans text-[13px]',
                    car.metaTone === 'teal'
                      ? 'font-bold text-teal-dark'
                      : 'text-muted'
                  )}
                >
                  {car.meta}
                </p>
              </div>
              <div className="shrink-0 sm:w-[230px]">
                {car.status === 'LIVE' ? (
                  <button
                    type="button"
                    aria-expanded={openInquiries === car.id}
                    onClick={() => toggleInquiries(car)}
                    className="font-mono text-[9px] tracking-[0.06em] text-muted hover:text-navy hover:underline"
                  >
                    {car.priceLabel}
                  </button>
                ) : car.status === 'IN REVIEW' ? (
                  <button
                    type="button"
                    aria-expanded={showNextFor === car.id}
                    onClick={() => setShowNextFor((v) => (v === car.id ? null : car.id))}
                    className="font-mono text-[9px] tracking-[0.06em] text-muted hover:text-navy hover:underline"
                  >
                    {car.priceLabel}
                  </button>
                ) : (
                  <p className="font-mono text-[9px] tracking-[0.06em] text-muted">
                    {car.priceLabel}
                  </p>
                )}
                <p className="mt-1 font-sans text-[22px] font-extrabold text-navy">
                  {car.price}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {car.secondaryAction === 'Delete' ? (
                    confirmDelete === car.id ? (
                      <>
                        <button
                          type="button"
                          onClick={() => remove(car.id)}
                          className="bg-coral px-[18px] py-[10px] font-sans text-[13px] font-bold text-white hover:opacity-90"
                        >
                          Confirm?
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(null)}
                          className="border border-navy/30 px-[18px] py-[10px] font-sans text-[13px] font-semibold text-navy"
                        >
                          Keep
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(car.id)}
                        className="border border-navy px-[18px] py-[10px] font-sans text-[13px] font-semibold text-navy hover:bg-off-white"
                      >
                        Delete
                      </button>
                    )
                  ) : (
                    <button
                      type="button"
                      onClick={() => openEdit(car)}
                      className="border border-navy px-[18px] py-[10px] font-sans text-[13px] font-semibold text-navy hover:bg-off-white"
                    >
                      {car.secondaryAction}
                    </button>
                  )}
                  {car.status === 'LIVE' ? (
                    <Link
                      href={`/cars/${car.slug}`}
                      className="bg-navy px-[18px] py-[10px] font-sans text-[13px] font-bold text-white hover:bg-navy-2"
                    >
                      {car.primaryAction}
                    </Link>
                  ) : car.status === 'IN REVIEW' ? (
                    <button
                      type="button"
                      onClick={() => setPreviewFor((v) => (v === car.id ? null : car.id))}
                      aria-expanded={previewFor === car.id}
                      className="bg-navy px-[18px] py-[10px] font-sans text-[13px] font-bold text-white hover:bg-navy-2"
                    >
                      {previewFor === car.id ? 'Hide preview ↑' : `${car.primaryAction}`}
                    </button>
                  ) : car.status === 'SOLD' || car.status === 'PAUSED' ? (
                    <button
                      type="button"
                      disabled={availBusy === car.id}
                      onClick={() => applyAvailability(car.id, 'resume')}
                      className="bg-teal px-[18px] py-[10px] font-sans text-[13px] font-bold text-navy hover:bg-[#12a295] disabled:opacity-60"
                    >
                      {car.primaryAction}
                    </button>
                  ) : (
                    <Link
                      href={`/sell-your-car?resume=${car.id}`}
                      className="bg-navy px-[18px] py-[10px] font-sans text-[13px] font-bold text-white hover:bg-navy-2"
                    >
                      {car.primaryAction}
                    </Link>
                  )}
                </div>
                {/* Demo seed cards have no DB row behind them, so availability
                    changes are only offered for real files. */}
                {!usingSample && (car.status === 'LIVE' || car.status === 'PAUSED') && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {confirmSold === car.id ? (
                      <>
                        <span className="font-sans text-[12px] font-semibold text-navy">
                          Sold outside AutoFair?
                        </span>
                        <button
                          type="button"
                          onClick={() => applyAvailability(car.id, 'sold')}
                          className="bg-coral px-[14px] py-[8px] font-sans text-[12px] font-bold text-white hover:opacity-90"
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmSold(null)}
                          className="border border-navy/30 px-[14px] py-[8px] font-sans text-[12px] font-semibold text-navy"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          disabled={availBusy === car.id}
                          onClick={() => setConfirmSold(car.id)}
                          className="border border-navy px-[14px] py-[8px] font-sans text-[12px] font-semibold text-navy hover:bg-off-white disabled:opacity-60"
                        >
                          Mark as sold
                        </button>
                        {car.status === 'LIVE' && (
                          <button
                            type="button"
                            disabled={availBusy === car.id}
                            onClick={() => applyAvailability(car.id, 'pause')}
                            className="border border-navy/30 px-[14px] py-[8px] font-sans text-[12px] font-semibold text-muted hover:bg-off-white disabled:opacity-60"
                          >
                            Pause
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
              {showNextFor === car.id && car.status === 'IN REVIEW' && (
                <div className="border border-line bg-off-white p-4 sm:basis-full" role="status">
                  <p className="font-mono text-[10px] tracking-[0.06em] text-teal-dark">
                    WHAT HAPPENS NEXT?
                  </p>
                  <ol className="mt-2 space-y-1.5 font-sans text-[13px] text-ink-soft">
                    <li><span className="font-mono text-[12px] text-teal-dark">01 — </span>Staff assigned to your {car.inspectionId} file (auto).</li>
                    <li><span className="font-mono text-[12px] text-teal-dark">02 — </span>On-site 82-check inspection + document verification.</li>
                    <li><span className="font-mono text-[12px] text-teal-dark">03 — </span>Approval → dossier goes LIVE under /cars. You can edit all details anytime before that.</li>
                  </ol>
                  <button
                    type="button"
                    onClick={() => openEdit(car)}
                    className="mt-3 border border-navy px-4 py-2 font-sans text-[12px] font-bold text-navy hover:bg-white"
                  >
                    Edit details →
                  </button>
                </div>
              )}
              {previewFor === car.id && car.status === 'IN REVIEW' && (
                <div className="border border-line bg-off-white p-4 sm:basis-full">
                  <p className="font-mono text-[10px] tracking-[0.06em] text-teal-dark">
                    DRAFT PREVIEW — NOT PUBLIC YET
                  </p>
                  <div className="mt-2 flex flex-col gap-3 sm:flex-row">
                    <div className="relative h-32 w-full shrink-0 overflow-hidden bg-white sm:w-[180px]">
                      <Image src={car.image} alt={`${car.title} preview`} fill className="object-cover" sizes="180px" loading="lazy" />
                    </div>
                    <div>
                      <p className="font-sans text-[16px] font-extrabold text-navy">{car.title}</p>
                      <p className="mt-1 font-mono text-[11px] text-muted">{car.spec}</p>
                      <p className="mt-1 font-sans text-[15px] font-bold text-navy">{car.price}</p>
                      <p className="mt-1 font-sans text-[12px] text-muted">{car.meta} — buyers will see this file at /cars/{car.slug} once verified.</p>
                    </div>
                  </div>
                </div>
              )}
              {openInquiries === car.id && car.status === 'LIVE' && (
                <div className="border border-teal-line bg-teal-bg p-4 sm:basis-full">
                  <p className="font-mono text-[10px] tracking-[0.06em] text-teal-dark">
                    BUYER INQUIRIES — LIVE
                  </p>
                  {usingSample ? (
                    car.inquiriesSample.length ? (
                      <ul className="mt-2 space-y-2">
                        {car.inquiriesSample.map((q) => (
                          <li
                            key={`${q.who}-${q.when}`}
                            className="flex flex-col gap-0.5 border-b border-teal-line/60 pb-2 font-sans text-[13px] last:border-0 last:pb-0 sm:flex-row sm:gap-3"
                          >
                            <span className="font-bold text-navy">{q.who}</span>
                            <span className="text-ink-soft">{q.what}</span>
                            <span className="font-mono text-[11px] text-muted sm:ml-auto">
                              {q.when}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 font-sans text-[13px] text-muted">No inquiries yet.</p>
                    )
                  ) : !listingId ? (
                    <p className="mt-2 font-sans text-[13px] text-muted">No listing yet — inquiries appear after verification.</p>
                  ) : inqLoading === car.id ? (
                    <p className="mt-2 font-mono text-[11px] text-muted" role="status">LOADING INQUIRIES…</p>
                  ) : inqError[car.id] ? (
                    <p className="mt-2 font-sans text-[13px] font-semibold text-[#9B2C2C]" role="alert">{inqError[car.id]}</p>
                  ) : inquiries && inquiries.length ? (
                    <ul className="mt-2 space-y-2">
                      {inquiries.map((q) => (
                        <li
                          key={q.id}
                          className="flex flex-col gap-0.5 border-b border-teal-line/60 pb-2 font-sans text-[13px] last:border-0 last:pb-0 sm:flex-row sm:gap-3"
                        >
                          <span className="font-bold text-navy">{q.buyer_contact || 'Buyer'}</span>
                          <span className="text-ink-soft">
                            {q.message || q.type}
                            {q.offered_price ? ` — offered ₹${q.offered_price.toLocaleString('en-IN')}` : ''}
                            {` • ${q.status}`}
                          </span>
                          <span className="font-mono text-[11px] text-muted sm:ml-auto">
                            {formatDateTime(q.created_at)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 font-sans text-[13px] text-muted">No inquiries yet — share your file link to get the first one.</p>
                  )}
                </div>
              )}
            </article>
            );
          })}
        </div>
      )}

      {editingId && (
        <div role="dialog" aria-modal="true" aria-label="Edit vehicle" className="fixed inset-0 z-[60] flex items-center justify-center bg-navy/60 p-4">
          <div className="max-h-[90vh] w-full max-w-[640px] overflow-y-auto border border-line bg-white p-6">
            <p className="font-mono text-[10px] tracking-[0.06em] text-teal-dark">EDIT FILE — ALL DETAILS</p>
            <h2 className="mt-1 font-sans text-[20px] font-extrabold text-navy">Update your listing</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="font-mono text-[11px] tracking-[0.06em] text-muted">REGISTRATION NUMBER *</span>
                <input
                  value={editReg}
                  onChange={(e) => setEditReg(e.target.value.toUpperCase())}
                  placeholder="KA-05-MN-4218"
                  className="mt-1.5 w-full border border-line bg-off-white px-4 py-3 font-mono text-[15px] text-navy outline-none focus:border-teal"
                />
              </label>
              <label className="block">
                <span className="font-mono text-[11px] tracking-[0.06em] text-muted">CITY / LOCATION *</span>
                <input
                  value={editLocation}
                  onChange={(e) => setEditLocation(e.target.value)}
                  placeholder="Bangalore"
                  className="mt-1.5 w-full border border-line bg-off-white px-4 py-3 font-sans text-[15px] text-navy outline-none focus:border-teal"
                />
              </label>
              <label className="block">
                <span className="font-mono text-[11px] tracking-[0.06em] text-muted">MAKE *</span>
                <input
                  value={editMake}
                  onChange={(e) => setEditMake(e.target.value)}
                  placeholder="Hyundai"
                  className="mt-1.5 w-full border border-line bg-off-white px-4 py-3 font-sans text-[15px] text-navy outline-none focus:border-teal"
                />
              </label>
              <label className="block">
                <span className="font-mono text-[11px] tracking-[0.06em] text-muted">MODEL *</span>
                <input
                  value={editModel}
                  onChange={(e) => setEditModel(e.target.value)}
                  placeholder="Creta SX"
                  className="mt-1.5 w-full border border-line bg-off-white px-4 py-3 font-sans text-[15px] text-navy outline-none focus:border-teal"
                />
              </label>
              <label className="block">
                <span className="font-mono text-[11px] tracking-[0.06em] text-muted">YEAR *</span>
                <input
                  value={editYear}
                  onChange={(e) => setEditYear(e.target.value)}
                  inputMode="numeric"
                  placeholder="2022"
                  className="mt-1.5 w-full border border-line bg-off-white px-4 py-3 font-sans text-[15px] text-navy outline-none focus:border-teal"
                />
              </label>
              <label className="block">
                <span className="font-mono text-[11px] tracking-[0.06em] text-muted">KILOMETRES *</span>
                <input
                  value={editKm}
                  onChange={(e) => setEditKm(e.target.value)}
                  inputMode="numeric"
                  placeholder="42180"
                  className="mt-1.5 w-full border border-line bg-off-white px-4 py-3 font-sans text-[15px] text-navy outline-none focus:border-teal"
                />
              </label>
              <label className="block">
                <span className="font-mono text-[11px] tracking-[0.06em] text-muted">EXPECTED PRICE (₹) *</span>
                <input
                  value={editPrice}
                  onChange={(e) => setEditPrice(e.target.value)}
                  inputMode="numeric"
                  placeholder="1240000"
                  className="mt-1.5 w-full border border-line bg-off-white px-4 py-3 font-sans text-[15px] text-navy outline-none focus:border-teal"
                />
              </label>
              <div className="flex items-end pb-1">
                <p className="font-sans text-[12px] leading-relaxed text-muted">
                  Shown as EXPECTED PRICE until verified, then as listing price.
                </p>
              </div>
              <label className="block">
                <span className="font-mono text-[11px] tracking-[0.06em] text-muted">FUEL *</span>
                <select
                  value={editFuel}
                  onChange={(e) => setEditFuel(e.target.value)}
                  className="mt-1.5 w-full appearance-none border border-line bg-white px-4 py-3 font-sans text-[15px] text-navy outline-none focus:border-teal"
                >
                  <option value="">Select...</option>
                  {FUEL_OPTIONS.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="font-mono text-[11px] tracking-[0.06em] text-muted">TRANSMISSION *</span>
                <select
                  value={editTransmission}
                  onChange={(e) => setEditTransmission(e.target.value)}
                  className="mt-1.5 w-full appearance-none border border-line bg-white px-4 py-3 font-sans text-[15px] text-navy outline-none focus:border-teal"
                >
                  <option value="">Select...</option>
                  {TRANSMISSION_OPTIONS.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-4 border-t border-line pt-4">
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-mono text-[11px] tracking-[0.06em] text-muted">PHOTOS *</p>
                <p className="font-mono text-[10px] tracking-[0.04em] text-[#9FB2C5]">
                  UP TO 10&nbsp;&nbsp;•&nbsp;&nbsp;FIRST = COVER
                </p>
              </div>
              {editPhotosLoading ? (
                <p className="mt-2 font-mono text-[11px] text-muted" role="status">LOADING PHOTOS…</p>
              ) : (
                <>
                  {(editPhotos.length > 0 || editNewFiles.length > 0) ? (
                    <div className="mt-2 flex flex-wrap gap-3" role="list" aria-label="Edit photos">
                      {editPhotos.map((p, i) => {
                        const marked = editDeleteIds.includes(p.id);
                        const isCover = i === 0 && !marked;
                        return (
                          <div key={p.id} role="listitem" className="relative h-24 w-32 shrink-0 overflow-hidden bg-off-white">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={p.public_url}
                              alt={`Existing photo ${i + 1}${isCover ? ' — cover' : ''}`}
                              className={marked ? 'h-full w-full object-cover opacity-30 grayscale' : 'h-full w-full object-cover'}
                            />
                            {isCover && (
                              <span className="absolute left-2 top-2 bg-navy px-2 py-1 font-mono text-[8px] font-bold tracking-[0.06em] text-white">
                                COVER
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => toggleDeleteExisting(p.id)}
                              aria-label={marked ? `Restore photo ${i + 1}` : `Remove photo ${i + 1}`}
                              aria-pressed={marked}
                              className={marked
                                ? 'absolute right-1 top-1 bg-navy px-2 py-0.5 font-sans text-[11px] font-bold text-white hover:bg-navy-2'
                                : 'absolute right-1 top-1 flex h-5 w-5 items-center justify-center bg-white font-sans text-[13px] font-bold leading-none text-navy hover:bg-off-white'}
                            >
                              {marked ? '↩' : '×'}
                            </button>
                          </div>
                        );
                      })}
                      {editNewFiles.map((p, i) => (
                        <div key={p.id} className="relative h-24 w-32 shrink-0 overflow-hidden bg-off-white">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={p.url} alt={`New upload ${i + 1}`} className="h-full w-full object-cover" />
                          {editPhotos.filter((x) => !editDeleteIds.includes(x.id)).length === 0 && i === 0 && (
                            <span className="absolute left-2 top-2 bg-teal px-2 py-1 font-mono text-[8px] font-bold tracking-[0.06em] text-navy">
                              NEW COVER
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => removeNewEditPhoto(p.id)}
                            aria-label={`Remove new photo ${i + 1}`}
                            className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center bg-white font-sans text-[13px] font-bold leading-none text-navy hover:bg-off-white"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 font-sans text-[13px] text-muted">
                      {usingSample ? 'Add photos to preview a new cover.' : 'No photos yet — add at least 1.'}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => editFileRef.current?.click()}
                      className="border border-navy px-4 py-2 font-sans text-[12px] font-bold text-navy hover:bg-off-white"
                    >
                      Add photos +
                    </button>
                    <p className="font-mono text-[10px] text-muted" role="status">
                      {editPhotos.filter((p) => !editDeleteIds.includes(p.id)).length + editNewFiles.length} / 10
                      {editDeleteIds.length ? `  •  ${editDeleteIds.length} marked to remove` : ''}
                    </p>
                  </div>
                  <input
                    ref={editFileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    className="sr-only"
                    aria-label="Add car photos"
                    onChange={(e) => {
                      addEditFiles(e.target.files);
                      e.target.value = '';
                    }}
                  />
                  {editPhotoError && (
                    <p role="alert" className="mt-2 font-sans text-[12px] font-semibold text-[#DC2626]">{editPhotoError}</p>
                  )}
                  <p className="mt-2 font-sans text-[11px] text-muted">JPG / PNG / WebP • max 5MB each • auto-compressed to WebP 1280px. First photo is the cover.</p>
                </>
              )}
            </div>
            {editError && (
              <p role="alert" className="mt-3 font-sans text-[13px] font-semibold text-[#DC2626]">{editError}</p>
            )}
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={editSaving}
                onClick={saveEdit}
                className="bg-navy px-6 py-3 font-sans text-[13px] font-bold text-white hover:bg-navy-2 disabled:opacity-60"
              >
                {editSaving ? 'Saving…' : 'Save changes →'}
              </button>
              <button
                type="button"
                disabled={editSaving}
                onClick={closeEdit}
                className="border border-navy/30 px-6 py-3 font-sans text-[13px] font-semibold text-navy"
              >
                Cancel
              </button>
            </div>
            <p className="mt-3 font-sans text-[11px] text-muted">Duplicate registration numbers are blocked — each vehicle keeps a unique file.</p>
          </div>
        </div>
      )}
    </Container>
  );
}
