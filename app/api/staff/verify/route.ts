import { NextResponse } from 'next/server';
import { requireAuth, requireRoles } from '@/lib/supabase/server-auth';
import { logDbError, toSafeApiPayload } from '@/lib/errors/db-error';
import { carTitle } from '@/lib/data/car-names';
import { parseVerificationDraft, writeVerification } from '@/lib/staff/verification';

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

const VALIDATION_MSG = 'Some values look invalid. Please check your input and try again.';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/staff/verify — complete verification. STAFF only (strict).
 * Body: { vehicleId, price, ...verification fields (see lib/staff/verification) }
 * Backend owns the transition: vehicle -> verified, listing -> LIVE.
 * Requires migration 0011 for the per-check breakdown; without it the
 * inspection saves but the Trust Report uses the verified fallback.
 * Admins monitor via /api/admin/*; they do not verify through staff APIs.
 * Editing an already-published file goes to /api/staff/vehicles/[id] instead,
 * which never touches status or published_at.
 */
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth(req);
    requireRoles(ctx, ['STAFF']);

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const vehicleId = typeof body?.vehicleId === 'string' ? body.vehicleId : '';
    const price = typeof body?.price === 'number' ? body.price : NaN;
    const draft = parseVerificationDraft(body);

    if (!vehicleId || !UUID_RE.test(vehicleId)) {
      return NextResponse.json({ error: { message: VALIDATION_MSG, code: 'VALIDATION' } }, { status: 422 });
    }
    if (!draft) {
      return NextResponse.json({ error: { message: VALIDATION_MSG, code: 'VALIDATION' } }, { status: 422 });
    }
    if (!Number.isFinite(price) || price < 0) {
      return NextResponse.json({ error: { message: VALIDATION_MSG, code: 'VALIDATION' } }, { status: 422 });
    }

    // Ownership/assignment check (RLS + trigger enforce again on write).
    const { data: vehicle, error: vErr } = await ctx.sb
      .from('vehicles')
      .select('id,seller_id,status,assigned_staff_id,year,make,model,reg_number')
      .eq('id', vehicleId)
      .maybeSingle();
    if (vErr) throw vErr;
    if (!vehicle) {
      return NextResponse.json({ error: { message: 'The requested item was not found.', code: 'NOT_FOUND' } }, { status: 404 });
    }
    const v = vehicle as { assigned_staff_id: string | null; status: string };
    if (ctx.role !== 'ADMIN' && v.assigned_staff_id && v.assigned_staff_id !== ctx.userId) {
      return NextResponse.json(
        { error: { message: "You don't have permission to do that.", code: 'FORBIDDEN' } },
        { status: 403 }
      );
    }

    // Claim unassigned on verify (keeps MVP to one step; assignment audit via column).
    if (!v.assigned_staff_id) {
      const { error: claimErr } = await ctx.sb
        .from('vehicles')
        .update({ assigned_staff_id: ctx.userId })
        .eq('id', vehicleId);
      if (claimErr) throw claimErr;
    }

    await writeVerification(ctx.sb, vehicleId, ctx.userId, draft);

    //flip to verified (trigger stamps verified_at; blocks non-staff).
    // inspection_status Completed drops it from admin active load/upcoming.
    const { error: vvErr } = await ctx.sb
      .from('vehicles')
      .update({ status: 'verified', inspection_status: 'Completed' })
      .eq('id', vehicleId);
    if (vvErr) throw vvErr;

    // Publish listing at staff-decided price (create if missing).
    const full = (await ctx.sb.from('vehicles').select('*').eq('id', vehicleId).maybeSingle()).data as
      | { year: number; make: string; model: string; variant: string; reg_number: string }
      | null;
    const { data: listing } = await ctx.sb.from('listings').select('id').eq('vehicle_id', vehicleId).maybeSingle();
    if (listing) {
      const { error: lErr } = await ctx.sb
        .from('listings')
        .update({ price, status: 'LIVE', published_at: new Date().toISOString() })
        .eq('vehicle_id', vehicleId);
      if (lErr) throw lErr;
    } else if (full) {
      // Slug is permanent once published — never recompute it for an existing
      // listing, or every shared link and search hit breaks.
      const trim = full.variant ? `-${full.variant}` : '';
      const base = `${full.year}-${full.make}-${full.model}${trim}-${String(full.reg_number).slice(-4)}`;
      const slug = `${slugify(base)}-${vehicleId.slice(0, 6)}`;
      const { error: cErr } = await ctx.sb.from('listings').insert({
        vehicle_id: vehicleId,
        slug,
        title: carTitle(full),
        price,
        description: '',
        status: 'LIVE',
        published_at: new Date().toISOString(),
      });
      if (cErr) throw cErr;
    }

    return NextResponse.json({ data: { vehicleId } });
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
    const { status: s, body } = toSafeApiPayload('staff.verify', err);
    logDbError('staff.verify', err);
    return NextResponse.json(body, { status: s });
  }
}
