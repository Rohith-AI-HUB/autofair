import { NextResponse } from 'next/server';
import { requireAuth, requireRoles } from '@/lib/supabase/server-auth';
import { logDbError, toSafeApiPayload } from '@/lib/errors/db-error';

/**
 * PATCH /api/admin/staff/[id] — edit name / activate / deactivate (ADMIN only).
 * Deactivation automatically reassigns the staff member's pending/upcoming
 * inspections via the backend assignment algorithm and reports the count.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth(req);
    requireRoles(ctx, ['ADMIN']);
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: { message: 'The requested item was not found.', code: 'NOT_FOUND' } }, { status: 404 });
    }

    const body = (await req.json().catch(() => null)) as { fullName?: unknown; isActive?: unknown } | null;
    const patch: { full_name?: string; is_active?: boolean } = {};
    if (body && 'fullName' in body) {
      const n = typeof body.fullName === 'string' ? body.fullName.trim() : '';
      if (!n || n.length < 2) {
        return NextResponse.json({ error: { message: 'Enter the staff member\u2019s full name.', code: 'VALIDATION' } }, { status: 422 });
      }
      patch.full_name = n;
    }
    if (body && 'isActive' in body) {
      if (typeof body.isActive !== 'boolean') {
        return NextResponse.json({ error: { message: 'Some values look invalid. Please check your input and try again.', code: 'VALIDATION' } }, { status: 422 });
      }
      patch.is_active = body.isActive;
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: { message: 'Nothing to update.', code: 'VALIDATION' } }, { status: 422 });
    }

    const { data: existing, error: fErr } = await ctx.sb.from('profiles').select('id,role,is_active').eq('id', id).maybeSingle();
    if (fErr) throw fErr;
    if (!existing) {
      return NextResponse.json({ error: { message: 'The requested item was not found.', code: 'NOT_FOUND' } }, { status: 404 });
    }

    const { error: uErr } = await ctx.sb.from('profiles').update(patch).eq('id', id);
    if (uErr) throw uErr;

    let reassigned = 0;
    const wasActive = ((existing as { is_active: boolean | null }).is_active ?? true);
    if (patch.is_active === false && wasActive) {
      const { data: count, error: rErr } = await ctx.sb.rpc('reassign_staff_inspections', {
        p_staff_id: id,
        p_reason: 'Staff deactivated',
        p_actor_id: ctx.userId,
      });
      if (rErr) throw rErr;
      reassigned = typeof count === 'number' ? count : 0;
    }

    const { data: updated } = await ctx.sb.from('profiles').select('id,full_name,email,is_active,last_assignment_at,created_at').eq('id', id).maybeSingle();
    const u = updated as { id: string; full_name: string | null; email: string | null; is_active: boolean | null; last_assignment_at: string | null; created_at: string } | null;

    return NextResponse.json({
      data: {
        id,
        fullName: u?.full_name ?? patch.full_name ?? 'Unnamed staff',
        email: u?.email ?? null,
        isActive: u?.is_active ?? patch.is_active ?? true,
        lastAssignmentAt: u?.last_assignment_at ?? null,
        reassigned,
      },
    });
  } catch (err) {
    const status = err && typeof err === 'object' && 'status' in (err as Record<string, unknown>) ? Number((err as { status: number }).status) : undefined;
    if (status === 401 || status === 403) {
      const msg = err && typeof err === 'object' && 'message' in (err as Record<string, unknown>) ? String((err as { message: unknown }).message) : 'Something went wrong. Please try again later.';
      return NextResponse.json({ error: { message: msg, code: status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN' } }, { status });
    }
    const { status: s, body } = toSafeApiPayload('admin.staff.update', err);
    logDbError('admin.staff.update', err);
    return NextResponse.json(body, { status: s });
  }
}
