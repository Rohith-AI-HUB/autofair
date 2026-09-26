'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { cars as seedCars } from '@/lib/data/cars';
import type { Car } from '@/types';
import { fetchLiveCars } from '@/lib/supabase/queries';
import { CarCard } from '@/components/cars/CarCard';
import { Container } from '@/components/shared/Container';
import { cn } from '@/lib/utils';

type SortKey = 'newest' | 'price-asc' | 'price-desc' | 'km-asc' | 'score-desc';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'newest', label: 'Newest first' },
  { key: 'price-asc', label: 'Price: low → high' },
  { key: 'price-desc', label: 'Price: high → low' },
  { key: 'km-asc', label: 'Lowest km' },
  { key: 'score-desc', label: 'Highest score' },
];

const baseMakes = ['All', 'Hyundai', 'Maruti', 'Honda', 'Tata', 'Kia'];
const fuels = ['All', 'Petrol', 'Diesel', 'CNG', 'Electric', 'Hybrid'];
const transmissions = ['All', 'Manual', 'Automatic', 'AMT', 'CVT'];
const baseCities = ['All', ...Array.from(new Set(seedCars.map((c) => c.location)))];
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
  // Hydration-safe: first render (server + client) always uses seed. Live cache
  // + saved city load in effects so back-navigation still feels instant
  // without SSR text mismatch (6 vs 7 files).
  const [liveCars, setLiveCars] = useState<Car[] | null>(null);
  // Dedupe guard: one card per vehicle id even if live + cache layers overlap
  // or slugs collide. Keyed by id, never slug.
  const cars = useMemo(() => {
    const pool = liveCars ?? seedCars;
    const seen = new Set<string>();
    return pool.filter((c) => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });
  }, [liveCars]);
  const makes = useMemo(() => {
    // Dedupe case-insensitively: "Kia" (seed) + "KIA" (user typed) must be one pill.
    const seen = new Map<string, string>();
    for (const m of [...baseMakes.slice(1), ...cars.map((c) => c.make)]) {
      const k = m.trim().toLowerCase();
      if (!seen.has(k)) seen.set(k, m.trim());
    }
    return ['All', ...seen.values()];
  }, [cars]);
  const cities = useMemo(() => {
    const seen = new Map<string, string>();
    for (const m of [...baseCities.slice(1), ...cars.map((c) => c.location)]) {
      const k = m.trim().toLowerCase();
      if (k && !seen.has(k)) seen.set(k, m.trim());
    }
    return ['All', ...seen.values()];
  }, [cars]);
  const [query, setQuery] = useState('');
  const [make, setMake] = useState('All');
  const [fuel, setFuel] = useState('All');
  const [gear, setGear] = useState('All');
  const [city, setCity] = useState('All');

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('autofair-city');
      if (saved) setCity(saved);
    } catch {
      /* storage unavailable */
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem('autofair-city', city);
    } catch {
      /* storage unavailable */
    }
  }, [city]);

  useEffect(() => {
    let cancelled = false;
    fetchLiveCars().then((rows) => {
      if (cancelled) return;
      if (rows && rows.length) {
        setLiveCars(rows);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const [priceIdx, setPriceIdx] = useState(0);
  const [yearIdx, setYearIdx] = useState(0);
  const [sort, setSort] = useState<SortKey>('newest');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const band = priceBands[priceIdx];
    const yb = yearBands[yearIdx];
    let list = cars.filter((c) => {
      if (make !== 'All' && c.make.trim().toLowerCase() !== make.trim().toLowerCase()) return false;
      if (fuel !== 'All' && c.fuel !== fuel) return false;
      if (gear !== 'All' && c.transmission !== gear) return false;
      if (city !== 'All' && c.location.trim().toLowerCase() !== city.trim().toLowerCase()) return false;
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
  }, [cars, query, make, fuel, gear, city, priceIdx, yearIdx, sort]);

  const filterBar = (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border border-line bg-white p-5">
      <FilterDropdown label="Make" options={makes} value={make} onChange={setMake} />
      <FilterDropdown label="Fuel" options={fuels} value={fuel} onChange={setFuel} />
      <FilterDropdown label="Transmission" options={transmissions} value={gear} onChange={setGear} />
      <FilterDropdown label="City" options={cities} value={city} onChange={setCity} />
      <FilterDropdown
        label="Price"
        options={priceBands.map((p) => p.label)}
        value={priceBands[priceIdx].label}
        defaultLabel={priceBands[0].label}
        onChange={(l) => setPriceIdx(Math.max(0, priceBands.findIndex((p) => p.label === l)))}
      />
      <FilterDropdown
        label="Year"
        options={yearBands.map((y) => y.label)}
        value={yearBands[yearIdx].label}
        defaultLabel={yearBands[0].label}
        onChange={(l) => setYearIdx(Math.max(0, yearBands.findIndex((y) => y.label === l)))}
      />
      <button
        type="button"
        onClick={() => {
          setMake('All');
          setFuel('All');
          setGear('All');
          setCity('All');
          setPriceIdx(0);
          setYearIdx(0);
        }}
        className="shrink-0 whitespace-nowrap border border-navy/30 bg-white px-5 py-2 font-sans text-[12.5px] font-bold text-navy hover:border-navy"
      >
        Reset
      </button>
    </div>
  );

  return (
    <Container className="pb-16 pt-10">
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
          <FilterDropdown
            label="Sort"
            options={SORT_OPTIONS.map((o) => o.label)}
            value={SORT_OPTIONS.find((o) => o.key === sort)!.label}
            defaultLabel={SORT_OPTIONS[0].label}
            onChange={(l) => setSort(SORT_OPTIONS.find((o) => o.label === l)!.key)}
            rootClassName="shrink-0"
          />
        </div>
      </div>

      {filterBar}

      <div className="mt-8">
        <div>
          <p className="font-mono text-[11px] text-muted" role="status" aria-live="polite">
            {filtered.length} FILE{filtered.length === 1 ? '' : 'S'} — VERIFIED LISTINGS
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
                  setCity('All');
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

function FilterDropdown({
  label,
  options,
  value,
  onChange,
  defaultLabel = 'All',
  rootClassName,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
  defaultLabel?: string;
  rootClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const isDefault = value === defaultLabel;
  const listId = `filter-list-${label.toLowerCase()}`;

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className={cn('relative shrink-0', rootClassName)}>
      <div
        className={cn(
          'flex h-full w-full items-center gap-2 whitespace-nowrap border bg-white px-3.5 py-2',
          open ? 'border-teal' : isDefault ? 'border-line' : 'border-navy'
        )}
      >
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          onClick={() => setOpen((v) => !v)}
          className="flex flex-1 items-center justify-between gap-3 font-sans text-[12.5px]"
        >
          <span className="border-r border-navy/20 pr-2.5 font-mono text-[10px] tracking-[0.08em] text-muted">
            {label.toUpperCase()}
          </span>
          <span className="flex items-center gap-1.5">
            <span className={cn('font-bold', isDefault ? 'text-navy' : 'text-teal-dark')}>{value}</span>
            <ChevronDown size={14} className={cn('text-muted transition-transform', open && 'rotate-180')} aria-hidden />
          </span>
        </button>
        {!isDefault && (
          <button
            type="button"
            aria-label={`Clear ${label} filter`}
            onClick={() => onChange(defaultLabel)}
            className="text-muted hover:text-navy"
          >
            <X size={13} />
          </button>
        )}
      </div>
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={`${label} filter options`}
          className="absolute left-0 top-[calc(100%+8px)] z-30 max-h-72 w-52 overflow-y-auto border border-line bg-white py-1 shadow-[0_8px_24px_rgba(11,27,46,0.14)]"
        >
          {options.map((opt) => {
            const selected = opt === value;
            return (
              <li key={opt} role="option" aria-selected={selected}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(opt);
                    setOpen(false);
                  }}
                  className={cn(
                    'flex w-full items-center justify-between px-4 py-2.5 text-left font-sans text-[13px]',
                    selected ? 'font-bold text-teal-dark' : 'font-semibold text-navy hover:bg-off-white'
                  )}
                >
                  {opt}
                  {selected && <Check size={14} aria-hidden />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
