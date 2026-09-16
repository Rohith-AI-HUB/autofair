/**
 * Centralized database error handling for AutoFair.
 *
 * All Supabase / PostgREST / storage errors MUST flow through here so that:
 * - users only ever see safe, generic messages (no SQL, table names, hints, stacks)
 * - the original error is preserved server-side via structured logging
 * - known Postgres / network conditions map to appropriate HTTP statuses
 *
 * Frontend: never render `err.message` directly. Use `getSafeErrorMessage(err)`
 * which returns `userMessage` for DbOperationError and a generic fallback otherwise.
 */

export type DbErrorCode =
  | 'VALIDATION'
  | 'CONFLICT'
  | 'UNAVAILABLE'
  | 'FORBIDDEN'
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'INTERNAL';

export interface SafeDbResult {
  status: number;
  code: DbErrorCode;
  userMessage: string;
}

export const SAFE_MESSAGES = {
  INTERNAL: 'Something went wrong. Please try again later.',
  UNAVAILABLE: 'The service is temporarily unavailable. Please try again later.',
  CONFLICT_GENERIC: 'This record already exists. Please check your input and try again.',
  CONFLICT_REG_NUMBER:
    'A vehicle with this registration number already exists. Please check the number and try again.',
  VALIDATION: 'Some values look invalid. Please check your input and try again.',
  FORBIDDEN: "You don't have permission to do that.",
  UNAUTHORIZED: 'Please sign in again to continue.',
  NOT_FOUND: 'The requested item was not found.',
  PROFILE_SETUP_FAILED:
    'Could not set up your seller profile. Please try again later.',
  VEHICLE_SAVE_FAILED: 'Could not save your vehicle. Please try again later.',
  PHOTOS_SAVE_FAILED:
    'Vehicle saved but photos could not be saved. Please try adding photos again from My Listings.',
  DELETE_FAILED: 'Could not delete this vehicle. Please try again later.',
  UPLOAD_FAILED: 'Photo upload failed. Please try again.',
} as const;

function isDev(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const env = (globalThis as any)?.process?.env ?? process.env;
    return env?.NODE_ENV !== 'production';
  } catch {
    return false;
  }
}

