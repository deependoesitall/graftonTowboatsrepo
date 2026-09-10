// src/app/shop/layout.tsx — retired thin Sinclair's picking shell.
//
// shop.* now 307s to apex /admin/orders (see middleware). This layout remains
// only for leftover /shop paths on the apex host; it no longer installs a
// second incomplete PWA. Manifest points at the same admin experience.

import ShopGate from '@/components/shop/ShopGate';

export const metadata = {
  title: 'GTS Orders',
  robots: 'noindex',
  // Same admin manifest — no second Home Screen target.
  manifest: '/admin.webmanifest',
  icons: {
    icon: '/branding/favicon-gts.png',
    shortcut: '/branding/favicon-gts.png',
    apple: '/branding/admin-icon.png',
  },
  appleWebApp: {
    capable: true,
    title: 'GTS Orders',
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
