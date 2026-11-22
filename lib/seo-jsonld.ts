import type { Car } from '@/types';
import { carTitle } from '@/lib/data/car-names';
import { formatKm } from '@/lib/data/cars';
import { CONTACT_EMAIL, CONTACT_PHONE, SITE_NAME, SITE_URL, absoluteUrl } from '@/lib/seo';

/**
 * JSON-LD builders. Rule: only emit properties backed by a real column. That is
 * why there is no aggregateRating (the inspection score is not a user review),
 * no VIN (reg_number is an RTO plate, not a chassis number), no seller legal
 * name, and no AutoDealer address (no street/pincode/geo is stored anywhere).
 * `offers.availability` is also omitted: the mapped Car shape carries no
 * listings.status, so stock state would be a guess.
 */

function offer(car: Car) {
  return {
    '@type': 'Offer',
    price: String(car.price),
    priceCurrency: 'INR',
    url: absoluteUrl(`/cars/${car.slug}`),
    itemCondition: 'https://schema.org/UsedCondition',
  };
}

function property(name: string, value: number | string) {
  return { '@type': 'PropertyValue', name, value };
}

/**
 * `inspections.inspected_at` is null on every live row, so published_at is the
 * only date that can be claimed. It is never later than a real change: photos
 * and corrections appended after publishing keep the earlier date.
 */
function dates(car: Car) {
  if (!car.publishedAt) return {};
  const iso = new Date(car.publishedAt).toISOString();
  return { datePublished: iso, dateModified: iso };
}

export function vehicleProductJsonLd(car: Car) {
  const url = absoluteUrl(`/cars/${car.slug}`);
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: carTitle(car),
    description:
      `${carTitle(car)} (${car.year}), ${formatKm(car.mileageKm)}, ${car.fuel}, ${car.transmission}, ${car.ownership}. ` +
      `Located in ${car.location}. Verified under inspection file ${car.inspectionId}.`,
    sku: car.inspectionId,
    productID: car.inspectionId,
    brand: { '@type': 'Brand', name: car.make },
    image: car.images.map(absoluteUrl),
    url,
    ...dates(car),
    offers: offer(car),
    additionalProperty: [
      property('Year of manufacture', car.year),
      property('Odometer reading', `${car.mileageKm} km`),
      property('Fuel type', car.fuel),
      property('Transmission', car.transmission),
      property('Ownership', car.ownership),
      property('Location', car.location),
      property('Inspection file', car.inspectionId),
    ],
  };
}

export function breadcrumbJsonLd(car: Car) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: absoluteUrl('/') },
      { '@type': 'ListItem', position: 2, name: 'Browse verified cars', item: absoluteUrl('/cars') },
      { '@type': 'ListItem', position: 3, name: carTitle(car), item: absoluteUrl(`/cars/${car.slug}`) },
    ],
  };
}

export function itemListJsonLd(cars: Car[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Verified used cars on AutoFair',
    numberOfItems: cars.length,
    itemListElement: cars.map((car, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: carTitle(car),
      url: absoluteUrl(`/cars/${car.slug}`),
    })),
  };
}

export function organizationJsonLd() {
  return {
    '@id': `${SITE_URL}/#organization`,
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: `${SITE_URL}/`,
    logo: absoluteUrl('/opengraph-image'),
    email: CONTACT_EMAIL,
    telephone: CONTACT_PHONE,
    foundingDate: '2026',
    description:
      'AutoFair publishes the inspection file, documents and disclosed history of every used car it lists, before a buyer calls the seller.',
    areaServed: [
      { '@type': 'City', name: 'Bengaluru' },
      { '@type': 'City', name: 'Chitradurga' },
    ],
  };
}

export function websiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: `${SITE_URL}/`,
    inLanguage: 'en-IN',
    publisher: { '@id': `${SITE_URL}/#organization` },
  };
}

/**
 * Escapes every `<` so a `</script>` sequence inside DB-authored text cannot
 * close the element early.
 */
export function jsonLd(data: unknown): { __html: string } {
  return { __html: JSON.stringify(data).replace(/</g, '\\u003c') };
}
