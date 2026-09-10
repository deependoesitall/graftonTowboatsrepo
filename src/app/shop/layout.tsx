// src/app/shop/layout.tsx — the Sinclair's picking app.
//
// SEPARATE ORIGIN, NOT JUST A SEPARATE PATH.
// Reached at shop.graftontowboatservices.com, rewritten to /shop by
// middleware.ts. Browsers scope installed web apps by origin, so a distinct
// hostname is what makes this a genuinely distinct app on an iPhone — its own
// icon, its own push permission, its own storage. Two manifests under one
// hostname is a coin-flip on iOS and the failure only shows up after the
// people who need it have already installed the wrong thing.
//
// Kept deliberately thin: no admin nav, no GTS branding, no links back into
// the admin panel. Sinclair's staff should see the shopping app and nothing
// that implies access to GTS's rates, ledger or billing.

import ShopGate from '@/components/shop/ShopGate';

export const metadata = {
  title: "Sinclair's Shop — Grafton Towboat",
  robots: 'noindex',
  manifest: '/shop.webmanifest',
  // iOS uses this, not the manifest icons, for the Home Screen.
  // ⚠️ /branding/shop-icon.png DOES NOT EXIST YET — drop a 512×512 PNG there.
  // Until you do, the installed icon falls back to a screenshot of the page,
  // which is exactly the "is this the right app?" confusion the separate
  // origin was meant to remove.
  icons: { apple: '/branding/shop-icon.png' },
  appleWebApp: {
    capable: true,
    title: "Sinclair's",
    statusBarStyle: 'black-translucent' as const,
  },
};

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <ShopGate>{children}</ShopGate>
    </div>
  );
}
