'use client';

/**
 * Single global auth-modal bus. No state library; a CustomEvent keeps one
 * reusable modal invokable from anywhere (navbar, sell page, staff gate).
 */
export type AuthModalMode = 'signin' | 'signup';
export type AuthModalView = 'form' | 'forgot';

export const AUTH_MODAL_OPEN = 'autofair:open-auth';
export const AUTH_MODAL_CLOSE = 'autofair:close-auth';

export interface OpenAuthDetail {
  mode?: AuthModalMode;
  /** Where to go after success. Defaults to staying on the current route. */
  next?: string;
}

export function openAuthModal(detail: OpenAuthDetail = {}): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<OpenAuthDetail>(AUTH_MODAL_OPEN, { detail }));
}

export function closeAuthModal(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(AUTH_MODAL_CLOSE));
}
