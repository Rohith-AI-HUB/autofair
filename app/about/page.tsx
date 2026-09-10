import type { Metadata } from 'next';
import { Container } from '@/components/shared/Container';

export const metadata: Metadata = {
  title: 'About | AutoFair',
  description:
    'Used-car buying should not feel like detective work. AutoFair publishes the inspection file before you call the seller.',
};

const principles = [
  {
    t: 'Transparent information',
    d: 'Every listing shows checks, documents and disclosures upfront.',
  },
  {
    t: 'Visible verification',
    d: 'Teal means passed. Amber means attention. Nothing hidden.',
  },
  {
    t: 'Honest disclosure',
    d: 'Accidents, repairs and pending paperwork are stated.',
  },
  {
    t: 'Safer listings',
    d: '5-step approval before any car goes public.',
  },
];

const rules = [
  {
    n: '01',
    t: 'Sample means sample',
    d: 'Demos are labelled. Real files publish only after physical checks.',
  },
  {
    n: '02',
    t: 'No inflated claims',
    d: "We don't claim biggest, fastest or most trusted — only visible.",
  },
  {
    n: '03',
    t: 'Attention is normal',
    d: "A 7/8 or amber flag isn't failure. It's information.",
  },
];

export default function AboutPage() {
  return (
    <>
      <section className="bg-off-white">
        <Container className="pb-12 pt-12">
          <p className="font-mono text-[11px] tracking-[0.06em] text-teal-dark">
            ABOUT&nbsp;&nbsp;•&nbsp;&nbsp;WHY AUTOFAIR EXISTS
          </p>
          <h1 className="mt-4 max-w-[760px] font-sans text-[38px] font-extrabold leading-[1.05] tracking-[-0.02em] text-navy md:text-[56px]">
            Used-car buying should not feel like detective work.
          </h1>
          <div className="mt-4 h-[5px] w-14 bg-amber" aria-hidden />
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <p className="font-sans text-[16px] leading-relaxed text-ink-soft">
              AutoFair publishes the inspection file before you call the seller —
              condition, documents and history, in one dossier.
            </p>
            <p className="font-sans text-[14px] leading-relaxed text-muted">
              No instant-price promises. No largest-platform claims. Just visible
              verification so you don&apos;t waste trips on cars with hidden pasts.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {principles.map((p) => (
              <div key={p.t} className="border border-line bg-white p-5">
                <h2 className="font-sans text-[15px] font-extrabold text-navy">{p.t}</h2>
                <p className="mt-2 font-sans text-[13px] leading-relaxed text-muted">{p.d}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <section className="bg-navy text-white">
        <Container className="py-14">
          <p className="font-mono text-[11px] tracking-[0.06em] text-teal-bright">
            HOW WE STAY HONEST&nbsp;&nbsp;•&nbsp;&nbsp;OPERATING RULES
          </p>
          <h2 className="mt-3 font-sans text-[30px] font-extrabold md:text-[36px]">
            Informed buyers make fair deals.
          </h2>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {rules.map((r) => (
              <div key={r.n} className="border-t border-white/10 pt-5">
                <p className="font-mono text-[12px] text-amber">{r.n}</p>
                <h3 className="mt-2 font-sans text-[16px] font-bold">{r.t}</h3>
                <p className="mt-2 font-sans text-[13px] leading-relaxed text-[#9FB2C5]">
                  {r.d}
                </p>
              </div>
            ))}
          </div>
        </Container>
      </section>
    </>
  );
}
