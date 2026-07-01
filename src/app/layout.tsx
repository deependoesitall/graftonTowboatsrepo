// src/app/layout.tsx
import type { Metadata, Viewport } from 'next';
import { Oswald, Inter } from 'next/font/google';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { AuthProvider } from '@/lib/auth-context';
import { SpeedInsights } from '@vercel/speed-insights/next';

// Oswald = heavy condensed uppercase — matches GTS site heading style
const oswald = Oswald({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
  weight: ['600', '700'],
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
});

export const metadata: Metadata = {
  title: 'Grafton Towboat Services — Order Groceries & Supplies',
  description:
    "Order groceries, provisions, and supplies for your vessel through Grafton Towboat Services. Partnered with Sinclair's Foods. Mississippi Mile Marker 218.",
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'GTS Orders',
  },
};

export const viewport: Viewport = {
  themeColor: '#1E3D1E',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${oswald.variable} ${inter.variable}`}>
      <head />
      <body className="font-body antialiased">
        <AuthProvider>
          {children}
          <Toaster />
        </AuthProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}
