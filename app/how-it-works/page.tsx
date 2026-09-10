import type { Metadata } from 'next';
import Link from 'next/link';
import { Container } from '@/components/shared/Container';

export const metadata: Metadata = {
  title: 'How It Works | AutoFair',
  description:
    'Buyers read the file before they call. Sellers publish the file before they list. Verification sits in the middle.',
};

const buyerSteps = [
  { n: '01', t: 'Discover', d: 'Shortlist by city, budget and body type. Every thumb shows verification state.' },
  { n: '02', t: 'Compare', d: 'Price against km, owners and condition score — not photos alone.' },
  { n: '03', t: 'Review verification', d: 'Open the dossier: 82 checks, documents, accident disclosure.' },
  { n: '04', t: 'Contact seller', d: 'Only after the file reads clean. Quote the Inspection ID.' },
  { n: '05', t: 'Inspect / test drive', d: 'Verify the car matches the file on road and ramp.' },
  { n: '06', t: 'Purchase', d: 'Paperwork with the same IDs you reviewed. No surprises.' },
];

const sellerSteps = [
  { n: '01', t: 'Submit vehicle', d: 'Reg number, make, model, km and photos.' },
  { n: '02', t: 'Provide documents', d: 'RC, insurance, service and challan set.' },
  { n: '03', t: 'Verification', d: '82 checks on-site + record cross-checks.' },
  { n: '04', t: 'Approval', d: 'Quality gate. Fixes or disclosures added.' },
  { n: '05', t: 'Publish listing', d: 'Dossier goes public with the car.' },
  { n: '06', t: 'Connect with buyers', d: 'Buyers arrive quoting your Inspection ID.' },
];

export default function HowItWorksPage() {
  return (
    <>
      <section className="bg-off-white">
        <Container className="pt-12">
          <p className="font-mono text-[11px] tracking-[0.06em] text-teal-dark">
            HOW IT WORKS&nbsp;&nbsp;•&nbsp;&nbsp;TWO PATHS, ONE DOSSIER
          </p>
          <h1 className="mt-4 font-sans text-[38px] font-extrabold tracking-[-0.02em] text-navy md:text-[56px]">
            From listing to verified.
          </h1>
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <p className="font-sans text-[16px] leading-relaxed text-ink-soft">
              Buyers read the file before they call. Sellers publish the file before
              they list. Verification sits in the middle — not as a badge, as a gate.
            </p>
            <div className="flex gap-2">
              <a
                href="#buy"
                className="bg-navy px-5 py-2.5 font-sans text-[13.5px] font-bold text-white"
              >
                I&apos;m buying
              </a>
              <a
                href="#sell"
                className="border border-navy/30 px-5 py-2.5 font-sans text-[13.5px] font-semibold text-navy"
              >
                I&apos;m selling
              </a>
            </div>
          </div>

          <div id="buy" className="mt-10 scroll-mt-32 pb-12">
            <p className="font-mono text-[11px] tracking-[0.06em] text-teal-dark">
              BUY — 01 / READ BEFORE YOU RING
            </p>
            <div className="mt-4 flex flex-col gap-3">
              {buyerSteps.map((s) => (
                <div
                  key={s.n}
                  className="flex items-center justify-between gap-4 border border-line bg-white px-5 py-4"
                >
                  <div className="flex items-baseline gap-4">
                    <span className="font-mono text-[13px] text-muted">{s.n}</span>
                    <div>
                      <h2 className="font-sans text-[17px] font-extrabold text-navy">{s.t}</h2>
                      <p className="mt-1 font-sans text-[13.5px] text-muted">{s.d}</p>
                    </div>
                  </div>
                  <span aria-hidden className="font-sans text-[18px] text-navy">
                    →
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Container>
      </section>

      <section id="sell" className="scroll-mt-20 bg-navy text-white">
        <Container className="py-14">
          <p className="font-mono text-[11px] tracking-[0.06em] text-teal-bright">
            SELL — 02 / PUBLISH THE FILE FIRST
          </p>
          <h2 className="mt-3 font-sans text-[30px] font-extrabold md:text-[36px]">
            List once. Prove everything.
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sellerSteps.map((s) => (
              <div key={s.n} className="border border-white/10 bg-navy-2 p-5">
                <p className="font-mono text-[12px] text-teal-bright">{s.n}</p>
                <h3 className="mt-2 font-sans text-[14.5px] font-bold">{s.t}</h3>
                <p className="mt-1 font-sans text-[12.5px] text-[#9FB2C5]">{s.d}</p>
              </div>
            ))}
          </div>
          <div className="mt-8">
            <Link
              href="/sell-your-car"
              className="inline-block bg-teal px-6 py-3 font-sans text-[14px] font-bold text-navy hover:bg-[#12a295]"
            >
              Start — Sell Your Car&nbsp;&nbsp;→
            </Link>
          </div>
        </Container>
      </section>
    </>
  );
}
