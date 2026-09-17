import { NextResponse } from 'next/server';
import { requireAuth, requireRoles } from '@/lib/supabase/server-auth';
import { logDbError, toSafeApiPayload } from '@/lib/errors/db-error';
import { getServiceClient } from '@/lib/supabase/service';

const STAFF_ROLES = ['staff'];
const ACTIVE = ['Pending', 'Assigned', 'In Progress'];

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function authCreateFailure(error: { message?: string | null; code?: string | null } | null): {
  status: 409 | 422 | 429 | 503;
  code: 'CONFLICT' | 'VALIDATION' | 'UNAVAILABLE';
  message: string;
} {
  const message = String(error?.message ?? '').toLowerCase();
  const code = String(error?.code ?? '').toLowerCase();
  if (message.includes('already') || message.includes('exists') || message.includes('duplicate') || code.includes('duplicate')) {
    return { status: 409, code: 'CONFLICT', message: 'An account with this email already exists.' };
  }
  if (message.includes('password') || code.includes('password') || code.includes('validation')) {
    return {
      status: 422,
      code: 'VALIDATION',
      message: 'The password does not meet the configured security requirements. Use a longer password with uppercase, lowercase, a number, and a symbol.',
    };
  }
  if (message.includes('rate limit') || message.includes('too many') || code.includes('rate_limit')) {
    return { status: 429, code: 'UNAVAILABLE', message: 'Too many account requests were made. Please wait a moment and try again.' };
  }
  return {
    status: 503,
    code: 'UNAVAILABLE',
    message: 'Could not create the staff account. Please verify the Supabase Auth configuration and try again.',
  };
}

function isDuplicateAuthUserError(error: { message?: string | null; code?: string | null } | null): boolean {
  const message = String(error?.message ?? '').toLowerCase();
  const code = String(error?.code ?? '').toLowerCase();
  return message.includes('already') || message.includes('exists') || message.includes('duplicate') || code.includes('duplicate');
}

/** Finds an Auth user by email for orphan recovery only. The Auth Admin API
 * has no get-by-email method, so scan bounded pages server-side. */
async function findAuthUserByEmail(
  svc: NonNullable<ReturnType<typeof getServiceClient>>,
  email: string
): Promise<{ id: string } | null> {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await svc.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const users = data?.users ?? [];
    const match = users.find((user) => user.email?.toLowerCase() === email);
    if (match) return { id: match.id };
    if (users.length < 1000) break;
  }
  return null;
}

/**
 * GET /api/admin/staff — list all inspection staff with backend-computed workload (ADMIN only).
 * Workload is counted server-side from vehicles; frontend value is never trusted.
 */
