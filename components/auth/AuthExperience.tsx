'use client';

import Link from 'next/link';
import { Lock } from 'lucide-react';
import { Container } from '@/components/shared/Container';
import { AuthForm } from '@/components/auth/AuthForm';

/**
 * Backward-compat full-page wrapper. The form itself is shared with the
 * floating AuthModal (single implementation). New entry points should call
 * openAuthModal() instead of linking to /auth.
 */
export function AuthExperience() {
  return (
    <Container className="pb-16 pt-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-[11px] tracking-[0.06em] text-teal-dark">
          ACCOUNT&nbsp;&nbsp;•&nbsp;&nbsp;SIGN IN / SIGN UP
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <h1 className="font-sans text-[38px] font-extrabold leading-[1.05] tracking-[-0.02em] text-navy md:text-[60px]">
            Open your dossier.
          </h1>
          <div className="mt-4 h-[5px] w-14 bg-amber" aria-hidden />
          <p className="mt-4 max-w-[560px] font-sans text-[16px] leading-relaxed text-ink-soft">
            One account for saved files, faster seller contact and verification alerts.
            Pick up exactly where you left off.
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-3 lg:w-[300px]">
          <p className="flex items-center gap-2 border border-line bg-white px-[14px] py-[10px] font-mono text-[10px] tracking-[0.04em] text-muted">
            <Lock size={14} aria-hidden />
            SOC2&nbsp;&nbsp;•&nbsp;&nbsp;GOOGLE OAUTH
          </p>
          <Link
            href="/contact"
            className="font-sans text-[13px] font-semibold text-navy hover:underline"
          >
            Need help? Contact support →
          </Link>
        </div>
      </div>

      <div className="mt-10 border border-line bg-white p-7 md:p-[28px] md:pb-[33px]">
        <AuthForm />
      </div>
    </Container>
  );
}
