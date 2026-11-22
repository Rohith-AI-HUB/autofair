import type { Metadata } from 'next';
import { NotFoundBody } from '@/components/shared/NotFoundBody';

export const metadata: Metadata = {
  title: 'Not found | AutoFair',
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return <NotFoundBody />;
}
