'use client';

import { useMemo, useState } from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { cars } from '@/lib/data/cars';
import { CarCard } from '@/components/cars/CarCard';
import { Container } from '@/components/shared/Container';

type SortKey = 'newest' | 'price-asc' | 'price-desc' | 'km-asc' | 'score-desc';

const makes = ['All', 'Hyundai', 'Maruti', 'Honda', 'Tata', 'Kia'];
const fuels = ['All', 'Petrol', 'Diesel'];
const transmissions = ['All', 'Manual', 'Automatic', 'AMT'];
const priceBands = [
  { label: 'All prices', min: 0, max: Infinity },
  { label: 'Under ₹8L', min: 0, max: 800000 },
  { label: '₹8–11L', min: 800000, max: 1100000 },
  { label: 'Above ₹11L', min: 1100000, max: Infinity },
];
const yearBands = [
  { label: 'All years', min: 0 },
  { label: '2021+', min: 2021 },
  { label: '2022+', min: 2022 },
];

export function CarsExplorer() {
  const [query, setQuery] = useState('');
  const [make, setMake] = useState('All');
  const [fuel, setFuel] = useState('All');
  const [gear, setGear] = useState('All');
  const [priceIdx, setPriceIdx] = useState(0);
  const [yearIdx, setYearIdx] = useState(0);
  const [sort, setSort] = useState<SortKey>('newest');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const band = priceBands[priceIdx];
    const yb = yearBands[yearIdx];
    let list = cars.filter((c) => {
      if (make !== 'All' && c.make !== make) return false;
      if (fuel !== 'All' && c.fuel !== fuel) return false;
      if (gear !== 'All' && c.transmission !== gear) return false;
      if (c.price < band.min || c.price > band.max) return false;
      if (c.year < yb.min) return false;
      if (q) {
        const hay = `${c.year} ${c.make} ${c.model} ${c.variant} ${c.location} ${c.inspectionId}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    switch (sort) {
      case 'price-asc':
        list = [...list].sort((a, b) => a.price - b.price);
        break;
      case 'price-desc':
        list = [...list].sort((a, b) => b.price - a.price);
        break;
      case 'km-asc':
        list = [...list].sort((a, b) => a.mileageKm - b.mileageKm);
        break;
      case 'score-desc':
        list = [...list].sort((a, b) => b.score - a.score);
        break;
      default:
        list = [...list].sort((a, b) => b.year - a.year);
    }
    return list;
  }, [query, make, fuel, gear, priceIdx, yearIdx, sort]);

  const filterPanel = (
    <div className="flex flex-col gap-5">
      <FilterGroup label="Make">
        <div className="flex flex-wrap gap-2">
          {makes.map((m) => (
            <FilterPill key={m} active={make === m} onClick={() => setMake(m)}>
              {m}
            </FilterPill>
          ))}
        </div>
      </FilterGroup>
      <FilterGroup label="Fuel">
        <div className="flex flex-wrap gap-2">
          {fuels.map((f) => (
            <FilterPill key={f} active={fuel === f} onClick={() => setFuel(f)}>
              {f}
            </FilterPill>
          ))}
        </div>
      </FilterGroup>
      <FilterGroup label="Transmission">
        <div className="flex flex-wrap gap-2">
          {transmissions.map((t) => (
            <FilterPill key={t} active={gear === t} onClick={() => setGear(t)}>
              {t}
            </FilterPill>
          ))}
        </div>
      </FilterGroup>
      <FilterGroup label="Price">
        <div className="flex flex-wrap gap-2">
          {priceBands.map((p, i) => (
            <FilterPill key={p.label} active={priceIdx === i} onClick={() => setPriceIdx(i)}>
              {p.label}
            </FilterPill>
          ))}
        </div>
      </FilterGroup>
      <FilterGroup label="Year">
        <div className="flex flex-wrap gap-2">
          {yearBands.map((y, i) => (
            <FilterPill key={y.label} active={yearIdx === i} onClick={() => setYearIdx(i)}>
              {y.label}
            </FilterPill>
          ))}
        </div>
      </FilterGroup>
    </div>
  );

  return (
    <Container className="pb-16 pt-10">
      <p className="font-mono text-[11px] tracking-[0.06em] text-teal-dark">
        INDEX&nbsp;&nbsp;/&nbsp;&nbsp;ALL DOSSIERS&nbsp;&nbsp;•&nbsp;&nbsp;VERIFICATION UPFRONT
      </p>
      <h1 className="mt-3 font-sans text-[36px] font-extrabold tracking-[-0.02em] text-navy md:text-[52px]">
        Browse verified used cars.
      </h1>
      <p className="mt-2 max-w-[600px] font-sans text-[15px] text-muted">
        A ledger, not a carousel. Search, filter and sort — every file shows checks before
        you contact the seller.
      </p>

      <div className="mt-8 flex flex-col gap-3 md:flex-row md:items-center">
        <label className="flex flex-1 items-center gap-3 border border-line bg-white px-4 py-3">
          <Search size={18} className="shrink-0 text-muted" aria-hidden />
          <span className="sr-only">Search vehicles</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search make, model, location, inspection ID…"
            className="w-full bg-transparent font-sans text-[14px] text-navy outline-none placeholder:text-[#999]"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="text-muted hover:text-navy"
            >
              <X size={16} />
            </button>
          )}
        </label>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
            className="inline-flex items-center gap-2 border border-navy/30 px-5 py-3 font-sans text-[13px] font-bold text-navy lg:hidden"
          >
            <SlidersHorizontal size={16} />
            Filters
          </button>
          <label className="inline-flex items-center gap-2 border border-line bg-white px-4 py-3">
            <span className="font-mono text-[11px] text-muted">SORT</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="bg-transparent font-sans text-[13px] font-semibold text-navy outline-none"
              aria-label="Sort vehicles"
            >
              <option value="newest">Newest first</option>
              <option value="price-asc">Price: low → high</option>
              <option value="price-desc">Price: high → low</option>
              <option value="km-asc">Lowest km</option>
              <option value="score-desc">Highest score</option>
            </select>
          </label>
        </div>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[280px_1fr]">
        <aside className="hidden lg:block">
          <div className="sticky top-32 border border-line bg-white p-5">{filterPanel}</div>
        </aside>
        {filtersOpen && (
          <div className="border border-line bg-white p-5 lg:hidden">{filterPanel}</div>
        )}
        <div>
          <p className="font-mono text-[11px] text-muted" role="status" aria-live="polite">
            {filtered.length} FILE{filtered.length === 1 ? '' : 'S'} — SAMPLE DATA
          </p>
          {filtered.length === 0 ? (
            <div className="mt-4 border border-line bg-white p-10 text-center">
              <p className="font-sans text-[18px] font-bold text-navy">No files match.</p>
              <p className="mt-2 font-sans text-[14px] text-muted">
                Try clearing search or widening filters.
              </p>
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setMake('All');
                  setFuel('All');
                  setGear('All');
                  setPriceIdx(0);
                  setYearIdx(0);
                }}
                className="mt-4 bg-navy px-6 py-3 font-sans text-[13px] font-bold text-white"
              >
                Reset all
              </button>
            </div>
          ) : (
            <div className="mt-4 flex flex-col gap-[18px]">
              {filtered.map((car, i) => (
                <CarCard key={car.id} car={car} index={i} />
              ))}
            </div>
          )}
        </div>
      </div>
    </Container>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-mono text-[10.5px] tracking-[0.08em] text-muted">{label.toUpperCase()}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        active
          ? 'bg-navy px-3 py-2 font-sans text-[12.5px] font-bold text-white'
          : 'border border-line bg-off-white px-3 py-2 font-sans text-[12.5px] font-semibold text-navy hover:border-navy'
      }
    >
      {children}
    </button>
  );
}
