import Link from 'next/link';
import type { Car } from '@/types';
import { InspectionBreakdown } from '@/components/inspection/InspectionBreakdown';
import { verifiedInspection } from '@/lib/data/inspections';

function formatInspectedAt(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return null;
  }
}

export function TrustReport({ car }: { car: Car }) {
  const categories = car.sections?.length ? car.sections : verifiedInspection;
  const passed = categories.reduce((s, c) => s + c.passed, 0);
  const total = categories.reduce((s, c) => s + c.total, 0);
  const attention = categories.flatMap((c) => c.items).filter((i) => i.result === 'attention');
  const failed = categories.flatMap((c) => c.items).filter((i) => i.result === 'fail');
  const inspectedAt = formatInspectedAt(car.inspectedAt);
  const docsNote = car.docsNote ? car.docsNote : 'RC ✓\u00a0\u00a0Insurance ✓\u00a0\u00a0PUC ✓\u00a0\u00a0Service ✓';
  const accidentNote = car.accidentNote
    ? car.accidentNote
    : 'No major accidents disclosed. 1 minor repair invoiced.';

  return (
    <section aria-labelledby="trust-report" className="mt-8 bg-navy p-6 text-white md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-[11px] tracking-[0.06em] text-teal-bright">
          AUTOFAIR TRUST REPORT&nbsp;&nbsp;•&nbsp;&nbsp;{car.inspectionId}
        </p>
        <span className="border border-teal/60 px-2 py-1 font-mono text-[10px] text-teal-bright">
          ● VERIFIED{inspectedAt ? ` • ${inspectedAt.toUpperCase()}` : ''}
        </span>
      </div>
      <h2 id="trust-report" className="mt-3 font-sans text-[28px] font-extrabold md:text-[36px]">
        Trust report — {car.score.toFixed(1)} / 10
      </h2>
      <p className="mt-2 max-w-[600px] font-sans text-[14px] text-[#9FB2C5]">
        <>
          Verified onsite by AutoFair staff{inspectedAt ? ` on ${inspectedAt}` : ''}.
          Mechanical {car.condition.mechanical} · Exterior{' '}
          {car.condition.exterior} · Interior {car.condition.interior} · Tyres{' '}
          {car.condition.tyres}.
          {car.inspectorNote ? ` ${car.inspectorNote}` : ''}
        </>
      </p>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="bg-navy-2 p-5">
          <p className="font-mono text-[10.5px] text-[#9FB2C5]">ACCIDENT HISTORY</p>
          <p className="mt-2 font-sans text-[28px] font-extrabold text-teal">
            {car.verification.accidentHistory}
          </p>
          <p className="mt-2 font-sans text-[13px] text-[#D6E2EC]">
            {accidentNote}
          </p>
        </div>
        <div className="bg-white p-5 text-navy">
          <p className="font-mono text-[10.5px] text-muted">INSPECTION</p>
          <p className="mt-2 font-sans text-[28px] font-extrabold">{passed} / {total}</p>
          <p className="mt-2 font-sans text-[13px] font-semibold">
            {failed.length} critical · {attention.length} attention{attention.length ? ` — ${attention.slice(0, 2).map((a) => a.name.toLowerCase()).join(' + ')}` : ''}.
          </p>
        </div>
        <div className="bg-navy-2 p-5">
          <p className="font-mono text-[10.5px] text-[#9FB2C5]">DOCUMENTS</p>
          <p className="mt-2 font-sans text-[28px] font-extrabold text-amber">
            {car.verification.documents}
          </p>
          <p className="mt-2 font-mono text-[11px] text-[#D6E2EC]">
            {docsNote}
          </p>
        </div>
      </div>

      <div className="mt-6 bg-off-white p-5 text-navy md:p-6">
        <h3 className="font-sans text-[16px] font-extrabold">
          Inspection breakdown — verified
        </h3>
        <div className="mt-4">
          <InspectionBreakdown categories={categories} />
        </div>
        <p className="mt-4 font-mono text-[10px] text-muted">
          {`Verified${inspectedAt ? ` ${inspectedAt}` : ''} — ${passed}/${total} checks passed${failed.length ? `, ${failed.length} need action` : ''}.`}
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
