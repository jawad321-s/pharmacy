import type { Metadata } from 'next';
import { Cairo } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

// Cairo renders beautifully in both Arabic and Latin scripts, so a single
// family keeps the LTR and RTL layouts visually consistent.
const cairo = Cairo({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'PharmaSaaS — Pharmacy Management Platform',
  description:
    'Multi-tenant SaaS platform for pharmacies: POS, inventory with batch expiry tracking, purchases, accounting and multi-branch management.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={cairo.variable} suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
