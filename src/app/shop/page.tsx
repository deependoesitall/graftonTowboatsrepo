'use client';
// src/app/shop/page.tsx
//
// The thin Sinclair's "To shop" PWA is retired. Shopping mode lives inside the
// full admin Orders UI (ShoppingModeModal). This route only exists so any
// leftover /shop bookmark on the apex host still lands somewhere useful —
// shop.* itself 307s to /admin/orders in middleware.

import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';

export default function ShopRetiredRedirect() {
  useEffect(() => {
    const q = typeof window !== 'undefined' ? window.location.search : '';
    window.location.replace(`/admin/orders${q}`);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
    </div>
  );
}
