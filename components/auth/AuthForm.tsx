'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, Bookmark, Loader2, Lock, ShieldCheck } from 'lucide-react';
import { GoogleMark } from '@/components/auth/GoogleMark';
import {
  getBrowserClient,
  getRememberChoice,
  getSessionFromAnyStore,
  getSiteUrl,
  setRememberChoice,
} from '@/lib/supabase/client';
import { getPostLoginDestination } from '@/lib/supabase/queries';
import { getSafeAuthMessage, isLeakyMessage, logDbError } from '@/lib/errors/db-error';


export type AuthFormMode = 'signin' | 'signup';
export type AuthFormView = 'form' | 'forgot' | 'check-email' | 'reset-sent';

const inputCls =
  'w-full border border-line bg-off-white px-4 py-[15px] font-sans text-[14px] text-navy outline-none placeholder:text-[#9AA8B5] focus:border-teal';

export function AuthForm({
  initialMode = 'signin',
  next,
  onSuccess,
  hideTrustRow = false,
}: {
  initialMode?: AuthFormMode;
  /** Post-login destination override. Defaults to role-aware destination. */
  next?: string;
  /** Called instead of the default router.replace on success (modal uses this to close). */
  onSuccess?: (dest: string) => void;
  hideTrustRow?: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<AuthFormMode>(initialMode);
  const [view, setView] = useState<AuthFormView>('form');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState<'google' | 'email' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [authedEmail, setAuthedEmail] = useState<string | null>(null);

  useEffect(() => {
    setRemember(getRememberChoice());
    getSessionFromAnyStore().then(({ session }) => {
      if (session?.user?.email) setAuthedEmail(session.user.email);
    });
  }, []);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  function needClient(persist?: 'local' | 'session') {
    const sb = getBrowserClient(persist ?? (remember ? 'local' : 'session'));
    if (!sb) {
      setError(
        'Auth is not connected yet. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, then reload.'
      );
      return null;
    }
    return sb;
  }

  async function finishLogin() {
    // Trusted role first: getPostLoginDestination now returns /admin for
    // admins and /staff for staff (DB source of truth). An explicit `next`
    // is honored only if the role is actually allowed there, otherwise the
    // role home wins. This fixes admins landing on staff/customer pages.
    const home = await getPostLoginDestination();
    let dest: string = home;
    if (next && next.startsWith('/')) {
      const { fetchCurrentProfile, isPathAllowedForRole } = await import('@/lib/auth/roles');
      const profile = await fetchCurrentProfile().catch(() => null);
      const role = profile?.role ?? null;
      if (role && isPathAllowedForRole(next, role)) dest = next;
      else if (!role && next !== '/admin' && !next.startsWith('/admin/') && next !== '/staff' && !next.startsWith('/staff/')) dest = next;
    }
    if (onSuccess) {
      onSuccess(dest);
      return;
    }
    router.replace(dest);
    router.refresh();
  }

  async function continueWithGoogle() {
    setError(null);
    setNotice(null);
    // Persist the choice before constructing the client. OAuth PKCE stores
    // its verifier in that client's storage, and the callback must reopen
    // the same store even in a different browser/profile.
    setRememberChoice(remember);
    const sb = needClient(remember ? 'local' : 'session');
    if (!sb) return;
    setBusy('google');
    const { error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${getSiteUrl()}/auth/callback?next=${encodeURIComponent(next ?? '/my-listings')}`,
        queryParams: { prompt: 'select_account' },
      },
    });
    if (error) {
      if (isLeakyMessage(error.message)) logDbError('auth.google', error);
      setError(getSafeAuthMessage(error));
      setBusy(null);
    }
  }

  function validate(): string | null {
    if (!email.trim()) return 'Enter your email address.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Enter a valid email address.';
    if (view === 'form' && !password) return 'Enter your password.';
    if (view === 'form' && mode === 'signup' && password.length < 6) return 'Password must be at least 6 characters.';
    return null;
  }

  async function continueWithEmail() {
    setError(null);
    setNotice(null);
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setRememberChoice(remember);
    const sb = needClient(remember ? 'local' : 'session');
    if (!sb) return;
    setBusy('email');
    if (mode === 'signin') {
      const { error } = await sb.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        if (isLeakyMessage(error.message)) logDbError('auth.signin', error);
        setError(getSafeAuthMessage(error));
        setBusy(null);
        return;
      }
      setBusy(null);
      await finishLogin();
    } else {
      const { data, error } = await sb.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: `${getSiteUrl()}/auth/callback?next=${encodeURIComponent(next ?? '/my-listings')}` },
      });
      setBusy(null);
      if (error) {
        if (isLeakyMessage(error.message)) logDbError('auth.signup', error);
        setError(getSafeAuthMessage(error));
        return;
      }
      if (data.session) {
        await finishLogin();
      } else {
        setView('check-email');
      }
    }
  }

  async function sendResetLink() {
    setError(null);
    setNotice(null);
    if (!email.trim()) {
      setError('Enter your email address first.');
      return;
    }
    const sb = getBrowserClient('local');
    if (!sb) {
      setError(
        'Auth is not connected yet. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, then reload.'
      );
      return;
    }
    setBusy('email');
    const { error } = await sb.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${getSiteUrl()}/auth/update-password`,
    });
    setBusy(null);
    if (error) {
      if (isLeakyMessage(error.message)) logDbError('auth.reset', error);
      setError(getSafeAuthMessage(error));
      return;
    }
    setView('reset-sent');
  }

  async function signOut() {
    const { persist } = await getSessionFromAnyStore();
    await getBrowserClient(persist)?.auth.signOut();
    setAuthedEmail(null);
    router.refresh();
  }

  const isSignup = mode === 'signup';

  if (authedEmail) {
    return (
      <div role="status" className="flex h-full flex-col items-start gap-3">
        <p className="font-mono text-[11px] tracking-[0.06em] text-teal-dark">SIGNED IN</p>
        <h2 className="font-sans text-[28px] font-extrabold text-navy">Welcome back</h2>
        <p className="font-sans text-[14px] text-muted">{authedEmail}</p>
        <div className="mt-2 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={finishLogin}
            className="bg-navy px-6 py-3 font-sans text-[14px] font-bold text-white hover:bg-navy-2"
          >
            Continue
          </button>
          <button
            type="button"
            onClick={signOut}
            className="border border-navy/30 px-6 py-3 font-sans text-[14px] font-semibold text-navy hover:border-navy"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  if (view === 'check-email' || view === 'reset-sent') {
    return (
      <div role="status" className="flex h-full flex-col items-start gap-3">
        <p className="font-mono text-[11px] tracking-[0.06em] text-teal-dark">
          {view === 'check-email' ? 'ACCOUNT CREATED' : 'RESET LINK SENT'}
        </p>
        <h2 className="font-sans text-[28px] font-extrabold text-navy">Check your inbox.</h2>
        <p className="max-w-[420px] font-sans text-[14px] leading-relaxed text-muted">
          {view === 'check-email'
            ? `We sent a confirmation link to ${email.trim()}. Open it to verify your email, then sign in.`
            : `We sent a password-reset link to ${email.trim()}. It expires in one hour.`}
        </p>
        <button
          type="button"
          onClick={() => {
            setView('form');
            setError(null);
          }}
          className="mt-2 font-sans text-[13px] font-bold text-navy hover:underline"
        >
          ← Back to sign in
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-sans text-[28px] font-extrabold text-navy">
          {view === 'forgot' ? 'Reset password' : 'Welcome back'}
        </h2>
        <span className="inline-flex items-center gap-2 bg-[#E6F4F1] px-3 py-2">
          <span aria-hidden className="h-2 w-2 rounded-full bg-teal" />
          <span className="font-mono text-[10px] tracking-[0.06em] text-teal-dark">SECURE</span>
        </span>
      </div>
      <p className="mt-2 font-sans text-[14px] text-muted">
        {view === 'forgot'
          ? 'Enter your account email and we will send a reset link.'
          : 'Sign in to open your saved files, alerts and seller threads.'}
      </p>

      {view === 'form' && (
        <div role="group" aria-label="Sign in or create account" className="mt-5 flex bg-[#EFEAE3] p-1">
          {(['signin', 'signup'] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => {
                setMode(m);
                setError(null);
              }}
              className={
                mode === m
                  ? 'flex-1 bg-navy px-4 py-3 font-sans text-[14px] font-bold text-white'
                  : 'flex-1 px-4 py-3 font-sans text-[14px] font-semibold text-navy hover:underline'
              }
            >
              {m === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          ))}
        </div>
      )}

      <div className="mt-5 space-y-4">
        <button
          type="button"
          disabled={busy !== null}
          onClick={continueWithGoogle}
          className="flex w-full items-center justify-center gap-[14px] border-[1.5px] border-navy bg-white px-5 py-[14px] font-sans text-[15px] font-semibold text-navy hover:bg-off-white disabled:opacity-60"
        >
          {busy === 'google' ? (
            <Loader2 size={20} className="animate-spin" aria-hidden />
          ) : (
            <GoogleMark size={22} />
          )}
          Continue with Google
        </button>

        <div className="flex items-center gap-3" aria-hidden>
          <span className="h-px flex-1 bg-line" />
          <span className="font-mono text-[10px] tracking-[0.06em] text-muted">OR WITH EMAIL</span>
          <span className="h-px flex-1 bg-line" />
        </div>

        <div>
          <label htmlFor="auth-email" className="font-mono text-[10px] tracking-[0.06em] text-muted">
            EMAIL ADDRESS
          </label>
          <input
            id="auth-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className={`${inputCls} mt-1.5`}
          />
        </div>

        {view === 'form' && (
          <>
            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="auth-password" className="font-mono text-[10px] tracking-[0.06em] text-muted">
                  PASSWORD
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setView('forgot');
                    setError(null);
                  }}
                  className="font-sans text-[12px] font-semibold text-teal-dark hover:underline"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative mt-1.5">
                <input
                  id="auth-password"
                  type={showPw ? 'text' : 'password'}
                  autoComplete={isSignup ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={isSignup ? '12+ characters with mixed case, number, symbol' : 'Enter your password'}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') continueWithEmail();
                  }}
                  className={`${inputCls} pr-16`}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  aria-pressed={showPw}
                  className="absolute right-4 top-1/2 -translate-y-1/2 font-mono text-[11px] text-teal-dark hover:underline"
                >
                  {showPw ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <button
                type="button"
                role="checkbox"
                aria-checked={remember}
                onClick={() => setRemember((v) => !v)}
                className="flex items-center gap-2"
              >
                <span
                  aria-hidden
                  className={
                    remember
                      ? 'flex h-[18px] w-[18px] items-center justify-center bg-navy font-sans text-[11px] font-extrabold text-white'
                      : 'h-[18px] w-[18px] border border-navy/40 bg-white'
                  }
                >
                  {remember ? '✓' : ''}
                </span>
                <span className="font-sans text-[13px] font-medium text-navy">Keep me signed in</span>
              </button>
              <span className="flex items-center gap-1.5 font-mono text-[10px] text-muted">
                <Lock size={12} aria-hidden />
                Encrypted
              </span>
            </div>
          </>
        )}

        {error && (
          <p
            role="alert"
            className="border border-coral/50 bg-[#FDECEC] px-4 py-3 font-sans text-[13px] font-semibold text-[#9B2C2C]"
          >
            {error}
          </p>
        )}
        {notice && (
          <p
            role="status"
            className="border border-teal-line bg-teal-bg px-4 py-3 font-sans text-[13px] font-semibold text-teal-dark"
          >
            {notice}
          </p>
        )}

        <button
          type="button"
          disabled={busy !== null}
          onClick={view === 'forgot' ? sendResetLink : continueWithEmail}
          className="w-full bg-navy px-6 py-4 font-sans text-[15px] font-bold text-white hover:bg-navy-2 disabled:opacity-60"
        >
          {busy === 'email' ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 size={18} className="animate-spin" aria-hidden />
              Working…
            </span>
          ) : view === 'forgot' ? (
            'Send reset link  →'
          ) : (
            'Continue  →'
          )}
        </button>

        {view === 'forgot' ? (
          <button
            type="button"
            onClick={() => {
              setView('form');
              setError(null);
            }}
            className="font-sans text-[13px] font-bold text-navy hover:underline"
          >
            ← Back to sign in
          </button>
        ) : (
          <p className="font-mono text-[10px] leading-relaxed text-muted">
            Protected by Google OAuth via Supabase Auth. We never see or store your password.
          </p>
        )}
      </div>

      {view === 'form' && !hideTrustRow && (
        <>
          <div className="mt-5 flex flex-wrap items-center gap-2 bg-[#F6F1EA] px-5 py-[14px]">
            <span className="font-sans text-[13px] text-muted">
              {isSignup ? 'Already have an account?' : 'New to Autofair?'}
            </span>
            <button
              type="button"
              onClick={() => {
                setMode(isSignup ? 'signin' : 'signup');
                setError(null);
              }}
              className="font-sans text-[13px] font-bold text-navy hover:underline"
            >
              {isSignup ? 'Sign in →' : 'Create an account →'}
            </button>
          </div>
          <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2">
            {[
              { icon: ShieldCheck, label: 'VERIFIED SELLERS' },
              { icon: Bell, label: 'INSTANT ALERTS' },
              { icon: Bookmark, label: 'SAVED FILES' },
            ].map(({ icon: Icon, label }) => (
              <span key={label} className="flex items-center gap-1.5">
                <Icon size={13} aria-hidden className="text-muted" />
                <span className="font-mono text-[9px] tracking-[0.06em] text-muted">{label}</span>
              </span>
            ))}
          </div>
        </>
      )}
    </>
  );
}
