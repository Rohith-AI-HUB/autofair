import type { Metadata } from 'next';
import Image from 'next/image';
import { Container } from '@/components/shared/Container';
import { ContactForm } from '@/components/contact/ContactForm';
import { CONTACT_EMAIL, CONTACT_PHONE, CONTACT_PHONE_E164, FOUNDER } from '@/lib/seo';
import { founderJsonLd, jsonLd } from '@/lib/seo-jsonld';

export const metadata: Metadata = {
  title: 'About | AutoFair',
  description:
    'Used-car buying should not feel like detective work. AutoFair publishes the inspection file before you call the seller. Email, phone and the enquiry form are on this page.',
  alternates: { canonical: '/about' },
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
    t: 'Verified means verified',
    d: 'Every file publishes only after physical checks.',
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

      <section id="founder" className="scroll-mt-20 bg-white">
        <Container className="py-14">
          <p className="font-mono text-[11px] tracking-[0.06em] text-teal-dark">
            WHO RUNS AUTOFAIR
          </p>
          <div className="mt-6 grid items-start gap-8 md:grid-cols-[164px_1fr]">
            <div className="relative h-[164px] w-[164px] overflow-hidden bg-navy">
              <Image
                src="/founder-keerthivanth.jpg"
                alt={`${FOUNDER.name}, founder of AutoFair`}
                fill
                sizes="164px"
                className="object-cover"
              />
            </div>
            <div>
              <h2 className="font-sans text-[28px] font-extrabold leading-tight text-navy md:text-[34px]">
                {FOUNDER.name}
              </h2>
              <p className="mt-1 font-mono text-[11px] tracking-[0.06em] text-muted">
                {FOUNDER.role.toUpperCase()}
              </p>
              <dl className="mt-5 grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className="font-mono text-[10.5px] text-muted">STUDIED</dt>
                  <dd className="mt-1 font-sans text-[14px] font-semibold text-navy">
                    {FOUNDER.degree}
                  </dd>
                </div>
                <div>
                  <dt className="font-mono text-[10.5px] text-muted">COLLEGE · YEAR</dt>
                  <dd className="mt-1 font-sans text-[14px] font-semibold text-navy">
                    {FOUNDER.college}, {FOUNDER.year}
                  </dd>
                </div>
                <div>
                  <dt className="font-mono text-[10.5px] text-muted">EMAIL</dt>
                  <dd className="mt-1 font-sans text-[14px] font-semibold">
                    <a className="break-all text-navy hover:underline" href={`mailto:${FOUNDER.email}`}>
                      {FOUNDER.email}
                    </a>
                  </dd>
                </div>
                <div>
                  <dt className="font-mono text-[10.5px] text-muted">PHONE</dt>
                  <dd className="mt-1 font-sans text-[14px] font-semibold">
                    <a className="text-navy hover:underline" href={`tel:${CONTACT_PHONE_E164}`}>
                      {FOUNDER.phone}
                    </a>
                  </dd>
                </div>
              </dl>
            </div>
          </div>
          <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(founderJsonLd())} />
        </Container>
      </section>

      {/* Merged from the old /contact page, which now 301s to this anchor. */}
      <section id="contact" className="scroll-mt-20 bg-off-white">
        <Container className="grid gap-10 py-14 lg:grid-cols-[1fr_1fr]">
          <div>
            <p className="font-mono text-[11px] tracking-[0.06em] text-teal-dark">
              CONTACT&nbsp;&nbsp;•&nbsp;&nbsp;REPLIES IN 1 BUSINESS DAY
            </p>
            <h2 className="mt-4 font-sans text-[32px] font-extrabold leading-[1.05] text-navy md:text-[42px]">
              Talk to a human about a car file.
            </h2>
            <p className="mt-4 max-w-[480px] font-sans text-[15px] leading-relaxed text-muted">
              Questions on an inspection ID, a document check or listing approval — send
              the file number and we&apos;ll pull the dossier.
            </p>
            <dl className="mt-9 grid gap-4 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3 max-w-[900px]">
              {[
                ['Email', CONTACT_EMAIL],
                ['Phone · 10–7 IST', CONTACT_PHONE],
                ['Yard by appointment', 'CV Raman Nagar,\nBangalore'],
              ].map(([k, v]) => (
                <div key={k} className="min-w-0 border border-line bg-white p-4">
                  <dt className="font-mono text-[10.5px] text-muted">{k.toUpperCase()}</dt>
                  <dd className="mt-1 break-words whitespace-pre-line font-sans text-[12px] font-bold leading-relaxed text-navy sm:text-[13px]">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
          <ContactForm />
        </Container>
      </section>
    </>
  );
}
