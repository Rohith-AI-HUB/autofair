'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { Logo } from '@/components/shared/Logo';

const links = [
  { label: 'Buy Cars', href: '/cars' },
  { label: 'Sell Your Car', href: '/sell-your-car' },
  { label: 'Inspection', href: '/inspection' },
  { label: 'How It Works', href: '/how-it-works' },
  { label: 'About', href: '/about' },
];

export function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-off-white">
      <nav
        aria-label="Primary"
        className="mx-auto flex w-full max-w-[1440px] items-center justify-between px-5 py-[18px] md:px-12 md:py-[22px]"
      >
        <Link href="/" aria-label="AutoFair home">
          <Logo variant="light" />
        </Link>

        <div className="hidden items-center gap-[30px] lg:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="font-sans text-[14px] font-medium text-navy hover:underline"
            >
              {l.label}
            </Link>
          ))}
        </div>

        <div className="hidden items-center gap-3 lg:flex">
          <Link
            href="/cars"
            className="bg-teal px-5 py-3 font-sans text-[14px] font-bold text-navy hover:bg-[#12a295]"
          >
            Browse Verified Cars
          </Link>
          <Link
            href="/sell-your-car"
            className="rounded-full border border-navy/40 px-5 py-[10px] font-sans text-[14px] font-semibold text-navy hover:border-navy"
          >
            Sell Your Car
          </Link>
        </div>

        <button
          type="button"
          className="inline-flex h-11 w-11 items-center justify-center border border-navy/20 lg:hidden"
          aria-expanded={open}
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </nav>

      {open && (
        <div className="border-t border-line bg-off-white px-5 pb-6 pt-4 lg:hidden">
          <div className="flex flex-col gap-1">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="border-b border-line py-3 font-sans text-[15px] font-semibold text-navy"
              >
                {l.label}
              </Link>
            ))}
            <div className="mt-4 flex flex-col gap-2">
              <Link
                href="/cars"
                onClick={() => setOpen(false)}
                className="bg-teal px-5 py-3 text-center font-sans text-[14px] font-bold text-navy"
              >
                Browse Verified Cars
              </Link>
              <Link
                href="/sell-your-car"
                onClick={() => setOpen(false)}
                className="rounded-full border border-navy/40 px-5 py-3 text-center font-sans text-[14px] font-semibold text-navy"
              >
                Sell Your Car
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
