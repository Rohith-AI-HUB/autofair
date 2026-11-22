import type { Metadata } from 'next';
import { CarsExplorer } from '@/components/cars/CarsExplorer';
import { demoCarsAllowed, cars as seedCars } from '@/lib/data/cars';
import { fetchLiveCars } from '@/lib/supabase/queries';
import { itemListJsonLd, jsonLd } from '@/lib/seo-jsonld';

// The grid is server-rendered from the database so a crawler that does not run
// JavaScript sees the real inventory. 60s matches the dossier route.
export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Browse Verified Used Cars | AutoFair',
  description:
    'Search verified used cars with inspection scores, documents and disclosed history. Filter by make, fuel, transmission, price and year.',
  alternates: { canonical: '/cars' },
};

export default async function CarsPage() {
  const live = await fetchLiveCars();
  const initial = live?.length ? live : demoCarsAllowed ? seedCars : [];
  return (
    <>
      <CarsExplorer initialCars={initial} />
      {live?.length ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={jsonLd(itemListJsonLd(live))}
        />
      ) : null}
    </>
  );
}
