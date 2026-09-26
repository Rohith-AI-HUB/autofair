import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Container } from '@/components/shared/Container';
import { VehicleGallery } from '@/components/cars/VehicleGallery';
import { VehicleSummary } from '@/components/cars/VehicleSummary';
import { TrustReport } from '@/components/cars/TrustReport';
import { CarCard } from '@/components/cars/CarCard';
import { ViewCounter } from '@/components/cars/ViewCounter';
import { cars, getCarBySlug, carTitle } from '@/lib/data/cars';
import { fetchCarBySlugFromDb, fetchLiveCars } from '@/lib/supabase/queries';

// DB rows can change without a deploy (photos added later, price at
// verification), so never serve the build-time snapshot indefinitely.
export const revalidate = 60;

export async function generateStaticParams() {
  return cars.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const car = (await fetchCarBySlugFromDb(slug)) ?? getCarBySlug(slug);
  if (!car) return { title: 'Not found | AutoFair' };
  return {
    title: `${carTitle(car)} | AutoFair`,
    description: `${carTitle(car)} — ${car.inspectionId}. Verified dossier with inspection, documents and disclosed history.`,
  };
}

export default async function CarDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const car = (await fetchCarBySlugFromDb(slug)) ?? getCarBySlug(slug);
  if (!car) notFound();

  const liveRelated = await fetchLiveCars();
  const pool = liveRelated?.length ? liveRelated : cars;
  const seen = new Set<string>([car.slug]);
  const related = pool.filter((c) => {
    if (c.slug === car.slug || seen.has(c.slug)) return false;
    seen.add(c.slug);
    return true;
  }).slice(0, 3);

  return (
    <Container className="pb-16 pt-8">
      <ViewCounter slug={slug} />
      <nav aria-label="Breadcrumb">
        <Link href="/cars" className="font-sans text-[13px] font-bold text-navy hover:underline">
          ← Back to all files
        </Link>
      </nav>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <VehicleGallery images={car.images} title={carTitle(car)} />
        <VehicleSummary car={car} />
      </div>

      <TrustReport car={car} />

      <section aria-labelledby="related" className="mt-12">
        <h2 id="related" className="font-sans text-[22px] font-extrabold text-navy">
          Other dossiers worth opening.
        </h2>
        <div className="mt-4 flex flex-col gap-[18px]">
          {related.map((r, i) => (
            <CarCard key={r.id} car={r} index={i} />
          ))}
        </div>
      </section>
    </Container>
  );
}
