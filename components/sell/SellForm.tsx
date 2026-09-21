'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ImagePlus } from 'lucide-react';
import { Container } from '@/components/shared/Container';
import { cn } from '@/lib/utils';
import { createVehicleRow, addVehiclePhotoRows, invalidateMyVehiclesCache, invalidateLiveCarsCache, fetchMyVehicleById, fetchMyVehicleByReg, updateMyVehicle } from '@/lib/supabase/queries';
import { uploadVehiclePhotos } from '@/lib/supabase/storage';
import { isSupabaseConfigured, getBrowserClient } from '@/lib/supabase/client';
import { DbOperationError, getSafeErrorMessage } from '@/lib/errors/db-error';
import { openAuthModal } from '@/lib/auth/modal';
import { normalizeIndianMobile } from '@/lib/validation/phone';

type Fields = {
  reg: string;
  make: string;
  model: string;
  year: string;
  fuel: string;
  transmission: string;
  km: string;
  location: string;
  price: string;
  whatsapp: string;
};

const initial: Fields = {
  reg: '',
  make: '',
  model: '',
  year: '',
  fuel: '',
  transmission: '',
  km: '',
  location: '',
  price: '',
  whatsapp: '',
};

interface Photo {
  id: string;
  url: string;
  name: string;
  file: File;
}

const MAX_PHOTOS = 10;
const MAX_MB = 5;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];

let photoSeq = 0;

