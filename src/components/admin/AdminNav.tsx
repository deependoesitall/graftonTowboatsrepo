'use client';
// src/components/admin/AdminNav.tsx
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, ShoppingBag, Settings, LogOut, Package } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/admin',          label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/orders',   label: 'Orders',    icon: ShoppingBag },
  { href: '/admin/products', label: 'Products',  icon: Package },
  { href: '/admin/settings', label: 'Settings',  icon: Settings },
];

export function AdminNav() {
  const path = usePathname();

  function handleLogout() {
    sessionStorage.removeItem('grafton_admin_token');
    window.location.href = '/admin';
  }

  return (
    <header className="bg-brand-green text-white shadow-md">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
        {/* Logo / title */}
        <Link href="/admin" className="flex items-center gap-2.5 shrink-0">
          <img
            src="https://images.squarespace-cdn.com/content/v1/6819038bc556772f05a46e4d/00f04765-aff3-41b3-8b27-6d14b9688c52/image0+%282%29.png?format=300w"
            alt="GTS"
            className="h-9 w-auto"
          />
          <span className="font-display font-bold text-brand-yellow text-sm uppercase tracking-widest hidden sm:block">
            GTS Admin
          </span>
        </Link>

        {/* Nav links */}
        <nav className="flex items-center gap-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = path === href || (href !== '/admin' && path.startsWith(href));
            return (
              <Link key={href} href={href}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide transition-colors',
                  active
                    ? 'bg-brand-yellow text-brand-green'
                    : 'text-white/70 hover:text-white hover:bg-white/10'
                )}>
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden sm:block">{label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-2">
          <Link href="/catalog" target="_blank"
            className="text-white/60 hover:text-white text-xs font-body transition-colors hidden md:block">
            View Store →
          </Link>
          <button onClick={handleLogout}
            className="flex items-center gap-1 text-white/60 hover:text-white text-xs font-body transition-colors p-1.5 rounded hover:bg-white/10">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
