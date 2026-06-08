'use client';
// src/components/cart/CartBar.tsx
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ShoppingCart } from 'lucide-react';
import { getCart, getCartTotal, getCartCount } from '@/lib/cart';
import { formatCurrency } from '@/lib/utils';

export function CartBar() {
  const [items, setItems] = useState(() => {
    if (typeof window === 'undefined') return [];
    return getCart();
  });

  useEffect(() => {
    setItems(getCart());
    const handler = () => setItems(getCart());
    window.addEventListener('cart-updated', handler);
    return () => window.removeEventListener('cart-updated', handler);
  }, []);

  const count = getCartCount(items);
  const total = getCartTotal(items);

  if (count === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 pb-safe cart-bar-enter">
      <div className="bg-brand-navy border-t-2 border-brand-gold shadow-2xl">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <ShoppingCart className="w-6 h-6 text-brand-gold" />
              <span className="absolute -top-2 -right-2 w-5 h-5 bg-brand-gold text-white text-xs font-bold rounded-full flex items-center justify-center">
                {count > 99 ? '99+' : count}
              </span>
            </div>
            <div>
              <p className="text-white font-bold font-body text-base leading-none">
                {formatCurrency(total)}
              </p>
              <p className="text-brand-sky text-xs mt-0.5">
                {count} item{count !== 1 ? 's' : ''} in cart
              </p>
            </div>
          </div>

          <Link
            href="/order"
            className="btn-gold py-2.5 px-6 text-sm whitespace-nowrap"
          >
            Review &amp; Submit →
          </Link>
        </div>
      </div>
    </div>
  );
}
