'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Container } from '@/components/shared/Container';
import { openAuthModal } from '@/lib/auth/modal';

/**
 * /auth renders background content and immediately opens the shared
 * floating auth window, so deep links keep working without a standalone page.
 */
export function AuthRouteOpener() {
  useEffect(() => {
    openAuthModal({ mode: 'signin' });
  }, []);

  return (
    <Container className="py-16">
      <div className="max-w-[560px] border border-line bg-white p-8">
        <p className="font-mono text-[11px] tracking-[0.06em] text-teal-dark">
          ACCOUNT&nbsp;&nbsp;•&nbsp;&nbsp;SIGN IN
        </p>
        <h1 className="mt-2 font-sans text-[24px] font-extrabold text-navy">
          Opening sign in…
        </h1>
        <p className="mt-2 font-sans text-[14px] text-muted">
          The sign-in window should appear over this page. If it did not, use the button below.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => openAuthModal({ mode: 'signin' })}
            className="bg-navy px-6 py-3 font-sans text-[14px] font-bold text-white hover:bg-navy-2"
          >
            Open sign in
          </button>
          <Link
            href="/"
            className="border border-navy/30 px-6 py-3 font-sans text-[14px] font-bold text-navy"
          >
            Back home
          </Link>
        </div>
      </div>
    </Container>
  );
}
