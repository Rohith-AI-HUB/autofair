import { NextResponse } from 'next/server';
import { requireAuth, requireRoles } from '@/lib/supabase/server-auth';
import { getServiceClient } from '@/lib/supabase/service';
import { logDbError, toSafeApiPayload } from '@/lib/errors/db-error';

const INSPECTION_STATUSES = ['Pending', 'Assigned', 'In Progress', 'Completed', 'Cancelled'] as const;

/**
 * GET /api/admin/inspections — upcoming + history (ADMIN only).
 * Query: ?status=Pending|Assigned|...&q=search&limit=100
 * Joins assigned staff in code (avoids fragile FK embedding).
 */
export async function GET(req: Request) {
  try {
    const ctx = await requireAuth(req);
    requireRoles(ctx, ['ADMIN']);

    const url = new URL(req.url);
    const status = url.searchParams.get('status') ?? '';
    const q = (url.searchParams.get('q') ?? '').trim().toLowerCase();
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 100) || 100, 1), 200);

    let query = ctx.sb
      .from('vehicles')
      .select('id,inspection_id,reg_number,make,model,variant,year,fuel,transmission,km_driven,location,scheduled_at,inspection_status,status,assigned_staff_id,assigned_at,created_at')
      .order('scheduled_at', { ascending: true })
      .limit(limit);
    if (status && (INSPECTION_STATUSES as readonly string[]).includes(status)) {
      query = query.eq('inspection_status', status);
    }
    const { data: vehicles, error: vErr } = await query;
    if (vErr) throw vErr;

    let rows = ((vehicles ?? []) as Array<{
      id: string; inspection_id: string; reg_number: string; make: string; model: string; variant: string;
      year: number; fuel: string; transmission: string; km_driven: number; location: string;
      scheduled_at: string; inspection_status: string; status: string;
      assigned_staff_id: string | null; assigned_at: string | null; created_at: string;
    }>);

    if (q) {
      rows = rows.filter((v) =>
        [v.reg_number, v.make, v.model, v.variant, v.location, v.inspection_id].join(' ').toLowerCase().includes(q)
      );
    }

    const staffIds = [...new Set(rows.map((r) => r.assigned_staff_id).filter(Boolean))] as string[];
    let staffMap = new Map<string, { fullName: string; email: string | null; isActive: boolean }>();
    if (staffIds.length) {
      const { data: staff } = await ctx.sb.from('profiles').select('id,full_name,email,is_active').in('id', staffIds);
      for (const s of ((staff ?? []) as Array<{ id: string; full_name: string | null; email: string | null; is_active: boolean | null }>)) {
        staffMap.set(s.id, { fullName: s.full_name ?? 'Unnamed staff', email: s.email ?? null, isActive: s.is_active ?? true });
      }
    }

    const out = rows.map((v) => ({
      vehicleId: v.id,
      inspectionCode: v.inspection_id,
      regNumber: v.reg_number,
      vehicle: `${v.year} ${v.make} ${v.model}${v.variant ? ` ${v.variant}` : ''}`,
      make: v.make,
      model: v.model,
      variant: v.variant,
      year: v.year,
      fuel: v.fuel,
      transmission: v.transmission,
      kmDriven: v.km_driven,
      location: v.location,
      scheduledAt: v.scheduled_at,
      inspectionStatus: v.inspection_status,
      vehicleStatus: v.status,
      assignedStaffId: v.assigned_staff_id,
      assignedStaff: v.assigned_staff_id ? (staffMap.get(v.assigned_staff_id) ?? null) : null,
      assignedAt: v.assigned_at,
      createdAt: v.created_at,
    }));

    return NextResponse.json({ data: out });
  } catch (err) {
    const status = err && typeof err === 'object' && 'status' in (err as Record<string, unknown>) ? Number((err as { status: number }).status) : undefined;
    if (status === 401 || status === 403) {
      const msg = err && typeof err === 'object' && 'message' in (err as Record<string, unknown>) ? String((err as { message: unknown }).message) : 'Something went wrong. Please try again later.';
      return NextResponse.json({ error: { message: msg, code: status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN' } }, { status });
    }
    const { status: s, body } = toSafeApiPayload('admin.inspections.list', err);
    logDbError('admin.inspections.list', err);
    return NextResponse.json(body, { status: s });
  }
}

/**
 * POST /api/admin/inspections — create a new inspection (ADMIN only).
 * Admin supplies vehicle details only; the backend auto-assigns staff by workload.
 * There is intentionally no staff picker here — automation owns assignment.
 */
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth(req);
    requireRoles(ctx, ['ADMIN']);
    const svc = getServiceClient();
    if (!svc) throw { status: 503, message: 'The assignment service is temporarily unavailable.' };

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const reg = typeof body?.regNumber === 'string' ? body.regNumber.toUpperCase().trim() : '';
    const make = typeof body?.make === 'string' ? body.make.trim() : '';
    const model = typeof body?.model === 'string' ? body.model.trim() : '';
    const variant = typeof body?.variant === 'string' ? (body.variant as string).trim() : '';
    const year = typeof body?.year === 'number' ? body.year : NaN;
    const location = typeof body?.location === 'string' ? (body.location as string).trim() : '';
    const scheduledAt = typeof body?.scheduledAt === 'string' && body.scheduledAt ? String(body.scheduledAt) : new Date().toISOString();
    const fuel = typeof body?.fuel === 'string' && ['Petrol', 'Diesel', 'CNG', 'Electric', 'Hybrid'].includes(body.fuel as string) ? (body.fuel as string) : 'Petrol';
    const transmission = typeof body?.transmission === 'string' && ['Manual', 'Automatic', 'AMT', 'CVT'].includes(body.transmission as string) ? (body.transmission as string) : 'Manual';
    const km = typeof body?.kmDriven === 'number' ? (body.kmDriven as number) : 0;

    if (!reg) return NextResponse.json({ error: { message: 'Enter the registration number.', code: 'VALIDATION' } }, { status: 422 });
    if (!make || !model) return NextResponse.json({ error: { message: 'Enter the vehicle make and model.', code: 'VALIDATION' } }, { status: 422 });
    if (!Number.isFinite(year) || year < 2000 || year > 2030) return NextResponse.json({ error: { message: 'Enter a valid model year (2000–2030).', code: 'VALIDATION' } }, { status: 422 });
    if (!location) return NextResponse.json({ error: { message: 'Enter the inspection location.', code: 'VALIDATION' } }, { status: 422 });

    const { data: inserted, error: iErr } = await ctx.sb
      .from('vehicles')
      .insert({
        reg_number: reg,
        make: make.charAt(0).toUpperCase() + make.slice(1).toLowerCase(),
        model,
        variant,
        year,
        fuel,
        transmission,
        km_driven: Math.max(0, Math.round(km)),
        ownership: 'First owner',
        location,
        price_expected: 0,
        status: 'submitted',
        inspection_status: 'Pending',
        scheduled_at: scheduledAt,
      })
      .select('id,inspection_id,reg_number,inspection_status,assigned_staff_id')
      .single();
    if (iErr) {
      const msg = String((iErr as { message?: string }).message ?? '');
      if (msg.toLowerCase().includes('duplicate') || msg.includes('23505') || msg.toLowerCase().includes('already exists')) {
        return NextResponse.json({ error: { message: 'A vehicle with this registration number already exists.', code: 'CONFLICT' } }, { status: 409 });
      }
      throw iErr;
    }

    const vid = (inserted as { id: string }).id;
    // Backend auto-assign: DB trigger vehicles_auto_assign fires on insert.
    // Only call the rpc fallback when the trigger did not assign yet —
    // otherwise trigger + rpc log the same creation twice in history.
    let assigned: string | null = null;
    try {
      const { data: fresh } = await svc.from('vehicles').select('assigned_staff_id').eq('id', vid).maybeSingle();
      assigned = ((fresh as { assigned_staff_id: string | null } | null)?.assigned_staff_id ?? null) as string | null;
    } catch {
      assigned = (inserted as { assigned_staff_id: string | null }).assigned_staff_id ?? null;
    }
    if (!assigned) {
      try {
        const { data: pick, error: aErr } = await svc.rpc('assign_inspection_to_least_loaded', {
          p_vehicle_id: vid,
          p_assignment_type: 'Automatic',
          p_reason: 'Auto-assigned on creation',
          p_actor_id: ctx.userId,
        });
        if (!aErr && pick) assigned = pick as string;
      } catch {
        // Trigger already attempted assignment; leave as-is rather than failing creation.
      }
    }

    let staffName: string | null = null;
    if (assigned) {
      const { data: s } = await ctx.sb.from('profiles').select('full_name').eq('id', assigned).maybeSingle();
      staffName = (s as { full_name: string | null } | null)?.full_name ?? null;
    }

    return NextResponse.json(
      {
        data: {
          vehicleId: vid,
          inspectionCode: (inserted as { inspection_id: string }).inspection_id,
          regNumber: (inserted as { reg_number: string }).reg_number,
          assignedStaffId: assigned,
          assignedStaffName: staffName,
          message: assigned ? `Auto-assigned to ${staffName ?? 'staff'} by workload.` : 'Created. No active staff available — it stays unassigned until staff are active.',
        },
      },
      { status: 201 }
    );
  } catch (err) {
    const status = err && typeof err === 'object' && 'status' in (err as Record<string, unknown>) ? Number((err as { status: number }).status) : undefined;
    if (status === 401 || status === 403) {
      const msg = err && typeof err === 'object' && 'message' in (err as Record<string, unknown>) ? String((err as { message: unknown }).message) : 'Something went wrong. Please try again later.';
      return NextResponse.json({ error: { message: msg, code: status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN' } }, { status });
    }
    const { status: s, body } = toSafeApiPayload('admin.inspections.create', err);
    logDbError('admin.inspections.create', err);
    return NextResponse.json(body, { status: s });
  }
}
