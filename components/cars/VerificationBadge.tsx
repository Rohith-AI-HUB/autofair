import { cn } from '@/lib/utils';

export function VerificationBadge({
  label,
  tone = 'ok',
  className,
}: {
  label: string;
  tone?: 'ok' | 'warn' | 'dark' | 'amber';
  className?: string;
}) {
  const tones: Record<string, string> = {
    ok: 'bg-teal/15 text-teal-dark',
    warn: 'bg-amber/20 text-[#8A6D1B]',
    dark: 'bg-navy text-white',
    amber: 'bg-amber text-navy',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-1 font-mono text-[10.5px] font-medium tracking-[0.04em]',
        tones[tone],
        className
      )}
    >
      {label}
    </span>
  );
}
