import { getBrowserClient } from '@/lib/supabase/client';
import { logDbError } from '@/lib/errors/db-error';

/**
 * Canonical application roles. DB stores legacy lowercase values
 * (buyer/seller/inspector/admin) plus new uppercase values; this module
 * is the single place that normalizes them.
 *
 * - CUSTOMER covers buyer + seller (same account; seller capability is
 *   inferred from having listings, never a separate account).
 * - STAFF covers inspector/staff (vehicle verification).
 * - ADMIN is reserved (no dashboard yet, placeholder only).
 */
export type AppRole = 'ADMIN' | 'CUSTOMER' | 'STAFF';

export type DbRoleString = string | null | undefined;

export function mapDbRoleToAppRole(dbRole: DbRoleString): AppRole {
  const v = String(dbRole ?? '').trim().toLowerCase();
  if (v === 'admin') return 'ADMIN';
  if (v === 'staff' || v === 'inspector') return 'STAFF';
  // buyer, seller, customer, '' and anything unknown default to CUSTOMER.
  // Unknown defaults to least-privileged role (never admin/staff).
  return 'CUSTOMER';
}

export function isStaffAppRole(role: AppRole | null | undefined): boolean {
  // Strict separation: ADMIN is NOT staff. Admins must use /admin only,
  // staff must use /staff only. Backend RLS may still treat admin as
  // privileged, but frontend route guards must never conflate the two
  // (this was the admin-shown-as-staff bug).
  return role === 'STAFF';
}

export function isAdminAppRole(role: AppRole | null | undefined): boolean {
  return role === 'ADMIN';
}

/**
 * Strict role-based access control (spec: admin/staff/customer).
 * DB stores ADMIN/STAFF/CUSTOMER (plus legacy lowercase); these helpers are
 * the single place that maps to role homes and allowed paths. Role always
 * comes from the backend/database via fetchCurrentProfile, never from
 * localStorage/sessionStorage/frontend state/URL params/request bodies.
 */

export type TrustedRole = AppRole;

export function getRoleHome(role: AppRole | null | undefined): '/' | '/admin' | '/staff' {
  if (role === 'ADMIN') return '/admin';
  if (role === 'STAFF') return '/staff';
  return '/';
}

export function isPathAllowedForRole(path: string, role: AppRole | null | undefined): boolean {
  const p = path.split('?')[0].split('#')[0];
  if (p === '/admin' || p.startsWith('/admin/')) return role === 'ADMIN';
  if (p === '/staff' || p.startsWith('/staff/')) return role === 'STAFF';
  if (p.startsWith('/api/admin')) return role === 'ADMIN';
  if (p.startsWith('/api/staff')) return role === 'STAFF';
  return true;
}

export function resolvePostLoginDestination(role: AppRole | null | undefined, next?: string | null): string {
  const home = getRoleHome(role);
  if (!next || next === '/auth/route') return home;
  // Never trust a frontend-supplied next that escapes the role's area.
  if (!next.startsWith('/')) return home;
  if (!isPathAllowedForRole(next, role)) return home;
  return next;
}

export interface CurrentProfile {
  id: string;
  role: AppRole;
  dbRole: string | null;
  email: string | null;
}

/**
 * Backend (DB) is source of truth for role. Reads profiles.role for the
 * current session user. Returns null when signed out / unconfigured.
 * Never throws raw DB errors to callers; logs and returns null.
 */
export async function fetchCurrentProfile(): Promise<CurrentProfile | null> {
  try {
    const sb =
      getBrowserClient('local') ?? getBrowserClient('session');
    if (!sb || typeof window === 'undefined') return null;
    const { data: sessionData } = await sb.auth.getSession();
    const user = sessionData.session?.user;
    if (!user) return null;
    const { data, error } = await sb.from('profiles').select('id, role').eq('id', user.id).maybeSingle();
    if (error) {
      logDbError('profiles.fetchRole', error);
      // Fall back to CUSTOMER so buyer flow never blocks on a role read
      // failure; staff-only surfaces re-check server-side.
      return { id: user.id, role: 'CUSTOMER', dbRole: null, email: user.email ?? null };
    }
    const row = data as { id: string; role: string | null } | null;
    const dbRole = row?.role ?? null;
    return {
      id: user.id,
      role: mapDbRoleToAppRole(dbRole),
      dbRole,
      email: user.email ?? null,
    };
  } catch (err) {
    logDbError('profiles.fetchRole', err);
    return null;
  }
}

/** Verification status derived from existing vehicle + listing statuses. No new states. */
export type VerificationState = 'PENDING' | 'VERIFIED';

export function getVerificationState(
  vehicleStatus: string | null | undefined,
  listingStatus: string | null | undefined
): VerificationState {
  const v = String(vehicleStatus ?? '').toLowerCase();
  const l = String(listingStatus ?? '').toUpperCase();
  if ((v === 'verified' || v === 'published') && l === 'LIVE') return 'VERIFIED';
  return 'PENDING';
}

export function verificationLabel(state: VerificationState): string {
  return state === 'VERIFIED' ? 'Verified' : 'Pending Verification';
}
