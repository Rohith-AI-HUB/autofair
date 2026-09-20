'use client';

import { useEffect, useMemo, useState } from 'react';
import { Container } from '@/components/shared/Container';
import { getSafeErrorMessage } from '@/lib/errors/db-error';
import {
  completeStaffVerification,
  fetchStaffAssignments,
  type StaffAssignment,
} from '@/lib/supabase/staff';
import { uploadVehiclePhotos } from '@/lib/supabase/storage';
import { addVehiclePhotoRows } from '@/lib/supabase/queries';
import { verifiedInspection } from '@/lib/data/inspections';

const RATING_FIELDS = [
  { key: 'exterior', label: 'Exterior /10' },
  { key: 'interior', label: 'Interior /10' },
  { key: 'mechanical', label: 'Mechanical /10' },
  { key: 'tyres', label: 'Tyres /10' },
] as const;

const CONDITION_OPTIONS = ['EXCELLENT', 'VERY GOOD', 'GOOD', 'AVERAGE', 'POOR'];
const ACCIDENT_OPTIONS = ['CLEAR', 'MINOR REPAIR', 'MAJOR ACCIDENT'];
const DOCS_OPTIONS = ['COMPLETE', '1 PENDING', '2+ PENDING'];

type SectionDraft = {
  id: string;
  title: string;
  items: { name: string; result: 'pass' | 'attention' | 'fail'; note: string }[];
};

function freshSections(): SectionDraft[] {
  return verifiedInspection.map((c) => ({
    id: c.id,
    title: c.title,
    items: c.items.map((i) => ({ name: i.name, result: i.result, note: '' })),
  }));
}

/**
 * Single staff workspace (MVP). Assigned cars -> onsite info -> inspection
 * (score/status/notes + configurable ratings + condition/accident/docs +
 * per-check breakdown) -> price -> photo upload -> Complete Verification
 * (backend owns VERIFIED transition + publishes the real Trust Report).
 */
