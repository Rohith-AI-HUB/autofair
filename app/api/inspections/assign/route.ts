import { NextResponse } from 'next/server';
import { requireAuth, requireRoles } from '@/lib/supabase/server-auth';
import { getServiceClient } from '@/lib/supabase/service';
import { logDbError, toSafeApiPayload } from '@/lib/errors/db-error';

/**
 * Assign one newly submitted customer vehicle.
 *
 * The browser never chooses a staff member. This endpoint verifies that the
 * caller owns the vehicle and then invokes the database's atomic least-load
 * function with the server-only service credential.
 */
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth(req);
    requireRoles(ctx, ['CUSTOMER']);
    const body = (await req.json().catch(() => null)) as { vehicleId?: unknown } | null;
    const vehicleId = typeof body?.vehicleId === 'string' ? body.vehicleId : '';
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(vehicleId)) {
      return NextResponse.json({ error: { message: 'Vehicle is required.', code: 'VALIDATION' } }, { status: 422 });
    }

    // Use the caller-scoped client as a second ownership check; RLS must also
    // permit this row for the request to proceed.
    const { data: vehicle, error: vehicleError } = await ctx.sb
      .from('vehicles')
      .select('id,seller_id,assigned_staff_id')
      .eq('id', vehicleId)
      .maybeSingle();
    if (vehicleError) throw vehicleError;
    const row = vehicle as { id: string; seller_id: string | null; assigned_staff_id: string | null } | null;
    if (!row || row.seller_id !== ctx.userId) {
      return NextResponse.json({ error: { message: "You don't have permission to assign this vehicle.", code: 'FORBIDDEN' } }, { status: 403 });
    }
    if (row.assigned_staff_id) return NextResponse.json({ data: { assigned: true, staffId: row.assigned_staff_id } });

    const svc = getServiceClient();
    if (!svc) {
      return NextResponse.json({ error: { message: 'Assignment service is temporarily unavailable.', code: 'UNAVAILABLE' } }, { status: 503 });
    }
    const { data: staffId, error: assignmentError } = await svc.rpc('assign_inspection_to_least_loaded', {
      p_vehicle_id: vehicleId,
      p_assignment_type: 'Automatic',
      p_reason: 'Customer vehicle submission',
      p_actor_id: null,
    });
    if (assignmentError) throw assignmentError;
    return NextResponse.json({ data: { assigned: Boolean(staffId), staffId: (staffId as string | null) ?? null } });
  } catch (err) {
    const status = err && typeof err === 'object' && 'status' in (err as Record<string, unknown>) ? Number((err as { status: number }).status) : undefined;
    if (status === 401 || status === 403) {
      const message = err && typeof err === 'object' && 'message' in (err as Record<string, unknown>) ? String((err as { message: unknown }).message) : 'Please sign in again to continue.';
      return NextResponse.json({ error: { message, code: status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN' } }, { status });
    }
    const safe = toSafeApiPayload('inspections.assign', err);
    logDbError('inspections.assign', err);
    return NextResponse.json(safe.body, { status: safe.status });
  }
}
