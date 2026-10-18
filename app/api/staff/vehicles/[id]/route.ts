import { NextResponse } from 'next/server';
import { requireAuth, requireRoles } from '@/lib/supabase/server-auth';
import { logDbError, toSafeApiPayload } from '@/lib/errors/db-error';
import { parseVerificationDraft, writeVerification } from '@/lib/staff/verification';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The assignee-only guard shared by both handlers. Returns the vehicle row, or
 * a response to send back. Editing is restricted to whoever completed the
 * verification — the same scoping photos_staff_insert and inspections_staff_*
 * already enforce at the row level.
 */
async function loadAssignable(
  ctx: Awaited<ReturnType<typeof requireAuth>>,
  vehicleId: string
): Promise<{ vehicle: { id: string }; error?: never } | { vehicle?: never; error: NextResponse }> {
  const notFound = NextResponse.json(
    { error: { message: 'The requested item was not found.', code: 'NOT_FOUND' } },
    { status: 404 }
  );
  const forbidden = NextResponse.json(
    { error: { message: "You don't have permission to do that.", code: 'FORBIDDEN' } },
    { status: 403 }
  );
  if (!UUID_RE.test(vehicleId)) return { error: notFound };

  const { data: vehicle, error } = await ctx.sb
    .from('vehicles')
    .select('id,status,assigned_staff_id')
    .eq('id', vehicleId)
    .maybeSingle();
  if (error) throw error;
  if (!vehicle) return { error: notFound };
  const v = vehicle as { id: string; assigned_staff_id: string | null };
  if (v.assigned_staff_id !== ctx.userId) return { error: forbidden };
  return { vehicle: v as { id: string } };
}

/**
 * GET /api/staff/vehicles/[id] — full verification record for the assignee,
 * used to prefill the edit form. STAFF only (strict).
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth(req);
    requireRoles(ctx, ['STAFF']);
    const { id } = await params;
    const loaded = await loadAssignable(ctx, id);
    if (loaded.error) return loaded.error;
    const vehicleId = loaded.vehicle.id;

    const [{ data: listing }, { data: inspection }, { data: photos }] = await Promise.all([
      ctx.sb.from('listings').select('*').eq('vehicle_id', vehicleId).maybeSingle(),
      ctx.sb.from('inspections').select('*').eq('vehicle_id', vehicleId).maybeSingle(),
      ctx.sb
        .from('vehicle_photos')
        .select('id,public_url,sort_order')
        .eq('vehicle_id', vehicleId)
        .order('sort_order'),
    ]);

    const inspectionRow = (inspection ?? null) as { id: string } | null;
    const sections = inspectionRow
      ? await (async () => {
          const { data: secs, error: sErr } = await ctx.sb
            .from('inspection_sections')
            .select('id,title,passed,total')
            .eq('inspection_id', inspectionRow.id);
          if (sErr) throw sErr;
          const withItems = [];
          for (const s of (secs ?? []) as { id: string; title: string }[]) {
            const { data: items } = await ctx.sb
              .from('inspection_items')
              .select('name,result,note')
              .eq('section_id', s.id);
            withItems.push({
              title: s.title,
              items: (items ?? []) as { name: string; result: string; note: string }[],
            });
          }
          return withItems;
        })()
      : [];

    return NextResponse.json({
      data: {
        vehicle: loaded.vehicle,
        listing: listing ?? null,
        inspection: inspection ?? null,
        sections,
        photos: photos ?? [],
      },
    });
  } catch (err) {
    return handleError('staff.vehicleDetail', err);
  }
}

/**
 * PATCH /api/staff/vehicles/[id] — correct an already-published verification.
 * STAFF only, assignee only. Writes the inspection and its breakdown and
 * nothing else: vehicle status, listing status, price and published_at are all
 * left alone, so saving a correction can never republish or re-rank a live ad.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth(req);
    requireRoles(ctx, ['STAFF']);
    const { id } = await params;
    const loaded = await loadAssignable(ctx, id);
    if (loaded.error) return loaded.error;
    const vehicleId = loaded.vehicle.id;

    const body = (await req.json().catch(() => null)) as unknown;
    const draft = parseVerificationDraft(body);
    if (!draft) {
      return NextResponse.json(
        { error: { message: 'Some values look invalid. Please check your input and try again.', code: 'VALIDATION' } },
        { status: 422 }
      );
    }

    await writeVerification(ctx.sb, vehicleId, ctx.userId, draft);
    return NextResponse.json({ data: { vehicleId } });
  } catch (err) {
    return handleError('staff.vehicleUpdate', err);
  }
}

function handleError(label: string, err: unknown): NextResponse {
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
  const { status: s, body } = toSafeApiPayload(label, err);
  logDbError(label, err);
  return NextResponse.json(body, { status: s });
}
