'use client';

import { useEffect, useState } from 'react';
import { Container } from '@/components/shared/Container';
import { getBrowserClient } from '@/lib/supabase/client';
import { normalizeIndianMobile, formatIndianMobileDisplay } from '@/lib/validation/phone';
import { getSafeErrorMessage } from '@/lib/errors/db-error';

export function ProfilePhoneForm() {
  const [phone, setPhone] = useState('');
  const [saved, setSaved] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sb = getBrowserClient('local') ?? getBrowserClient('session');
    if (!sb) {
      setLoading(false);
      return;
    }
    sb.auth.getSession().then(({ data }) => {
      const uid = data.session?.user?.id;
      if (!uid) {
        setLoading(false);
        return;
      }
      sb.from('profiles').select('phone').eq('id', uid).maybeSingle().then(({ data: p, error: e }) => {
        setLoading(false);
        if (e) {
          setError(getSafeErrorMessage(e, 'Could not load your number.'));
          return;
        }
        const cur = (p as { phone?: string | null } | null)?.phone ?? null;
        setSaved(cur);
        if (cur) {
          const digits = cur.replace(/\D/g, '');
          setPhone(digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits);
        }
      });
    });
  }, []);

  async function save() {
    setError(null);
    const e164 = normalizeIndianMobile(phone);
    if (!e164) {
      setError('Enter 10-digit mobile starting 6-9.');
      return;
    }
    setSaving(true);
    try {
      const sb = getBrowserClient('local') ?? getBrowserClient('session');
      if (!sb) throw new Error('Auth not connected');
      const { data } = await sb.auth.getSession();
      const uid = data.session?.user?.id;
      if (!uid) throw new Error('Please sign in again');
      const { error } = await sb.from('profiles').update({ phone: e164 }).eq('id', uid);
      if (error) throw error;
      setSaved(e164);
    } catch (err) {
      setError(getSafeErrorMessage(err, 'Could not save your number.'));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <p className="font-mono text-[11px] text-muted" role="status">LOADING PROFILE…</p>
    );
  }

  return (
    <div className="border border-line bg-white p-6">
      <p className="font-mono text-[11px] tracking-[0.06em] text-teal-dark">WHATSAPP / MOBILE *</p>
      <h2 className="mt-1 font-sans text-[20px] font-extrabold text-navy">Where buyers reach you</h2>
      {saved && (
        <p className="mt-2 font-sans text-[13px] text-muted">
          Current: <span className="font-bold text-navy">{formatIndianMobileDisplay(saved)}</span>
        </p>
      )}
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          inputMode="tel"
          autoComplete="tel"
          placeholder="96864 13636"
          aria-label="WhatsApp mobile number"
          className="w-full border border-line bg-off-white px-4 py-3 font-sans text-[15px] text-navy outline-none focus:border-teal sm:max-w-[280px]"
        />
        <button
          type="button"
          disabled={saving}
          onClick={save}
          className="bg-navy px-6 py-3 font-sans text-[13px] font-bold text-white hover:bg-navy-2 disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save number →'}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-3 font-sans text-[13px] font-semibold text-[#DC2626]">{error}</p>
      )}
      <p className="mt-3 font-sans text-[11px] text-muted">
        10-digit mobile starting 6-9. Shown to signed-in buyers only after they tap Contact Seller.
      </p>
    </div>
  );
}
