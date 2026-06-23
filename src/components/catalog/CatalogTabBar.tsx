'use client';
// src/components/catalog/CatalogTabBar.tsx
// Client component — renders tab switcher and shows live service badge count.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ShoppingBasket, Package } from 'lucide-react';
import { getAdditionalServices, getActiveServicesCount } from '@/lib/cart';

export function CatalogTabBar({ activeTab }: { activeTab: 'groceries' | 'services' }) {
  const [serviceBadge, setServiceBadge] = useState(0);

  useEffect(() => {
    function update() {
      setServiceBadge(getActiveServicesCount(getAdditionalServices()));
    }
    update();
    window.addEventListener('cart-updated', update);
    return () => window.removeEventListener('cart-updated', update);
  }, []);

  return (
    <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-5 w-full sm:w-auto sm:inline-flex">
      <Link
        href="/catalog?tab=groceries"
        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all flex-1 sm:flex-none justify-center sm:justify-start ${
          activeTab === 'groceries'
            ? 'bg-white text-brand-navy shadow-sm'
            : 'text-gray-500 hover:text-brand-navy'
        }`}
      >
        <ShoppingBasket className="w-4 h-4" />
        Sinclair&apos;s Groceries
      </Link>
      <Link
        href="/catalog?tab=services"
        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all flex-1 sm:flex-none justify-center sm:justify-start relative ${
          activeTab === 'services'
            ? 'bg-white text-brand-navy shadow-sm'
            : 'text-gray-500 hover:text-brand-navy'
        }`}
      >
        <Package className="w-4 h-4" />
        Additional Services
        {serviceBadge > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-brand-green text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {serviceBadge}
          </span>
        )}
      </Link>
    </div>
  );
}
