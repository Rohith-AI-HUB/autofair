import type { Metadata } from 'next';
import { MyListingsExperience } from '@/components/listings/MyListingsExperience';
import { RequireRole } from '@/components/auth/RequireRole';

export const metadata: Metadata = {
  title: 'My Listings | AutoFair',
  description:
    'Every file you published, with live status, views and buyer inquiries. Sign in to open your garage.',
};

export default function MyListingsPage() {
  return (
    <RequireRole allow={['CUSTOMER', 'STAFF', 'ADMIN']} title="Sign in to open your garage">
      <MyListingsExperience />
    </RequireRole>
  );
}
