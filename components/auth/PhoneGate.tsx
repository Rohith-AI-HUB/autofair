'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { getAuthedBrowserClient } from '@/lib/supabase/client';
import { fetchCurrentProfile } from '@/lib/auth/roles';
import { normalizeIndianMobile } from '@/lib/validation/phone';
import { getSafeErrorMessage, logDbError } from '@/lib/errors/db-error';

const REFRESH_EVENT = 'autofair:phone-gate-refresh';

const inputCls =
  'w-full border border-line bg-off-white px-4 py-[15px] font-sans text-[14px] text-navy outline-none placeholder:text-[#9AA8B5] focus:border-teal';

/**
 * Sign-in through a provider we cannot pass metadata to (Google) still has to
 * yield a number, so capture happens after the session exists rather than
 * during it. One rule covers every entry point: signed-in customer + no phone
 * = ask, and the dialog has no escape because the number is required.
 * AuthForm calls this after any successful login, because a sign-in that
 * lands on the page the visitor was already reading never remounts the layout.
 */
export function refreshPhoneGate() {
  window.dispatchEvent(new Event(REFRESH_EVENT));
}

export function PhoneGate() {
  const pathname = usePathname();
  const [askFor, setAskFor] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const check = useCallback(async () => {
    const profile = await fetchCurrentProfile();
    // Customers only: staff and admins work in these pages under time
    // pressure, and a blocking dialog is not their gate to pass.
    if (!profile || profile.role !== 'CUSTOMER' || profile.phone) {
      setAskFor(null);
      return;
    }
    setAskFor(profile.id);
  }, []);

  useEffect(() => {
    void check();
  }, [check, pathname]);

  useEffect(() => {
    window.addEventListener(REFRESH_EVENT, check);
    return () => window.removeEventListener(REFRESH_EVENT, check);
  }, [check]);

  async function save() {
    if (!askFor) return;
    const normalized = normalizeIndianMobile(phone);
    if (!normalized) {
      setError('Enter a valid 10-digit Indian mobile number.');
      return;
    }
    setBusy(true);
    setError(null);
    const sb = await getAuthedBrowserClient();
    if (!sb) {
      setBusy(false);
      setError('Auth is not connected yet.');
      return;
    }
    const { data, error: saveErr } = await sb
      .from('profiles')
      .update({ phone: normalized })
      .eq('id', askFor)
      .select('id');
    setBusy(false);
    if (saveErr) {
      logDbError('profiles.saveOwnPhone', saveErr);
      setError(getSafeErrorMessage(saveErr, 'The number could not be saved. Please try again.'));
      return;
    }
    // RLS filters a rejected UPDATE to zero rows without raising an error, so
    // the returned row is the only proof the number was actually stored.
    if (!data?.length) {
      setError('The number could not be saved. Please try again.');
      return;
    }
    setAskFor(null);
    setPhone('');
  }

  if (!askFor) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add your mobile number"
      className="fixed inset-0 z-[110] flex items-center justify-center p-4 sm:p-6"
    >
      <div className="absolute inset-0 bg-navy/60 backdrop-blur-[2px]" />
      <div className="relative w-full max-w-[440px] rounded-[4px] border border-line bg-white p-6 shadow-[0_24px_80px_rgba(11,23,38,0.35)] sm:p-7">
        <p className="font-mono text-[10px] tracking-[0.06em] text-teal-dark">
          ACCOUNT&nbsp;&nbsp;•&nbsp;&nbsp;ONE MORE STEP
        </p>
        <h2 className="mt-3 font-sans text-[28px] font-extrabold text-navy">Add your mobile number</h2>
        <p className="mt-2 font-sans text-[14px] leading-relaxed text-muted">
          AutoFair uses it to reach you about your account and your cars. It is never displayed on
          the website or attached to any listing.
        </p>

        <div className="mt-5">
          <label htmlFor="gate-phone" className="font-mono text-[10px] tracking-[0.06em] text-muted">
            MOBILE NUMBER (+91)
          </label>
          <input
            id="gate-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            autoFocus
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void save();
            }}
            placeholder="10-digit mobile number"
            className={`${inputCls} mt-1.5`}
          />
        </div>

        {error && (
          <p
            role="alert"
            className="mt-4 border border-coral/50 bg-[#FDECEC] px-4 py-3 font-sans text-[13px] font-semibold text-[#9B2C2C]"
          >
            {error}
          </p>
        )}

        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="mt-5 w-full bg-navy px-6 py-4 font-sans text-[15px] font-bold text-white hover:bg-navy-2 disabled:opacity-60"
        >
          {busy ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 size={18} className="animate-spin" aria-hidden />
              Saving…
            </span>
          ) : (
            'Save number'
          )}
        </button>
      </div>
    </div>
  );
}
