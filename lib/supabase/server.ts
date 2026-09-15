import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Server / shared read client (anon key, public reads only).
// For writes we use the browser client in lib/supabase/client.ts so RLS sees auth.uid().
// Cached + in-memory storage so browser calls from CarsExplorer don't spawn
// competing GoTrueClients under the same storage key (fixes the dev warning).
let cached: SupabaseClient | null = null;
const memStorage = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
};

export function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  if (cached) return cached;
  cached = createClient(url, anon, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: 'autofair-server-read',
      storage: typeof window === 'undefined' ? undefined : (memStorage() as unknown as Storage),
    },
  });
  return cached;
}
