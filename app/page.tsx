import type { Metadata } from 'next';
import { Hero } from '@/components/home/Hero';
import { PhotoBleed } from '@/components/home/PhotoBleed';
import { Ruler } from '@/components/home/Ruler';
import { FeaturedCars } from '@/components/home/FeaturedCars';
import { TrustReportPreview } from '@/components/home/TrustReportPreview';
import { DossierPreview } from '@/components/home/DossierPreview';

export const metadata: Metadata = {
  title: 'AutoFair — Verified Used Cars. Honest History. Fair Deals.',
  description:
    'Verified used cars with transparent inspection reports, documented history and no hidden surprises. The dossier is public — before you call the seller.',
};

export default function HomePage() {
  return (
    <>
      <Hero />
      <PhotoBleed />
      <Ruler />
      <FeaturedCars />
      <TrustReportPreview />
      <DossierPreview />
    </>
  );
}
