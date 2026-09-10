'use client';

import { useState } from 'react';
import { Container } from '@/components/shared/Container';

type Fields = {
  reg: string;
  make: string;
  model: string;
  year: string;
  fuel: string;
  transmission: string;
  km: string;
  location: string;
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
};

export function SellForm() {
  const [f, setF] = useState<Fields>(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof Fields, string>>>({});
  const [done, setDone] = useState(false);

  function set<K extends keyof Fields>(k: K, v: string) {
    setF((p) => ({ ...p, [k]: v }));
  }

  function validate() {
    const e: Partial<Record<keyof Fields, string>> = {};
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
    return e;
  }

  if (done) {
    return (
      <div className="border border-teal-line bg-white p-8" role="status">
        <p className="font-mono text-[11px] text-teal-dark">FILE CAPTURED — FRONTEND ONLY</p>
        <h2 className="mt-2 font-sans text-[24px] font-extrabold text-navy">
          Your vehicle details have been captured.
        </h2>
        <p className="mt-2 max-w-[520px] font-sans text-[14px] leading-relaxed text-muted">
          AutoFair will review the information ({f.reg.toUpperCase()} · {f.make}{' '}
          {f.model}). Nothing was sent to a backend — this is a frontend prototype.
          Next step in production: physical verification and document review.
        </p>
        <button
          type="button"
          onClick={() => {
            setDone(false);
            setF(initial);
          }}
          className="mt-5 border border-navy/30 px-5 py-3 font-sans text-[13px] font-bold text-navy"
        >
          Submit another vehicle
        </button>
      </div>
    );
  }

  const inputCls =
    'w-full border border-line bg-off-white px-4 py-3 font-sans text-[14px] outline-none focus:border-teal';

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const v = validate();
        setErrors(v);
        if (Object.keys(v).length === 0) setDone(true);
      }}
      className="border border-line bg-white p-6 md:p-8"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="sell-reg" className="font-mono text-[10px] text-muted">
            REGISTRATION NUMBER *
          </label>
          <input
            id="sell-reg"
            value={f.reg}
            onChange={(e) => set('reg', e.target.value)}
            placeholder="KA-05-MN-4218"
            className={`${inputCls} mt-1.5 font-mono`}
            aria-invalid={!!errors.reg}
          />
          <Err msg={errors.reg} />
        </div>
        <div>
          <label htmlFor="sell-location" className="font-mono text-[10px] text-muted">
            CITY / LOCATION *
          </label>
          <input
            id="sell-location"
            value={f.location}
            onChange={(e) => set('location', e.target.value)}
            placeholder="Bangalore"
            className={`${inputCls} mt-1.5`}
            aria-invalid={!!errors.location}
          />
          <Err msg={errors.location} />
        </div>
        <div>
          <label htmlFor="sell-make" className="font-mono text-[10px] text-muted">
            MAKE *
          </label>
          <input
            id="sell-make"
            value={f.make}
            onChange={(e) => set('make', e.target.value)}
            placeholder="Hyundai"
            className={`${inputCls} mt-1.5`}
            aria-invalid={!!errors.make}
          />
          <Err msg={errors.make} />
        </div>
        <div>
          <label htmlFor="sell-model" className="font-mono text-[10px] text-muted">
            MODEL *
          </label>
          <input
            id="sell-model"
            value={f.model}
            onChange={(e) => set('model', e.target.value)}
            placeholder="Creta SX"
            className={`${inputCls} mt-1.5`}
            aria-invalid={!!errors.model}
          />
          <Err msg={errors.model} />
        </div>
        <div>
          <label htmlFor="sell-year" className="font-mono text-[10px] text-muted">
            YEAR *
          </label>
          <input
            id="sell-year"
            value={f.year}
            onChange={(e) => set('year', e.target.value)}
            placeholder="2022"
            inputMode="numeric"
            className={`${inputCls} mt-1.5`}
            aria-invalid={!!errors.year}
          />
          <Err msg={errors.year} />
        </div>
        <div>
          <label htmlFor="sell-km" className="font-mono text-[10px] text-muted">
            KILOMETRES *
          </label>
          <input
            id="sell-km"
            value={f.km}
            onChange={(e) => set('km', e.target.value)}
            placeholder="42180"
            inputMode="numeric"
            className={`${inputCls} mt-1.5`}
            aria-invalid={!!errors.km}
          />
          <Err msg={errors.km} />
        </div>
        <div>
          <label htmlFor="sell-fuel" className="font-mono text-[10px] text-muted">
            FUEL *
          </label>
          <select
            id="sell-fuel"
            value={f.fuel}
            onChange={(e) => set('fuel', e.target.value)}
            className={`${inputCls} mt-1.5`}
            aria-invalid={!!errors.fuel}
          >
            <option value="">Select…</option>
            <option>Petrol</option>
            <option>Diesel</option>
            <option>CNG</option>
            <option>Electric</option>
            <option>Hybrid</option>
          </select>
          <Err msg={errors.fuel} />
        </div>
        <div>
          <label htmlFor="sell-gear" className="font-mono text-[10px] text-muted">
            TRANSMISSION *
          </label>
          <select
            id="sell-gear"
            value={f.transmission}
            onChange={(e) => set('transmission', e.target.value)}
            className={`${inputCls} mt-1.5`}
            aria-invalid={!!errors.transmission}
          >
            <option value="">Select…</option>
            <option>Manual</option>
            <option>Automatic</option>
            <option>AMT</option>
            <option>CVT</option>
          </select>
          <Err msg={errors.transmission} />
        </div>
      </div>
      <button
        type="submit"
        className="mt-6 w-full bg-navy px-6 py-4 font-sans text-[14px] font-bold text-white hover:bg-navy-2"
      >
        Submit for review&nbsp;&nbsp;→
      </button>
      <p className="mt-3 font-mono text-[10px] leading-relaxed text-muted">
        Frontend-only. No listing goes live without physical verification and approval.
      </p>
    </form>
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
    <Container className="grid gap-10 py-12 lg:grid-cols-[0.9fr_1.1fr]">
      <div>
        <p className="font-mono text-[11px] tracking-[0.06em] text-teal-dark">
          SELL&nbsp;&nbsp;•&nbsp;&nbsp;FILE FIRST, LISTING SECOND
        </p>
        <h1 className="mt-4 font-sans text-[38px] font-extrabold leading-[1.05] text-navy md:text-[48px]">
          List once. Prove everything.
        </h1>
        <p className="mt-4 font-sans text-[15px] leading-relaxed text-muted">
          Submit your vehicle. AutoFair reviews, verifies on-site, then publishes the
          dossier with your listing. Buyers arrive quoting your Inspection ID.
        </p>
        <ol className="mt-6 space-y-3">
          {[
            'Submit vehicle + documents',
            'On-site verification + record checks',
            'Approval → dossier goes public',
          ].map((t, i) => (
            <li key={t} className="flex gap-3 font-sans text-[14px] text-navy">
              <span className="font-mono text-[12px] text-teal-dark">
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
