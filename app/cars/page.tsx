import type { Metadata } from 'next';
import { CarsExplorer } from '@/components/cars/CarsExplorer';

export const metadata: Metadata = {
  title: 'Browse Verified Used Cars | AutoFair',
  description:
    'Search verified used cars with inspection scores, documents and disclosed history. Filter by make, fuel, transmission, price and year.',
};

export default function CarsPage() {
  return <CarsExplorer />;
}
