import { NextResponse } from 'next/server';
import { requireAuth, requireRoles } from '@/lib/supabase/server-auth';
import { logDbError, toSafeApiPayload } from '@/lib/errors/db-error';

const OVERALL = new Set(['pass', 'attention', 'fail']);

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

/**
 * POST /api/staff/verify — complete verification. STAFF only (strict).
 * Body: { vehicleId, score 0-10, overallStatus, notes?, ratings?, price >= 0 }
 * Backend owns the transition: vehicle -> verified, listing -> LIVE.
 * Admins monitor via /api/admin/*; they do not verify through staff APIs.
 */
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth(req);
    requireRoles(ctx, ['STAFF']);

    const body = (await req.json().catch(() => null)) as {
      vehicleId?: unknown;
      score?: unknown;
      overallStatus?: unknown;
      notes?: unknown;
      ratings?: unknown;
      price?: unknown;
    } | null;
    const vehicleId = typeof body?.vehicleId === 'string' ? body.vehicleId : '';
    const score = typeof body?.score === 'number' ? body.score : NaN;
    const overallStatus = typeof body?.overallStatus === 'string' ? body.overallStatus : '';
    const notes = typeof body?.notes === 'string' ? body.notes.slice(0, 2000) : '';
    const price = typeof body?.price === 'number' ? body.price : NaN;
    const ratings =
      body?.ratings && typeof body.ratings === 'object' && !Array.isArray(body.ratings)
        ? (body.ratings as Record<string, unknown>)
        : null;

    if (!vehicleId) {
      return NextResponse.json(
        { error: { message: 'Some values look invalid. Please check your input and try again.', code: 'VALIDATION' } },
        { status: 422 }
      );
    }
    if (!Number.isFinite(score) || score < 0 || score > 10) {
      return NextResponse.json(
        { error: { message: 'Some values look invalid. Please check your input and try again.', code: 'VALIDATION' } },
        { status: 422 }
      );
    }
    if (!OVERALL.has(overallStatus)) {
      return NextResponse.json(
        { error: { message: 'Some values look invalid. Please check your input and try again.', code: 'VALIDATION' } },
        { status: 422 }
      );
    }
    if (!Number.isFinite(price) || price < 0) {
      return NextResponse.json(
        { error: { message: 'Some values look invalid. Please check your input and try again.', code: 'VALIDATION' } },
        { status: 422 }
      );
    }

    // Ownership/assignment check (RLS + trigger enforce again on write).
    const { data: vehicle, error: vErr } = await ctx.sb
      .from('vehicles')
      .select('id,seller_id,status,assigned_staff_id,year,make,model,reg_number')
      .eq('id', vehicleId)
      .maybeSingle();
    if (vErr) throw vErr;
    if (!vehicle) {
      return NextResponse.json(
        { error: { message: 'The requested item was not found.', code: 'NOT_FOUND' } },
        { status: 404 }
      );
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

    // Upsert inspection (reuses existing table; ratings jsonb stays configurable).
    const cleanRatings: Record<string, number | null> | null = (() => {
      if (!ratings) return null;
      const allowed = ['overall', 'exterior', 'interior', 'mechanical', 'tyres', 'electrical'];
      const out: Record<string, number | null> = {};
      for (const k of allowed) {
        const raw = (ratings as Record<string, unknown>)[k];
        if (raw == null) continue;
        const n = typeof raw === 'number' ? raw : Number(raw);
        out[k] = Number.isFinite(n) ? Math.min(10, Math.max(0, n)) : null;
      }
      return Object.keys(out).length ? out : null;
    })();

    const { data: existingInsp } = await ctx.sb
      .from('inspections')
      .select('id')
      .eq('vehicle_id', vehicleId)
      .maybeSingle();

    if (existingInsp) {
      const { error: uErr } = await ctx.sb
        .from('inspections')
        .update({
          inspector_id: ctx.userId,
          score,
          overall_status: overallStatus,
          notes,
          ratings: cleanRatings,
          inspected_at: new Date().toISOString(),
        })
        .eq('vehicle_id', vehicleId);
      if (uErr) throw uErr;
    } else {
      const { error: iErr } = await ctx.sb.from('inspections').insert({
        vehicle_id: vehicleId,
        inspector_id: ctx.userId,
        score,
        overall_status: overallStatus,
        notes,
        ratings: cleanRatings,
        inspected_at: new Date().toISOString(),
      });
      if (iErr) throw iErr;
    }

    //flip to verified (trigger stamps verified_at; blocks non-staff).
    const { error: vvErr } = await ctx.sb
      .from('vehicles')
      .update({ status: 'verified' })
      .eq('id', vehicleId);
    if (vvErr) throw vvErr;

    // Publish listing at staff-decided price (create if missing).
    const full = (await ctx.sb.from('vehicles').select('*').eq('id', vehicleId).maybeSingle()).data as
      | { year: number; make: string; model: string; reg_number: string }
      | null;
    const { data: listing } = await ctx.sb.from('listings').select('id').eq('vehicle_id', vehicleId).maybeSingle();
    if (listing) {
      const { error: lErr } = await ctx.sb
        .from('listings')
        .update({ price, status: 'LIVE', published_at: new Date().toISOString() })
        .eq('vehicle_id', vehicleId);
      if (lErr) throw lErr;
    } else if (full) {
      const base = `${full.year}-${full.make}-${full.model}-${String(full.reg_number).slice(-4)}`;
      const slug = `${slugify(base)}-${vehicleId.slice(0, 6)}`;
      const { error: cErr } = await ctx.sb.from('listings').insert({
        vehicle_id: vehicleId,
        slug,
        title: `${full.year} ${full.make} ${full.model}`,
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
      return NextResponse.json(
        { error: { message: msg, code: status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN' } },
        { status }
      );
    }
    const { status: s, body } = toSafeApiPayload('staff.verify', err);
    logDbError('staff.verify', err);
    return NextResponse.json(body, { status: s });
  }
}
