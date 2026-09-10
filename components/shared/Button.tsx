import Link from 'next/link';
import { cn } from '@/lib/utils';

type Props = {
  href?: string;
  variant?: 'primary-dark' | 'primary-teal' | 'outline' | 'ghost';
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  type?: 'button' | 'submit';
};

export function Button({
  href,
  variant = 'primary-dark',
  children,
  className,
  onClick,
  type = 'button',
}: Props) {
  const base =
    'inline-flex items-center justify-center font-sans text-[14px] font-bold leading-none px-6 py-[14px] min-h-[44px] no-underline';
  const styles: Record<string, string> = {
    'primary-dark': 'bg-navy text-white hover:bg-navy-2',
    'primary-teal': 'bg-teal text-navy hover:bg-[#12a295]',
    outline: 'border border-navy/30 text-navy hover:border-navy bg-transparent',
    ghost: 'text-navy hover:underline px-2',
  };
  const cls = cn(base, styles[variant], className);
  if (href) {
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button type={type} onClick={onClick} className={cls}>
      {children}
    </button>
  );
}
