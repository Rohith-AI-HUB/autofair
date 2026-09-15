'use client';

import { useEffect, useState } from 'react';
import type { Car } from '@/types';
import { fetchLiveCars } from '@/lib/supabase/queries';

function formatIST(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const period = (get('dayPeriod') || '').toUpperCase();
  return `${get('day')} ${get('month').toUpperCase()} ${get('year')}  ${get('hour')}:${get('minute')} ${period} IST`;
}

export function LedgerBar() {
  // Hydration-safe: first render matches old static copy, live data fills after mount.
  const [live, setLive] = useState<Car[] | null>(null);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const tick = () => {
      const s = formatIST(new Date());
      setNow((prev) => (prev && formatIST(prev) === s ? prev : new Date()));
    };
    tick();
    const t = window.setInterval(tick, 5000);
    let cancelled = false;
    fetchLiveCars().then((rows) => {
      if (!cancelled && rows?.length) setLive(rows);
    });
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, []);

  const left = live?.length
    ? (() => {
        const cityCounts = new Map<string, number>();
        for (const c of live) {
          const k = c.location.trim().toUpperCase();
          if (k) cityCounts.set(k, (cityCounts.get(k) ?? 0) + 1);
        }
        const top = [...cityCounts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([k]) => k)
          .join(' / ');
        return `FIELD DOSSIER  ●  ${live.length} LIVE  ●  ${top || 'ALL CITIES'}`;
      })()
    : 'FIELD DOSSIER  ●  SAMPLE DATA  ●  BANGALORE / MUMBAI / DELHI';

  const rightId = live?.[0]?.inspectionId ?? 'AF-2026-008421';
  const rightTime = now ? formatIST(now) : '10 SEP 2026  14:32 IST';

  return (
    <div className="bg-navy">
      <div className="mx-auto flex w-full max-w-[1440px] items-center justify-between px-5 py-[9px] md:px-12">
        <p className="font-mono text-[10px] tracking-[0.04em] text-teal-bright">{left}</p>
        <p className="hidden font-mono text-[10px] tracking-[0.04em] text-[#D6E2EC] sm:block">
          {rightId}  •  {rightTime}
        </p>
      </div>
    </div>
  );
}
