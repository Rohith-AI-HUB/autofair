import type { Metadata } from 'next';
import { Container } from '@/components/shared/Container';
import { InspectionBreakdown } from '@/components/inspection/InspectionBreakdown';
import { PROTOCOL, verifiedInspection } from '@/lib/data/inspections';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Inspection Method | AutoFair',
  description:
    `How AutoFair verifies used cars — the same ${PROTOCOL.total} checks across ` +
    `${PROTOCOL.sections} sections on every file, plus document review and honest disclosure.`,
  alternates: { canonical: '/inspection' },
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
            Every AutoFair listing carries the same dossier structure — {PROTOCOL.total} checks
            filed under {verifiedInspection.length} sections, plus documents and history. The
            sample below shows that structure with the wording our verifiers use. Files publish
            only after physical verification. Live files are at <Link href="/cars" className="font-semibold text-navy hover:underline">/cars</Link>.
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
            Every listing records the same {PROTOCOL.total} checks. Where one needs attention it is
            written into the file with a note. We publish the record, not a guarantee.
          </p>
        </Container>
      </section>

      <section className="bg-off-white">
        <Container className="grid gap-6 py-12 lg:grid-cols-[360px_1fr]">
          <aside className="h-fit bg-navy p-6 text-white">
            <p className="font-mono text-[10.5px] text-teal-bright">SAMPLE FILE&nbsp;&nbsp;•&nbsp;&nbsp;STRUCTURE, NOT A CAR</p>
            <p className="mt-2 font-sans text-[36px] font-extrabold">{PROTOCOL.total} CHECKS</p>
            <p className="mt-2 font-mono text-[11px] text-[#9FB2C5]">
              {PROTOCOL.sections} SECTIONS&nbsp;&nbsp;•&nbsp;&nbsp;{PROTOCOL.passed} / {PROTOCOL.total} RECORDED
            </p>
            <p className="mt-3 font-sans text-[13px] text-[#D6E2EC]">
              {`0 critical · ${PROTOCOL.flagged.length} attention — ${PROTOCOL.flagged.join(' + ').toLowerCase()}.`}
            </p>
            <Link
              href="/cars"
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
