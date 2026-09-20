import { NextResponse } from 'next/server';
import { requireAuth, requireRoles } from '@/lib/supabase/server-auth';
import { logDbError, toSafeApiPayload } from '@/lib/errors/db-error';

/**
 * GET /api/staff/assignments — staff's assigned (and claimable unassigned)
 * vehicles with listing + cover. STAFF only (strict separation: admins use
 * /api/admin/* monitoring instead of the staff workspace).
 */
export async function GET(req: Request) {
  try {
    const ctx = await requireAuth(req);
    requireRoles(ctx, ['STAFF']);

    // Parameterized filters only — never interpolate IDs into `.or()` strings.
    // (PostgREST `.or()` takes raw filter text, so a crafted ID could break out.)
    // Returns active work (mine + claimable unassigned) plus my recent
    // completed verifications for the Pending / Completed tabs.
    const [mine, claimable, done] = await Promise.all([
      ctx.sb
        .from('vehicles')
        .select('*')
        .eq('assigned_staff_id', ctx.userId)
        .in('status', ['submitted', 'in_review', 'draft'])
        .order('created_at', { ascending: false })
        .limit(25),
      ctx.sb
        .from('vehicles')
        .select('*')
        .is('assigned_staff_id', null)
        .in('status', ['submitted', 'in_review', 'draft'])
        .order('created_at', { ascending: false })
        .limit(25),
      ctx.sb
        .from('vehicles')
        .select('*')
        .eq('assigned_staff_id', ctx.userId)
        .in('status', ['verified', 'published', 'sold'])
        .order('updated_at', { ascending: false })
        .limit(20),
    ]);
    if (mine.error) throw mine.error;
    if (claimable.error) throw claimable.error;
    if (done.error) throw done.error;
    const seen = new Set<string>();
    const vehicles = [...(mine.data ?? []), ...(claimable.data ?? []), ...(done.data ?? [])].filter((v) => {
      const id = (v as { id?: string }).id;
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    }).slice(0, 50);

    const out: Array<{ vehicle: unknown; listing: unknown; coverUrl: string | null }> = [];
    for (const v of ((vehicles ?? []) as Array<{ id: string }>)) {
      const vehicle = v as unknown as { id: string };
      const [{ data: listing }, { data: photos }] = await Promise.all([
        ctx.sb.from('listings').select('*').eq('vehicle_id', vehicle.id).maybeSingle(),
        ctx.sb
          .from('vehicle_photos')
          .select('public_url,sort_order')
          .eq('vehicle_id', vehicle.id)
          .order('sort_order')
          .limit(1),
      ]);
      const cover = (photos as Array<{ public_url: string }> | null)?.[0]?.public_url ?? null;
      out.push({ vehicle, listing: listing ?? null, coverUrl: cover });
    }
    return NextResponse.json({ data: out });
  } catch (err) {
    const status =
      err && typeof err === 'object' && 'status' in (err as Record<string, unknown>)
        ? Number((err as { status: number }).status)
        : undefined;
    if (status === 401 || status === 403) {
      const msg =
        err && typeof err === 'object' && 'message' in (err as Record<string, unknown>)
          ? String((err as { message: unknown }).message)
          : 'Something went wrong. Please try again later.';
      return NextResponse.json({ error: { message: msg, code: status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN' } }, { status });
    }
    const { status: s, body } = toSafeApiPayload('staff.assignments', err);
    logDbError('staff.assignments', err);
    return NextResponse.json(body, { status: s });
  }
}
