import type { Metadata } from 'next';
import { RequireRole } from '@/components/auth/RequireRole';
import { ProfilePhoneForm } from '@/components/profile/ProfilePhoneForm';
import { Container } from '@/components/shared/Container';

export const metadata: Metadata = {
  title: 'Profile | AutoFair',
  description: 'Manage your AutoFair profile and contact number.',
};

export default function ProfilePage() {
  return (
    <RequireRole allow={['CUSTOMER', 'STAFF', 'ADMIN']} title="Sign in to open your profile">
      <Container className="pb-16 pt-12">
        <p className="font-mono text-[10px] tracking-[0.04em] text-muted">PROFILE</p>
        <h1 className="mt-2 font-sans text-[32px] font-extrabold text-navy">Your contact number.</h1>
        <p className="mt-2 max-w-[560px] font-sans text-[14px] text-muted">
          Buyers see this number only after signing in and tapping Contact Seller on your file.
        </p>
        <div className="mt-6 max-w-[560px]">
          <ProfilePhoneForm />
        </div>
      </Container>
    </RequireRole>
  );
}
