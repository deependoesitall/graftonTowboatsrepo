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
  title: "GTS - Sinclair's",
  robots: 'noindex',
  manifest: '/shop.webmanifest',
  // ⚠️ `icon` MUST BE LISTED HERE, NOT LEFT TO app/shop/icon.png.
  //
  // Declaring `icons` in a segment REPLACES the icon set that segment would
  // otherwise inherit. This said `{ apple: … }` and nothing else, so every page
  // under /shop emitted an apple-touch-icon and NO <link rel="icon"> at all —
  // the Sinclair's app and its install page showed the browser's generic globe
  // while a perfectly good favicon sat unused in app/shop/icon.png.
  //
  // Referenced from /public rather than the app-dir convention because Next
  // serves convention icons at a hashed URL that cannot be named here.
  //
  // Red, where GTS is green: staff have both installed and both open.
  icons: {
    icon: '/branding/favicon-sinclairs.png',
    shortcut: '/branding/favicon-sinclairs.png',
    // iOS uses this, not the manifest icons, for the Home Screen.
    apple: '/branding/shop-icon.png',
  },
  appleWebApp: {
    capable: true,
    // This is the label that appears under the Home Screen icon on iOS.
    title: "GTS - Sinclair's",
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
