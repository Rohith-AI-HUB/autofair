import { getBrowserClient, getSessionFromAnyStore } from '@/lib/supabase/client';
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

/**
 * Convert only a role actually stored by the backend into an application role.
 * `null` deliberately means an invalid session; it is never a customer
 * fallback.  Treating an unreadable/missing profile as a customer hid broken
 * provisioning and made different parts of the app disagree about a user.
 */
export function mapDbRoleToAppRole(dbRole: DbRoleString): AppRole | null {
  const v = String(dbRole ?? '').trim().toLowerCase();
  if (v === 'admin') return 'ADMIN';
  // Keep existing accounts usable while a deployment is moving from the
  // original buyer/seller/inspector names to the canonical RBAC roles.
  // The database migrations perform this normalization too, but login must
  // not present a valid pre-migration account as signed out if that migration
  // has not reached the connected Supabase project yet.
  if (v === 'staff' || v === 'inspector') return 'STAFF';
  if (v === 'customer' || v === 'buyer' || v === 'seller') return 'CUSTOMER';
  return null;
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
  if (!role) return false;
  if (role === 'ADMIN') return p === '/admin' || p.startsWith('/admin/');
  if (role === 'STAFF') return p === '/staff' || p.startsWith('/staff/');
  return !(p === '/admin' || p.startsWith('/admin/') || p === '/staff' || p.startsWith('/staff/'));
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
    if (typeof window === 'undefined') return null;
    // The browser can persist a session in localStorage or sessionStorage.
    // Query the profile through the exact client that contains the session;
    // choosing the merely available localStorage client makes a valid
    // session-only login appear signed out.
    const { session, persist } = await getSessionFromAnyStore();
    const user = session?.user;
    if (!user) return null;
    const sb = getBrowserClient(persist);
    if (!sb) return null;
    const { data, error } = await sb.from('profiles').select('id, role').eq('id', user.id).maybeSingle();
    if (error) {
      logDbError('profiles.fetchRole', error);
      return null;
    }
    if (!data) {
      // No profile is an invalid application session (for example, an old
      // browser session created before profile provisioning). It is not a
      // database error, so do not feed `null` to the error logger and create
      // a misleading 500 console event.
      return null;
    }
    const row = data as { id: string; role: string | null } | null;
    const dbRole = row?.role ?? null;
    const role = mapDbRoleToAppRole(dbRole);
    if (!role) return null;
    return {
      id: user.id,
      role,
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
