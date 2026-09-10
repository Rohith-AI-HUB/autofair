import type { InspectionItem as Item } from '@/types';
import { cn } from '@/lib/utils';

export function InspectionItem({ item }: { item: Item }) {
  return (
    <li className="flex flex-col gap-1 border-b border-line/60 pb-3 last:border-0 last:pb-0 sm:flex-row sm:items-baseline sm:justify-between">
      <span className="font-sans text-[13px] font-semibold text-navy">{item.name}</span>
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
  );
}
