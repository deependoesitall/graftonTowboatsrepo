'use client';
// src/components/layout/SiteHeader.tsx
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { Anchor, ShoppingCart, Menu, X, Phone } from 'lucide-react';
import { getCart, getCartCount, getCartTotal } from '@/lib/cart';
import { formatCurrency } from '@/lib/utils';

export function SiteHeader() {
  const [cartCount, setCartCount] = useState(0);
  const [cartTotal, setCartTotal] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const update = () => {
      const items = getCart();
      setCartCount(getCartCount(items));
      setCartTotal(getCartTotal(items));
    };
    update();
    window.addEventListener('cart-updated', update);
    return () => window.removeEventListener('cart-updated', update);
  }, []);

  return (
    <header className="sticky top-0 z-40 bg-brand-navy shadow-lg">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <div className="w-7 h-7 bg-brand-gold/20 rounded-full flex items-center justify-center">
            <Anchor className="w-3.5 h-3.5 text-brand-gold" />
          </div>
          <span className="font-display text-white font-bold text-sm md:text-base leading-tight">
            Grafton Towboat
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-6">
          <Link href="/catalog" className="text-brand-sky hover:text-white text-sm font-medium transition-colors">
            Browse Items
          </Link>
          <a href="tel:6185560290" className="flex items-center gap-1.5 text-brand-sky hover:text-white text-sm transition-colors">
            <Phone className="w-3.5 h-3.5" />
            (618) 556-0290
          </a>
        </nav>

        {/* Cart + hamburger */}
        <div className="flex items-center gap-3">
          <Link
            href="/order"
            className="flex items-center gap-2 bg-brand-gold/10 hover:bg-brand-gold/20 border border-brand-gold/30 rounded-lg px-3 py-1.5 transition-colors group"
          >
            <div className="relative">
              <ShoppingCart className="w-4 h-4 text-brand-gold" />
              {cartCount > 0 && (
                <span className="absolute -top-2 -right-2 w-4 h-4 bg-brand-gold text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {cartCount > 9 ? '9+' : cartCount}
                </span>
              )}
            </div>
            {cartCount > 0 && (
              <span className="text-white text-xs font-semibold hidden sm:block">
                {formatCurrency(cartTotal)}
              </span>
            )}
          </Link>
          <button
            className="md:hidden text-white p-1"
            onClick={() => setMenuOpen(o => !o)}
            aria-label="Toggle menu"
          >
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden bg-brand-steel border-t border-brand-river/40 px-4 py-4 flex flex-col gap-1">
          {[
            { href: '/catalog', label: 'Browse Groceries & Supplies' },
            { href: '/order', label: cartCount > 0 ? `My Order (${cartCount} items · ${formatCurrency(cartTotal)})` : 'My Order' },
          ].map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setMenuOpen(false)}
              className="text-white font-medium text-sm py-3 px-3 rounded-lg hover:bg-brand-river/40 transition-colors border-b border-brand-river/20 last:border-0"
            >
              {label}
            </Link>
          ))}
          <a href="tel:6185560290" className="text-brand-sky text-sm py-3 px-3 flex items-center gap-2">
            <Phone className="w-4 h-4" /> (618) 556-0290
          </a>
        </div>
      )}
    </header>
  );
}
