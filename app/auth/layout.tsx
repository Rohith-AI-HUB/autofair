import type { Metadata } from 'next';

// /auth/callback and /auth/update-password are client components and cannot
// export metadata themselves, so the whole segment is noindexed from here.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
