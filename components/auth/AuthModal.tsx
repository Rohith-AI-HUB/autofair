'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { AuthForm, type AuthFormMode } from '@/components/auth/AuthForm';

/**
 * Floating auth window. Centered, responsive, design-system consistent.
 * Backdrop blocks background interaction; ESC / backdrop / X closes.
 * Background route stays mounted behind the overlay.
 */
export function AuthModal({
  open,
  initialMode = 'signin',
  next,
  onClose,
  onSuccess,
}: {
  open: boolean;
  initialMode?: AuthFormMode;
  next?: string;
  onClose: () => void;
  onSuccess: (dest: string) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    // Focus the dialog for screen readers / keyboard users.
    panelRef.current?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Sign in to AutoFair"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6"
    >
      <button
        type="button"
        aria-label="Close sign in"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-navy/60 backdrop-blur-[2px]"
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative max-h-[92vh] w-full max-w-[440px] overflow-y-auto rounded-[4px] border border-line bg-white p-6 shadow-[0_24px_80px_rgba(11,23,38,0.35)] outline-none transition-all duration-200 sm:p-7"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <p className="font-mono text-[10px] tracking-[0.06em] text-teal-dark">
            ACCOUNT&nbsp;&nbsp;•&nbsp;&nbsp;SIGN IN / SIGN UP
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center border border-line text-navy hover:border-navy"
          >
            <X size={16} aria-hidden />
          </button>
        </div>
        <AuthForm initialMode={initialMode} next={next} onSuccess={onSuccess} hideTrustRow />
      </div>
    </div>
  );
}
