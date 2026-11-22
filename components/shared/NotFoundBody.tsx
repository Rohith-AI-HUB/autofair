import Link from 'next/link';
import { Container } from '@/components/shared/Container';

/**
 * Shared by app/not-found.tsx and app/cars/[slug]/not-found.tsx. A route that
 * prerenders with generateStaticParams serves its own boundary, so the segment
 * copy cannot live only in the root file.
 */
export function NotFoundBody() {
  return (
    <Container className="py-20">
      <p className="font-mono text-[11px] text-muted">404</p>
      <h1 className="mt-3 font-sans text-[28px] font-extrabold text-navy">
        That file is not here.
      </h1>
      <p className="mt-3 max-w-[520px] font-sans text-[14px] leading-relaxed text-muted">
        The car may be sold, paused, or the link may be mistyped. Every dossier
        currently open for viewing is on the browse page.
      </p>
      <div className="mt-7 flex flex-wrap gap-3">
        <Link
          className="border border-navy bg-navy px-4 py-2 font-sans text-[13px] font-bold text-white"
          href="/cars"
        >
          Browse verified cars
        </Link>
        <Link
          className="border border-line bg-white px-4 py-2 font-sans text-[13px] font-bold text-navy"
          href="/contact"
        >
          Talk to a human
        </Link>
      </div>
    </Container>
  );
}
