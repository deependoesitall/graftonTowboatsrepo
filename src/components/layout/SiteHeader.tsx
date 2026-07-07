'use client';
// src/components/layout/SiteHeader.tsx
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { ShoppingCart, Menu, X, User } from 'lucide-react';
import { getCart, getCartCount, getCartTotal } from '@/lib/cart';
import { formatCurrency } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';
import { AuthModal } from '@/components/auth/AuthModal';

export function SiteHeader() {
  const [cartCount, setCartCount] = useState(0);
  const [cartTotal, setCartTotal] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const { user, profile } = useAuth();

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
    <header className="sticky top-0 z-40 bg-white/70 backdrop-blur-md border-b border-brand-green/15 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <img
            src="https://images.squarespace-cdn.com/content/v1/6819038bc556772f05a46e4d/00f04765-aff3-41b3-8b27-6d14b9688c52/image0+%282%29.png?format=300w"
            alt="Grafton Towboat Services"
            className="h-10 w-auto"
          />
        </Link>

        {/* Desktop nav — no phone number here on purpose: contact options
            appear only late in the order flow (review/submit + confirmation) */}
        <nav className="hidden md:flex items-center gap-6">
          <Link href="/catalog" className="text-brand-green font-body font-semibold text-sm hover:text-brand-orange transition-colors tracking-wide">
            Browse Items
          </Link>
        </nav>

        {/* Cart + hamburger */}
        <div className="flex items-center gap-3">
          {user ? (
            <Link href="/account"
              className="hidden sm:flex flex-col items-end leading-tight text-right group"
              title={user.email || 'Account'}>
              <span className="flex items-center gap-1.5 text-brand-green text-sm font-bold group-hover:text-brand-orange transition-colors">
                <User className="w-4 h-4" />
                {profile?.first_name
                  ? `${profile.first_name}${profile.last_name ? ' ' + profile.last_name : ''}`
                  : 'My Account'}
              </span>
              {profile?.company_name && (
                <span className="text-brand-green/50 text-[11px] font-semibold -mt-0.5">
                  {profile.company_name}
                </span>
              )}
            </Link>
          ) : (
            <button onClick={() => setAuthOpen(true)}
              className="hidden sm:flex items-center gap-1.5 text-brand-green/70 hover:text-brand-green text-sm font-semibold transition-colors">
              <User className="w-4 h-4" />
              Sign In
            </button>
          )}
          <Link
            href="/order"
            className="flex items-center gap-2 bg-brand-green text-white rounded-full px-3.5 py-1.5 transition-colors hover:bg-brand-gmed group"
          >
            <div className="relative">
              <ShoppingCart className="w-4 h-4" />
              {cartCount > 0 && (
                <span className="absolute -top-2 -right-2 w-4 h-4 bg-brand-orange text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {cartCount > 9 ? '9+' : cartCount}
                </span>
              )}
            </div>
            {cartCount > 0 && (
              <span className="text-white text-xs font-bold hidden sm:block">
                {formatCurrency(cartTotal)}
              </span>
            )}
          </Link>
          <button
            className="md:hidden text-brand-green p-1"
            onClick={() => setMenuOpen(o => !o)}
            aria-label="Toggle menu"
          >
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden bg-brand-green border-t border-brand-gmed px-4 py-4 flex flex-col gap-1">
          {[
            { href: '/catalog', label: 'Browse Groceries & Supplies' },
            { href: '/order', label: cartCount > 0 ? `My Order (${cartCount} items · ${formatCurrency(cartTotal)})` : 'My Order' },
          ].map(({ href, label }) => (
            <Link key={href} href={href} onClick={() => setMenuOpen(false)}
              className="text-white font-bold text-sm py-3 px-3 rounded-lg hover:bg-brand-gmed transition-colors border-b border-brand-gmed/50 last:border-0 uppercase tracking-wide">
              {label}
            </Link>
          ))}
          {user ? (
            <Link href="/account" onClick={() => setMenuOpen(false)}
              className="text-white py-3 px-3 rounded-lg hover:bg-brand-gmed transition-colors border-b border-brand-gmed/50 flex items-center gap-2">
              <User className="w-4 h-4 shrink-0" />
              <span className="leading-tight">
                <span className="block font-bold text-sm uppercase tracking-wide">
                  {profile?.first_name
                    ? `${profile.first_name}${profile.last_name ? ' ' + profile.last_name : ''}`
                    : 'My Account'}
                </span>
                {profile?.company_name && (
                  <span className="block text-brand-yellow/60 text-[11px] font-semibold normal-case">
                    {profile.company_name}
                  </span>
                )}
              </span>
            </Link>
          ) : (
            <button onClick={() => { setMenuOpen(false); setAuthOpen(true); }}
              className="text-white font-bold text-sm py-3 px-3 rounded-lg hover:bg-brand-gmed transition-colors border-b border-brand-gmed/50 uppercase tracking-wide flex items-center gap-2 text-left w-full">
              <User className="w-4 h-4" /> Sign In / Create Account
            </button>
          )}
        </div>
      )}
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </header>
  );
}
