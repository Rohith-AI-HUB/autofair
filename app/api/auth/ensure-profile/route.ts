import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase/server-auth';
import { getServiceClient } from '@/lib/supabase/service';
import { logDbError, toSafeApiPayload } from '@/lib/errors/db-error';

/**
 * POST /api/auth/ensure-profile — create the caller's profiles row when the
 * signup trigger did not provision one.
 *
 * Accounts without a profiles row cannot be authorized by requireAuth at all,
 * so this is the only repair path that can run before a role exists: it checks
 * the credential, not the role. `ignoreDuplicates` makes it create-only, the id
 * comes from the verified token, and the role is hardcoded 'customer', so this
 * can never rewrite an existing row or escalate anyone.
 */
export async function POST(req: Request) {
  try {
    const ctx = await requireUser(req);
    const svc = getServiceClient();
    if (!svc) {
      throw { status: 503, message: 'The service is temporarily unavailable. Please try again later.' };
    }
    const { error } = await svc
      .from('profiles')
      .upsert(
        { id: ctx.userId, email: ctx.email, role: 'customer', is_active: true },
        { onConflict: 'id', ignoreDuplicates: true }
      );
    if (error) throw error;
    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    const e = (err ?? {}) as { status?: unknown; message?: unknown };
    const status = typeof e.status === 'number' ? e.status : undefined;
    if (status === 401 || status === 403) {
      return NextResponse.json(
        { error: { message: String(e.message ?? 'Something went wrong.'), code: status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN' } },
        { status }
      );
    }
    logDbError('ensure-profile', err);
    const { status: safeStatus, body } = toSafeApiPayload('ensure-profile', err);
    return NextResponse.json(body, { status: safeStatus });
  }
}
