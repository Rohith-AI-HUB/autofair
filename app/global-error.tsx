'use client';

import { useEffect } from 'react';
import { getSafeErrorMessage, logDbError } from '@/lib/errors/db-error';

/**
 * Root-level boundary: last resort for errors in the root layout.
 * Must render its own <html>/<body>. Shows only a safe message.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logDbError('app.render.root', error, error?.digest ? { digest: error.digest } : undefined);
  }, [error]);

  return (
    <html lang="en">
      <body className="font-sans">
        <main style={{ padding: 32, maxWidth: 560, margin: '0 auto' }}>
          <div role="alert">
            <p style={{ fontSize: 11, letterSpacing: '0.06em' }}>SOMETHING WENT WRONG</p>
            <h1 style={{ fontSize: 24, fontWeight: 800 }}>Please try again.</h1>
            <p style={{ fontSize: 14 }}>
              {getSafeErrorMessage(error, 'Something went wrong. Please try again later.')}
            </p>
            <button
              type="button"
              onClick={reset}
              style={{ marginTop: 16, padding: '12px 24px', fontWeight: 700 }}
            >
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
