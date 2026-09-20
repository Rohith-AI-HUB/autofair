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
 * Body: { vehicleId, score 0-10, overallStatus, notes?, ratings?, price >= 0,
 *   condition? {mechanical,exterior,interior,tyres}, accidentStatus?, accidentNote?,
 *   docsStatus?, docsNote?, sections? [{title, items:[{name,result,note}]}] }
 * Backend owns the transition: vehicle -> verified, listing -> LIVE.
 * Requires migration 0011 for the per-check breakdown; without it the
 * inspection saves but the Trust Report uses the verified fallback.
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
      condition?: unknown;
      accidentStatus?: unknown;
      accidentNote?: unknown;
      docsStatus?: unknown;
      docsNote?: unknown;
      sections?: unknown;
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
    const CONDITION_LABELS = new Set(['EXCELLENT', 'VERY GOOD', 'GOOD', 'AVERAGE', 'POOR']);
    const cleanCondition: Record<string, string> | null = (() => {
      if (!body?.condition || typeof body.condition !== 'object' || Array.isArray(body.condition)) return null;
      const out: Record<string, string> = {};
      for (const k of ['mechanical', 'exterior', 'interior', 'tyres']) {
        const raw = (body.condition as Record<string, unknown>)[k];
        if (typeof raw !== 'string' || !raw.trim()) continue;
        const v = raw.trim().toUpperCase().slice(0, 24);
        out[k] = CONDITION_LABELS.has(v) ? v : v;
      }
      return Object.keys(out).length ? out : null;
    })();
    const ACCIDENTS = new Set(['CLEAR', 'MINOR REPAIR', 'MAJOR ACCIDENT']);
    const accidentStatusRaw = typeof body?.accidentStatus === 'string' ? body.accidentStatus.trim().toUpperCase().slice(0, 32) : 'CLEAR';
    const accidentStatus = ACCIDENTS.has(accidentStatusRaw) ? accidentStatusRaw : 'CLEAR';
    const accidentNote = typeof body?.accidentNote === 'string' ? body.accidentNote.slice(0, 500) : '';
    const docsStatus = typeof body?.docsStatus === 'string' && body.docsStatus.trim()
      ? body.docsStatus.trim().toUpperCase().slice(0, 32)
      : '1 PENDING';
    const docsNote = typeof body?.docsNote === 'string' ? body.docsNote.slice(0, 500) : '';
    // Breakdown sections: [{title, items:[{name,result,note}]}]. Capped so one
    // request cannot flood the table. Names/titles trimmed, notes sliced.
    const cleanSections: { title: string; items: { name: string; result: string; note: string }[] }[] = (() => {
      if (!Array.isArray(body?.sections)) return [];
      return (body.sections as unknown[])
        .slice(0, 12)
        .map((s) => {
          if (!s || typeof s !== 'object') return null;
          const title = typeof (s as { title?: unknown }).title === 'string'
            ? String((s as { title: string }).title).trim().slice(0, 80)
            : '';
          const rawItems = Array.isArray((s as { items?: unknown }).items) ? ((s as { items: unknown[] }).items as unknown[]) : [];
          const items = rawItems.slice(0, 20).map((it) => {
            if (!it || typeof it !== 'object') return null;
            const name = typeof (it as { name?: unknown }).name === 'string'
              ? String((it as { name: string }).name).trim().slice(0, 120)
              : '';
            const result = typeof (it as { result?: unknown }).result === 'string'
              ? String((it as { result: string }).result).toLowerCase()
              : '';
            const note = typeof (it as { note?: unknown }).note === 'string'
              ? String((it as { note: string }).note).slice(0, 300)
              : '';
            if (!name || !OVERALL.has(result)) return null;
            return { name, result, note };
          }).filter((x): x is { name: string; result: string; note: string } => x !== null);
          if (!title || !items.length) return null;
          return { title, items };
        })
        .filter((x): x is { title: string; items: { name: string; result: string; note: string }[] } => x !== null);
    })();

    if (!vehicleId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(vehicleId)) {
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
          condition: cleanCondition,
          accident_status: accidentStatus,
          accident_note: accidentNote,
          docs_status: docsStatus,
          docs_note: docsNote,
          is_sample: false,
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
        condition: cleanCondition,
        accident_status: accidentStatus,
        accident_note: accidentNote,
        docs_status: docsStatus,
        docs_note: docsNote,
        is_sample: false,
        inspected_at: new Date().toISOString(),
      });
      if (iErr) throw iErr;
    }

    // Per-check breakdown (requires migration 0011 RLS). Replace the whole
    // breakdown so re-verification never duplicates rows. Best-effort when
    // sections are provided; without them the report keeps prior data.
    if (cleanSections.length) {
      const { data: inspRow } = await ctx.sb
        .from('inspections')
        .select('id')
        .eq('vehicle_id', vehicleId)
        .maybeSingle();
      const inspectionId = (inspRow as { id: string } | null)?.id;
      if (!inspectionId) throw new Error('inspection row missing after upsert');
      const { error: delErr } = await ctx.sb
        .from('inspection_sections')
        .delete()
        .eq('inspection_id', inspectionId);
      if (delErr) throw delErr;
      const now = new Date().toISOString();
      for (const sec of cleanSections) {
        const passed = sec.items.filter((i) => i.result === 'pass').length;
        const { data: secRow, error: sErr } = await ctx.sb
          .from('inspection_sections')
          .insert({ inspection_id: inspectionId, title: sec.title, passed, total: sec.items.length })
          .select('id')
          .single();
        if (sErr) throw sErr;
        const sectionId = (secRow as { id: string }).id;
        const { error: itErr } = await ctx.sb.from('inspection_items').insert(
          sec.items.map((it) => ({
            section_id: sectionId,
            name: it.name,
            result: it.result,
            note: it.note,
            inspected_at: now,
            inspector_id: ctx.userId,
          }))
        );
        if (itErr) throw itErr;
      }
    }

    //flip to verified (trigger stamps verified_at; blocks non-staff).
    // inspection_status Completed drops it from admin active load/upcoming.
    const { error: vvErr } = await ctx.sb
      .from('vehicles')
      .update({ status: 'verified', inspection_status: 'Completed' })
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
