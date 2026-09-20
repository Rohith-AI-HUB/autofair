import { NextResponse } from 'next/server';
import { requireAuth, requireRoles } from '@/lib/supabase/server-auth';
import { logDbError, toSafeApiPayload } from '@/lib/errors/db-error';

/**
 * GET /api/admin/assignments/logs — assignment history / audit log (ADMIN only).
 * Returns newest first with vehicle + staff names resolved server-side.
 */
export async function GET(req: Request) {
  try {
    const ctx = await requireAuth(req);
    requireRoles(ctx, ['ADMIN']);

    const url = new URL(req.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 100) || 100, 1), 200);

    const { data: logs, error: lErr } = await ctx.sb
      .from('staff_assignment_logs')
      .select('id,vehicle_id,previous_staff_id,new_staff_id,assignment_type,reason,created_by,created_at')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (lErr) throw lErr;

    const rows = ((logs ?? []) as Array<{
      id: string; vehicle_id: string; previous_staff_id: string | null; new_staff_id: string | null;
      assignment_type: string; reason: string; created_by: string | null; created_at: string;
    }>);

    // Collapse creation double-fire: trigger + app fallback can log the same
    // Unassigned → Unassigned no-op twice within minutes. Show newest only.
    // Rows are newest-first, so keep the first per vehicle+type, drop older
    // ones within 10 minutes of it.
    const keptAt = new Map<string, number>();
    const deduped = rows.filter((r) => {
      if (r.previous_staff_id || r.new_staff_id) return true;
      const key = `${r.vehicle_id}|${r.assignment_type}`;
      const t = new Date(r.created_at).getTime();
      const prev = keptAt.get(key);
      if (prev !== undefined && Math.abs(prev - t) < 10 * 60 * 1000) return false;
      keptAt.set(key, t);
      return true;
    });

    const vehicleIds = [...new Set(deduped.map((r) => r.vehicle_id))];
    const staffIds = [...new Set([...deduped.map((r) => r.previous_staff_id), ...deduped.map((r) => r.new_staff_id)].filter(Boolean))] as string[];

    const [{ data: vehicles }, { data: staff }] = await Promise.all([
      vehicleIds.length
        ? ctx.sb.from('vehicles').select('id,inspection_id,reg_number,make,model').in('id', vehicleIds)
        : Promise.resolve({ data: [] as unknown[] }),
      staffIds.length
        ? ctx.sb.from('profiles').select('id,full_name,email').in('id', staffIds)
        : Promise.resolve({ data: [] as unknown[] }),
    ]);

    const vMap = new Map<string, { code: string; reg: string; label: string }>();
    for (const v of ((vehicles ?? []) as Array<{ id: string; inspection_id: string; reg_number: string; make: string; model: string }>)) {
      vMap.set(v.id, { code: v.inspection_id, reg: v.reg_number, label: `${v.make} ${v.model}` });
    }
    const sMap = new Map<string, { name: string; email: string | null }>();
    for (const s of ((staff ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>)) {
      sMap.set(s.id, { name: s.full_name ?? 'Unnamed staff', email: s.email ?? null });
    }

    const out = deduped.map((r) => ({
      id: r.id,
      vehicleId: r.vehicle_id,
      inspectionCode: vMap.get(r.vehicle_id)?.code ?? r.vehicle_id.slice(0, 8),
      regNumber: vMap.get(r.vehicle_id)?.reg ?? '—',
      vehicleLabel: vMap.get(r.vehicle_id)?.label ?? 'Vehicle',
      previousStaff: r.previous_staff_id ? (sMap.get(r.previous_staff_id) ?? { name: 'Former staff', email: null }) : null,
      newStaff: r.new_staff_id ? (sMap.get(r.new_staff_id) ?? { name: 'Former staff', email: null }) : null,
      assignmentType: r.assignment_type,
      reason: r.reason,
      createdAt: r.created_at,
    }));

    return NextResponse.json({ data: out });
  } catch (err) {
    const status = err && typeof err === 'object' && 'status' in (err as Record<string, unknown>) ? Number((err as { status: number }).status) : undefined;
    if (status === 401 || status === 403) {
      const msg = err && typeof err === 'object' && 'message' in (err as Record<string, unknown>) ? String((err as { message: unknown }).message) : 'Something went wrong. Please try again later.';
      return NextResponse.json({ error: { message: msg, code: status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN' } }, { status });
    }
    const { status: s, body } = toSafeApiPayload('admin.assign.logs', err);
    logDbError('admin.assign.logs', err);
    return NextResponse.json(body, { status: s });
  }
}
