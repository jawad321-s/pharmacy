import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'PharmaSaaS — Pharmacy Management Platform',
  description:
    'Multi-tenant SaaS platform for pharmacies: POS, inventory with batch expiry tracking, purchases, accounting and multi-branch management.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
