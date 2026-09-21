import { NextResponse } from 'next/server';
import { requireAuth, requireRoles } from '@/lib/supabase/server-auth';
import { getServiceClient } from '@/lib/supabase/service';
import { logDbError, toSafeApiPayload } from '@/lib/errors/db-error';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function displayPhone(e164: string): string {
  const digits = e164.replace(/\D/g, '');
  const ten = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
  if (!/^[6-9]\d{9}$/.test(ten)) return e164;
  return `+91 ${ten.slice(0, 5)} ${ten.slice(5)}`;
}

/**
 * GET /api/seller-contact?vehicleId=xxx — reveal seller WhatsApp to signed-in buyers.
 * Never exposed in SSR/dossier payloads. Rate-limited + audit-logged.
 */
export async function GET(req: Request) {
  try {
    const ctx = await requireAuth(req);
    requireRoles(ctx, ['CUSTOMER', 'STAFF', 'ADMIN']);

    const url = new URL(req.url);
    const vehicleId = (url.searchParams.get('vehicleId') ?? '').trim();
    if (!UUID.test(vehicleId)) {
      return NextResponse.json({ error: { message: 'Vehicle is required.', code: 'VALIDATION' } }, { status: 422 });
    }

    const svc = getServiceClient();
    if (!svc) throw { status: 503, message: 'The contact service is temporarily unavailable.' };

    // Rate limit: max 20 reveals/hour per buyer.
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await svc
      .from('phone_reveals')
      .select('id', { count: 'exact', head: true })
      .eq('revealer_id', ctx.userId)
      .gt('created_at', hourAgo);
    if ((count ?? 0) >= 20) {
      return NextResponse.json({ error: { message: 'Too many reveals — try again in an hour.', code: 'RATE_LIMITED' } }, { status: 429 });
    }

    const { data: vehicle, error: vErr } = await svc
      .from('vehicles')
      .select('id,seller_id,inspection_id,year,make,model')
      .eq('id', vehicleId)
      .maybeSingle();
    if (vErr) throw vErr;
    const v = vehicle as { id: string; seller_id: string | null; inspection_id: string; year: number; make: string; model: string } | null;
    if (!v) {
      return NextResponse.json({ error: { message: 'The requested item was not found.', code: 'NOT_FOUND' } }, { status: 404 });
    }

    // Sellers viewing their own file get their number without audit noise.
    let phone: string | null = null;
    if (v.seller_id) {
      const { data: profile } = await svc.from('profiles').select('phone').eq('id', v.seller_id).maybeSingle();
      phone = ((profile as { phone?: string | null } | null)?.phone ?? null) as string | null;
    }
    if (!phone || !/^\+91[6-9][0-9]{9}$/.test(phone)) {
      return NextResponse.json({ data: { phone: null, waLink: null, inspectionId: v.inspection_id } });
    }

    const digits = phone.replace(/\D/g, '');
    const title = `${v.year} ${v.make} ${v.model}`;
    const waLink = `https://wa.me/${digits}?text=${encodeURIComponent(`Hi, I'm interested in ${title} (${v.inspection_id}) on AutoFair. Is it available?`)}`;

    // Audit + buyer→seller signal (best-effort, never blocks reveal).
    try {
      await svc.from('phone_reveals').insert({ vehicle_id: vehicleId, seller_id: v.seller_id, revealer_id: ctx.userId });
      const { data: listing } = await svc.from('listings').select('id,status').eq('vehicle_id', vehicleId).maybeSingle();
      const l = listing as { id: string; status: string } | null;
      if (l && l.status === 'LIVE') {
        await svc.from('inquiries').insert({
          listing_id: l.id,
          buyer_id: ctx.userId,
          buyer_contact: ctx.email ?? '',
          message: `WhatsApp reveal for ${v.inspection_id}`,
          type: 'general',
          status: 'new',
        });
      }
    } catch (err) {
      logDbError('seller-contact.audit', err, { vehicleId });
    }

    return NextResponse.json({ data: { phone: displayPhone(phone), waLink, inspectionId: v.inspection_id } });
  } catch (err) {
    const e = (err ?? {}) as { status?: unknown; message?: unknown; code?: unknown };
    const status = typeof e.status === 'number' ? e.status : undefined;
    if (status === 401 || status === 403) {
      const msg = typeof e.message === 'string' ? e.message : 'Something went wrong. Please try again later.';
      const code = typeof e.code === 'string' ? e.code : status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN';
      return NextResponse.json({ error: { message: msg, code } }, { status });
    }
    const { status: s, body } = toSafeApiPayload('seller-contact', err);
    logDbError('seller-contact', err);
    return NextResponse.json(body, { status: s });
  }
}
