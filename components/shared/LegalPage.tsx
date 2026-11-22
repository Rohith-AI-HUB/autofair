import { Container } from '@/components/shared/Container';
import { jsonLd } from '@/lib/seo-jsonld';
import { CONTACT_EMAIL, CONTACT_PHONE } from '@/lib/seo';

export interface LegalSection {
  h: string;
  p: (string | { b: string; t: string })[];
}

/**
 * Shared chrome for the policy pages. Kept as data so the two pages stay
 * readable and a future refund/cancellation page reuses the same structure.
 */
export function LegalPage({
  eyebrow,
  title,
  intro,
  updated,
  sections,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  updated: string;
  sections: LegalSection[];
}) {
  return (
    <Container className="pb-20 pt-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLd({
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: title,
          description: intro,
          inLanguage: 'en-IN',
        })}
      />
      <p className="font-mono text-[11px] tracking-[0.06em] text-teal-dark">{eyebrow}</p>
      <h1 className="mt-4 max-w-[820px] font-sans text-[34px] font-extrabold leading-[1.08] tracking-[-0.02em] text-navy md:text-[46px]">
        {title}
      </h1>
      <p className="mt-4 max-w-[760px] font-sans text-[15px] leading-relaxed text-muted">{intro}</p>
      <p className="mt-4 font-mono text-[11px] text-muted">LAST UPDATED&nbsp;&nbsp;{updated}</p>

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
        <nav aria-label="Contents" className="h-fit lg:sticky lg:top-24">
          <ol className="space-y-2 border-l border-line pl-4">
            {sections.map((s, i) => (
              <li key={s.h}>
                <a
                  href={`#s${i + 1}`}
                  className="font-sans text-[12.5px] leading-snug text-muted hover:text-navy"
                >
                  {i + 1}. {s.h}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="max-w-[760px]">
          {sections.map((s, i) => (
            <section key={s.h} id={`s${i + 1}`} className="mt-10 scroll-mt-32 first:mt-0">
              <h2 className="font-sans text-[19px] font-extrabold text-navy">
                {i + 1}. {s.h}
              </h2>
              {s.p.map((para, k) =>
                typeof para === 'string' ? (
                  <p key={k} className="mt-3 font-sans text-[14.5px] leading-relaxed text-ink-soft">
                    {para}
                  </p>
                ) : (
                  <p key={k} className="mt-3 font-sans text-[14.5px] leading-relaxed text-ink-soft">
                    <strong className="font-bold text-navy">{para.b}</strong>
                    {para.t}
                  </p>
                )
              )}
            </section>
          ))}

          <p className="mt-12 border border-line bg-off-white p-5 font-sans text-[13.5px] leading-relaxed text-muted">
            Questions about this page: {CONTACT_EMAIL} or {CONTACT_PHONE}. AutoFair operates from
            Bangalore, Karnataka, India.
          </p>
        </div>
      </div>
    </Container>
  );
}
