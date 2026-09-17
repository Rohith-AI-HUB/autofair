'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { User } from 'lucide-react';
import { getBrowserClient, getSessionFromAnyStore } from '@/lib/supabase/client';
import { openAuthModal } from '@/lib/auth/modal';
import { useAuth } from '@/lib/auth/useAuth';

export function AuthButton({ onNavigate }: { onNavigate?: () => void }) {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { role } = useAuth();
  const isInternalUser = role === 'ADMIN' || role === 'STAFF';

  useEffect(() => {
    let mounted = true;
    getSessionFromAnyStore().then(({ session }) => {
      if (mounted) {
        setEmail(session?.user?.email ?? null);
        setReady(true);
      }
    });
    const subs = (['local', 'session'] as const).map((persist) => {
      const sb = getBrowserClient(persist);
      if (!sb) return null;
      const { data } = sb.auth.onAuthStateChange((_event, session) => {
        if (mounted) setEmail(session?.user?.email ?? null);
      });
      return data.subscription;
    });
    return () => {
      mounted = false;
      subs.forEach((s) => s?.unsubscribe());
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open ]);

  async function signOut() {
    setSigningOut(true);
    setEmail(null);
    try {
      try {
        await getBrowserClient('local')?.auth.signOut();
      } catch {
        /* sign-out must never throw */
      }
      try {
        await getBrowserClient('session')?.auth.signOut();
      } catch {
        /* sign-out must never throw */
      }
      try {
        window.localStorage.removeItem('autofair-live-cars');
        window.sessionStorage.removeItem('autofair-live-cars');
        window.sessionStorage.removeItem('autofair-my-vehicles');
      } catch {
        /* storage unavailable */
      }
    } finally {
      setSigningOut(false);
      setOpen(false);
      setEmail(null);
      onNavigate?.();
      router.replace('/');
      router.refresh();
    }
  }

  if (!ready) return null;

  if (email) {
    return (
      <div ref={menuRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`Profile — signed in as ${email}`}
          title={email}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-navy font-sans text-[14px] font-bold text-white hover:bg-navy-2"
        >
          {email.charAt(0).toUpperCase()}
        </button>
        {open && (
          <div
            role="menu"
            aria-label="Profile"
            className="absolute right-0 top-11 z-50 w-64 border border-line bg-white shadow-[0_8px_30px_rgba(11,23,38,0.14)]"
          >
            <p className="border-b border-line px-4 py-3 font-mono text-[10px] tracking-[0.04em] text-muted">
              SIGNED IN AS<br />
              <span className="mt-1 block truncate font-sans text-[13px] font-bold normal-case tracking-normal text-navy">
                {email}
              </span>
            </p>
            {!isInternalUser && (
              <>
                <Link
                  href="/sell-your-car"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    onNavigate?.();
                  }}
                  className="block px-4 py-3 font-sans text-[13.5px] font-semibold text-navy hover:bg-off-white"
                >
                  Sell Your Car
                </Link>
                <Link
                  href="/cars"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    onNavigate?.();
                  }}
                  className="block px-4 py-3 font-sans text-[13.5px] font-semibold text-navy hover:bg-off-white"
                >
                  Browse cars
                </Link>
              </>
            )}
            <button
              type="button"
              role="menuitem"
              disabled={signingOut}
              onClick={signOut}
              className="block w-full border-t border-line px-4 py-3 text-left font-sans text-[13.5px] font-bold text-[#B42318] hover:bg-off-white disabled:opacity-60"
            >
              {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        onNavigate?.();
        openAuthModal({ mode: 'signin' });
      }}
      className="inline-flex items-center gap-2 px-3 py-[10px] font-sans text-[14px] font-semibold text-navy hover:underline"
    >
      <User size={16} aria-hidden />
      Sign in
    </button>
  );
}
