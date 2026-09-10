import Link from 'next/link';
import type { Car } from '@/types';
import { InspectionBreakdown } from '@/components/inspection/InspectionBreakdown';
import { sampleInspection } from '@/lib/data/inspections';

export function TrustReport({ car }: { car: Car }) {
  return (
    <section aria-labelledby="trust-report" className="mt-8 bg-navy p-6 text-white md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-[11px] tracking-[0.06em] text-teal-bright">
          AUTOFAIR TRUST REPORT&nbsp;&nbsp;•&nbsp;&nbsp;{car.inspectionId}
        </p>
        <span className="border border-amber/60 px-2 py-1 font-mono text-[10px] text-amber">
          ● SAMPLE
        </span>
      </div>
      <h2 id="trust-report" className="mt-3 font-sans text-[28px] font-extrabold md:text-[36px]">
        Trust report — {car.score.toFixed(1)} / 10
      </h2>
      <p className="mt-2 max-w-[600px] font-sans text-[14px] text-[#9FB2C5]">
        Sample inspection data for this prototype. Real files publish after physical
        verification. Mechanical {car.condition.mechanical} · Exterior{' '}
        {car.condition.exterior} · Interior {car.condition.interior} · Tyres{' '}
        {car.condition.tyres}.
      </p>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="bg-navy-2 p-5">
          <p className="font-mono text-[10.5px] text-[#9FB2C5]">ACCIDENT HISTORY</p>
          <p className="mt-2 font-sans text-[28px] font-extrabold text-teal">
            {car.verification.accidentHistory}
          </p>
          <p className="mt-2 font-sans text-[13px] text-[#D6E2EC]">
            No major accidents disclosed in sample. 1 minor repair invoiced.
          </p>
        </div>
        <div className="bg-white p-5 text-navy">
          <p className="font-mono text-[10.5px] text-muted">INSPECTION</p>
          <p className="mt-2 font-sans text-[28px] font-extrabold">82 / 82</p>
          <p className="mt-2 font-sans text-[13px] font-semibold">
            0 critical · 2 attention — tyres + exterior touch-up.
          </p>
        </div>
        <div className="bg-navy-2 p-5">
          <p className="font-mono text-[10.5px] text-[#9FB2C5]">DOCUMENTS</p>
          <p className="mt-2 font-sans text-[28px] font-extrabold text-amber">
            {car.verification.documents}
          </p>
          <p className="mt-2 font-mono text-[11px] text-[#D6E2EC]">
            RC ✓&nbsp;&nbsp;Insurance ✓&nbsp;&nbsp;PUC ✓&nbsp;&nbsp;Service ✓
          </p>
        </div>
      </div>

      <div className="mt-6 bg-off-white p-5 text-navy md:p-6">
        <h3 className="font-sans text-[16px] font-extrabold">Inspection breakdown — sample</h3>
        <div className="mt-4">
          <InspectionBreakdown categories={sampleInspection} />
        </div>
        <p className="mt-4 font-mono text-[10px] text-muted">
          Sample data. Real files include photos per check and reviewer timestamps.
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/contact"
          className="bg-teal px-6 py-3 text-center font-sans text-[14px] font-bold text-navy hover:bg-[#12a295]"
        >
          Contact seller — quote {car.inspectionId}
        </Link>
        <Link
          href="/inspection"
          className="border border-white/20 px-6 py-3 text-center font-sans text-[14px] font-semibold text-white hover:border-white"
        >
          How verification works
        </Link>
      </div>
    </section>
  );
}
