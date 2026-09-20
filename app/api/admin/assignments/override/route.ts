import { NextResponse } from 'next/server';
import { requireAuth, requireRoles } from '@/lib/supabase/server-auth';
import { getServiceClient } from '@/lib/supabase/service';
import { logDbError, toSafeApiPayload } from '@/lib/errors/db-error';

/**
 * POST /api/admin/assignments/override — manual override for exceptional cases (ADMIN only).
 * Body: { vehicleId, staffId, reason } — reason is required and audited.
 * Normal flow stays automatic; this path is logged as "Manual Override".
 */
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth(req);
    requireRoles(ctx, ['ADMIN']);
    const svc = getServiceClient();
    if (!svc) throw { status: 503, message: 'The assignment service is temporarily unavailable.' };

    const body = (await req.json().catch(() => null)) as { vehicleId?: unknown; staffId?: unknown; reason?: unknown } | null;
    const vehicleId = typeof body?.vehicleId === 'string' ? body.vehicleId : '';
    const staffId = typeof body?.staffId === 'string' ? body.staffId : '';
    const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 500) : '';

    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID.test(vehicleId) || !UUID.test(staffId)) {
      return NextResponse.json({ error: { message: 'Choose an inspection and a staff member.', code: 'VALIDATION' } }, { status: 422 });
    }

    if (!vehicleId || !staffId) {
      return NextResponse.json({ error: { message: 'Choose an inspection and a staff member.', code: 'VALIDATION' } }, { status: 422 });
    }
    if (!reason) {
      return NextResponse.json({ error: { message: 'Enter a reason for the manual override. It is saved in the audit log.', code: 'VALIDATION' } }, { status: 422 });
    }

    const { data: pick, error: mErr } = await svc.rpc('manual_assign_inspection', {
      p_vehicle_id: vehicleId,
      p_target_staff_id: staffId,
      p_reason: reason,
      p_actor_id: ctx.userId,
    });
    if (mErr) {
      const msg = String((mErr as { message?: string }).message ?? '');
      if (msg.includes('inactive')) {
        return NextResponse.json({ error: { message: 'That staff member is inactive. Reactivate them first.', code: 'VALIDATION' } }, { status: 422 });
      }
      if (msg.includes('reason required')) {
        return NextResponse.json({ error: { message: 'Enter a reason for the manual override.', code: 'VALIDATION' } }, { status: 422 });
      }
      if (msg.includes('not found')) {
        return NextResponse.json({ error: { message: 'The requested item was not found.', code: 'NOT_FOUND' } }, { status: 404 });
      }
      throw mErr;
    }

    return NextResponse.json({ data: { vehicleId, staffId: pick } });
  } catch (err) {
    const status = err && typeof err === 'object' && 'status' in (err as Record<string, unknown>) ? Number((err as { status: number }).status) : undefined;
    if (status === 401 || status === 403) {
      const msg = err && typeof err === 'object' && 'message' in (err as Record<string, unknown>) ? String((err as { message: unknown }).message) : 'Something went wrong. Please try again later.';
      return NextResponse.json({ error: { message: msg, code: status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN' } }, { status });
    }
    const { status: s, body } = toSafeApiPayload('admin.assign.override', err);
    logDbError('admin.assign.override', err);
    return NextResponse.json(body, { status: s });
  }
}
