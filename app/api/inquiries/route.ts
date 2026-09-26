import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/service';
import { sendEmail } from '@/lib/email';
import { logDbError, toSafeApiPayload } from '@/lib/errors/db-error';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INSPECTION_ID_RE = /^AF-\d{4}-\d{4,}$/i;
const MAX_PER_HOUR = 5;

/**
 * POST /api/inquiries — public contact form.
 * Stores the message in `inquiries` (service role; anonymous buyers have no
 * auth.uid, so RLS-backed browser inserts cannot apply here) and emails the
 * office. Rate-limited per buyer email via a DB count — no extra infra.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as {
      name?: unknown;
      email?: unknown;
      inspectionId?: unknown;
      message?: unknown;
    } | null;

    const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 120) : '';
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase().slice(0, 254) : '';
    const inspectionId =
      typeof body?.inspectionId === 'string' ? body.inspectionId.trim().toUpperCase() : '';
    const message = typeof body?.message === 'string' ? body.message.trim().slice(0, 4000) : '';

    if (!name || !email || !EMAIL_RE.test(email) || message.length < 10) {
      return NextResponse.json(
        { error: { message: 'Please fill in name, a valid email and a longer message.', code: 'VALIDATION' } },
        { status: 422 }
      );
    }
    if (inspectionId && !INSPECTION_ID_RE.test(inspectionId)) {
      return NextResponse.json(
        { error: { message: 'Inspection ID must look like AF-2026-008421.', code: 'VALIDATION' } },
        { status: 422 }
      );
    }

    const svc = getServiceClient();
    if (!svc) {
      return NextResponse.json(
        { error: { message: 'Inquiries are temporarily unavailable. Please try again later.', code: 'UNAVAILABLE' } },
        { status: 503 }
      );
    }

    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await svc
      .from('inquiries')
      .select('id', { count: 'exact', head: true })
      .eq('buyer_contact', email)
      .gte('created_at', since);
    if ((count ?? 0) >= MAX_PER_HOUR) {
      return NextResponse.json(
        { error: { message: 'Too many messages from this email — please try again in an hour.', code: 'RATE_LIMITED' } },
        { status: 429 }
      );
    }

    // Optional AF id → attach the LIVE listing when one exists (general
    // queries and pre-verification files legitimately have none).
    let listingId: string | null = null;
    if (inspectionId) {
      const { data: vehicle } = await svc
        .from('vehicles')
        .select('id')
        .eq('inspection_id', inspectionId)
        .maybeSingle();
      if (vehicle) {
        const { data: listing } = await svc
          .from('listings')
          .select('id')
          .eq('vehicle_id', (vehicle as { id: string }).id)
          .eq('status', 'LIVE')
          .maybeSingle();
        listingId = ((listing as { id: string } | null) ?? null)?.id ?? null;
      }
    }

    const { error: insertError } = await svc.from('inquiries').insert({
      listing_id: listingId,
      buyer_contact: email,
      message: `${message}\n\n— ${name} <${email}>${inspectionId ? ` · ${inspectionId}` : ''}`,
      type: 'general',
    });
    if (insertError) throw insertError;

    const office = process.env.OFFICE_EMAIL ?? 'autofaironline.co@gmail.com';
    const emailed = await sendEmail({
      to: office,
      subject: `New inquiry ${inspectionId || '(no file id)'} — ${name}`,
      text: [
        `Name: ${name}`,
        `Email: ${email}`,
        inspectionId ? `Inspection ID: ${inspectionId}` : null,
        '',
        message,
      ]
        .filter(Boolean)
        .join('\n'),
      replyTo: email,
    });
    if (!emailed) logDbError('inquiries.email', new Error('Resend send failed or not configured'), { inspectionId });

    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    const safe = toSafeApiPayload('inquiries.create', err);
    logDbError('inquiries.create', err);
    return NextResponse.json(safe.body, { status: safe.status });
  }
}
