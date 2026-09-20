'use client';

import { useEffect } from 'react';
import { getBrowserClient } from '@/lib/supabase/client';

// Fire-and-forget view counter so garage TOTAL VIEWS is real.
// Looks up the LIVE listing by slug, then calls the security-definer
// increment_listing_views RPC. Never renders UI, never throws to the page.
export function ViewCounter({ slug }: { slug: string }) {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sb = getBrowserClient('local') ?? getBrowserClient('session');
        if (!sb) return;
        const { data: listing } = await sb.from('listings').select('id').eq('slug', slug).maybeSingle();
        const id = (listing as { id: string } | null)?.id;
        if (!id || cancelled) return;
        await sb.rpc('increment_listing_views', { p_listing_id: id });
      } catch {
        /* views are best-effort */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);
  return null;
}
