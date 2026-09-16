import { NextResponse } from 'next/server';
import { requireAuth, requireRoles } from '@/lib/supabase/server-auth';
import { logDbError, toSafeApiPayload } from '@/lib/errors/db-error';

const STAFF_ROLES = ['STAFF', 'staff', 'inspector'];
const ACTIVE = ['Pending', 'Assigned', 'In Progress'];

/**
 * GET /api/admin/overview — dashboard summary (ADMIN only).
 * Backend computes real workload (never trusts frontend):
 * load = count vehicles assigned to staff with inspection_status in active set.
 */
export async function GET(req: Request) {
  try {
    const ctx = await requireAuth(req);
    requireRoles(ctx, ['ADMIN']);

    const [{ data: staff }, { data: vehicles, error: vErr }] = await Promise.all([
      ctx.sb.from('profiles').select('id,full_name,email,is_active,last_assignment_at,created_at,role').in('role', STAFF_ROLES),
      ctx.sb.from('vehicles').select('id,assigned_staff_id,inspection_status,assigned_at'),
    ]);
    if (vErr) throw vErr;

    const staffRows = ((staff ?? []) as Array<{ id: string; full_name: string | null; email: string | null; is_active: boolean | null; last_assignment_at: string | null; created_at: string }>);
    const vehRows = ((vehicles ?? []) as Array<{ id: string; assigned_staff_id: string | null; inspection_status: string | null; assigned_at: string | null }>);

    const today = new Date().toISOString().slice(0, 10);
    const loadByStaff = new Map<string, { load: number; today: number }>();
    for (const s of staffRows) loadByStaff.set(s.id, { load: 0, today: 0 });
    for (const v of vehRows) {
      if (!v.assigned_staff_id) continue;
      const entry = loadByStaff.get(v.assigned_staff_id);
      if (!entry) continue;
      if (v.inspection_status && ACTIVE.includes(v.inspection_status)) entry.load += 1;
      if (v.assigned_at && v.assigned_at.slice(0, 10) === today) entry.today += 1;
    }

    const totalStaff = staffRows.length;
    const activeStaff = staffRows.filter((s) => (s.is_active ?? true)).length;
    const upcoming = vehRows.filter((v) => v.inspection_status && ACTIVE.includes(v.inspection_status)).length;
    const unassigned = vehRows.filter((v) => !v.assigned_staff_id && v.inspection_status && ACTIVE.includes(v.inspection_status)).length;
    const inProgress = vehRows.filter((v) => v.inspection_status === 'In Progress').length;
    const completed = vehRows.filter((v) => v.inspection_status === 'Completed').length;

    const workload = staffRows
      .map((s) => ({
        staffId: s.id,
        fullName: s.full_name ?? 'Unnamed staff',
        email: s.email ?? null,
        isActive: s.is_active ?? true,
        load: loadByStaff.get(s.id)?.load ?? 0,
        today: loadByStaff.get(s.id)?.today ?? 0,
        lastAssignmentAt: s.last_assignment_at,
        createdAt: s.created_at,
      }))
      .sort((a, b) => b.load - a.load || a.fullName.localeCompare(b.fullName));

    return NextResponse.json({
      data: {
        totals: { totalStaff, activeStaff, upcoming, unassigned, inProgress, completed },
        workload,
      },
    });
  } catch (err) {
    const status = err && typeof err === 'object' && 'status' in (err as Record<string, unknown>) ? Number((err as { status: number }).status) : undefined;
    if (status === 401 || status === 403) {
      const msg = err && typeof err === 'object' && 'message' in (err as Record<string, unknown>) ? String((err as { message: unknown }).message) : 'Something went wrong. Please try again later.';
      return NextResponse.json({ error: { message: msg, code: status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN' } }, { status });
    }
    const { status: s, body } = toSafeApiPayload('admin.overview', err);
    logDbError('admin.overview', err);
    return NextResponse.json(body, { status: s });
  }
}
