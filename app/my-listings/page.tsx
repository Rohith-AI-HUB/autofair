import type { Metadata } from 'next';
import { MyListingsExperience } from '@/components/listings/MyListingsExperience';

export const metadata: Metadata = {
  title: 'My Listings | AutoFair',
  description:
    'Every file you published, with live status, views and buyer inquiries. Sign in to open your garage.',
};

export default function MyListingsPage() {
  return <MyListingsExperience />;
}
