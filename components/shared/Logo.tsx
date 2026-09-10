export function Logo({
  variant = 'light',
  compact = false,
}: {
  variant?: 'light' | 'dark';
  compact?: boolean;
}) {
  const boxBorder = variant === 'light' ? 'border-navy' : 'border-white';
  const main = variant === 'light' ? 'text-navy' : 'text-white';
  const sub = variant === 'light' ? 'text-[#666]' : 'text-[#9FB2C5]';

  return (
    <span className="inline-flex items-center gap-3">
      <span
        aria-hidden
        className={`flex h-[42px] w-[42px] items-center justify-center border-2 ${boxBorder} font-sans text-[18px] font-extrabold leading-none ${main}`}
      >
        A✓
      </span>
      {!compact && (
        <span className="flex flex-col leading-none">
          <span className={`font-sans text-[17px] font-extrabold tracking-[0.04em] ${main}`}>
            AUTOFAIR
          </span>
          <span className={`mt-1 font-mono text-[9px] tracking-[0.08em] ${sub}`}>
            KNOW THE CAR — EST. 2026
          </span>
        </span>
      )}
    </span>
  );
}
