// src/app/layout.tsx — root layout
import type { Metadata, Viewport } from 'next';
import { Oswald, Inter } from 'next/font/google';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { AuthProvider } from '@/lib/auth-context';

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
  metadataBase: new URL('https://graftontowboatservices.com'),
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://graftontowboatservices.com',
    siteName: 'Grafton Towboat Services',
    title: 'Grafton Towboat Services - Order Groceries & Supplies',
    description:
      "Family-owned marine grocery and supply delivery in Grafton, Illinois. Partnered with Sinclair's Foods. Mississippi MM 219 / Illinois MM 0.",
    images: [{ url: '/branding/gts-lockup.png', width: 1178, height: 492, alt: 'Grafton Towboat Services' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Grafton Towboat Services - Order Groceries & Supplies',
    description:
      "Groceries, towboat supplies, and crew change ? delivered to your vessel at Grafton, IL.",
    images: ['/branding/gts-lockup.png'],
  },

  title: 'Grafton Towboat Services - Order Groceries & Supplies',
  description:
    "Order groceries, provisions, and supplies for your vessel through Grafton Towboat Services. Partnered with Sinclair's Foods. Mile Marker 219 on the Mississippi River, Mile Marker 0 on the Illinois River.",
  manifest: '/manifest.json',
  // ⚠️ THE CUSTOMER APP NEEDS ITS OWN ICONS DECLARED HERE.
  //
  // `appleWebApp.capable` tells iOS this installs as an app, but iOS ignores
  // the manifest's icons for the Home Screen and looks ONLY for an
  // apple-touch-icon. There wasn't one, so a captain who installed the
  // ordering site got a SCREENSHOT OF THE PAGE as their icon — the exact
  // failure the comment in shop/layout.tsx warns about, in the one place that
  // still had it.
  //
  // Brand yellow, where the two staff apps are on black: a crew member and a
  // GTS office phone can both have all three installed, and the light one is
  // always the customer's.
  icons: {
    icon: '/branding/favicon-gts.png',
    shortcut: '/branding/favicon-gts.png',
    apple: '/branding/customer-icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    // NOT 'GTS Orders' — that is the STAFF app, and this label is what sits
    // under the icon on the Home Screen. Two apps called the same thing on one
    // phone is the confusion the separate origins exist to prevent.
    title: 'Grafton Order',
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
      </body>
    </html>
  );
}
