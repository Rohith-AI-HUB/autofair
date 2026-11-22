import type { MetadataRoute } from 'next';
import { fetchLiveListingSlugs } from '@/lib/supabase/queries';
import { SITE_URL } from '@/lib/seo';

// Listings change between deploys (new dossier published, price corrected at
// verification), so the sitemap must not be frozen at build time.
export const revalidate = 3600;

const PUBLIC_PATHS: { path: string; priority: number; changeFrequency: 'daily' | 'weekly' | 'monthly' }[] = [
  { path: '', priority: 1, changeFrequency: 'daily' },
  { path: 'cars', priority: 0.9, changeFrequency: 'daily' },
  { path: 'sell-your-car', priority: 0.8, changeFrequency: 'monthly' },
  { path: 'inspection', priority: 0.7, changeFrequency: 'monthly' },
  { path: 'how-it-works', priority: 0.6, changeFrequency: 'monthly' },
  { path: 'about', priority: 0.5, changeFrequency: 'monthly' },
  { path: 'privacy-policy', priority: 0.3, changeFrequency: 'monthly' },
  { path: 'terms', priority: 0.3, changeFrequency: 'monthly' },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // The static pages only change on deploy, so they get no lastmod: Google
  // checks it against the page and stops trusting a sitemap that overstates it.
  const statics: MetadataRoute.Sitemap = PUBLIC_PATHS.map(({ path, priority, changeFrequency }) => ({
    url: `${SITE_URL}/${path}`,
    changeFrequency,
    priority,
  }));

  // Seed/demo dossiers are deliberately absent: fetchLiveListingSlugs() reads
  // listings.status = LIVE from the database, and demo cars have no row.
  const dossiers: MetadataRoute.Sitemap = (await fetchLiveListingSlugs()).map(
    ({ slug, publishedAt }) => ({
      url: `${SITE_URL}/cars/${slug}`,
      ...(publishedAt ? { lastModified: publishedAt } : {}),
      changeFrequency: 'daily',
      priority: 0.8,
    }),
  );

  return [...statics, ...dossiers];
}
