import { NextResponse } from 'next/server';
import { requireAuth, requireRoles } from '@/lib/supabase/server-auth';
import { logDbError, toSafeApiPayload } from '@/lib/errors/db-error';

const STATUSES = ['Pending', 'Assigned', 'In Progress', 'Completed', 'Cancelled'];

/**
 * PATCH /api/admin/inspections/[id] — update inspection status / schedule (ADMIN only).
 * Completing or cancelling automatically drops the staff member's workload
 * because workload counts only active statuses server-side.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth(req);
    requireRoles(ctx, ['ADMIN']);
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: { message: 'The requested item was not found.', code: 'NOT_FOUND' } }, { status: 404 });
    }
    const body = (await req.json().catch(() => null)) as { inspectionStatus?: unknown; scheduledAt?: unknown; location?: unknown } | null;
    const patch: Record<string, unknown> = {};
    if (body && 'inspectionStatus' in body) {
      if (typeof body.inspectionStatus !== 'string' || !STATUSES.includes(body.inspectionStatus)) {
        return NextResponse.json({ error: { message: 'Choose a valid inspection status.', code: 'VALIDATION' } }, { status: 422 });
      }
      patch.inspection_status = body.inspectionStatus;
    }
    if (body && 'scheduledAt' in body && typeof body.scheduledAt === 'string' && body.scheduledAt) {
      const d = new Date(body.scheduledAt);
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ error: { message: 'Enter a valid scheduled date and time.', code: 'VALIDATION' } }, { status: 422 });
      }
      patch.scheduled_at = d.toISOString();
    }
    if (body && 'location' in body && typeof body.location === 'string' && body.location.trim()) {
      patch.location = body.location.trim();
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: { message: 'Nothing to update.', code: 'VALIDATION' } }, { status: 422 });
    }
    const { data, error } = await ctx.sb.from('vehicles').update(patch).eq('id', id).select('id,inspection_status').single();
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (err) {
    const status = err && typeof err === 'object' && 'status' in (err as Record<string, unknown>) ? Number((err as { status: number }).status) : undefined;
    if (status === 401 || status === 403) {
      const msg = err && typeof err === 'object' && 'message' in (err as Record<string, unknown>) ? String((err as { message: unknown }).message) : 'Something went wrong. Please try again later.';
      return NextResponse.json({ error: { message: msg, code: status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN' } }, { status });
    }
    const { status: s, body } = toSafeApiPayload('admin.inspections.update', err);
    logDbError('admin.inspections.update', err);
    return NextResponse.json(body, { status: s });
  }
}
