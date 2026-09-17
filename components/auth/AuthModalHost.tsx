'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AuthModal } from '@/components/auth/AuthModal';
import type { AuthFormMode } from '@/components/auth/AuthForm';
import { AUTH_MODAL_CLOSE, AUTH_MODAL_OPEN, type OpenAuthDetail } from '@/lib/auth/modal';

/**
 * Global host mounted once in RootLayout. Single modal instance for the
 * whole app: opened via openAuthModal({mode, next}) or ?auth=signin|signup.
 * Preserves the underlying route; on success stays unless `next` given.
 */
function HostInner() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AuthFormMode>('signin');
  const [next, setNext] = useState<string | undefined>(undefined);

  const close = useCallback(() => {
    setOpen(false);
    setNext(undefined);
    // Drop ?auth= without navigating away (preserve context).
    if (params.get('auth')) router.replace(pathname);
  }, [params, pathname, router]);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const d = (e as CustomEvent<OpenAuthDetail>).detail ?? {};
      setMode(d.mode ?? 'signin');
      setNext(d.next);
      setOpen(true);
    };
    const onClose = () => setOpen(false);
    window.addEventListener(AUTH_MODAL_OPEN, onOpen);
    window.addEventListener(AUTH_MODAL_CLOSE, onClose);
    return () => {
      window.removeEventListener(AUTH_MODAL_OPEN, onOpen);
      window.removeEventListener(AUTH_MODAL_CLOSE, onClose);
    };
  }, []);

  // Deep-link support: /cars?auth=signin, /auth (compat page redirects here too).
  useEffect(() => {
    const a = params.get('auth');
    if (a === 'signin' || a === 'signup') {
      setMode(a);
      setOpen(true);
    }
  }, [params]);

  // Handle OAuth PKCE callbacks that land on the root or other pages (e.g. Supabase fallback to Site URL: https://www.autofair.online/?code=...)
  useEffect(() => {
    const code = params.get('code');
    if (code && pathname !== '/auth/callback') {
      const search = typeof window !== 'undefined' ? window.location.search : `?code=${encodeURIComponent(code)}`;
      const hash = typeof window !== 'undefined' ? window.location.hash : '';
      router.replace(`/auth/callback${search}${hash}`);
    }
  }, [params, pathname, router]);

  const handleSuccess = useCallback(
    (dest: string) => {
      setOpen(false);
      setNext(undefined);
      // `dest` is calculated by AuthForm from the backend profile and any
      // allowed `next` path.  Navigating to the raw modal `next` value here
      // discarded the role home for ordinary modal sign-ins, so admins and
      // staff remained on the public page after a successful login.
      if (dest && dest !== pathname) router.replace(dest);
      else router.refresh();
    },
    [pathname, router]
  );

  return <AuthModal open={open} initialMode={mode} next={next} onClose={close} onSuccess={handleSuccess} />;
}

export function AuthModalHost() {
  return (
    <Suspense>
      <HostInner />
    </Suspense>
  );
}
