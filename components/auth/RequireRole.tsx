'use client';

import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Container } from '@/components/shared/Container';
import { useAuth } from '@/lib/auth/useAuth';
import { openAuthModal } from '@/lib/auth/modal';
import { getRoleHome, type AppRole } from '@/lib/auth/roles';

/**
 * Strict client route guard. Role comes from DB via useAuth, never from
 * localStorage flags. Unauthorized authed users are redirected to their role
 * home (admin->/admin, staff->/staff, customer->/) without flashing protected
 * content or an unauthorized page. Loading state renders first to prevent
 * incorrect-page flashes.
 */
export function RequireRole({
  allow,
  children,
  title = 'Sign in required',
}: {
  allow: AppRole[];
  children: ReactNode;
  title?: string;
}) {
  const { ready, isAuthed, role } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!ready || !isAuthed || !role) return;
    if (!allow.includes(role)) {
      router.replace(getRoleHome(role));
    }
  }, [ready, isAuthed, role, allow, router]);

  if (!ready) {
    return (
      <Container className="py-16">
        <p className="font-mono text-[11px] text-muted" role="status">
          CHECKING ACCESS…
        </p>
      </Container>
    );
  }

  if (!isAuthed) {
    return (
      <Container className="py-16">
        <div className="max-w-[560px] border border-line bg-white p-8">
          <p className="font-mono text-[11px] tracking-[0.06em] text-teal-dark">LOCKED</p>
          <h1 className="mt-2 font-sans text-[24px] font-extrabold text-navy">{title}.</h1>
          <button
            type="button"
            onClick={() => openAuthModal({ mode: 'signin' })}
            className="mt-4 bg-navy px-6 py-3 font-sans text-[14px] font-bold text-white hover:bg-navy-2"
          >
            Sign in&nbsp;&nbsp;→
          </button>
        </div>
      </Container>
    );
  }

  if (role && !allow.includes(role)) {
    // Redirecting to role home; render only a neutral loading state so the
    // unauthorized page never flashes, even briefly.
    return (
      <Container className="py-16">
        <p className="font-mono text-[11px] text-muted" role="status">
          REDIRECTING…
        </p>
      </Container>
    );
  }

  return <>{children}</>;
}