export function generateRequestId(): string {
  try {
    const g = globalThis as unknown as {
      crypto?: { randomUUID?: () => string };
    };
    if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return `req-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

const SENSITIVE_KEYS = new Set(
  [
    'password',
    'passwd',
    'pwd',
    'secret',
    'token',
    'accesstoken',
    'access_token',
    'refreshtoken',
    'refresh_token',
    'apikey',
    'api_key',
    'anonkey',
    'anon_key',
    'servicekey',
    'service_key',
    'service_role',
    'authorization',
    'auth',
    'cookie',
    'cookies',
    'set-cookie',
    'connectionstring',
    'connection_string',
    'databaseurl',
    'database_url',
    'supabaseurl',
    'supabase_url',
    'supabaseanonkey',
    'supabase_anon_key',
    'supabaseservicekey',
    'supabase_service_key',
    'privatekey',
    'private_key',
    'clientsecret',
    'client_secret',
  ].map((k) => k.toLowerCase().replace(/[^a-z0-9]/g, ''))
);

function normalizeKey(k: string): string {
  return k.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function looksLikeSecretValue(v: unknown): boolean {
  if (typeof v !== 'string') return false;
  const s = v.trim();
  if (s.length < 16) return false;
  if (/^postgres(ql)?:\/\//i.test(s)) return true;
  if (/^eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./.test(s)) return true;
  if (/^sb_[A-Za-z0-9_-]{10,}/.test(s)) return true;
  if (/supabase\.co/i.test(s) && s.length > 40) return true;
  return false;
}

/** Deep-redact sensitive keys + secret-looking values. Never throws. */
export function redactSensitive<T>(input: T, depth = 0): T {
  if (depth > 4) return '[TRUNCATED]' as unknown as T;
  if (input == null) return input;
  if (typeof input === 'string') {
    if (looksLikeSecretValue(input)) return '[REDACTED]' as unknown as T;
    return (input.length > 2000 ? input.slice(0, 2000) + '…[TRUNCATED]' : input) as unknown as T;
  }
  if (Array.isArray(input)) {
    return input.slice(0, 50).map((v) => redactSensitive(v, depth + 1)) as unknown as T;
  }
  if (typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(normalizeKey(k))) {
        out[k] = '[REDACTED]';
      } else {
        try {
          out[k] = redactSensitive(v, depth + 1);
        } catch {
          out[k] = '[UNREADABLE]';
        }
      }
    }
    return out as unknown as T;
  }
  return input;
}

interface SupabaseLikeError {
  code?: unknown;
  message?: unknown;
  details?: unknown;
  hint?: unknown;
  status?: unknown;
}

function readErrorParts(raw: unknown): {
  code: string;
  message: string;
  details: string;
  hint: string;
  status: number | null;
} {
  if (typeof raw === 'string') {
    return { code: '', message: raw, details: '', hint: '', status: null };
  }
  if (raw && typeof raw === 'object') {
    const e = raw as SupabaseLikeError & { cause?: unknown };
    const nested =
      e.cause && typeof e.cause === 'object'
        ? (e.cause as SupabaseLikeError)
        : null;
    const code = String(e.code ?? nested?.code ?? '');
    const msgSource =
      e.message ?? nested?.message ?? (raw instanceof Error ? raw.message : 'Unknown error');
    const message = String(msgSource ?? 'Unknown error');
    const details = String(e.details ?? nested?.details ?? '');
    const hint = String(e.hint ?? nested?.hint ?? '');
    const rawStatus = e.status ?? nested?.status;
    const status =
      typeof rawStatus === 'number'
        ? rawStatus
        : typeof rawStatus === 'string' && /^\d+$/.test(rawStatus)
          ? Number(rawStatus)
          : null;
    return { code, message, details, hint, status };
  }
  if (raw instanceof Error) {
    return { code: '', message: raw.message || 'Unknown error', details: '', hint: '', status: null };
  }
  return { code: '', message: 'Unknown error', details: '', hint: '', status: null };
}

function combinedHaystack(parts: { code: string; message: string; details: string; hint: string }): string {
  return `${parts.code}\n${parts.message}\n${parts.details}\n${parts.hint}`.toLowerCase();
}

/**
 * Map a raw Supabase/Postgres/network error to a safe HTTP status + message.
 * Never includes table/column names, SQL, hints, or driver text.
 */
export function classifyDbError(raw: unknown): SafeDbResult {
  const parts = readErrorParts(raw);
  const hay = combinedHaystack(parts);
  const code = (parts.code || '').toUpperCase().trim();

  // --- Unavailable: network / Supabase not reachable / misconfigured ---
  if (
    code === 'ECONNREFUSED' ||
    code === 'ENOTFOUND' ||
    code === 'ETIMEDOUT' ||
    code === 'EAI_AGAIN' ||
    code === 'ENETUNREACH' ||
    hay.includes('failed to fetch') ||
    hay.includes('fetch failed') ||
    hay.includes('networkerror') ||
    hay.includes('network request failed') ||
    hay.includes('temporarily unavailable') ||
    hay.includes('connection refused') ||
    hay.includes('connection reset') ||
    hay.includes('connection timed out') ||
    hay.includes('timeout') ||
    hay.includes('econn') ||
    hay.includes('supabase not configured') ||
    hay.includes('supabase url') ||
    parts.status === 502 ||
    parts.status === 503 ||
    parts.status === 504
  ) {
    return { status: 503, code: 'UNAVAILABLE', userMessage: SAFE_MESSAGES.UNAVAILABLE };
  }

  // --- Auth-adjacent (thrown from supabase.auth.* but surfaced via DB layer) ---
  if (
    hay.includes('jwt expired') ||
    hay.includes('invalid jwt') ||
    hay.includes('not authenticated') ||
    hay.includes('session missing') ||
    hay.includes('session expired')
  ) {
    return { status: 401, code: 'UNAUTHORIZED', userMessage: SAFE_MESSAGES.UNAUTHORIZED };
  }
  if (
    code === '42501' ||
    hay.includes('permission denied') ||
    hay.includes('row-level security') ||
    hay.includes('row level security') ||
    hay.includes('violates row-level security') ||
    hay.includes('insufficient_privilege') ||
    hay.includes('insufficient privilege') ||
    (hay.includes('policy') && hay.includes('rls'))
  ) {
    return { status: 403, code: 'FORBIDDEN', userMessage: SAFE_MESSAGES.FORBIDDEN };
  }

  // --- Conflict: unique violations (reg_number, slug, inspection_id, etc.) ---
  if (
    code === '23505' ||
    hay.includes('duplicate key') ||
    hay.includes('already exists') ||
    hay.includes('unique constraint')
  ) {
    if (
      hay.includes('reg_number') ||
      hay.includes('reg number') ||
      hay.includes('registration') ||
      hay.includes('vehicles_reg')
    ) {
      return { status: 409, code: 'CONFLICT', userMessage: SAFE_MESSAGES.CONFLICT_REG_NUMBER };
    }
    if (hay.includes('slug') && !hay.includes('reg')) {
      return { status: 409, code: 'CONFLICT', userMessage: SAFE_MESSAGES.CONFLICT_GENERIC };
    }
    // Generic unique violation (e.g. inspection_id retry) is still a conflict,
    // but without field details to avoid leaking schema.
    return { status: 409, code: 'CONFLICT', userMessage: SAFE_MESSAGES.CONFLICT_GENERIC };
  }

  // --- Validation: NOT NULL / CHECK / bad input ---
  if (
    code === '23502' ||
    code === '23514' ||
    code === '22001' ||
    code === '22003' ||
    code === '22P02' ||
    code === '42602' ||
    hay.includes('not-null') ||
    hay.includes('not null') ||
    hay.includes('violates not-null') ||
    hay.includes('violates check constraint') ||
    hay.includes('check constraint') ||
    hay.includes('invalid input') ||
    hay.includes('invalid_text_representation') ||
    hay.includes('invalid text representation') ||
    hay.includes('value too long') ||
    hay.includes('out of range')
  ) {
    return { status: 422, code: 'VALIDATION', userMessage: SAFE_MESSAGES.VALIDATION };
  }

  // --- FK: references a missing parent (profile, vehicle, listing, ...) ---
  if (code === '23503' || hay.includes('foreign key') || hay.includes('violates foreign key')) {
    return {
      status: 422,
      code: 'VALIDATION',
      userMessage: SAFE_MESSAGES.VALIDATION,
    };
  }

  // --- Not found (PostgREST single-row helpers) ---
  if (code === 'PGRST116' || hay.includes('no rows') || hay.includes('results contain 0 rows')) {
    return { status: 404, code: 'NOT_FOUND', userMessage: SAFE_MESSAGES.NOT_FOUND };
  }

  return { status: 500, code: 'INTERNAL', userMessage: SAFE_MESSAGES.INTERNAL };
}

export interface LogContext {
  [key: string]: unknown;
}

/**
 * Structured server-side log. Keeps original error type/message/stack +
 * operation + correlation id, with sensitive values redacted.
 */
export function logDbError(
  operation: string,
  raw: unknown,
  context?: LogContext,
  requestId?: string
): string {
  const rid = requestId ?? generateRequestId();
  const parts = readErrorParts(raw);
  const classified = classifyDbError(raw);
  const rawName =
    raw instanceof Error
      ? raw.name || 'Error'
      : raw && typeof raw === 'object' && 'name' in (raw as Record<string, unknown>)
        ? String((raw as Record<string, unknown>).name)
        : typeof raw;
  let stack: string | undefined;
  if (raw instanceof Error && raw.stack) {
    stack = raw.stack.length > 4000 ? raw.stack.slice(0, 4000) + '…[TRUNCATED]' : raw.stack;
  }
  const payload = {
    level: 'error',
    kind: 'db-error',
    ts: new Date().toISOString(),
    operation,
    requestId: rid,
    errorType: rawName,
    code: parts.code || undefined,
    status: classified.status,
    classifiedAs: classified.code,
    // Original driver message kept ONLY in server logs, never in responses.
    message: parts.message.slice(0, 2000),
    details: parts.details ? parts.details.slice(0, 1000) : undefined,
    hint: parts.hint ? parts.hint.slice(0, 1000) : undefined,
    stack,
    context: context ? redactSensitive(context) : undefined,
  };
  try {
    // eslint-disable-next-line no-console
    console.error(JSON.stringify(redactSensitive(payload)));
  } catch {
    try {
      // eslint-disable-next-line no-console
      console.error(`[db-error] ${operation} ${rid} ${classified.code}`);
    } catch {
      /* logging must never throw */
    }
  }
  return rid;
}

/**
 * Public error type thrown across DB boundaries. `message` === safe
 * user-facing text, so UI may render `err.userMessage` directly.
 * Original error is kept on `cause` (server logs only).
 */
export class DbOperationError extends Error {
  status: number;
  code: DbErrorCode;
  userMessage: string;
  operation: string;
  requestId: string;
  isPublic = true;

  constructor(
    operation: string,
    raw: unknown,
    overrides?: Partial<Pick<SafeDbResult, 'status' | 'code' | 'userMessage'>> & {
      context?: LogContext;
      requestId?: string;
    }
  ) {
    const classified = classifyDbError(raw);
    const status = overrides?.status ?? classified.status;
    const code = overrides?.code ?? classified.code;
    const userMessage = overrides?.userMessage ?? classified.userMessage;
    super(userMessage);
    this.name = 'DbOperationError';
    this.status = status;
    this.code = code;
    this.userMessage = userMessage;
    this.operation = operation;
    this.requestId = logDbError(operation, raw, overrides?.context, overrides?.requestId);
    if (raw instanceof Error && raw.stack) {
      try {
        (this as unknown as { cause: unknown }).cause = raw;
      } catch {
        /* ignore */
      }
    }
  }
}

/** Convenience: log + wrap in one call. */
export function toDbOperationError(
  operation: string,
  raw: unknown,
  overrides?: Partial<Pick<SafeDbResult, 'status' | 'code' | 'userMessage'>> & {
    context?: LogContext;
    requestId?: string;
  }
): DbOperationError {
  return new DbOperationError(operation, raw, overrides);
}

// ---------------------------------------------------------------------------
// Leakage detection (used by UI fallback + tests)
// ---------------------------------------------------------------------------

const LEAK_PATTERNS: RegExp[] = [
  /select\s+.+\s+from\s+/i,
  /insert\s+into\s+/i,
  /update\s+.+\s+set\s+/i,
  /delete\s+from\s+/i,
  /from\s+"?public"?\./i,
  /duplicate\s+key/i,
  /violates\s+(not-null|check|foreign key|unique|row-level)/i,
  /unique\s+constraint/i,
  /foreign\s+key/i,
  /row-level\s+security/i,
  /postgrest/i,
  /postgres/i,
  /supabase/i,
  /relation\s+"?[a-z_]+"?\s+does not exist/i,
  /column\s+"?[a-z_]+"?\s+does not exist/i,
  /table\s+"?[a-z_]+"?/i,
  /constraint\s+"?[a-z_]+"?/i,
  /vehicles?(_photos|_id)?/i,
  /vehicle_photos/i,
  /profiles/i,
  /listings/i,
  /inquiries/i,
  /inspections?(_sections|_items)?/i,
  /seller_id/i,
  /vehicle_id/i,
  /listing_id/i,
  /reg_number/i,
  /storage_path/i,
  /public_url/i,
  /inspection_id/i,
  /error\s+code\s*:?\s*\d{4,5}/i,
  /\b(23505|23503|23502|23514|42501|22P02|PGRST\d+)\b/,
  /at\s+\S+\s+\(.+\.tsx?:\d+:\d+\)/,
  /\.tsx?:\d+:\d+/,
  /\.sql\b/i,
  /\/[a-z0-9_.-]+\/[a-z0-9_./-]+\.(ts|tsx|js|sql)/i,
  /postgres(ql)?:\/\//i,
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./,
  /\bsb_[A-Za-z0-9_-]{10,}/,
  /api[_-]?key/i,
  /connection\s+string/i,
  /\bstack\b.*\b(at|Error)\b/i,
];

export function isLeakyMessage(msg: unknown): boolean {
  if (typeof msg !== 'string' || !msg) return false;
  return LEAK_PATTERNS.some((re) => re.test(msg));
}

/**
 * Frontend-safe extractor. Returns the sanitized message for
 * DbOperationError, otherwise a generic fallback unless the original
 * message is provably non-leaky AND short (to avoid showing driver text).
 */
export function getSafeErrorMessage(err: unknown, fallback = SAFE_MESSAGES.INTERNAL): string {
  if (err instanceof DbOperationError) return err.userMessage;
  if (
    err &&
    typeof err === 'object' &&
    'userMessage' in (err as Record<string, unknown>) &&
    typeof (err as Record<string, unknown>).userMessage === 'string'
  ) {
    const m = (err as Record<string, unknown>).userMessage as string;
    if (m && !isLeakyMessage(m) && m.length <= 300) return m;
    return fallback;
  }
  if (err instanceof Error) {
    const m = err.message || '';
    if (!m || isLeakyMessage(m) || m.length > 300) return fallback;
    // Even short non-leaky driver messages (e.g. "permission denied") can
    // reveal implementation details, so only allow messages that read like
    // user-facing copy.
    if (/^(please|you|could not|something|the service|this|a |an |sign in|enter|add|choose|use |password|email)/i.test(m.trim())) {
      return m;
    }
    return fallback;
  }
  if (typeof err === 'string') {
    if (!err || isLeakyMessage(err) || err.length > 300) return fallback;
    return err;
  }
  return fallback;
}

/**
 * Auth-safe extractor. Supabase Auth messages are usually user-facing
 * ("Invalid login credentials"), but Auth can also surface raw DB text
 * ("Database error saving new user"). Block anything leaky / DB-like and
 * fall back to a generic message; otherwise preserve the original text so
 * sign-in / sign-up UX keeps its helpful errors.
 */
export function getSafeAuthMessage(err: unknown, fallback = SAFE_MESSAGES.INTERNAL): string {
  if (err instanceof DbOperationError) return err.userMessage;
  const rawMsg =
    err && typeof err === 'object' && 'message' in (err as Record<string, unknown>)
      ? String((err as Record<string, unknown>).message ?? '')
      : typeof err === 'string'
        ? err
        : '';
  if (!rawMsg) return fallback;
  if (isLeakyMessage(rawMsg)) return fallback;
  if (/database\s+error/i.test(rawMsg)) return fallback;
  if (rawMsg.length > 300) return fallback;
  return rawMsg;
}

/**
 * Build a production-safe API payload. In development the original message
 * is included under `debug` to help developers; in production only the
 * safe message + code + request id are returned.
 */
export function toSafeApiPayload(
  operation: string,
  raw: unknown,
  overrides?: Partial<Pick<SafeDbResult, 'status' | 'code' | 'userMessage'>> & {
    context?: LogContext;
    requestId?: string;
  }
): { status: number; body: Record<string, unknown> } {
  let wrapped: DbOperationError;
  if (raw instanceof DbOperationError && !overrides) {
    wrapped = raw;
  } else {
    wrapped = new DbOperationError(operation, raw, overrides);
  }
  const body: Record<string, unknown> = {
    error: {
      message: wrapped.userMessage,
      code: wrapped.code,
      requestId: wrapped.requestId,
    },
  };
  if (isDev()) {
    const inner = (wrapped as unknown as { cause?: unknown }).cause ?? raw;
    const parts = readErrorParts(inner);
    (body.error as Record<string, unknown>).debug = {
      operation: wrapped.operation,
      originalMessage: parts.message.slice(0, 500),
      originalCode: parts.code || undefined,
    };
  }
  return { status: wrapped.status, body };
}
