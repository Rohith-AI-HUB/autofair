import type { Metadata } from 'next';
import { AuthExperience } from '@/components/auth/AuthExperience';

export const metadata: Metadata = {
  title: 'Sign In | AutoFair',
  description:
    'Sign in to AutoFair to open your saved dossiers, alerts and seller threads. Secured by Google OAuth via Supabase Auth.',
};

export default function AuthPage() {
  return <AuthExperience />;
}
