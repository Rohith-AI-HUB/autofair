import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

const PRIVATE_PATHS = ['/admin', '/staff', '/my-listings', '/auth', '/api'];

// AI answer engines fetch raw HTML without JavaScript, so the crawl policy is
// written out per bot rather than left to the '*' default.
const CRAWLERS = ['*', 'GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'PerplexityBot', 'Google-Extended', 'Applebot-Extended'];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: CRAWLERS.map((userAgent) => ({
      userAgent,
      allow: '/',
      disallow: PRIVATE_PATHS,
    })),
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
