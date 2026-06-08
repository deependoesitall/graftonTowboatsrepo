'use client';
// src/components/cart/CartBar.tsx
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ShoppingCart, ChevronRight } from 'lucide-react';
import { getCart, getCartTotal, getCartCount } from '@/lib/cart';
import { formatCurrency } from '@/lib/utils';

export function CartBar() {
  const [count, setCount] = useState(0);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const update = () => {
      const items = getCart();
      setCount(getCartCount(items));
      setTotal(getCartTotal(items));
    };
    update();
    window.addEventListener('cart-updated', update);
    return () => window.removeEventListener('cart-updated', update);
  }, []);

  if (count === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 cart-bar-enter pb-safe">
      <div className="max-w-3xl mx-auto px-4 pb-4">
        <Link href="/order"
          className="flex items-center justify-between bg-brand-green text-white rounded-full px-5 py-3.5 shadow-2xl hover:bg-brand-gmed transition-colors group">
          <div className="flex items-center gap-3">
            <div className="relative">
              <ShoppingCart className="w-5 h-5" />
              <span className="absolute -top-2 -right-2 w-4 h-4 bg-brand-orange text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {count > 9 ? '9+' : count}
              </span>
            </div>
            <span className="font-bold text-sm uppercase tracking-widest">
              {count} {count === 1 ? 'item' : 'items'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-base">{formatCurrency(total)}</span>
            <span className="text-xs uppercase tracking-widest font-bold opacity-80">Review &amp; Submit</span>
            <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </Link>
      </div>
    </div>
  );
}
