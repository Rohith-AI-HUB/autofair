import type { Metadata } from 'next';
import { Container } from '@/components/shared/Container';
import { InspectionBreakdown } from '@/components/inspection/InspectionBreakdown';
import { verifiedInspection } from '@/lib/data/inspections';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Inspection Method | AutoFair',
  description:
    'How AutoFair verifies used cars — on-site checks, document review and honest disclosure. Every file verified.',
};

const steps = [
  { n: '01', t: 'On-site checks', d: 'Exterior, interior, mechanical, electrical and road behaviour recorded with notes and photos.' },
  { n: '02', t: 'Document review', d: 'RC, insurance, PUC, service history, challans and HSRP reviewed as a set.' },
  { n: '03', t: 'History disclosure', d: 'Accidents, repaints and repairs stated with invoices where available. Attention flags are normal.' },
  { n: '04', t: 'Approval gate', d: 'Files with critical safety issues do not list. Others list with disclosures visible.' },
];

export default function InspectionPage() {
  return (
    <>
      <section className="bg-off-white">
        <Container className="pt-12">
          <p className="font-mono text-[11px] tracking-[0.06em] text-teal-dark">
            INSPECTION&nbsp;&nbsp;•&nbsp;&nbsp;METHOD, NOT MARKETING
          </p>
          <h1 className="mt-4 max-w-[720px] font-sans text-[38px] font-extrabold leading-[1.05] text-navy md:text-[52px]">
            The file before the phone call.
          </h1>
          <p className="mt-4 max-w-[620px] font-sans text-[15px] leading-relaxed text-muted">
            Every AutoFair listing carries the same dossier structure — checks,
            documents and history. Below is a verified report (AF-2026-008421).
            Files publish only after physical verification.
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {steps.map((s) => (
              <div key={s.n} className="border border-line bg-white p-5">
                <p className="font-mono text-[12px] text-teal-dark">{s.n}</p>
                <h2 className="mt-2 font-sans text-[15px] font-extrabold text-navy">{s.t}</h2>
                <p className="mt-2 font-sans text-[13px] leading-relaxed text-muted">{s.d}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 font-mono text-[10px] text-muted">
            We do not claim fixed point-counts or guarantees unless shown in the file.
            What you see in the dossier is what was checked.
          </p>
        </Container>
      </section>

      <section className="bg-off-white">
        <Container className="grid gap-6 py-12 lg:grid-cols-[360px_1fr]">
          <aside className="h-fit bg-navy p-6 text-white">
            <p className="font-mono text-[10.5px] text-teal-bright">VERIFIED REPORT</p>
            <p className="mt-2 font-sans text-[36px] font-extrabold">8.7 / 10</p>
            <p className="mt-2 font-mono text-[11px] text-[#9FB2C5]">
              AF-2026-008421&nbsp;&nbsp;•&nbsp;&nbsp;82 / 82 DONE
            </p>
            <p className="mt-3 font-sans text-[13px] text-[#D6E2EC]">
              0 critical · 2 attention — tyres + exterior touch-up.
            </p>
            <Link
              href="/cars/2022-hyundai-creta-sx"
              className="mt-5 block bg-teal px-5 py-3 text-center font-sans text-[14px] font-bold text-navy"
            >
              Open verified dossier&nbsp;&nbsp;→
            </Link>
          </aside>
          <div>
            <InspectionBreakdown categories={verifiedInspection} />
          </div>
        </Container>
      </section>
    </>
  );
}
