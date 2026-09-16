import { NextResponse } from 'next/server';
import { toSafeApiPayload, type LogContext } from '@/lib/errors/db-error';

/**
 * Central API error boundary for future Route Handlers / Server Actions.
 *
 * Usage:
 *   try {
 *     ...
 *   } catch (err) {
 *     return apiError('listings.create', err, { vehicleId });
 *   }
 *
 * Always returns a production-safe JSON body:
 *   { error: { message, code, requestId } }
 * In development, `error.debug` carries the original message/code.
 */
export function apiError(
  operation: string,
  raw: unknown,
  context?: LogContext,
  overrides?: { status?: number; userMessage?: string }
) {
  const { status, body } = toSafeApiPayload(operation, raw, {
    ...(overrides ?? {}),
    ...(context ? { context } : {}),
  });
  return NextResponse.json(body, { status });
}

/** Success envelope (keeps error/success shapes consistent). */
export function apiOk<T>(data: T, status = 200) {
  return NextResponse.json({ data }, { status });
}
