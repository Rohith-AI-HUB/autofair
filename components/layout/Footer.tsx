'use client';

import Link from 'next/link';
import { Logo } from '@/components/shared/Logo';
import { useAuth } from '@/lib/auth/useAuth';

export function Footer() {
  const { role } = useAuth();

  // Internal workspaces have their own navigation. Do not expose the public
  // customer site map to an authenticated admin or staff user.
  if (role === 'ADMIN' || role === 'STAFF') return null;

  return (
    <footer className="bg-navy text-white">
      <div className="mx-auto w-full max-w-[1440px] px-5 pb-7 pt-10 md:px-12">
        <div className="grid grid-cols-2 gap-8 py-8 md:grid-cols-4">
          <div className="col-span-2 md:col-span-1">
            <Logo variant="dark" />
            <p className="mt-4 max-w-[260px] font-sans text-[13px] leading-relaxed text-[#9FB2C5]">
              Verified cars. Honest history. Fair deals.
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
            </ul>
          </nav>

          <nav aria-label="Trust">
            <p className="font-mono text-[11px] tracking-[0.08em] text-teal-bright">TRUST</p>
            <ul className="mt-4 space-y-2.5 font-sans text-[13.5px] text-[#D6E2EC]">
              <li><Link className="hover:text-white" href="/inspection">Verification method</Link></li>
              <li><Link className="hover:text-white" href="/cars/2022-hyundai-creta-sx">Verified report</Link></li>
              <li><Link className="hover:text-white" href="/inspection">Document checks</Link></li>
            </ul>
          </nav>
        </div>

        <div className="flex flex-col gap-2 border-t border-line-dark pt-5 md:flex-row md:items-center md:justify-between">
          <p className="font-sans text-[12px] text-[#5C738A]">
            © 2026 AutoFair.online&nbsp;&nbsp;
          </p>
        </div>
      </div>
    </footer>
  );
}
