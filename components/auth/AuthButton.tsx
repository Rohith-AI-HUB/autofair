'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { User } from 'lucide-react';
import {
  getBrowserClient,
  getSessionFromAnyStore,
} from '@/lib/supabase/client';

export function AuthButton({ onNavigate }: { onNavigate?: () => void }) {
  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

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

  if (!ready) return null;

  if (email) {
    return (
      <Link
        href="/my-listings"
        onClick={onNavigate}
        aria-label={`My garage — signed in as ${email}`}
        title={email}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-navy font-sans text-[14px] font-bold text-white hover:bg-navy-2"
      >
        {email.charAt(0).toUpperCase()}
      </Link>
    );
  }

  return (
    <Link
      href="/auth"
      onClick={onNavigate}
      className="inline-flex items-center gap-2 px-3 py-[10px] font-sans text-[14px] font-semibold text-navy hover:underline"
    >
      <User size={16} aria-hidden />
      Sign in
    </Link>
  );
}
