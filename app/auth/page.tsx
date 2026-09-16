import type { Metadata } from 'next';
import { AuthRouteOpener } from '@/components/auth/AuthRouteOpener';

export const metadata: Metadata = {
  title: 'Sign In | AutoFair',
  description:
    'Sign in to AutoFair to open your saved dossiers, alerts and seller threads. Secured by Google OAuth via Supabase Auth.',
};

/**
 * Backward-compat route. Auth is a floating window everywhere now;
 * visiting /auth opens the same modal over a neutral background instead
 * of a standalone full-page form.
 */
export default function AuthPage() {
  return <AuthRouteOpener />;
}
