import type { Metadata } from 'next';
import { RequireRole } from '@/components/auth/RequireRole';
import { AdminDashboard } from '@/components/admin/AdminDashboard';

export const metadata: Metadata = {
  title: 'Admin Dashboard | AutoFair',
  description: 'Manage inspection staff, monitor workload and upcoming inspections. Assignment is automatic by workload.',
};

export default function AdminPage() {
  return (
    <RequireRole allow={['ADMIN']} title="Admin sign in required">
      <AdminDashboard />
    </RequireRole>
  );
}
