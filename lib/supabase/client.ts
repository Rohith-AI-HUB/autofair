import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const REMEMBER_KEY = 'autofair-remember';
const STORAGE_KEYS: Record<PersistChoice, string> = {
  local: 'autofair-auth',
  session: 'autofair-auth-session',
};

// One cached client per store. Never construct GoTrueClients ad-hoc:
// concurrent instances under one storage key trigger undefined behavior.
const clientCache = new Map<PersistChoice, SupabaseClient>();

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export type PersistChoice = 'local' | 'session';

export function getRememberChoice(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(REMEMBER_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setRememberChoice(remember: boolean): void {
  try {
    if (remember) window.localStorage.removeItem(REMEMBER_KEY);
    else window.localStorage.setItem(REMEMBER_KEY, 'off');
  } catch {
    /* storage unavailable — session-only fallback */
  }
}

export function getBrowserClient(persist: PersistChoice = 'local'): SupabaseClient | null {
  if (!isSupabaseConfigured() || typeof window === 'undefined') return null;
  const cached = clientCache.get(persist);
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
  const client = createClient(url, anon, {
    auth: {
      storage: persist === 'local' ? window.localStorage : window.sessionStorage,
      storageKey: STORAGE_KEYS[persist],
      persistSession: true,
      autoRefreshToken: true,
      // `/auth/callback` explicitly exchanges the PKCE code. Letting a newly
      // constructed browser client also inspect the URL races that exchange
      // and consumes the verifier before the callback can use it.
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
  });
  clientCache.set(persist, client);
  return client;
}

export async function getSessionFromAnyStore(): Promise<{
  session: import('@supabase/supabase-js').Session | null;
  persist: PersistChoice;
}> {
  // Never throws raw auth/DB errors to callers. Failures are logged and
  // treated as "no session" so UI falls back safely (guest garage, etc.).
  try {
    // Honour the persistence choice used for the current login. Checking
    // local storage first unconditionally lets a stale remembered session
    // override a newly authenticated session-only admin/staff account.
    const preferred: readonly PersistChoice[] = getRememberChoice()
      ? ['local', 'session']
      : ['session', 'local'];
    for (const persist of preferred) {
      const sb = getBrowserClient(persist);
      if (!sb) return { session: null, persist: 'local' };
      const { data } = await sb.auth.getSession();
      if (data.session) return { session: data.session, persist };
    }
    return { session: null, persist: 'local' };
  } catch (err) {
    try {
      const { logDbError } = await import('@/lib/errors/db-error');
      logDbError('auth.getSession', err);
    } catch {
      /* logging must never throw */
    }
    return { session: null, persist: 'local' };
  }
}

export function getSiteUrl(): string {
  if (typeof window !== 'undefined') return window.location.origin;
  return process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
}
