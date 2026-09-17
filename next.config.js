/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: blob: https://images.unsplash.com https://*.supabase.co; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src 'self' https://*.supabase.co; object-src 'none'; upgrade-insecure-requests",
          },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: 'ueuutxpqgkjyubwaiall.supabase.co',
      },
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
  },
};

module.exports = nextConfig;
