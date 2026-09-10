'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { InspectionCategory } from '@/types';

export function InspectionCategoryRow({
  category,
  defaultOpen = false,
}: {
  category: InspectionCategory;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const isAttention = category.passed < category.total;
  const btnId = `acc-btn-${category.id}`;
  const panelId = `acc-panel-${category.id}`;

  return (
    <div className="border border-line bg-white">
      <h3>
        <button
          type="button"
          id={btnId}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-off-white"
        >
          <span className="font-sans text-[13.5px] font-extrabold tracking-[0.02em] text-navy">
            {category.title}
          </span>
          <span className="flex items-center gap-3">
            <span
              className={cn(
                'font-mono text-[11px]',
                isAttention ? 'text-[#8A6D1B]' : 'text-teal-dark'
              )}
            >
              {category.passed} / {category.total}
            </span>
            <span aria-hidden className="font-sans text-[16px] text-[#999]">
              {open ? '▾' : '›'}
            </span>
          </span>
        </button>
      </h3>
      <div
        id={panelId}
        role="region"
        aria-labelledby={btnId}
        className="accordion-panel"
        data-open={open}
      >
        <div className="accordion-inner">
          <div className="border-t border-line bg-[#F7F5EF] px-5 py-4">
            <ul className="space-y-3">
              {category.items.map((item) => (
                <li
                  key={item.name}
                  className="flex flex-col gap-1 border-b border-line/60 pb-3 last:border-0 last:pb-0 sm:flex-row sm:items-baseline sm:justify-between"
                >
                  <span className="font-sans text-[13px] font-semibold text-navy">
                    {item.name}
                  </span>
                  <span
                    className={cn(
                      'font-sans text-[12px]',
                      item.result === 'pass' ? 'text-teal-dark' : 'text-[#8A6D1B]'
                    )}
                  >
                    {item.result === 'pass' ? '✓  Good — ' : '⚠  Attention — '}
                    {item.note}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export function InspectionBreakdown({
  categories,
}: {
  categories: InspectionCategory[];
}) {
  return (
    <div className="flex flex-col gap-2">
      {categories.map((c, i) => (
        <InspectionCategoryRow key={c.id} category={c} defaultOpen={c.id === 'tyres'} />
      ))}
    </div>
  );
}
