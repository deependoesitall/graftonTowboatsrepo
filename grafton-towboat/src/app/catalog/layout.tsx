// src/app/catalog/layout.tsx
import { SiteHeader } from '@/components/layout/SiteHeader';
import { CartBar } from '@/components/cart/CartBar';

export default function CatalogLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-brand-cream flex flex-col">
      <SiteHeader />
      <main className="flex-1 pb-24">{children}</main>
      <CartBar />
    </div>
  );
}
