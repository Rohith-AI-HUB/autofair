'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Container } from '@/components/shared/Container';
import { getBrowserClient, getRememberChoice, getSessionFromAnyStore } from '@/lib/supabase/client';
import { getPostLoginDestination } from '@/lib/supabase/queries';
import { getSafeAuthMessage } from '@/lib/errors/db-error';

// Codes already exchanged in this tab. exchangeCodeForSession() is
// single-use: React StrictMode remounts (and useSearchParams identity
// changes) re-run this effect with the same ?code=, and the second exchange
// fails with "invalid flow state" even though the first one stored a valid
// session. Skipping consumed codes keeps the UI truthful.
const consumedCodes = new Set<string>();

function CallbackHandler() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = params.get('code');
    const oauthError = params.get('error_description') ?? params.get('error');
    const next = params.get('next') ?? '/my-listings';    if (oauthError) {
      setError(oauthError);
      return;
    }

    if (!code) {
      setError('This sign-in link is invalid or has expired. Start again from the sign-in page.');
      return;
    }

    let cancelled = false;

    const finish = async () => {
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

    const runExchange = async () => {
      // Already handled (StrictMode remount / params identity change):
      // if a session exists, continue instead of re-exchanging.
      if (code && consumedCodes.has(code)) {
        const { session } = await getSessionFromAnyStore().catch(() => ({ session: null, persist: 'local' as const }));
        if (session && !cancelled) {
          await finish();
          return;
        }
      }
      const preferred = getRememberChoice()
        ? (['local', 'session'] as const)
        : (['session', 'local'] as const);
      let lastErr: unknown = null;

      for (const store of preferred) {
        const sb = getBrowserClient(store);
        if (!sb) continue;
        try {
          const { error: exchangeErr } = await sb.auth.exchangeCodeForSession(code);
          if (!exchangeErr) {
            consumedCodes.add(code);
            if (!cancelled) await finish();
            return;
          }
          lastErr = exchangeErr;
          // If code verifier is not found in this store, try the other store
          if (
            typeof exchangeErr === 'object' &&
            exchangeErr !== null &&
            'code' in exchangeErr &&
            (exchangeErr as { code?: string }).code !== 'pkce_code_verifier_not_found'
          ) {
            break;
          }
        } catch (e) {
          lastErr = e;
        }
      }

      if (cancelled) return;
      // The exchange may have failed because a first attempt already
      // succeeded (double-run with a single-use code). A stored session is
      // ground truth — never show "link didn't work" when signed in.
      const { session } = await getSessionFromAnyStore().catch(() => ({ session: null, persist: 'local' as const }));
      if (session) {
        consumedCodes.add(code);
        await finish();
        return;
      }
      if (
        lastErr &&
        typeof lastErr === 'object' &&
        'code' in lastErr &&
        (lastErr as { code?: string }).code === 'pkce_code_verifier_not_found'
      ) {
        setError('Your sign-in session expired. Please start sign-in again in this browser.');
      } else if (lastErr) {
        const raw = getSafeAuthMessage(lastErr);
        // Raw Supabase PKCE text confuses users; say what to do instead.
        setError(
          /flow state|verifier|expired/i.test(raw)
            ? 'This sign-in link was already used or expired. Please start sign-in again in this browser.'
            : raw
        );
      } else {
        setError('Auth is not connected yet. Add your Supabase keys, then try again.');
      }
    };

    void runExchange();

    return () => {
      cancelled = true;
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
