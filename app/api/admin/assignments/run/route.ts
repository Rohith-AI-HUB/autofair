import { NextResponse } from 'next/server';
import { requireAuth, requireRoles } from '@/lib/supabase/server-auth';
import { getServiceClient } from '@/lib/supabase/service';
import { logDbError, toSafeApiPayload } from '@/lib/errors/db-error';

/**
 * POST /api/admin/assignments/run — auto-assign every unassigned upcoming inspection (ADMIN only).
 * Uses the backend workload algorithm per vehicle (atomic via advisory lock).
 * This is monitoring + bulk automation, not manual per-vehicle picking.
 */
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth(req);
    requireRoles(ctx, ['ADMIN']);
    const svc = getServiceClient();
    if (!svc) throw { status: 503, message: 'The assignment service is temporarily unavailable.' };

    const { data: pending, error: qErr } = await ctx.sb
      .from('vehicles')
      .select('id,reg_number')
      .is('assigned_staff_id', null)
      .in('inspection_status', ['Pending', 'Assigned', 'In Progress'])
      .order('scheduled_at', { ascending: true })
      .limit(100);
    if (qErr) throw qErr;

    const rows = ((pending ?? []) as Array<{ id: string; reg_number: string }>);
    let assigned = 0;
    const details: Array<{ vehicleId: string; regNumber: string; staffId: string | null }> = [];

    for (const v of rows) {
      const { data: pick, error: aErr } = await svc.rpc('assign_inspection_to_least_loaded', {
        p_vehicle_id: v.id,
        p_assignment_type: 'Automatic',
        p_reason: 'Bulk auto-assign from admin dashboard',
        p_actor_id: ctx.userId,
      });
      if (aErr) {
        logDbError('admin.assign.run.one', aErr);
        details.push({ vehicleId: v.id, regNumber: v.reg_number, staffId: null });
        continue;
      }
      const sid = (pick as string | null) ?? null;
      if (sid) assigned += 1;
      details.push({ vehicleId: v.id, regNumber: v.reg_number, staffId: sid });
    }

    return NextResponse.json({ data: { scanned: rows.length, assigned, stillUnassigned: rows.length - assigned, details } });
  } catch (err) {
    const status = err && typeof err === 'object' && 'status' in (err as Record<string, unknown>) ? Number((err as { status: number }).status) : undefined;
    if (status === 401 || status === 403) {
      const msg = err && typeof err === 'object' && 'message' in (err as Record<string, unknown>) ? String((err as { message: unknown }).message) : 'Something went wrong. Please try again later.';
      return NextResponse.json({ error: { message: msg, code: status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN' } }, { status });
    }
    const { status: s, body } = toSafeApiPayload('admin.assign.run', err);
    logDbError('admin.assign.run', err);
    return NextResponse.json(body, { status: s });
  }
}
