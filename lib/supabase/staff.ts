'use client';

import { getBrowserClient } from '@/lib/supabase/client';
import { DbOperationError, SAFE_MESSAGES } from '@/lib/errors/db-error';
import type { DbListing, DbVehicle } from '@/lib/supabase/db-types';

export interface StaffAssignment {
  vehicle: DbVehicle;
  listing: DbListing | null;
  coverUrl: string | null;
}

async function authHeaders(): Promise<Record<string, string>> {
  const sb = getBrowserClient('local') ?? getBrowserClient('session');
  if (!sb) {
    throw new DbOperationError('staff.auth', new Error('Supabase not configured'), {
      status: 503,
      code: 'UNAVAILABLE',
      userMessage: SAFE_MESSAGES.UNAVAILABLE,
    });
  }
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new DbOperationError('staff.auth', new Error('Missing session'), {
      status: 401,
      code: 'UNAUTHORIZED',
      userMessage: 'Please sign in again to continue.',
    });
  }
  return { Authorization: `Bearer ${token}` };
}

function safeJsonError(status: number, body: unknown): never {
  const msg =
    body && typeof body === 'object' && 'error' in (body as Record<string, unknown>)
      ? String((body as { error: { message?: unknown } }).error?.message ?? '')
      : '';
  throw new DbOperationError('staff.api', new Error(`staff api ${status}`), {
    status: status === 401 ? 401 : status === 403 ? 403 : status === 503 ? 503 : 500,
    code: status === 401 ? 'UNAUTHORIZED' : status === 403 ? 'FORBIDDEN' : status === 503 ? 'UNAVAILABLE' : 'INTERNAL',
    userMessage: msg && msg.length < 300 ? msg : SAFE_MESSAGES.INTERNAL,
  });
}

/** Staff: list vehicles assigned to me (or unassigned claimable). */
export async function fetchStaffAssignments(): Promise<StaffAssignment[]> {
  const headers = await authHeaders();
  const res = await fetch('/api/staff/assignments', { headers, cache: 'no-store' });
  const body = (await res.json().catch(() => null)) as {
    data?: StaffAssignment[];
    error?: { message?: string };
  } | null;
  if (!res.ok || !body?.data) safeJsonError(res.status, body);
  return (body as { data: StaffAssignment[] }).data;
}

export interface VerifyInput {
  vehicleId: string;
  score: number;
  overallStatus: 'pass' | 'attention' | 'fail';
  notes?: string;
  ratings?: Record<string, number | null>;
  price: number;
}

/** Staff: complete verification. Backend owns the VERIFIED transition. */
export async function completeStaffVerification(input: VerifyInput): Promise<{ vehicleId: string }> {
  const headers = await authHeaders();
  const res = await fetch('/api/staff/verify', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = (await res.json().catch(() => null)) as {
    data?: { vehicleId: string };
    error?: { message?: string };
  } | null;
  if (!res.ok || !body?.data) safeJsonError(res.status, body);
  return (body as { data: { vehicleId: string } }).data;
}
