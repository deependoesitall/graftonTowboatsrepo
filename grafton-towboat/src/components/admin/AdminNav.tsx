'use client';
// src/components/admin/AdminNav.tsx
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Anchor, LayoutDashboard, ShoppingBag, Settings, LogOut, Package } from 'lucide-react';
import { cn } from '@/lib/utils';

const ADMIN_TOKEN_KEY = 'grafton_admin_token';

export function AdminNav() {
  const pathname = usePathname();

  function handleLogout() {
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    window.location.reload();
  }

  const links = [
    { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/admin/orders', label: 'Orders', icon: ShoppingBag },
    { href: '/admin/products', label: 'Products', icon: Package },
    { href: '/admin/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <header className="bg-brand-navy border-b border-brand-steel/40 shadow-md">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 shrink-0">
            <Anchor className="w-5 h-5 text-brand-gold" />
            <span className="font-display text-white font-bold text-sm">
              GTS Admin
            </span>
          </div>
          <nav className="hidden md:flex items-center gap-1">
            {links.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2 rounded text-sm font-medium transition-colors',
                  (pathname === href || (href !== '/admin' && pathname.startsWith(href)))
                    ? 'bg-brand-steel/50 text-white'
                    : 'text-brand-sky hover:text-white hover:bg-brand-steel/30'
                )}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/catalog" target="_blank" className="text-brand-sky text-xs hover:text-white">
            View Store →
          </Link>
          <button
            onClick={handleLogout}
            className="text-brand-sky hover:text-white transition-colors flex items-center gap-1.5 text-sm"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden md:inline">Logout</span>
          </button>
        </div>
      </div>
      {/* Mobile nav */}
      <div className="md:hidden overflow-x-auto scrollbar-hide">
        <div className="flex items-center gap-1 px-4 pb-2">
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap transition-colors',
                (pathname === href || (href !== '/admin' && pathname.startsWith(href)))
                  ? 'bg-brand-steel/50 text-white'
                  : 'text-brand-sky'
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </Link>
          ))}
        </div>
      </div>
    </header>
  );
}
