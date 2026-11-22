import type { Metadata } from 'next';
import type { Car } from '@/types';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Container } from '@/components/shared/Container';
import { VehicleGallery } from '@/components/cars/VehicleGallery';
import { VehicleSummary } from '@/components/cars/VehicleSummary';
import { TrustReport } from '@/components/cars/TrustReport';
import { CarCard } from '@/components/cars/CarCard';
import { ViewCounter } from '@/components/cars/ViewCounter';
import { cars, demoCarsAllowed, formatKm, formatPrice, getCarBySlug } from '@/lib/data/cars';
import { carTitle } from '@/lib/data/car-names';
import { fetchCarBySlugFromDb, fetchLiveCars, fetchLiveListingSlugs } from '@/lib/supabase/queries';
import { absoluteUrl } from '@/lib/seo';
import { breadcrumbJsonLd, jsonLd, vehicleProductJsonLd } from '@/lib/seo-jsonld';

// DB rows can change without a deploy (photos added later, price at
// verification), so never serve the build-time snapshot indefinitely.
export const revalidate = 60;

/**
 * Resolves a dossier and records whether it is demo content. `getCarBySlug`
 * only knows the seed list in lib/data/cars.ts, so a hit there with no DB row
 * is an Unsplash-backed sample car, not a vehicle anyone is selling.
 */
async function resolveCar(slug: string): Promise<{ car: Car | undefined; isDemo: boolean }> {
  const fromDb = await fetchCarBySlugFromDb(slug);
  if (fromDb) return { car: fromDb, isDemo: false };
  return { car: getCarBySlug(slug), isDemo: true };
}

export async function generateStaticParams() {
  // Prerender the real inventory. The seed slugs used to come from here, which
  // put six sample cars on the production index while actual listings did not.
  const live = await fetchLiveListingSlugs();
  return live.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const { car, isDemo } = await resolveCar(slug);
  if (!car) return { title: 'Not found | AutoFair', robots: { index: false, follow: false } };
  // The visible H1 stays the bare car name (car naming policy renders stored data
  // as-is). Only the SERP string carries price and city, which is what buyers
  // actually filter on ("used BMW 520d Bangalore price").
  const title = `${carTitle(car)} — ${formatPrice(car.price)}, ${car.location} | AutoFair`;
  const description =
    `${formatPrice(car.price)} • ${car.year} • ${car.fuel} • ${car.transmission} • ` +
    `${formatKm(car.mileageKm)} • ${car.ownership} • ${car.location}. ` +
    `Verified dossier ${car.inspectionId}: checks, documents and accident disclosure.`;
  return {
    title,
    description,
    alternates: { canonical: `/cars/${car.slug}` },
    openGraph: {
      type: 'website',
      title,
      description,
      url: absoluteUrl(`/cars/${car.slug}`),
      images: car.images.map((src) => ({ url: absoluteUrl(src) })),
    },
    // Sample dossiers stay reachable from the marketing previews but must never
    // rank: they advertise a car that is not for sale.
    robots: isDemo ? { index: false, follow: true } : { index: true, follow: true },
  };
}

export default async function CarDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { car, isDemo } = await resolveCar(slug);
  if (!car) notFound();

  const liveRelated = await fetchLiveCars();
  const pool = liveRelated?.length ? liveRelated : demoCarsAllowed ? cars : [];
  const seen = new Set<string>([car.slug]);
  const related = pool.filter((c) => {
    if (c.slug === car.slug || seen.has(c.slug)) return false;
    seen.add(c.slug);
    return true;
  }).slice(0, 3);

  return (
    <Container className="pb-16 pt-8">
      {!isDemo ? (
        <>
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={jsonLd(vehicleProductJsonLd(car))}
          />
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={jsonLd(breadcrumbJsonLd(car))}
          />
        </>
      ) : null}
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
