'use client';

import { useEffect } from 'react';
import { Container } from '@/components/shared/Container';
import { getSafeErrorMessage, logDbError } from '@/lib/errors/db-error';

/**
 * Route-level boundary: catches render / data errors for the current segment.
 * Logs the original error (server-side observable) and shows only a safe,
 * generic message — never `error.message` or stack traces.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logDbError('app.render', error, error?.digest ? { digest: error.digest } : undefined);
  }, [error]);

  return (
    <Container className="py-16">
      <div role="alert" className="max-w-[560px] border border-line bg-white p-8">
        <p className="font-mono text-[11px] tracking-[0.06em] text-teal-dark">SOMETHING WENT WRONG</p>
        <h1 className="mt-2 font-sans text-[24px] font-extrabold text-navy">
          Please try again.
        </h1>
        <p className="mt-2 font-sans text-[14px] text-muted">
          {getSafeErrorMessage(error, 'Something went wrong. Please try again later.')}
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-4 bg-navy px-6 py-3 font-sans text-[14px] font-bold text-white hover:bg-navy-2"
        >
          Try again
        </button>
      </div>
    </Container>
  );
}
