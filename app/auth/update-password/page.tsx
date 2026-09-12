'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Container } from '@/components/shared/Container';
import { getBrowserClient } from '@/lib/supabase/client';

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    const sb = getBrowserClient('local');
    if (!sb) {
      setError('Auth is not connected yet.');
      return;
    }
    setBusy(true);
    const { error } = await sb.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setDone(true);
    window.setTimeout(() => {
      router.replace('/my-listings');
      router.refresh();
    }, 1500);
  }

  return (
    <Container className="py-16">
      <div className="max-w-[560px] border border-line bg-white p-8">
        <p className="font-mono text-[11px] tracking-[0.06em] text-teal-dark">
          ACCOUNT&nbsp;&nbsp;•&nbsp;&nbsp;NEW PASSWORD
        </p>
        <h1 className="mt-2 font-sans text-[28px] font-extrabold text-navy">
          Set a new password.
        </h1>
        {done ? (
          <p role="status" className="mt-3 font-sans text-[14px] text-muted">
            Password updated. Taking you home…
          </p>
        ) : (
          <div className="mt-5 space-y-4">
            <div>
              <label
                htmlFor="new-password"
                className="font-mono text-[10px] tracking-[0.06em] text-muted"
              >
                NEW PASSWORD
              </label>
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 6 characters"
                className="mt-1.5 w-full border border-line bg-off-white px-4 py-[15px] font-sans text-[14px] text-navy outline-none placeholder:text-[#9AA8B5] focus:border-teal"
              />
            </div>
            {error && (
              <p
                role="alert"
                className="border border-coral/50 bg-[#FDECEC] px-4 py-3 font-sans text-[13px] font-semibold text-[#9B2C2C]"
              >
                {error}
              </p>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={submit}
              className="w-full bg-navy px-6 py-4 font-sans text-[15px] font-bold text-white hover:bg-navy-2 disabled:opacity-60"
            >
              Update password&nbsp;&nbsp;→
            </button>
            <Link
              href="/auth"
              className="inline-block font-sans text-[13px] font-bold text-navy hover:underline"
            >
              ← Back to sign in
            </Link>
          </div>
        )}
      </div>
    </Container>
  );
}
