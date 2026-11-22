'use client';

import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/useAuth';
import { getRoleHome, isPathAllowedForRole } from '@/lib/auth/roles';

/**
 * Keeps internal users in their one workspace. This is an UX redirect only;
 * every privileged API independently verifies the bearer token and profile role.
 * Children always render: the session lookup only resolves in the browser, so
 * holding the page for it served every public route to a non-JavaScript crawler
 * as a placeholder and nothing else. An admin/staff user who types a customer
 * URL now sees it for one frame before the redirect lands.
 */
export function RoleRouteGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { ready, isAuthed, role } = useAuth();

  const roleCanOpenPath = role ? isPathAllowedForRole(pathname, role) : true;
  const mustRedirect = ready && isAuthed && role && !roleCanOpenPath;

  useEffect(() => {
    if (mustRedirect) router.replace(getRoleHome(role));
  }, [mustRedirect, role, router]);

  if (mustRedirect) {
    return (
      <div className="mx-auto w-full max-w-[1440px] px-5 py-16 md:px-12" role="status">
        <p className="font-mono text-[11px] text-muted">OPENING YOUR WORKSPACE…</p>
      </div>
    );
  }

  return <>{children}</>;
}
