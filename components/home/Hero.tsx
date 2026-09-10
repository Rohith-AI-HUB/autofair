import Link from 'next/link';
import { Container } from '@/components/shared/Container';

export function Hero() {
  return (
    <section aria-labelledby="hero-heading" className="bg-off-white">
      <Container className="pb-9 pt-10 md:pt-14">
        <div className="max-w-[760px]">
          <p className="font-mono text-[11px] tracking-[0.06em] text-teal-dark">
            01 — VERIFIED USED CARS&nbsp;&nbsp;/&nbsp;&nbsp;TRANSPARENT HISTORY
          </p>
          <h1
            id="hero-heading"
            className="mt-4 font-sans text-[44px] font-extrabold leading-[1.02] tracking-[-0.02em] text-navy md:text-[76px]"
          >
            Know the car before you buy it.
          </h1>
          <div className="mt-4 h-[5px] w-14 bg-amber" aria-hidden />
          <p className="mt-4 max-w-[640px] font-sans text-[17px] leading-[1.6] text-ink-soft">
            Verified used cars with transparent inspection reports, documented history and no
            hidden surprises. The dossier is public — before you call the seller.
          </p>
          <p className="mt-4 font-mono text-[11px] tracking-[0.06em] text-muted">
            82 CHECKS&nbsp;&nbsp;•&nbsp;&nbsp;5-STEP APPROVAL&nbsp;&nbsp;•&nbsp;&nbsp;DISCLOSED,
            NOT PROMISED
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-5">
            <Link
              href="/cars"
              className="bg-navy px-7 py-4 font-sans text-[15px] font-bold text-white hover:bg-navy-2"
            >
              Browse Verified Cars&nbsp;&nbsp;→
            </Link>
            <Link
              href="/sell-your-car"
              className="font-sans text-[14px] font-semibold text-navy hover:underline"
            >
              or list yours — Sell Your Car
            </Link>
          </div>
        </div>
      </Container>
    </section>
  );
}
