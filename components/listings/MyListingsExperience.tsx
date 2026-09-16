'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Container } from '@/components/shared/Container';
import { listings as seed, type Listing, type ListingStatus } from '@/lib/data/listings';
import { getSessionFromAnyStore, isSupabaseConfigured } from '@/lib/supabase/client';
import { fetchMyVehicles, deleteMyVehicle, type MyVehicleRow } from '@/lib/supabase/queries';
import { getSafeErrorMessage } from '@/lib/errors/db-error';
import { openAuthModal } from '@/lib/auth/modal';
import { cn } from '@/lib/utils';

function formatLakh(n: number): string {
  return `₹${(n / 100000).toFixed(2)} Lakh`;
}

function mapRow(r: MyVehicleRow): Listing {
  const v = r.vehicle;
  const l = r.listing;
  const status: ListingStatus =
    l?.status === 'LIVE' ? 'LIVE' : v.status === 'draft' ? 'DRAFT' : v.status === 'submitted' || v.status === 'in_review' || v.status === 'verified' || l?.status === 'IN_REVIEW' ? 'IN REVIEW' : 'DRAFT';
  const title = `${v.year} ${v.make} ${v.model}${v.variant ? ` ${v.variant}` : ''}`;
  const price = formatLakh(l?.price ?? v.price_expected);
  const viewsNum = l?.views_count ?? 0;
  return {
    id: v.id,
    slug: l?.slug ?? v.id,
    title,
    price,
    priceLabel: status === 'LIVE' ? `VIEW INQUIRIES (${r.inquiriesCount}) →` : status === 'IN REVIEW' ? 'WHAT HAPPENS NEXT?' : 'EXPECTED PRICE',
    spec: `${v.year}  •  ${v.fuel.toUpperCase()}  •  ${Math.round(v.km_driven / 1000)}K KM  •  ${v.reg_number}`,
    inspectionId: v.inspection_id,
    status,
    meta:
      status === 'LIVE'
        ? `✓ Verified  •  ${viewsNum} views  •  ${r.inquiriesCount} inquiries`
        : status === 'IN REVIEW'
          ? `◷ Pending Verification  •  ${v.inspection_id}`
          : `○ Draft  •  ${v.inspection_id}`,
    metaTone: status === 'LIVE' ? 'teal' : 'muted',
    views: `${viewsNum} views`,
    viewsNum,
    inquiries: r.inquiriesCount,
    image: r.coverUrl ?? '/icon.svg',
    primaryAction: status === 'LIVE' ? 'Open file →' : status === 'IN REVIEW' ? 'Preview →' : 'Resume draft →',
    secondaryAction: status === 'DRAFT' ? 'Delete' : 'Edit',
    inquiriesSample: [],
  };
}

type Filter = 'ALL' | ListingStatus;

const FILTERS: { key: Filter; label: (n: number) => string }[] = [
  { key: 'ALL', label: (n) => `All · ${n}` },
  { key: 'LIVE', label: (n) => `Live · ${n}` },
  { key: 'IN REVIEW', label: (n) => `In review · ${n}` },
  { key: 'DRAFT', label: (n) => `Draft · ${n}` },
];

function formatCompact(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n);
}

function StatusPill({ status }: { status: ListingStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-[10px] py-[5px] font-mono text-[10px] font-bold tracking-[0.04em]',
        status === 'LIVE' && 'bg-teal text-white',
        status === 'IN REVIEW' && 'bg-amber text-navy',
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
  const [loadingRows, setLoadingRows] = useState(true);
  const [usingSample, setUsingSample] = useState(false);
  const [filter, setFilter] = useState<Filter>('ALL');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [openInquiries, setOpenInquiries] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    getSessionFromAnyStore().then(({ session }) => {
      if (session?.user?.email) {
        setAuth('authed');
        setEmail(session.user.email);
        // Real garage: own vehicles only. Never show seed demo to signed-in users.
        if (!isSupabaseConfigured()) {
          setRows(seed);
          setUsingSample(true);
          setLoadingRows(false);
          return;
        }
        fetchMyVehicles().then((mine) => {
          if (mine && mine.length) {
            setRows(mine.map(mapRow));
            setUsingSample(false);
          } else if (mine) {
            setRows([]);
            setUsingSample(false);
          } else {
            setRows(seed);
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

  const visible = rows.filter((r) => filter === 'ALL' || r.status === filter);

  function remove(id: string) {
    const target = rows.find((r) => r.id === id);
    setDeleteError(null);
    // Optimistic removal; restore + show a safe message if the DB delete fails.
    // DbOperationError already logs the raw error server-side via logDbError.
    if (target && !usingSample) {
      setRows((rs) => rs.filter((r) => r.id !== id));
      setConfirmDelete(null);
      deleteMyVehicle(id).catch((err: unknown) => {
        setRows((rs) => (rs.some((r) => r.id === id) ? rs : [...rs, target]));
        setDeleteError(getSafeErrorMessage(err, 'Could not delete this vehicle. Please try again later.'));
      });
      return;
    }
    setRows((rs) => rs.filter((r) => r.id !== id));
    setConfirmDelete(null);
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
        <p className="font-mono text-[11px] tracking-[0.06em] text-teal-dark">
          GARAGE&nbsp;&nbsp;•&nbsp;&nbsp;MY LISTINGS
        </p>
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
        <p className="shrink-0 font-mono text-[10px] tracking-[0.06em] text-teal-bright lg:w-[200px]">
          GARAGE SUMMARY&nbsp;&nbsp;•&nbsp;&nbsp;{email.toUpperCase()}
        </p>
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
        <p className="font-mono text-[10px] tracking-[0.04em] text-muted">
          SORT: NEWEST ↓{usingSample ? '  •  SAMPLE DATA' : '  •  LIVE'}
        </p>
      </div>

      {deleteError && (
        <p role="alert" className="mt-4 border border-coral/50 bg-[#FDECEC] px-4 py-3 font-sans text-[13px] font-semibold text-[#9B2C2C]">
          {deleteError}
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
          {visible.map((car) => (
            <article
              key={car.id}
              className="flex flex-col gap-5 border border-line bg-white p-5 sm:flex-row"
            >
              <div className="relative h-40 w-full shrink-0 overflow-hidden bg-off-white sm:h-[96px] sm:w-[132px]">
                <Image
                  src={car.image}
                  alt={`${car.title} — sample photo`}
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
                    onClick={() => setOpenInquiries((v) => (v === car.id ? null : car.id))}
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
                    <Link
                      href="/sell-your-car"
                      className="border border-navy px-[18px] py-[10px] font-sans text-[13px] font-semibold text-navy hover:bg-off-white"
                    >
                      {car.secondaryAction}
                    </Link>
                  )}
                  <Link
                    href={
                      car.status === 'DRAFT' ? '/sell-your-car' : `/cars/${car.slug}`
                    }
                    className="bg-navy px-[18px] py-[10px] font-sans text-[13px] font-bold text-white hover:bg-navy-2"
                  >
                    {car.primaryAction}
                  </Link>
                </div>
              </div>
              {openInquiries === car.id && car.inquiriesSample.length > 0 && (
                <div className="border border-teal-line bg-teal-bg p-4 sm:basis-full">
                  <p className="font-mono text-[10px] tracking-[0.06em] text-teal-dark">
                    SAMPLE INQUIRIES
                  </p>
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
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </Container>
  );
}
