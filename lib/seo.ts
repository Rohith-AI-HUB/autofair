// Canonical origin for every absolute URL handed to a crawler (metadataBase,
// canonicals, robots.txt, sitemap.xml). NEXT_PUBLIC_SITE_URL is not set on the
// hosted project, so the fallback is the real apex-and-www-normalised host:
// a wrong value here silently points every canonical at the wrong site.
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.autofair.online'
).replace(/\/$/, '');

export const SITE_HOST = SITE_URL.replace(/^https?:\/\//, '');

export const SITE_NAME = 'AutoFair';

// Single source for the published contact block: /contact renders these and the
// Organization JSON-LD emits the same values, so NAP cannot drift between them.
export const CONTACT_EMAIL = 'autofaironline.co@gmail.com';
export const CONTACT_PHONE = '+91 9686413636';
export const CONTACT_PHONE_E164 = CONTACT_PHONE.replace(/\s/g, '');

export function absoluteUrl(path = '/'): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}