export function StaffWorkspace() {
  const [rows, setRows] = useState<StaffAssignment[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [score, setScore] = useState('8.0');
  const [overall, setOverall] = useState<'pass' | 'attention' | 'fail'>('attention');
  const [notes, setNotes] = useState('');
  const [ratings, setRatings] = useState<Record<string, string>>({});
  const [condition, setCondition] = useState<Record<string, string>>({
    mechanical: 'VERY GOOD',
    exterior: 'GOOD',
    interior: 'VERY GOOD',
    tyres: 'GOOD',
  });
  const [accidentStatus, setAccidentStatus] = useState('CLEAR');
  const [accidentNote, setAccidentNote] = useState('');
  const [docsStatus, setDocsStatus] = useState('1 PENDING');
  const [docsNote, setDocsNote] = useState('');
  const [sections, setSections] = useState<SectionDraft[]>(() => freshSections());
  const [openSection, setOpenSection] = useState<string | null>('tyres');
  const [price, setPrice] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [tab, setTab] = useState<'pending' | 'completed'>('pending');

  useEffect(() => {
    fetchStaffAssignments()
      .then((r) => {
        setRows(r);
        const firstPending = r.find(
          (x) => !['verified', 'published', 'sold'].includes(x.vehicle.status) && x.vehicle.inspection_status !== 'Completed'
        );
        if (!selectedId) setSelectedId((firstPending ?? r[0])?.vehicle.id ?? null);
      })
      .catch((err: unknown) => setLoadError(getSafeErrorMessage(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pending = useMemo(
    () =>
      (rows ?? []).filter(
        (r) => !['verified', 'published', 'sold'].includes(r.vehicle.status) && r.vehicle.inspection_status !== 'Completed'
      ),
    [rows]
  );
  const completed = useMemo(
    () =>
      (rows ?? []).filter(
        (r) => ['verified', 'published', 'sold'].includes(r.vehicle.status) || r.vehicle.inspection_status === 'Completed'
      ),
    [rows]
  );
  const visible = tab === 'pending' ? pending : completed;

  const selected = rows?.find((r) => r.vehicle.id === selectedId) ?? null;
  const selectedIsCompleted = Boolean(
    selected &&
      (['verified', 'published', 'sold'].includes(selected.vehicle.status) ||
        selected.vehicle.inspection_status === 'Completed')
  );

  function setItemResult(secId: string, itemName: string, result: 'pass' | 'attention' | 'fail') {
    setSections((ss) =>
      ss.map((s) =>
        s.id === secId
          ? { ...s, items: s.items.map((i) => (i.name === itemName ? { ...i, result } : i)) }
          : s
      )
    );
  }

  function setItemNote(secId: string, itemName: string, note: string) {
    setSections((ss) =>
      ss.map((s) =>
        s.id === secId
          ? { ...s, items: s.items.map((i) => (i.name === itemName ? { ...i, note: note.slice(0, 300) } : i)) }
          : s
      )
    );
  }

  async function submit() {
    setFormError(null);
    setDone(null);
    if (!selected) return;
    const s = Number(score);
    const p = Number(String(price).replace(/,/g, ''));
    if (!Number.isFinite(s) || s < 0 || s > 10) {
      setFormError('Overall condition must be a number 0–10.');
      return;
    }
    if (!Number.isFinite(p) || p < 0) {
      setFormError('Enter the decided listing price (numbers only).');
      return;
    }
    setBusy(true);
    try {
      // Optional inspection photos reuse the existing 0-rupee pipeline.
      if (files.length) {
        const uploaded = await uploadVehiclePhotos(selected.vehicle.id, files);
        await addVehiclePhotoRows(selected.vehicle.id, uploaded);
      }
      const parsedRatings: Record<string, number | null> = {};
      for (const { key } of RATING_FIELDS) {
        const raw = ratings[key];
        if (raw == null || raw === '') continue;
        const n = Number(raw);
        parsedRatings[key] = Number.isFinite(n) ? Math.min(10, Math.max(0, n)) : null;
      }
      await completeStaffVerification({
        vehicleId: selected.vehicle.id,
        score: s,
        overallStatus: overall,
        notes,
        ratings: parsedRatings,
        price: Math.round(p),
        condition: {
          mechanical: condition.mechanical,
          exterior: condition.exterior,
          interior: condition.interior,
          tyres: condition.tyres,
        },
        accidentStatus,
        accidentNote,
        docsStatus,
        docsNote,
        sections: sections.map((sec) => ({
          title: sec.title,
          items: sec.items.map((i) => ({ name: i.name, result: i.result, note: i.note })),
        })),
      });
      setDone(`Verified. ${selected.vehicle.year} ${selected.vehicle.make} ${selected.vehicle.model} is now LIVE in /cars with its real Trust Report.`);
      // Move the file to Completed instead of dropping it, so the
      // Completed tab shows history without a refetch.
      setRows((rs) =>
        (rs ?? []).map((r) =>
          r.vehicle.id === selected.vehicle.id
            ? { ...r, vehicle: { ...r.vehicle, status: 'verified' as const, inspection_status: 'Completed' as const } }
            : r
        )
      );
      setSelectedId(null);
      setFiles([]);
      setSections(freshSections());
    } catch (err) {
      setFormError(getSafeErrorMessage(err, 'Could not complete verification. If the breakdown did not save, run migration 0011_real_trust_report.sql in Supabase SQL Editor, then try again.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Container className="pb-16 pt-12">
      <p className="font-mono text-[11px] tracking-[0.06em] text-teal-dark">
        STAFF&nbsp;&nbsp;•&nbsp;&nbsp;VERIFICATION WORKSPACE
      </p>
      <h1 className="mt-2 font-sans text-[32px] font-extrabold text-navy">Assigned cars.</h1>
      <p className="mt-2 max-w-[620px] font-sans text-[14px] text-muted">
        Inspect onsite, record ratings and price, upload inspection photos, then complete
        verification. Only verified cars appear in /cars — with the Trust Report you enter below.
      </p>

      {loadError && (
        <p role="alert" className="mt-4 border border-coral/50 bg-[#FDECEC] px-4 py-3 font-sans text-[13px] font-semibold text-[#9B2C2C]">
          {loadError}
        </p>
      )}

      {!rows ? (
        <p className="mt-6 font-mono text-[11px] text-muted" role="status">LOADING ASSIGNMENTS…</p>
      ) : (
        <>
          <div role="group" aria-label="Filter by verification status" className="mt-6 flex flex-wrap gap-0 bg-[#EFEAE3] p-1">
            {(
              [
                { key: 'pending', label: `Pending · ${pending.length}` },
                { key: 'completed', label: `Completed · ${completed.length}` },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                type="button"
                aria-pressed={tab === t.key}
                onClick={() => setTab(t.key)}
                className={
                  tab === t.key
                    ? 'bg-navy px-4 py-[10px] font-sans text-[13px] font-bold text-white'
                    : 'px-4 py-[10px] font-sans text-[13px] font-semibold text-navy hover:underline'
                }
              >
                {t.label}
              </button>
            ))}
          </div>

          {visible.length === 0 ? (
            <div className="mt-4 border border-line bg-white p-8">
              <p className="font-mono text-[11px] text-teal-dark">
                {tab === 'pending' ? 'NO PENDING WORK' : 'NOTHING COMPLETED YET'}
              </p>
              <p className="mt-2 font-sans text-[16px] font-bold text-navy">
                {tab === 'pending' ? 'Nothing assigned right now.' : 'Verified files will appear here.'}
              </p>
            </div>
          ) : (
        <div className="mt-4 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="flex flex-col gap-3">
            {visible.map((r) => {
              const isDone =
                ['verified', 'published', 'sold'].includes(r.vehicle.status) ||
                r.vehicle.inspection_status === 'Completed';
              return (
              <button
                key={r.vehicle.id}
                type="button"
                aria-pressed={selectedId === r.vehicle.id}
                onClick={() => {
                  setSelectedId(r.vehicle.id);
                  setDone(null);
                  setFormError(null);
                }}
                className={
                  selectedId === r.vehicle.id
                    ? 'border border-navy bg-white p-4 text-left shadow-[0_8px_30px_rgba(11,23,38,0.12)]'
                    : 'border border-line bg-white p-4 text-left hover:border-navy'
                }
              >
                <p className="font-sans text-[15px] font-extrabold text-navy">
                  {r.vehicle.year} {r.vehicle.make} {r.vehicle.model}
                </p>
                <p className="mt-1 font-mono text-[11px] text-muted">
                  {r.vehicle.reg_number} • {r.vehicle.location} • {r.vehicle.inspection_id}
                </p>
                <p className="mt-1 font-mono text-[10px] text-teal-dark">
                  {isDone
                    ? 'STATUS: VERIFIED ✓'
                    : r.vehicle.assigned_staff_id
                      ? 'STATUS: ASSIGNED'
                      : 'STATUS: UNASSIGNED — VERIFY TO CLAIM'}
                </p>
              </button>
              );
            })}
          </div>

          {selected && selectedIsCompleted ? (
            <div className="h-fit border border-teal-line bg-teal-bg p-6">
              <p className="font-mono text-[10px] tracking-[0.06em] text-teal-dark">VERIFIED ✓</p>
              <h2 className="mt-1 font-sans text-[20px] font-extrabold text-navy">
                {selected.vehicle.year} {selected.vehicle.make} {selected.vehicle.model}
              </h2>
              <p className="mt-1 font-sans text-[13px] text-muted">
                {selected.vehicle.location} • {selected.vehicle.km_driven} km • {selected.vehicle.fuel} •{' '}
                {selected.vehicle.transmission} • Reg {selected.vehicle.reg_number}
              </p>
              <p className="mt-3 font-mono text-[11px] text-teal-dark">{selected.vehicle.inspection_id}</p>
              {selected.listing?.slug ? (
                <a
                  href={`/cars/${selected.listing.slug}`}
                  className="mt-4 inline-block bg-navy px-5 py-3 font-sans text-[13px] font-bold text-white hover:bg-navy-2"
                >
                  Open live dossier →
                </a>
              ) : (
                <p className="mt-4 font-sans text-[13px] text-muted">This file is verified and live in /cars.</p>
              )}
            </div>
          ) : (
          selected && !selectedIsCompleted && (
            <div className="border border-line bg-white p-6">
              <p className="font-mono text-[10px] tracking-[0.06em] text-muted">ONSITE VISIT</p>
              <h2 className="mt-1 font-sans text-[20px] font-extrabold text-navy">
                {selected.vehicle.year} {selected.vehicle.make} {selected.vehicle.model}
              </h2>
              <p className="mt-1 font-sans text-[13px] text-muted">
                {selected.vehicle.location} • {selected.vehicle.km_driven} km • {selected.vehicle.fuel} •{' '}
                {selected.vehicle.transmission} • Reg {selected.vehicle.reg_number}
              </p>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="font-mono text-[10px] text-muted">OVERALL CONDITION /10 *</span>
                  <input
                    value={score}
                    onChange={(e) => setScore(e.target.value)}
                    inputMode="decimal"
                    className="mt-1.5 w-full border border-line bg-off-white px-4 py-3 font-sans text-[14px] outline-none focus:border-teal"
                  />
                </label>
                <label className="block">
                  <span className="font-mono text-[10px] text-muted">OVERALL RESULT *</span>
                  <select
                    value={overall}
                    onChange={(e) => setOverall(e.target.value as 'pass' | 'attention' | 'fail')}
                    className="mt-1.5 w-full border border-line bg-white px-4 py-3 font-sans text-[14px] outline-none focus:border-teal"
                  >
                    <option value="pass">pass</option>
                    <option value="attention">attention</option>
                    <option value="fail">fail</option>
                  </select>
                </label>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {RATING_FIELDS.map(({ key, label }) => (
                  <label key={key} className="block">
                    <span className="font-mono text-[10px] text-muted">{label}</span>
                    <input
                      value={ratings[key] ?? ''}
                      onChange={(e) => setRatings((r) => ({ ...r, [key]: e.target.value }))}
                      inputMode="decimal"
                      placeholder="Optional"
                      className="mt-1.5 w-full border border-line bg-off-white px-4 py-3 font-sans text-[14px] outline-none focus:border-teal"
                    />
                  </label>
                ))}
              </div>

              <div className="mt-4 border border-teal-line bg-teal-bg p-4">
                <p className="font-mono text-[10px] tracking-[0.06em] text-teal-dark">TRUST REPORT FIELDS — SHOWN TO BUYERS</p>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  {(['mechanical', 'exterior', 'interior', 'tyres'] as const).map((k) => (
                    <label key={k} className="block">
                      <span className="font-mono text-[10px] text-muted">{k.toUpperCase()} CONDITION</span>
                      <select
                        value={condition[k] ?? 'GOOD'}
                        onChange={(e) => setCondition((c) => ({ ...c, [k]: e.target.value }))}
                        className="mt-1.5 w-full border border-line bg-white px-4 py-3 font-sans text-[14px] outline-none focus:border-teal"
                      >
                        {CONDITION_OPTIONS.map((o) => (
                          <option key={o} value={o}>{o}</option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="font-mono text-[10px] text-muted">ACCIDENT HISTORY</span>
                    <select
                      value={accidentStatus}
                      onChange={(e) => setAccidentStatus(e.target.value)}
                      className="mt-1.5 w-full border border-line bg-white px-4 py-3 font-sans text-[14px] outline-none focus:border-teal"
                    >
                      {ACCIDENT_OPTIONS.map((o) => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="font-mono text-[10px] text-muted">DOCUMENTS</span>
                    <select
                      value={docsStatus}
                      onChange={(e) => setDocsStatus(e.target.value)}
                      className="mt-1.5 w-full border border-line bg-white px-4 py-3 font-sans text-[14px] outline-none focus:border-teal"
                    >
                      {DOCS_OPTIONS.map((o) => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="mt-4 block">
                  <span className="font-mono text-[10px] text-muted">ACCIDENT NOTE (BUYER-VISIBLE)</span>
                  <input
                    value={accidentNote}
                    onChange={(e) => setAccidentNote(e.target.value.slice(0, 500))}
                    placeholder="e.g. Rear bumper repainted 2019, invoice on file."
                    className="mt-1.5 w-full border border-line bg-white px-4 py-3 font-sans text-[14px] outline-none focus:border-teal"
                  />
                </label>
                <label className="mt-4 block">
                  <span className="font-mono text-[10px] text-muted">DOCUMENTS NOTE (BUYER-VISIBLE)</span>
                  <input
                    value={docsNote}
                    onChange={(e) => setDocsNote(e.target.value.slice(0, 500))}
                    placeholder="e.g. RC ✓ Insurance ✓ PUC ✓ Service ✓"
                    className="mt-1.5 w-full border border-line bg-white px-4 py-3 font-sans text-[14px] outline-none focus:border-teal"
                  />
                </label>
              </div>

              <div className="mt-4 border border-line bg-off-white p-4">
                <p className="font-mono text-[10px] tracking-[0.06em] text-teal-dark">INSPECTION BREAKDOWN — PER CHECK</p>
                <p className="mt-1 font-sans text-[12px] text-muted">Set each check to pass / attention / fail and add your note. This becomes the buyer-facing breakdown.</p>
                <div className="mt-3 flex flex-col gap-2">
                  {sections.map((sec) => {
                    const passed = sec.items.filter((i) => i.result === 'pass').length;
                    const open = openSection === sec.id;
                    return (
                      <div key={sec.id} className="border border-line bg-white">
                        <button
                          type="button"
                          aria-expanded={open}
                          onClick={() => setOpenSection((v) => (v === sec.id ? null : sec.id))}
                          className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-off-white"
                        >
                          <span className="font-sans text-[13px] font-extrabold text-navy">{sec.title}</span>
                          <span className="font-mono text-[11px] text-teal-dark">{passed} / {sec.items.length} {open ? '▾' : '›'}</span>
                        </button>
                        {open && (
                          <div className="space-y-3 border-t border-line px-4 py-3">
                            {sec.items.map((item) => (
                              <div key={item.name} className="grid gap-2 border-b border-line/60 pb-3 last:border-0 last:pb-0 sm:grid-cols-[1fr_130px]">
                                <div>
                                  <p className="font-sans text-[13px] font-semibold text-navy">{item.name}</p>
                                  <input
                                    value={item.note}
                                    onChange={(e) => setItemNote(sec.id, item.name, e.target.value)}
                                    placeholder="Your note for the buyer…"
                                    className="mt-1 w-full border border-line bg-off-white px-3 py-2 font-sans text-[12px] outline-none focus:border-teal"
                                  />
                                </div>
                                <label className="block">
                                  <span className="font-mono text-[9px] text-muted">RESULT</span>
                                  <select
                                    value={item.result}
                                    onChange={(e) => setItemResult(sec.id, item.name, e.target.value as 'pass' | 'attention' | 'fail')}
                                    className="mt-1 w-full border border-line bg-white px-3 py-2 font-sans text-[12px] outline-none focus:border-teal"
                                  >
                                    <option value="pass">✓ pass</option>
                                    <option value="attention">⚠ attention</option>
                                    <option value="fail">✕ fail</option>
                                  </select>
                                </label>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <label className="mt-4 block">
                <span className="font-mono text-[10px] text-muted">INSPECTION NOTES</span>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  placeholder="Exterior, interior, engine, tyres, electrical, accident history, documents, mileage…"
                  className="mt-1.5 w-full border border-line bg-off-white px-4 py-3 font-sans text-[14px] outline-none focus:border-teal"
                />
              </label>

              <label className="mt-4 block">
                <span className="font-mono text-[10px] text-muted">DECIDED LISTING PRICE (₹) *</span>
                <input
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  inputMode="numeric"
                  placeholder="e.g. 850000"
                  className="mt-1.5 w-full border border-line bg-off-white px-4 py-3 font-sans text-[14px] outline-none focus:border-teal"
                />
              </label>

              <label className="mt-4 block">
                <span className="font-mono text-[10px] text-muted">INSPECTION PHOTOS (OPTIONAL)</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
                  className="mt-1.5 w-full font-sans text-[13px]"
                />
              </label>

              {formError && (
                <p role="alert" className="mt-4 border border-coral/50 bg-[#FDECEC] px-4 py-3 font-sans text-[13px] font-semibold text-[#9B2C2C]">
                  {formError}
                </p>
              )}
              {done && (
                <p role="status" className="mt-4 border border-teal-line bg-teal-bg px-4 py-3 font-sans text-[13px] font-semibold text-teal-dark">
                  {done}
                </p>
              )}

              <button
                type="button"
                disabled={busy}
                onClick={submit}
                className="mt-5 w-full bg-navy px-6 py-4 font-sans text-[15px] font-bold text-white hover:bg-navy-2 disabled:opacity-60"
              >
                {busy ? 'Verifying…' : 'Complete Verification  →'}
              </button>
              <p className="mt-2 font-mono text-[10px] text-muted">
                Backend sets status VERIFIED + publishes LIVE. Customers cannot self-verify.
              </p>
            </div>
          ))}
        </div>
          )}
        </>
      )}
    </Container>
  );
}
