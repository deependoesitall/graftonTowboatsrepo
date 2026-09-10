// src/app/admin/layout.tsx
import { AdminNav } from '@/components/admin/AdminNav';

export const metadata = {
  title: 'Admin Dashboard — Grafton Towboat',
  robots: 'noindex',
  // SEPARATE MANIFEST FOR STAFF.
  //
  // The root manifest starts at /catalog, which is right for a cook ordering
  // groceries and wrong for the people this install is aimed at — a shopper
  // who added the icon to get order alerts would tap it and land in the
  // customer storefront.
  //
  // Overriding it here means an "Add to Home Screen" performed from any /admin
  // page installs an icon that opens /admin/orders. Customers installing from
  // the catalog are unaffected: they never see an /admin page, so they never
  // see this manifest.
  manifest: '/admin.webmanifest',
  // iOS ignores the manifest's icons for the Home Screen and uses this.
  //
  // Deliberately NOT /branding/gts-logo.png. That file is the marketing site's
  // header logo and the `logo` in the LocalBusiness JSON-LD Google reads —
  // replacing it with an app-icon crop would change the website header and the
  // logo Google shows for the business. An app icon and a site logo want
  // different artwork, so they get different files.
  icons: { apple: '/branding/admin-icon.png' },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <AdminNav />
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">
        {children}
      </main>
    </div>
  );
}
