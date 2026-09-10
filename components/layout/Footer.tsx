import Link from 'next/link';
import { Logo } from '@/components/shared/Logo';

export function Footer() {
  return (
    <footer className="bg-navy text-white">
      <div className="mx-auto w-full max-w-[1440px] px-5 pb-7 pt-10 md:px-12">
        <div className="flex flex-col gap-2 border-b border-line-dark pb-7 md:flex-row md:items-center md:justify-between">
          <p className="font-mono text-[10px] tracking-[0.06em] text-teal-bright">
            FILE CLOSE — END OF DOSSIER&nbsp;&nbsp;•&nbsp;&nbsp;SAMPLE DATA
          </p>
          <p className="font-mono text-[10px] tracking-[0.04em] text-[#9FB2C5]">
            AF-2026-008421&nbsp;&nbsp;•&nbsp;&nbsp;10 SEP 2026&nbsp;&nbsp;14:32 IST
          </p>
        </div>

        <div className="grid grid-cols-2 gap-8 py-8 md:grid-cols-4">
          <div className="col-span-2 md:col-span-1">
            <Logo variant="dark" />
            <p className="mt-4 max-w-[260px] font-sans text-[13px] leading-relaxed text-[#9FB2C5]">
              Verified cars. Honest history. Fair deals.
            </p>
            <p className="mt-3 font-mono text-[11px] leading-relaxed text-[#5C738A]">
              Inspection IDs • Report IDs • Timestamps in IBM Plex Mono
            </p>
          </div>

          <nav aria-label="Buy">
            <p className="font-mono text-[11px] tracking-[0.08em] text-teal-bright">BUY</p>
            <ul className="mt-4 space-y-2.5 font-sans text-[13.5px] text-[#D6E2EC]">
              <li><Link className="hover:text-white" href="/cars">Browse Cars</Link></li>
              <li><Link className="hover:text-white" href="/sell-your-car">Sell Your Car</Link></li>
              <li><Link className="hover:text-white" href="/inspection">Inspection</Link></li>
              <li><Link className="hover:text-white" href="/how-it-works">How It Works</Link></li>
            </ul>
          </nav>

          <nav aria-label="Company">
            <p className="font-mono text-[11px] tracking-[0.08em] text-teal-bright">COMPANY</p>
            <ul className="mt-4 space-y-2.5 font-sans text-[13.5px] text-[#D6E2EC]">
              <li><Link className="hover:text-white" href="/about">About</Link></li>
              <li><Link className="hover:text-white" href="/contact">Contact</Link></li>
              <li><Link className="hover:text-white" href="/about">Careers</Link></li>
              <li><Link className="hover:text-white" href="/about">Press</Link></li>
            </ul>
          </nav>

          <nav aria-label="Trust">
            <p className="font-mono text-[11px] tracking-[0.08em] text-teal-bright">TRUST</p>
            <ul className="mt-4 space-y-2.5 font-sans text-[13.5px] text-[#D6E2EC]">
              <li><Link className="hover:text-white" href="/inspection">Verification method</Link></li>
              <li><Link className="hover:text-white" href="/cars/2022-hyundai-creta-sx">Sample report</Link></li>
              <li><Link className="hover:text-white" href="/inspection">Document checks</Link></li>
              <li><Link className="hover:text-white" href="/contact">Contact support</Link></li>
            </ul>
          </nav>
        </div>

        <div className="flex flex-col gap-2 border-t border-line-dark pt-5 md:flex-row md:items-center md:justify-between">
          <p className="font-sans text-[12px] text-[#5C738A]">
            © 2026 AutoFair&nbsp;&nbsp;•&nbsp;&nbsp;Prototype with sample data&nbsp;&nbsp;•&nbsp;&nbsp;Instagram&nbsp;&nbsp;Facebook&nbsp;&nbsp;YouTube&nbsp;&nbsp;X&nbsp;&nbsp;Threads
          </p>
          <p className="font-mono text-[11px] text-[#5C738A]">
            /&nbsp;&nbsp;/cars&nbsp;&nbsp;/inspection&nbsp;&nbsp;/how-it-works&nbsp;&nbsp;/about&nbsp;&nbsp;/contact
          </p>
        </div>
      </div>
    </footer>
  );
}
