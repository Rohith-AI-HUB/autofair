import type { Metadata } from 'next';
import { RequireRole } from '@/components/auth/RequireRole';
import { StaffWorkspace } from '@/components/staff/StaffWorkspace';

export const metadata: Metadata = {
  title: 'Staff Workspace | AutoFair',
  description: 'Assigned vehicle verifications: inspect, rate, price, and publish.',
};

export default function StaffPage() {
  return (
    <RequireRole allow={['STAFF']} title="Staff sign in required">
      <StaffWorkspace />
    </RequireRole>
  );
}
