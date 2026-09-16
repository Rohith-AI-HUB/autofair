'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Container } from '@/components/shared/Container';
import { getBrowserClient, getRememberChoice } from '@/lib/supabase/client';
import { getPostLoginDestination } from '@/lib/supabase/queries';
import { getSafeAuthMessage, isLeakyMessage, logDbError } from '@/lib/errors/db-error';

function CallbackHandler() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = params.get('code');
    const next = params.get('next') ?? '/my-listings';
    if (!code) {
      setError('This sign-in link is invalid or has expired. Start again from the sign-in page.');
      return;
    }
    // Shared cached client: the local client auto-processes the PKCE code
    // on init; the session client needs one manual exchange. Either way,
    // exactly one exchange runs against one client instance.
    const sb = getBrowserClient(getRememberChoice() ? 'local' : 'session');
    if (!sb) {
      setError('Auth is not connected yet. Add your Supabase keys, then try again.');
      return;
    }
    let done = false;
    const finish = async () => {
      if (done) return;
      done = true;
      // Trusted role home first (admin->/admin, staff->/staff). An explicit
      // non-default next is honored only if the role is allowed there.
      const home = await getPostLoginDestination();
      if (next === '/my-listings' || next === '/auth/route') {
        router.replace(home);
      } else if (next && next.startsWith('/')) {
        try {
          const { fetchCurrentProfile, isPathAllowedForRole } = await import('@/lib/auth/roles');
          const profile = await fetchCurrentProfile().catch(() => null);
          const role = profile?.role ?? null;
          router.replace(role && !isPathAllowedForRole(next, role) ? home : next);
        } catch {
          router.replace(next);
        }
      } else {
        router.replace(home);
      }
      router.refresh();
    };
    sb.auth.getSession().then(({ data }) => {
      if (data.session) finish();
    });
    const { data: listener } = sb.auth.onAuthStateChange((_event, session) => {
      if (session) finish();
    });
    const fallback = window.setTimeout(() => {
      if (done) return;
      sb.auth
        .exchangeCodeForSession(code)
        .then(({ error }) => {
          if (error) {
            if (isLeakyMessage(error.message)) logDbError('auth.exchangeCode', error);
            setError(getSafeAuthMessage(error));
          } else finish();
        })
        .catch((e: unknown) => {
          setError(getSafeAuthMessage(e, 'Sign-in failed. Try again.'));
        });
    }, 1500);
    return () => {
      done = true;
      window.clearTimeout(fallback);
      listener.subscription.unsubscribe();
    };
  }, [params, router]);

  return (
    <Container className="py-16">
      {error ? (
        <div role="alert" className="max-w-[560px] border border-line bg-white p-8">
          <p className="font-mono text-[11px] tracking-[0.06em] text-teal-dark">
            SIGN-IN INTERRUPTED
          </p>
          <h1 className="mt-2 font-sans text-[24px] font-extrabold text-navy">
            That link didn&apos;t work.
          </h1>
          <p className="mt-2 font-sans text-[14px] text-muted">{error}</p>
          <Link
            href="/auth"
            className="mt-4 inline-block bg-navy px-6 py-3 font-sans text-[14px] font-bold text-white"
          >
            Back to sign in
          </Link>
        </div>
      ) : (
        <div role="status" className="max-w-[560px] border border-line bg-white p-8">
          <p className="font-mono text-[11px] tracking-[0.06em] text-teal-dark">
            VERIFYING
          </p>
          <h1 className="mt-2 font-sans text-[24px] font-extrabold text-navy">
            Opening your dossier…
          </h1>
        </div>
      )}
    </Container>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense>
      <CallbackHandler />
    </Suspense>
  );
}