export async function GET(req: Request) {
  try {
    const ctx = await requireAuth(req);
    requireRoles(ctx, ['ADMIN']);

    const [{ data: staff, error: sErr }, { data: vehicles, error: vErr }] = await Promise.all([
      ctx.sb.from('profiles').select('id,full_name,email,is_active,last_assignment_at,created_at,role').in('role', STAFF_ROLES).order('created_at', { ascending: true }),
      ctx.sb.from('vehicles').select('id,assigned_staff_id,inspection_status,assigned_at,scheduled_at'),
    ]);
    if (sErr) throw sErr;
    if (vErr) throw vErr;

    const staffRows = ((staff ?? []) as Array<{ id: string; full_name: string | null; email: string | null; is_active: boolean | null; last_assignment_at: string | null; created_at: string }>);
    const vehRows = ((vehicles ?? []) as Array<{ id: string; assigned_staff_id: string | null; inspection_status: string | null; assigned_at: string | null; scheduled_at: string | null }>);

    const today = new Date().toISOString().slice(0, 10);
    const out = staffRows.map((s) => {
      const mine = vehRows.filter((v) => v.assigned_staff_id === s.id);
      const load = mine.filter((v) => v.inspection_status && ACTIVE.includes(v.inspection_status)).length;
      const upcoming = mine
        .filter((v) => v.inspection_status && ACTIVE.includes(v.inspection_status))
        .sort((a, b) => String(a.scheduled_at ?? '').localeCompare(String(b.scheduled_at ?? '')))
        .slice(0, 5)
        .map((v) => v.id);
      const todayCount = mine.filter((v) => v.assigned_at && v.assigned_at.slice(0, 10) === today).length;
      return {
        id: s.id,
        fullName: s.full_name ?? 'Unnamed staff',
        email: s.email ?? null,
        isActive: s.is_active ?? true,
        load,
        upcomingCount: mine.filter((v) => v.inspection_status && ACTIVE.includes(v.inspection_status)).length,
        upcomingIds: upcoming,
        todayCount,
        lastAssignmentAt: s.last_assignment_at,
        createdAt: s.created_at,
      };
    });

    return NextResponse.json({ data: out });
  } catch (err) {
    const status = err && typeof err === 'object' && 'status' in (err as Record<string, unknown>) ? Number((err as { status: number }).status) : undefined;
    if (status === 401 || status === 403) {
      const msg = err && typeof err === 'object' && 'message' in (err as Record<string, unknown>) ? String((err as { message: unknown }).message) : 'Something went wrong. Please try again later.';
      return NextResponse.json({ error: { message: msg, code: status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN' } }, { status });
    }
    const { status: s, body } = toSafeApiPayload('admin.staff.list', err);
    logDbError('admin.staff.list', err);
    return NextResponse.json(body, { status: s });
  }
}

/**
 * POST /api/admin/staff — create inspection staff account (ADMIN only).
 * Body: { fullName, email, password }
 * Passwords are hashed by Supabase Auth (bcrypt); never stored or returned.
 * Requires SUPABASE_SERVICE_ROLE_KEY on the server.
 */
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth(req);
    requireRoles(ctx, ['ADMIN']);

    const body = (await req.json().catch(() => null)) as { fullName?: unknown; email?: unknown; password?: unknown } | null;
    const fullName = typeof body?.fullName === 'string' ? body.fullName.trim() : '';
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body?.password === 'string' ? body.password : '';

    if (!fullName || fullName.length < 2) {
      return NextResponse.json({ error: { message: 'Enter the staff member\u2019s full name.', code: 'VALIDATION' } }, { status: 422 });
    }
    if (!isValidEmail(email)) {
      return NextResponse.json({ error: { message: 'Enter a valid email address.', code: 'VALIDATION' } }, { status: 422 });
    }
    if (!password || password.length < 6) {
      return NextResponse.json({ error: { message: 'Password must be at least 6 characters.', code: 'VALIDATION' } }, { status: 422 });
    }

    const svc = getServiceClient();
    if (!svc) {
      return NextResponse.json(
        {
          error: {
            message: 'Staff creation is not configured yet. Add SUPABASE_SERVICE_ROLE_KEY to the server environment, then try again. (Get it from Supabase Dashboard → Project Settings → API → service_role.)',
            code: 'UNAVAILABLE',
          },
        },
        { status: 503 }
      );
    }

    const { data: created, error: cErr } = await svc.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    let userId = created?.user?.id ?? null;
    const createdNewAuthUser = Boolean(userId && !cErr);
    if (cErr || !userId) {
      // Earlier versions could create the Auth record and then fail while
      // assigning its profile role. An admin retrying that exact email should
      // recover the orphan, not be blocked by an invisible Auth-only account.
      if (isDuplicateAuthUserError(cErr)) {
        const orphan = await findAuthUserByEmail(svc, email);
        if (orphan) {
          const { data: existingProfile, error: lookupError } = await svc
            .from('profiles')
            .select('id')
            .eq('id', orphan.id)
            .maybeSingle();
          if (lookupError) throw lookupError;
          if (!existingProfile) {
            const { error: updateError } = await svc.auth.admin.updateUserById(orphan.id, {
              password,
              email_confirm: true,
              user_metadata: { full_name: fullName },
            });
            if (updateError) {
              const safe = authCreateFailure(updateError);
              return NextResponse.json({ error: { message: safe.message, code: safe.code } }, { status: safe.status });
            }
            userId = orphan.id;
          }
        }
      }
      if (userId) {
        // Continue below and atomically complete the missing profile role.
      } else {
        logDbError('admin.staff.create.auth-user', cErr ?? new Error('createUser returned no user'));
        const safe = authCreateFailure(cErr);
        return NextResponse.json({ error: { message: safe.message, code: safe.code } }, { status: safe.status });
      }
    }

    const { error: pErr } = await svc
      .from('profiles')
      .upsert({ id: userId, full_name: fullName, email, role: 'staff', is_active: true }, { onConflict: 'id' });
    if (pErr) {
      // Do not leave an account that can authenticate but has no valid staff
      // profile. The service credential is the only actor allowed to perform
      // this compensating cleanup.
      if (createdNewAuthUser) await svc.auth.admin.deleteUser(userId).catch(() => undefined);
      logDbError('admin.staff.create.profile', pErr, { stage: 'profile-upsert' });
      return NextResponse.json(
        { error: { message: 'Could not finish setting up the staff account. Please try again.', code: 'UNAVAILABLE' } },
        { status: 503 }
      );
    }

    return NextResponse.json({ data: { id: userId, fullName, email, isActive: true } }, { status: 201 });
  } catch (err) {
    const status = err && typeof err === 'object' && 'status' in (err as Record<string, unknown>) ? Number((err as { status: number }).status) : undefined;
    if (status === 401 || status === 403) {
      const msg = err && typeof err === 'object' && 'message' in (err as Record<string, unknown>) ? String((err as { message: unknown }).message) : 'Something went wrong. Please try again later.';
      return NextResponse.json({ error: { message: msg, code: status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN' } }, { status });
    }
    const { status: s, body } = toSafeApiPayload('admin.staff.create', err);
    logDbError('admin.staff.create', err);
    return NextResponse.json(body, { status: s });
  }
}