export function SellForm() {
  const router = useRouter();
  const [f, setF] = useState<Fields>(initial);
  const [editId, setEditId] = useState<string | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [existingPhotos, setExistingPhotos] = useState(0);
  const [errors, setErrors] = useState<Partial<Record<keyof Fields | 'photos' | 'submit', string>>>({});
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [inspectionId, setInspectionId] = useState<string | null>(null);
  const [savedToDb, setSavedToDb] = useState(false);
  const [assignmentStatus, setAssignmentStatus] = useState<'assigned' | 'pending' | null>(null);
  // Recovery state for the phantom-failure loop: stage 1 (vehicle row)
  // committed but a later stage failed, or a retry hit reg_number 409.
  // Rendered as its own panel with a resume CTA — never a dead-end alert.
  const [recovery, setRecovery] = useState<{ vehicleId: string; inspectionId: string; reason: 'photos-failed' | 'already-exists' } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const [scrollPct, setScrollPct] = useState(0);

  useEffect(() => {
    return () => {
      setPhotos((ps) => {
        ps.forEach((p) => URL.revokeObjectURL(p.url));
        return ps;
      });
    };
  }, []);

  // Edit / resume-draft mode: /sell-your-car?resume=<vehicleId> or ?vehicleId=
  // prefills the owner's row so Edit and Resume draft land here with data.
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      const id = q.get('resume') || q.get('vehicleId');
      if (!id) return;
      setEditLoading(true);
      fetchMyVehicleById(id).then((row) => {
        setEditLoading(false);
        if (!row) return;
        setEditId(row.vehicle.id);
        setF({
          reg: row.vehicle.reg_number ?? '',
          make: row.vehicle.make ?? '',
          model: row.vehicle.model ?? '',
          year: String(row.vehicle.year ?? ''),
          fuel: row.vehicle.fuel ?? '',
          transmission: row.vehicle.transmission ?? '',
          km: String(row.vehicle.km_driven ?? ''),
          location: row.vehicle.location ?? '',
          price: String(row.listing?.price ?? row.vehicle.price_expected ?? ''),
          whatsapp: f.whatsapp,
        });
        const sb = getBrowserClient('local') ?? getBrowserClient('session');
        if (sb) {
          sb.from('vehicle_photos')
            .select('id', { count: 'exact', head: true })
            .eq('vehicle_id', row.vehicle.id)
            .then(({ count }) => {
              if (typeof count === 'number') setExistingPhotos(count);
            });
        }
      });
    } catch {
      setEditLoading(false);
    }
  }, []);

  // Prefill saved WhatsApp so repeat sellers don't retype it.
  useEffect(() => {
    const sb = getBrowserClient('local') ?? getBrowserClient('session');
    if (!sb) return;
    sb.auth.getSession().then(({ data }) => {
      const uid = data.session?.user?.id;
      if (!uid) return;
      sb.from('profiles').select('phone').eq('id', uid).maybeSingle().then(({ data: p }) => {
        const phone = (p as { phone?: string | null } | null)?.phone;
        if (phone) {
          const digits = phone.replace(/\D/g, '');
          const ten = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
          setF((prev) => (prev.whatsapp ? prev : { ...prev, whatsapp: ten }));
        }
      });
    });
  }, []);

  function set<K extends keyof Fields>(k: K, v: string) {
    setF((p) => ({ ...p, [k]: v }));
  }

  function addFiles(list: FileList | null) {
    if (!list) return;
    setErrors((e) => ({ ...e, photos: undefined }));
    const incoming = Array.from(list);
    const problems: string[] = [];
    const accepted: Photo[] = [];
    for (const file of incoming) {
      if (!ACCEPTED.includes(file.type)) {
        problems.push(`${file.name}: only JPG / PNG / WebP.`);
        continue;
      }
      if (file.size > MAX_MB * 1024 * 1024) {
        problems.push(`${file.name}: over ${MAX_MB}MB.`);
        continue;
      }
      accepted.push({ id: `p${++photoSeq}`, url: URL.createObjectURL(file), name: file.name, file });
    }
    setPhotos((ps) => {
      const room = MAX_PHOTOS - ps.length;
      if (room <= 0) {
        problems.push(`Maximum ${MAX_PHOTOS} photos.`);
        if (problems.length) setErrors((e) => ({ ...e, photos: problems.join(' ') }));
        return ps;
      }
      const take = accepted.slice(0, room);
      if (accepted.length > room) problems.push(`Maximum ${MAX_PHOTOS} photos — extras skipped.`);
      if (problems.length) setErrors((e) => ({ ...e, photos: problems.join(' ') }));
      return [...ps, ...take];
    });
  }

  function removePhoto(id: string) {
    setPhotos((ps) => {
      const target = ps.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return ps.filter((p) => p.id !== id);
    });
  }

  function onStripScroll() {
    const el = stripRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setScrollPct(max > 0 ? el.scrollLeft / max : 0);
  }

  function nudge(dir: 1 | -1) {
    stripRef.current?.scrollBy({ left: dir * 280, behavior: 'smooth' });
  }

  function validate() {
    const e: Partial<Record<keyof Fields | 'photos', string>> = {};
    if (!f.reg.trim()) e.reg = 'Registration number is required.';
    if (!f.make.trim()) e.make = 'Make is required.';
    if (!f.model.trim()) e.model = 'Model is required.';
    if (!f.year.trim()) e.year = 'Year is required.';
    else if (!/^(19|20)\d{2}$/.test(f.year.trim())) e.year = 'Use YYYY, e.g. 2021.';
    else {
      const y = Number(f.year);
      if (y < 2005 || y > 2026) e.year = 'Year must be 2005–2026.';
    }
    if (!f.fuel) e.fuel = 'Choose fuel.';
    if (!f.transmission) e.transmission = 'Choose transmission.';
    if (!f.km.trim()) e.km = 'Kilometres required.';
    else if (!/^\d+$/.test(f.km.replace(/,/g, ''))) e.km = 'Digits only.';
    if (!f.location.trim()) e.location = 'City is required.';
    if (!normalizeIndianMobile(f.whatsapp)) e.whatsapp = 'Enter 10-digit mobile starting 6-9.';
    if (!f.price.trim()) e.price = 'Expected price required.';
    else if (!/^\d+$/.test(f.price.replace(/,/g, '').trim())) e.price = 'Digits only, e.g. 1240000.';
    // In edit/resume mode existing DB photos satisfy the requirement.
    if (photos.length === 0 && !(editId && existingPhotos > 0)) e.photos = 'Add at least 1 photo.';
    return e;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const v = validate();
    setErrors(v);
    if (Object.keys(v).length !== 0) return;
    if (!isSupabaseConfigured()) {
      // No DB yet — keep old frontend-only behaviour
      setSavedToDb(false);
      setDone(true);
      return;
    }
    setSubmitting(true);
    setErrors((prev) => ({ ...prev, submit: undefined }));
    setRecovery(null);
    try {
      const year = Number(f.year.trim());
      const km = Number(f.km.replace(/,/g, '').trim());
      const priceExpected = Number(f.price.replace(/,/g, '').trim());
      const whatsappE164 = normalizeIndianMobile(f.whatsapp);
      async function saveContactPhone() {
        try {
          if (!whatsappE164) return;
          const sb = getBrowserClient('local') ?? getBrowserClient('session');
          if (!sb) return;
          const { data } = await sb.auth.getSession();
          const uid = data.session?.user?.id;
          if (!uid) return;
          await sb.from('profiles').update({ phone: whatsappE164 }).eq('id', uid);
        } catch {
          /* contact save is best-effort; vehicle submit already succeeded */
        }
      }
      // Edit / resume-draft: update the owner's row instead of inserting.
      if (editId) {
        await updateMyVehicle(editId, {
          make: f.make,
          model: f.model,
          year,
          fuel: f.fuel as 'Petrol' | 'Diesel' | 'CNG' | 'Electric' | 'Hybrid',
          transmission: f.transmission as 'Manual' | 'Automatic' | 'AMT' | 'CVT',
          km_driven: km,
          location: f.location,
          price_expected: priceExpected,
        });
        if (photos.length) {
          try {
            const uploaded = await uploadVehiclePhotos(
              editId,
              photos.map((p) => p.file)
            );
            await addVehiclePhotoRows(editId, uploaded);
          } catch (photoErr) {
            // Details saved; only the new photos failed. Resume instead of
            // reporting a total failure.
            invalidateMyVehiclesCache();
            invalidateLiveCarsCache();
            const row = await fetchMyVehicleById(editId).catch(() => null);
            setRecovery({
              vehicleId: editId,
              inspectionId: row?.vehicle.inspection_id ?? '',
              reason: 'photos-failed',
            });
            setErrors((prev) => ({
              ...prev,
              submit: `${getSafeErrorMessage(photoErr, 'Details saved, but the new photos could not be uploaded.')} Your file is kept — resume it from My Listings.`,
            }));
            return;
          }
        }
        invalidateMyVehiclesCache();
        invalidateLiveCarsCache();
        await saveContactPhone();
        router.replace('/my-listings');
        router.refresh();
        return;
      }
      // Stage 1: vehicle row. On reg_number 409, recover the caller's own
      // row (phantom-failure retry) instead of a dead-end "already exists".
      let vehicleId: string;
      let newId: string;
      let autoAssigned = false;
      try {
        const created = await createVehicleRow({
          reg: f.reg,
          make: f.make,
          model: f.model,
          year,
          fuel: f.fuel as 'Petrol' | 'Diesel' | 'CNG' | 'Electric' | 'Hybrid',
          transmission: f.transmission as 'Manual' | 'Automatic' | 'AMT' | 'CVT',
          km,
          location: f.location,
          priceExpected,
        });
        vehicleId = created.vehicleId;
        newId = created.inspectionId;
        autoAssigned = created.autoAssigned;
      } catch (createErr) {
        const isConflict =
          createErr instanceof DbOperationError &&
          (createErr.status === 409 || createErr.code === 'CONFLICT');
        if (isConflict) {
          const own = await fetchMyVehicleByReg(f.reg).catch(() => null);
          if (own) {
            setRecovery({ vehicleId: own.vehicleId, inspectionId: own.inspectionId, reason: 'already-exists' });
            setErrors((prev) => ({
              ...prev,
              submit: `This registration was already submitted as file ${own.inspectionId}. Your details are safe — continue where you left off.`,
            }));
            return;
          }
        }
        throw createErr;
      }
      // Stages 2+3: photo upload + photo rows. The vehicle row already
      // exists here, so a failure must offer resume — never "try again".
      try {
        // Upload compressed WebP to Supabase Storage (0-rupee pipeline)
        const uploaded = await uploadVehiclePhotos(
          vehicleId,
          photos.map((p) => p.file)
        );
        await addVehiclePhotoRows(vehicleId, uploaded);
      } catch (photoErr) {
        invalidateMyVehiclesCache();
        setRecovery({ vehicleId, inspectionId: newId, reason: 'photos-failed' });
        setErrors((prev) => ({
          ...prev,
          submit: `${getSafeErrorMessage(photoErr, 'Vehicle saved, but photos could not be uploaded.')} Your file ${newId} is kept — add photos from My Listings.`,
        }));
        return;
      }
      invalidateMyVehiclesCache();
      await saveContactPhone();
      setInspectionId(newId);
      setAssignmentStatus(autoAssigned ? 'assigned' : 'pending');
      setSavedToDb(true);
      setDone(true);
      // A completed customer submission belongs in the customer workspace.
      // Go straight to the garage, where the new file appears as IN REVIEW.
      router.replace('/my-listings');
      router.refresh();
    } catch (err) {
      // Never render raw DB/driver text. DbOperationError already carries a
      // safe userMessage; anything else falls back to a generic message.
      setErrors((prev) => ({
        ...prev,
        submit: getSafeErrorMessage(err, 'Submit failed. Please try again later.'),
      }));
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="border border-teal-line bg-white p-8" role="status">
        <p className="font-mono text-[11px] text-teal-dark">{savedToDb ? `FILE SAVED — ${inspectionId ?? ''}` : 'FILE CAPTURED — FRONTEND ONLY'}</p>
        <h2 className="mt-2 font-sans text-[24px] font-extrabold text-navy">
          {savedToDb ? 'Submitted for review.' : 'Your vehicle details have been captured.'}
        </h2>
        <p className="mt-2 max-w-[520px] font-sans text-[14px] leading-relaxed text-muted">
          AutoFair will review the information ({f.reg.toUpperCase()} · {f.make}{' '}
          {f.model} · {photos.length} photo{photos.length === 1 ? '' : 's'}).{' '}
          {savedToDb
            ? assignmentStatus === 'assigned'
              ? `Saved to Supabase and assigned to an inspection staff member. Quote Inspection ID ${inspectionId} on call. Track it in My Listings after sign-in.`
              : `Saved to Supabase. Your inspection is queued for staff assignment. Quote Inspection ID ${inspectionId} on call. Track it in My Listings after sign-in.`
            : 'Nothing was sent to a backend — this is a frontend prototype. Run the Supabase migration to enable saving.'}
        </p>
        <button
          type="button"
          onClick={() => {
            setDone(false);
            setF(initial);
            setPhotos([]);
            setInspectionId(null);
            setSavedToDb(false);
            setAssignmentStatus(null);
            setRecovery(null);
          }}
          className="mt-5 border border-navy/30 px-5 py-3 font-sans text-[13px] font-bold text-navy"
        >
          Submit another vehicle
        </button>
      </div>
    );
  }

  const textCls =
    'w-full border border-line bg-off-white px-[18px] py-4 font-sans text-[16px] text-navy outline-none placeholder:text-[#A8B0B8] focus:border-teal';
  const left = MAX_PHOTOS - photos.length;

  return (
    <form
      noValidate
      onSubmit={handleSubmit}
      className="border border-line bg-white p-6 md:p-10"
    >
      {editLoading && (
        <p className="border border-teal-line bg-teal-bg px-4 py-3 font-mono text-[11px] text-teal-dark" role="status">
          LOADING YOUR FILE…
        </p>
      )}
      {editId && !editLoading && (
        <p className="border border-amber/60 bg-[#FFFBEB] px-4 py-3 font-mono text-[11px] text-navy" role="status">
          EDITING FILE — {editId.slice(0, 8).toUpperCase()} · changes save to the same inspection file{existingPhotos > 0 ? ` · ${existingPhotos} photo${existingPhotos === 1 ? '' : 's'} already saved` : ''}.
        </p>
      )}
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id="sell-reg"
            label="REGISTRATION NUMBER *"
            value={f.reg}
            onChange={(v) => set('reg', v)}
            placeholder="KA-05-MN-4218"
            mono
            error={errors.reg}
            className={textCls}
          />
          <TextField
            id="sell-location"
            label="CITY / LOCATION *"
            value={f.location}
            onChange={(v) => set('location', v)}
            placeholder="Bangalore"
            error={errors.location}
            className={textCls}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id="sell-whatsapp"
            label="WHATSAPP / MOBILE *"
            value={f.whatsapp}
            onChange={(v) => set('whatsapp', v)}
            placeholder="91+"
            inputMode="tel"
            error={errors.whatsapp}
            className={textCls}
          />
          <div className="flex items-end pb-1">
            <p className="font-sans text-[12px] leading-relaxed text-muted">
              10-digit mobile starting 6-9. Buyers see it after tapping Contact Seller.
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id="sell-make"
            label="MAKE *"
            value={f.make}
            onChange={(v) => set('make', v)}
            placeholder="Hyundai"
            error={errors.make}
            className={textCls}
          />
          <TextField
            id="sell-model"
            label="MODEL *"
            value={f.model}
            onChange={(v) => set('model', v)}
            placeholder="Creta SX"
            error={errors.model}
            className={textCls}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id="sell-year"
            label="YEAR *"
            value={f.year}
            onChange={(v) => set('year', v)}
            placeholder="2022"
            inputMode="numeric"
            error={errors.year}
            className={textCls}
          />
          <TextField
            id="sell-km"
            label="KILOMETRES *"
            value={f.km}
            onChange={(v) => set('km', v)}
            placeholder="42180"
            inputMode="numeric"
            error={errors.km}
            className={textCls}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id="sell-price"
            label="EXPECTED PRICE (₹) *"
            value={f.price}
            onChange={(v) => set('price', v)}
            placeholder="1240000"
            inputMode="numeric"
            error={errors.price}
            className={textCls}
          />
          <div className="flex items-end pb-1">
            <p className="font-sans text-[12px] leading-relaxed text-muted">
              {f.price.trim() && /^\d+$/.test(f.price.replace(/,/g, '').trim())
                ? `≈ ₹${(Number(f.price.replace(/,/g, '')) / 100000).toFixed(2)} Lakh — shown as EXPECTED PRICE in your garage.`
                : 'Shown as EXPECTED PRICE until verified, then as listing price.'}
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="sell-fuel" className="font-mono text-[11px] tracking-[0.06em] text-muted">
              FUEL *
            </label>
            <div className="relative mt-1.5">
              <select
                id="sell-fuel"
                value={f.fuel}
                onChange={(e) => set('fuel', e.target.value)}
                aria-invalid={!!errors.fuel}
                className="w-full appearance-none border border-line bg-white px-[18px] py-4 pr-12 font-sans text-[16px] text-navy outline-none focus:border-teal"
              >
                <option value="">Select...</option>
                <option>Petrol</option>
                <option>Diesel</option>
                <option>CNG</option>
                <option>Electric</option>
                <option>Hybrid</option>
              </select>
              <ChevronDown
                size={16}
                aria-hidden
                className="pointer-events-none absolute right-[18px] top-1/2 -translate-y-1/2 text-[#1A1A1A]"
              />
            </div>
            <Err msg={errors.fuel} />
          </div>
          <div>
            <label htmlFor="sell-gear" className="font-mono text-[11px] tracking-[0.06em] text-muted">
              TRANSMISSION *
            </label>
            <div className="relative mt-1.5">
              <select
                id="sell-gear"
                value={f.transmission}
                onChange={(e) => set('transmission', e.target.value)}
                aria-invalid={!!errors.transmission}
                className="w-full appearance-none border border-line bg-white px-[18px] py-4 pr-12 font-sans text-[16px] text-navy outline-none focus:border-teal"
              >
                <option value="">Select...</option>
                <option>Manual</option>
                <option>Automatic</option>
                <option>AMT</option>
                <option>CVT</option>
              </select>
              <ChevronDown
                size={16}
                aria-hidden
                className="pointer-events-none absolute right-[18px] top-1/2 -translate-y-1/2 text-[#1A1A1A]"
              />
            </div>
            <Err msg={errors.transmission} />
          </div>
        </div>

        <div>
          <div className="flex items-baseline justify-between gap-3">
            <p className="font-mono text-[11px] tracking-[0.06em] text-muted" id="photos-label">
              PHOTOS *
            </p>
            <p className="font-mono text-[10px] tracking-[0.04em] text-[#9FB2C5]">
              UP TO 10&nbsp;&nbsp;•&nbsp;&nbsp;FIRST = COVER
            </p>
          </div>
          <div
            role="button"
            tabIndex={0}
            aria-labelledby="photos-label"
            onClick={() => fileRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click();
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              addFiles(e.dataTransfer.files);
            }}
            className={cn(
              'mt-1.5 flex flex-col items-center gap-3 border-[1.5px] border-dashed p-6 text-center',
              dragOver ? 'border-teal bg-teal-bg' : 'border-teal-dark bg-[#F2FAF9]'
            )}
          >
            <ImagePlus size={24} aria-hidden className="text-navy" />
            <p className="font-sans text-[14px] font-semibold text-navy">
              Drag photos here or
            </p>
            <span className="bg-navy px-5 py-[10px] font-sans text-[13px] font-bold text-white">
              Browse files
            </span>
            <p className="font-mono text-[10px] tracking-[0.02em] text-muted">
              JPG / PNG / WebP&nbsp;&nbsp;•&nbsp;&nbsp;max 5MB each&nbsp;&nbsp;•&nbsp;&nbsp;auto-compressed to WebP 1280px for 0-rupee storage
            </p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="sr-only"
            aria-label="Upload car photos"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <Err msg={errors.photos} />

          {photos.length > 0 && (
            <div className="mt-3">
              <div className="flex gap-3">
                <div
                  ref={stripRef}
                  onScroll={onStripScroll}
                  className="no-scrollbar flex w-full max-w-[408px] gap-3 overflow-x-auto"
                  role="list"
                  aria-label="Uploaded photos"
                >
                  {photos.map((p, i) => (
                    <div
                      key={p.id}
                      role="listitem"
                      className="relative h-24 w-32 shrink-0 overflow-hidden bg-off-white"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.url} alt={`Upload ${i + 1} — first photo is the cover`} className="h-full w-full object-cover" />
                      {i === 0 ? (
                        <span className="absolute left-2 top-2 bg-navy px-2 py-1 font-mono text-[8px] font-bold tracking-[0.06em] text-white">
                          COVER
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => removePhoto(p.id)}
                          aria-label={`Remove photo ${i + 1}`}
                          className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center bg-white font-sans text-[13px] font-bold leading-none text-navy hover:bg-off-white"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {left > 0 && (
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    aria-label={`Add more photos, ${left} of 10 left`}
                    className="flex h-24 w-32 shrink-0 flex-col items-center justify-center gap-1 border border-navy bg-navy hover:bg-navy-2"
                  >
                    <span className="font-sans text-[24px] font-extrabold leading-none text-white">
                      +{left}
                    </span>
                    <span className="font-mono text-[9px] tracking-[0.06em] text-teal-bright">
                      {left} OF 10 LEFT
                    </span>
                  </button>
                )}
              </div>
              <div className="mt-3 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => nudge(-1)}
                  aria-label="Scroll photos left"
                  className="flex h-7 w-7 shrink-0 items-center justify-center border border-line font-sans text-[14px] text-muted hover:border-navy hover:text-navy"
                >
                  ←
                </button>
                <button
                  type="button"
                  onClick={() => nudge(1)}
                  aria-label="Scroll photos right"
                  className="flex h-7 w-7 shrink-0 items-center justify-center bg-navy font-sans text-[14px] text-white hover:bg-navy-2"
                >
                  →
                </button>
                <div className="relative h-1 flex-1 bg-line" aria-hidden>
                  <span
                    className="absolute top-0 h-1 w-[120px] max-w-full bg-teal"
                    style={{ left: `calc(${scrollPct * 100}% - ${scrollPct * 120}px)` }}
                  />
                </div>
                <p className="shrink-0 font-mono text-[10px] text-muted" role="status">
                  {photos.length} / 10&nbsp;&nbsp;•&nbsp;&nbsp;SCROLL →
                </p>
              </div>
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-navy px-6 py-5 font-sans text-[16px] font-bold text-white hover:bg-navy-2 disabled:opacity-60"
        >
          {submitting ? 'Saving + uploading…' : editId ? 'Save changes  →' : 'Submit for review  →'}
        </button>
        {errors.submit && (
          <p role="alert" className="font-sans text-[13px] font-semibold text-[#DC2626]">
            {errors.submit}{' '}
            {errors.submit.toLowerCase().includes('sign in') && (
              <button
                type="button"
                onClick={() => openAuthModal({ mode: 'signin' })}
                className="underline hover:no-underline"
              >
                Go to Sign in →
              </button>
            )}
          </p>
        )}
        {recovery && (
          <div role="status" className="border border-teal-line bg-teal-bg p-4">
            <p className="font-mono text-[10px] tracking-[0.06em] text-teal-dark">
              {recovery.reason === 'already-exists' ? 'FILE ALREADY SUBMITTED' : 'FILE SAVED — PHOTOS PENDING'}
              {recovery.inspectionId ? ` • ${recovery.inspectionId}` : ''}
            </p>
            <p className="mt-1 font-sans text-[13px] text-navy">
              {recovery.reason === 'already-exists'
                ? 'No need to submit again — open your garage to continue.'
                : 'Your vehicle is saved. Add the pending photos from your garage.'}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  invalidateMyVehiclesCache();
                  router.replace('/my-listings');
                  router.refresh();
                }}
                className="bg-navy px-5 py-3 font-sans text-[13px] font-bold text-white hover:bg-navy-2"
              >
                Open My Listings →
              </button>
              <button
                type="button"
                onClick={() => {
                  invalidateMyVehiclesCache();
                  router.replace(`/sell-your-car?resume=${recovery.vehicleId}`);
                  router.refresh();
                }}
                className="border border-navy/30 px-5 py-3 font-sans text-[13px] font-bold text-navy"
              >
                Resume file →
              </button>
            </div>
          </div>
        )}
        <p className="-mt-2 font-sans text-[11px] leading-relaxed text-muted">
          No listing goes live without physical verification and approval.
        </p>
      </div>
    </form>
  );
}

