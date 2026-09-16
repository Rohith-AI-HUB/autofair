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

  const handleSuccess = useCallback(
    (dest: string) => {
      setOpen(false);
      const target = next ?? null;
      setNext(undefined);
      router.refresh();
      // Preserve context by default; only navigate when an explicit `next`
      // was requested and differs from the current route.
      if (target && target !== pathname) router.replace(target);
      else if (!next && dest && (pathname === '/auth' || pathname.startsWith('/auth/'))) {
        router.replace(dest);
      }
    },
    [next, pathname, router]
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
