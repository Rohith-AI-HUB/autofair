import { cn } from '@/lib/utils';

export function SectionHeading({
  eyebrow,
  title,
  sub,
  dark = false,
  className,
}: {
  eyebrow: string;
  title: string;
  sub?: string;
  dark?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <p
        className={cn(
          'font-mono text-[11px] tracking-[0.06em]',
          dark ? 'text-teal-bright' : 'text-teal-dark'
        )}
      >
        {eyebrow}
      </p>
      <h2
        className={cn(
          'font-sans font-extrabold leading-[1.05] tracking-[-0.02em]',
          'text-[32px] md:text-[42px]',
          dark ? 'text-white' : 'text-navy'
        )}
      >
        {title}
      </h2>
      {sub ? (
        <p
          className={cn(
            'max-w-[640px] font-sans text-[15px] leading-[1.6]',
            dark ? 'text-[#9FB2C5]' : 'text-muted'
          )}
        >
          {sub}
        </p>
      ) : null}
    </div>
  );
}
