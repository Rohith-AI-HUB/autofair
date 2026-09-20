import Link from 'next/link';
import { Container } from '@/components/shared/Container';
import { InspectionBreakdown } from '@/components/inspection/InspectionBreakdown';
import { verifiedInspection } from '@/lib/data/inspections';

export function DossierPreview() {
  return (
    <section aria-labelledby="dossier-heading" className="bg-off-white">
      <Container className="py-16">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-[700px]">
            <div className="flex flex-wrap items-center gap-3">
              <p className="font-mono text-[11px] tracking-[0.06em] text-teal-dark">
                04 — FULL DOSSIER&nbsp;&nbsp;•&nbsp;&nbsp;AF-2026-008421
              </p>
              <span className="border border-teal/60 px-2 py-[2px] font-mono text-[10px] text-teal-dark">
                VERIFIED
              </span>
            </div>
            <h2
              id="dossier-heading"
              className="mt-3 font-sans text-[30px] font-extrabold leading-[1.08] tracking-[-0.02em] text-navy md:text-[38px]"
            >
              See the inspection, not just the car.
            </h2>
            <p className="mt-2 max-w-[560px] font-sans text-[14px] leading-relaxed text-muted">
              Eight systems. Every check with result, note and photo in the full file.
              Preview below is verified data.
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 lg:items-end">
            <p className="font-mono text-[12px] text-navy">OVERALL&nbsp;&nbsp;8.7 / 10</p>
            <Link
              href="/cars/2022-hyundai-creta-sx"
              className="font-sans text-[14px] font-bold text-navy hover:underline"
            >
              Open full dossier&nbsp;&nbsp;→
            </Link>
          </div>
        </div>

        <div className="mt-8 grid gap-5 lg:grid-cols-[360px_1fr]">
          <aside className="h-fit bg-navy p-6 text-white">
            <p className="font-mono text-[10.5px] tracking-[0.08em] text-teal-bright">
              CONDITION SUMMARY
            </p>
            <p className="mt-2 font-sans text-[42px] font-extrabold leading-none">8.7 / 10</p>
            <dl className="mt-5 space-y-3 border-t border-white/10 pt-5">
              {[
                ['Mechanical', 'GOOD', 'text-teal'],
                ['Exterior', 'GOOD', 'text-teal'],
                ['Interior', 'VERY GOOD', 'text-teal'],
                ['Tyres', 'ATTENTION', 'text-amber'],
              ].map(([k, v, cls]) => (
                <div key={k} className="flex items-center justify-between">
                  <dt className="font-sans text-[13px] text-[#D6E2EC]">{k}</dt>
                  <dd className={`font-sans text-[11.5px] font-extrabold ${cls}`}>{v}</dd>
                </div>
              ))}
            </dl>
            <Link
              href="/cars/2022-hyundai-creta-sx"
              className="mt-6 block bg-teal px-5 py-3 text-center font-sans text-[14px] font-bold text-navy hover:bg-[#12a295]"
            >
              Open verified dossier&nbsp;&nbsp;→
            </Link>
            <p className="mt-3 font-mono text-[10px] leading-relaxed text-[#5C738A]">
              Verified data. Files publish after physical verification.
            </p>
          </aside>

          <div>
            <InspectionBreakdown categories={verifiedInspection} />
          </div>
        </div>
      </Container>
    </section>
  );
}
