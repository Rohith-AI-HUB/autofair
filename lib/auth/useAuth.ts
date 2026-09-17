'use client';

import { useCallback, useEffect, useState } from 'react';
import { getBrowserClient, getSessionFromAnyStore } from '@/lib/supabase/client';
import { fetchCurrentProfile, type AppRole } from '@/lib/auth/roles';

export interface AuthState {
  ready: boolean;
  email: string | null;
  userId: string | null;
  role: AppRole | null;
  isAuthed: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

/**
 * Single client auth subscription. Role comes from DB (profiles.role),
 * never trusted from client storage. A missing or invalid backend profile
 * invalidates the browser session instead of granting a fallback role.
 */
export function useAuth(): AuthState {
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);

  const refresh = useCallback(async () => {
    const { session } = await getSessionFromAnyStore();
    if (!session?.user) {
      setEmail(null);
      setUserId(null);
      setRole(null);
      setReady(true);
      return;
    }
    const profile = await fetchCurrentProfile();
    if (!profile) {
      setEmail(null);
      setUserId(null);
      setRole(null);
      await Promise.allSettled([
        getBrowserClient('local')?.auth.signOut(),
        getBrowserClient('session')?.auth.signOut(),
      ]);
      setReady(true);
      return;
    }
    setEmail(session.user.email ?? null);
    setUserId(session.user.id);
    setRole(profile.role);
    setReady(true);
  }, []);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      await refresh();
      if (!mounted) return;
    })();
    const subs = (['local', 'session'] as const).map((persist) => {
      const sb = getBrowserClient(persist);
      if (!sb) return null;
      const { data } = sb.auth.onAuthStateChange(() => {
        void refresh();
      });
      return data.subscription;
    });
    return () => {
      mounted = false;
      subs.forEach((s) => s?.unsubscribe());
    };
  }, [refresh]);

  const signOut = useCallback(async () => {
    // Clear both persisted sessions so back-navigation or a reopened tab
    // cannot reuse a stale session/role. Role state is cleared first so
    // protected pages never flash for the previous user.
    setEmail(null);
    setUserId(null);
    setRole(null);
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
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem('autofair-live-cars');
        window.sessionStorage.removeItem('autofair-live-cars');
        window.sessionStorage.removeItem('autofair-my-vehicles');
      }
    } catch {
      /* storage unavailable */
    }
    setReady(true);
  }, []);

  return { ready, email, userId, role, isAuthed: Boolean(email), refresh, signOut };
}
