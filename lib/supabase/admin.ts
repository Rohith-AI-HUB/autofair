'use client';

import { getBrowserClient } from '@/lib/supabase/client';
import { DbOperationError, SAFE_MESSAGES } from '@/lib/errors/db-error';

export interface WorkloadEntry {
  staffId: string;
  fullName: string;
  email: string | null;
  isActive: boolean;
  load: number;
  today: number;
  lastAssignmentAt: string | null;
  createdAt: string;
}

export interface OverviewData {
  totals: {
    totalStaff: number;
    activeStaff: number;
    upcoming: number;
    unassigned: number;
    inProgress: number;
    completed: number;
  };
  workload: WorkloadEntry[];
}

export interface AdminStaff {
  id: string;
  fullName: string;
  email: string | null;
  isActive: boolean;
  load: number;
  upcomingCount: number;
  upcomingIds: string[];
  todayCount: number;
  lastAssignmentAt: string | null;
  createdAt: string;
}

export interface AdminInspection {
  vehicleId: string;
  inspectionCode: string;
  regNumber: string;
  vehicle: string;
  make: string;
  model: string;
  variant: string;
  year: number;
  fuel: string;
  transmission: string;
  kmDriven: number;
  location: string;
  scheduledAt: string;
  inspectionStatus: string;
  vehicleStatus: string;
  assignedStaffId: string | null;
  assignedStaff: { fullName: string; email: string | null; isActive: boolean } | null;
  assignedAt: string | null;
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  vehicleId: string;
  inspectionCode: string;
  regNumber: string;
  vehicleLabel: string;
  previousStaff: { name: string; email: string | null } | null;
  newStaff: { name: string; email: string | null } | null;
  assignmentType: string;
  reason: string;
  createdAt: string;
}

async function authHeaders(): Promise<Record<string, string>> {
  const sb = getBrowserClient('local') ?? getBrowserClient('session');
  if (!sb) {
    throw new DbOperationError('admin.auth', new Error('Supabase not configured'), {
      status: 503,
      code: 'UNAVAILABLE',
      userMessage: SAFE_MESSAGES.UNAVAILABLE,
    });
  }
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new DbOperationError('admin.auth', new Error('Missing session'), {
      status: 401,
      code: 'UNAUTHORIZED',
      userMessage: 'Please sign in again to continue.',
    });
  }
  return { Authorization: `Bearer ${token}` };
}

function throwSafe(status: number, body: unknown): never {
  const msg =
    body && typeof body === 'object' && 'error' in (body as Record<string, unknown>)
      ? String((body as { error: { message?: unknown } }).error?.message ?? '')
      : '';
  throw new DbOperationError('admin.api', new Error(`admin api ${status}`), {
    status: status === 401 ? 401 : status === 403 ? 403 : status === 404 ? 404 : status === 409 ? 409 : status === 422 ? 422 : status === 503 ? 503 : 500,
    code: status === 401 ? 'UNAUTHORIZED' : status === 403 ? 'FORBIDDEN' : status === 404 ? 'NOT_FOUND' : status === 409 ? 'CONFLICT' : status === 422 ? 'VALIDATION' : status === 503 ? 'UNAVAILABLE' : 'INTERNAL',
    userMessage: msg && msg.length < 500 ? msg : SAFE_MESSAGES.INTERNAL,
  });
}

async function getJson<T>(url: string): Promise<T> {
  const headers = await authHeaders();
  const res = await fetch(url, { headers, cache: 'no-store' });
  const body = (await res.json().catch(() => null)) as { data?: T; error?: { message?: string } } | null;
  if (!res.ok || !body || !('data' in body)) throwSafe(res.status, body);
  return (body as { data: T }).data;
}

async function sendJson<T>(url: string, method: string, payload: unknown): Promise<T> {
  const headers = await authHeaders();
  const res = await fetch(url, {
    method,
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = (await res.json().catch(() => null)) as { data?: T; error?: { message?: string } } | null;
  if (!res.ok || !body || !('data' in body)) throwSafe(res.status, body);
  return (body as { data: T }).data;
}

export function fetchAdminOverview(): Promise<OverviewData> {
  return getJson<OverviewData>('/api/admin/overview');
}

export function fetchAdminStaff(): Promise<AdminStaff[]> {
  return getJson<AdminStaff[]>('/api/admin/staff');
}

export function createAdminStaff(input: { fullName: string; email: string; password: string }): Promise<{ id: string; fullName: string; email: string }> {
  return sendJson('/api/admin/staff', 'POST', input);
}

export function updateAdminStaff(id: string, patch: { fullName?: string; isActive?: boolean }): Promise<{ id: string; fullName: string; email: string | null; isActive: boolean; reassigned: number }> {
  return sendJson(`/api/admin/staff/${id}`, 'PATCH', patch);
}

export function fetchAdminInspections(status = '', q = ''): Promise<AdminInspection[]> {
  const p = new URLSearchParams();
  if (status) p.set('status', status);
  if (q) p.set('q', q);
  p.set('limit', '150');
  return getJson<AdminInspection[]>(`/api/admin/inspections?${p.toString()}`);
}

export function createAdminInspection(input: {
  regNumber: string; make: string; model: string; variant?: string; year: number;
  location: string; scheduledAt: string; fuel?: string; transmission?: string; kmDriven?: number;
}): Promise<{ vehicleId: string; inspectionCode: string; regNumber: string; assignedStaffId: string | null; assignedStaffName: string | null; message: string }> {
  return sendJson('/api/admin/inspections', 'POST', input);
}

export function updateInspectionStatus(id: string, patch: { inspectionStatus?: string; scheduledAt?: string; location?: string }): Promise<unknown> {
  return sendJson(`/api/admin/inspections/${id}`, 'PATCH', patch);
}

export function runAutoAssign(): Promise<{ scanned: number; assigned: number; stillUnassigned: number }> {
  return sendJson('/api/admin/assignments/run', 'POST', {});
}

export function manualOverride(input: { vehicleId: string; staffId: string; reason: string }): Promise<{ vehicleId: string; staffId: string }> {
  return sendJson('/api/admin/assignments/override', 'POST', input);
}

export function fetchAuditLog(): Promise<AuditEntry[]> {
  return getJson<AuditEntry[]>('/api/admin/assignments/logs?limit=100');
}