function TextField({
  id,
  label,
  value,
  onChange,
  placeholder,
  error,
  className,
  inputMode,
  mono = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  error?: string;
  className: string;
  inputMode?: 'numeric' | 'text' | 'tel';
  mono?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="font-mono text-[11px] tracking-[0.06em] text-muted">
        {label}
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        aria-invalid={!!error}
        className={`${className} mt-1.5 ${mono ? 'font-mono' : ''}`}
      />
      <Err msg={error} />
    </div>
  );
}

function Err({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <p role="alert" className="mt-1 font-sans text-[12px] font-semibold text-[#DC2626]">
      {msg}
    </p>
  );
}

export function SellPageShell() {
  return (
    <Container className="grid gap-10 py-16 lg:grid-cols-[0.9fr_1.1fr]">
      <div>
        <p className="font-mono text-[11px] tracking-[0.06em] text-teal-dark">
          SELL&nbsp;&nbsp;•&nbsp;&nbsp;FILE FIRST, LISTING SECOND
        </p>
        <h1 className="mt-4 font-sans text-[40px] font-extrabold leading-[1.05] tracking-[-0.02em] text-navy md:text-[64px]">
          List once. Prove everything.
        </h1>
        <p className="mt-4 font-sans text-[17px] leading-relaxed text-[#5C5C5C]">
          Submit your vehicle. AutoFair reviews, verifies on-site, then publishes the
          dossier with your listing. Buyers arrive quoting your Inspection ID.
        </p>
        <ol className="mt-6 space-y-3">
          {[
            'Submit vehicle + documents',
            'On-site verification + record checks',
            'Approval → dossier goes public',
          ].map((t, i) => (
            <li key={t} className="flex gap-3 font-sans text-[18px] text-[#1A1A1A]">
              <span className="font-mono text-[14px] leading-[1.7] text-teal-dark">
                {String(i + 1).padStart(2, '0')}
              </span>
              {t}
            </li>
          ))}
        </ol>
      </div>
      <SellForm />
    </Container>
  );
}
