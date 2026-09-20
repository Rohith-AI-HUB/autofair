'use client';

import { useState } from 'react';
import { getSessionFromAnyStore } from '@/lib/supabase/client';
import { openAuthModal } from '@/lib/auth/modal';
import { cn } from '@/lib/utils';

type State = 'idle' | 'loading' | 'revealed' | 'fallback';

const BTN =
  'block w-full px-6 py-3 text-center font-sans text-[14px] font-bold transition-colors disabled:opacity-60';

/**
 * Contact Seller → number. Same button before/after: idle shows
 * "Contact Seller" (or quote variant), after click the label becomes
 * the seller's WhatsApp number and acts as a wa.me link.
 */
export function SellerContact({
  vehicleId,
  inspectionId,
  variant = 'dossier',
}: {
  vehicleId: string;
  inspectionId: string;
  variant?: 'dossier' | 'trust';
}) {
  const [state, setState] = useState<State>('idle');
  const [phone, setPhone] = useState<string | null>(null);
  const [waLink, setWaLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const idleLabel = variant === 'trust' ? `Contact seller — quote ${inspectionId}` : 'Contact Seller';

  async function reveal() {
    if (state === 'loading' || state === 'revealed') return;
    setError(null);
    setState('loading');
    try {
      const { session } = await getSessionFromAnyStore();
      if (!session) {
        setState('idle');
        openAuthModal({ mode: 'signin' });
        return;
      }
      const res = await fetch(`/api/seller-contact?vehicleId=${encodeURIComponent(vehicleId)}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.status === 401) {
        setState('idle');
        openAuthModal({ mode: 'signin' });
        return;
      }
      const json = (await res.json().catch(() => null)) as {
        data?: { phone: string | null; waLink: string | null };
        error?: { message?: string };
      } | null;
      if (!res.ok) {
        setState('idle');
        setError(json?.error?.message ?? 'Could not load the number. Try again.');
        return;
      }
      if (json?.data?.phone) {
        setPhone(json.data.phone);
        setWaLink(json.data.waLink ?? null);
        setState('revealed');
      } else {
        setState('fallback');
      }
    } catch {
      setState('idle');
      setError('Could not load the number. Try again.');
    }
  }

  const cls =
    variant === 'trust'
      ? 'bg-teal text-navy hover:bg-[#12a295]'
      : 'bg-navy text-white hover:bg-navy-2';

  if (state === 'revealed' && phone && waLink) {
    return (
      <a href={waLink} target="_blank" rel="noopener noreferrer" className={cn(BTN, cls)} aria-label={`Chat with seller on WhatsApp: ${phone}`}>
        {phone}
      </a>
    );
  }

  if (state === 'fallback') {
    return (
      <a href={`/contact?inspectionId=${encodeURIComponent(inspectionId)}`} className={cn(BTN, cls)}>
        Send inquiry →
      </a>
    );
  }

  return (
    <span className="block">
      <button type="button" disabled={state === 'loading'} onClick={reveal} className={cn(BTN, cls)}>
        {state === 'loading' ? 'Loading…' : idleLabel}
      </button>
      {error && (
        <span role="alert" className={cn('mt-2 block font-sans text-[12px] font-semibold', variant === 'trust' ? 'text-amber' : 'text-[#DC2626]')}>
          {error}
        </span>
      )}
    </span>
  );
}
