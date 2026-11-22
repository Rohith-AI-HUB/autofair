import type { Metadata } from 'next';
import { SellPageShell } from '@/components/sell/SellForm';

export const metadata: Metadata = {
  title: 'Sell Your Car | AutoFair',
  description: 'Submit your vehicle for review. Verification first, listing second.',
  alternates: { canonical: '/sell-your-car' },
};

export default function SellPage() {
  return (
    <div className="bg-off-white">
      <SellPageShell />
    </div>
  );
}
