import Link from 'next/link';
import { PROTOCOL, verifiedInspection } from '@/lib/data/inspections';
import { Container } from '@/components/shared/Container';

export function TrustReportPreview() {
  return (
    <section aria-labelledby="lab-heading" className="bg-navy text-white">
      <Container className="py-16">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="font-mono text-[11px] tracking-[0.06em] text-teal-bright">
            03 — LAB SHEET&nbsp;&nbsp;•&nbsp;&nbsp;SAMPLE FILE, STRUCTURE ONLY
          </p>
          <div className="flex items-center gap-4">
            <p className="font-mono text-[11px] text-[#9FB2C5]">
              {PROTOCOL.total} CHECKS&nbsp;&nbsp;•&nbsp;&nbsp;{PROTOCOL.sections} SECTIONS
            </p>
            <span className="border border-teal/60 px-2 py-1 font-mono text-[10px] tracking-[0.08em] text-teal-bright">
              ● VERIFIED
            </span>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-[720px]">
            <h2
              id="lab-heading"
              className="font-sans text-[34px] font-extrabold leading-[1.05] tracking-[-0.02em] md:text-[44px]"
            >
              Before you buy, see what we found.
            </h2>
            <p className="mt-3 max-w-[560px] font-sans text-[15px] leading-relaxed text-[#9FB2C5]">
              The shape of every AutoFair file — condition, checks and documents on one sheet,
              with the wording our verifiers use. No showroom talk.
            </p>
          </div>
          <div className="flex items-center gap-4 border border-white/10 bg-navy-2 px-6 py-5">
            <p className="font-sans text-[44px] font-extrabold leading-none">8.7</p>
            <div>
              <p className="font-mono text-[11px] tracking-[0.06em] text-teal-bright">
                / 10 OVERALL
              </p>
              <p className="mt-1 font-sans text-[12px] text-[#D6E2EC]">
                Mechanical GOOD · Interior VERY GOOD
              </p>
            </div>
          </div>
        </div>

        <div className="my-8 h-px bg-white/10" aria-hidden />

        <div className="grid gap-4 lg:grid-cols-3">
          {/* Accident */}
          <div className="border border-white/10 bg-navy-2 p-6">
            <div className="flex items-center justify-between">
              <p className="font-mono text-[10.5px] tracking-[0.08em] text-[#9FB2C5]">
                ACCIDENT HISTORY
              </p>
              <span className="bg-teal/15 px-2 py-1 font-sans text-[11px] font-extrabold text-teal">
                ● CLEAR
              </span>
            </div>
            <p className="mt-4 font-sans text-[42px] font-extrabold leading-none text-teal">
              CLEAR
            </p>
            <p className="mt-3 font-sans text-[13px] leading-relaxed text-[#D6E2EC]">
              No major accidents. 1 minor rear-bumper repair, invoiced.
            </p>
            <ul className="mt-4 space-y-2 border-t border-white/10 pt-4">
              <li className="flex gap-3 font-mono text-[10.5px] text-[#9FB2C5]">
                <span aria-hidden className="h-4 w-[6px] shrink-0 bg-teal" />
                2019 — Rear bumper repaint · invoice on file
              </li>
              <li className="flex gap-3 font-mono text-[10.5px] text-[#9FB2C5]">
                <span aria-hidden className="h-4 w-[6px] shrink-0 bg-teal" />
                2021–26 — Zero structural / airbag flags
              </li>
            </ul>
          </div>

          {/* Inspection */}
          <div className="bg-white p-6 text-navy">
            <div className="flex items-center justify-between">
              <p className="font-mono text-[10.5px] tracking-[0.08em] text-muted">
                INSPECTION
              </p>
              <span className="bg-navy px-2 py-1 font-mono text-[10.5px] text-white">
                {PROTOCOL.passed} / {PROTOCOL.total} DONE
              </span>
            </div>
            <p className="mt-4 font-sans text-[42px] font-extrabold leading-none">
              {PROTOCOL.passed} / {PROTOCOL.total}
            </p>
            <div className="mt-3 h-2 w-full bg-[#E8ECEA]" aria-hidden>
              <div className="h-2 bg-teal" style={{ width: `${Math.round((PROTOCOL.passed / PROTOCOL.total) * 100)}%` }} />
            </div>
            <p className="mt-3 font-sans text-[13px] font-semibold">
              {`0 critical · ${PROTOCOL.flagged.length} attention — ${PROTOCOL.flagged.join(' + ').toLowerCase()}.`}
            </p>
            <p className="mt-2 font-mono text-[10.5px] text-muted">
              {PROTOCOL.sections} SECTIONS · {PROTOCOL.total} CHECKS · NOTE ON EVERY ITEM
            </p>
          </div>

          {/* Docs */}
          <div className="border border-white/10 bg-navy-2 p-6">
            <div className="flex items-center justify-between">
              <p className="font-mono text-[10.5px] tracking-[0.08em] text-[#9FB2C5]">
                DOCUMENTS
              </p>
              <span className="bg-amber px-2 py-1 font-sans text-[11px] font-extrabold text-navy">
                ✓ VERIFIED
              </span>
            </div>
            <p className="mt-4 font-sans text-[34px] font-extrabold leading-none text-amber">
              VERIFIED
            </p>
            <p className="mt-4 font-mono text-[11px] text-[#D6E2EC]">
              RC ✓&nbsp;&nbsp;&nbsp;Insurance ✓&nbsp;&nbsp;&nbsp;PUC ✓
            </p>
            <p className="mt-1 font-mono text-[11px] text-[#D6E2EC]">
              Service ✓&nbsp;&nbsp;&nbsp;Challans ✓&nbsp;&nbsp;&nbsp;HSRP ✓
            </p>
            <p className="mt-3 font-mono text-[10.5px] text-[#7A8DA0]">
              Every real file carries its own review date and notes
            </p>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-3 border-t border-white/10 pt-6 md:flex-row md:items-center md:justify-between">
          <p className="font-mono text-[10px] tracking-[0.04em] text-[#5C738A]">
            {verifiedInspection.map((c) => `${c.total}`).join(' — ')} ¦ {PROTOCOL.total} CHECKS ACROSS {PROTOCOL.sections} SECTIONS
          </p>
          <Link
            href="/cars"
            className="font-sans text-[13px] font-bold text-teal-bright hover:underline"
          >
            Open a live verified dossier&nbsp;&nbsp;→
          </Link>
        </div>
      </Container>
    </section>
  );
}
