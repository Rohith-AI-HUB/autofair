import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AppRole } from '@/lib/auth/roles';
import { mapDbRoleToAppRole } from '@/lib/auth/roles';

export interface AuthContext {
  userId: string;
  email: string | null;
  role: AppRole;
  dbRole: string | null;
  /** RLS-aware client acting as the caller (Bearer token forwarded). */
  sb: SupabaseClient;
}

function getEnv(): { url: string; anon: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  return { url, anon };
}

function bearerFrom(req: Request): string | null {
  const h = req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (!h) return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

/**
 * Resolve the caller from `Authorization: Bearer <access_token>`.
 * Works with the current localStorage auth flow (client sends its session
 * token). Throws a safe {status, message} object on failure — routes turn
 * it into a production-safe payload via toSafeApiPayload.
 */
export async function requireAuth(req: Request): Promise<AuthContext> {
  const env = getEnv();
  if (!env) {
    throw { status: 503, message: 'The service is temporarily unavailable. Please try again later.' };
  }
  const token = bearerFrom(req);
  if (!token) {
    throw { status: 401, message: 'Please sign in again to continue.' };
  }
  const sb = createClient(env.url, env.anon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await sb.auth.getUser(token);
  const user = data?.user;
  if (error || !user) {
    throw { status: 401, message: 'Please sign in again to continue.' };
  }
  const { data: profile, error: profileError } = await sb.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const dbRole = (profile as { role?: string | null } | null)?.role ?? null;
  const role = mapDbRoleToAppRole(dbRole);
  if (profileError || !profile || !role) {
    // A valid JWT alone is not sufficient for application authorization.
    // Privileged APIs must have a valid, database-backed application role.
    throw { status: 401, message: 'Please sign in again to continue.' };
  }
  return {
    userId: user.id,
    email: user.email ?? null,
    role,
    dbRole,
    sb,
  };
}

export function requireRoles(ctx: AuthContext, allowed: AppRole[]): void {
  if (!allowed.includes(ctx.role)) {
    throw { status: 403, message: "You don't have permission to do that." };
  }
}
