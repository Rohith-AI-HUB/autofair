import type { Metadata } from 'next';
import { Manrope, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
import { LedgerBar } from '@/components/layout/LedgerBar';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { AuthModalHost } from '@/components/auth/AuthModalHost';

const manrope = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-sans',
  display: 'swap',
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'AutoFair — Verified Used Cars. Honest History. Fair Deals.',
  description:
    'Verified used cars with transparent inspection reports, documented history and no hidden surprises. The dossier is public — before you call the seller.',
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
  },
  openGraph: {
    title: 'AutoFair — Verified Used Cars. Honest History. Fair Deals.',
    description:
      'Know the car before you buy it. Inspection file, documents and history upfront.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth" className={`${manrope.variable} ${plexMono.variable} overflow-x-hidden`}>
      <body className="font-sans overflow-x-hidden">
        <LedgerBar />
        <Navbar />
        <main className="overflow-x-hidden">{children}</main>
        <Footer />
        <AuthModalHost />
      </body>
    </html>
  );
}
