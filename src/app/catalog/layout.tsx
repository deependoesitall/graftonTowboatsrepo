// src/app/catalog/layout.tsx
import { SiteHeader } from '@/components/layout/SiteHeader';
import { CartBar } from '@/components/cart/CartBar';
import { StoreFooter } from '@/components/layout/StoreFooter';

export default function CatalogLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-brand-cream flex flex-col">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      {/* Footer sits inside the pb-24 gutter so the fixed CartBar can't cover
          the legal links — the point of putting them here is that they're
          reachable. */}
      <div className="pb-24">
        <StoreFooter />
      </div>
      <CartBar />
    </div>
  );
}
