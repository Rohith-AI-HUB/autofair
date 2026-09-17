import type { Metadata } from 'next';
import { Container } from '@/components/shared/Container';
import { ContactForm } from '@/components/contact/ContactForm';

export const metadata: Metadata = {
  title: 'Contact | AutoFair',
  description: 'Talk to a human about a car file. Replies in 1 business day.',
};

export default function ContactPage() {
  return (
    <section className="bg-off-white">
      <Container className="grid gap-10 py-12 lg:grid-cols-[1fr_1fr]">
        <div>
          <p className="font-mono text-[11px] tracking-[0.06em] text-teal-dark">
            CONTACT&nbsp;&nbsp;•&nbsp;&nbsp;REPLIES IN 1 BUSINESS DAY
          </p>
          <h1 className="mt-4 font-sans text-[38px] font-extrabold leading-[1.05] text-navy md:text-[52px]">
            Talk to a human about a car file.
          </h1>
          <p className="mt-4 max-w-[480px] font-sans text-[15px] leading-relaxed text-muted">
            Questions on an inspection ID, a document check or listing approval — send
            the file number and we&apos;ll pull the dossier.
          </p>
          <dl className="mt-9 grid gap-4 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3 max-w-[800px]">
            {[
              ['Email', 'autofaironline.co@gmail.com'],
              ['Phone · 10–7 IST', '+91 9686413636'],
              ['Yard by appointment', 'CV Raman Nagar, Bangalore'],
            ].map(([k, v]) => (
              <div key={k} className="min-w-0 border border-line bg-white p-4">
                <dt className="font-mono text-[10.5px] text-muted">{k.toUpperCase()}</dt>
                <dd className="mt-1 break-all font-sans text-[12px] font-bold leading-relaxed text-navy sm:text-[13px]">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        <ContactForm />
      </Container>
    </section>
  );
}
