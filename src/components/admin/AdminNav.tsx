'use client';
// src/components/admin/AdminNav.tsx
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LayoutDashboard, ShoppingBag, Settings, LogOut, Package } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getAdminRole, getAdminName, clearAdminSession, canAccess, AdminRole } from '@/lib/admin-auth';

const NAV: Array<{ href: string; label: string; icon: any; area: 'orders' | 'products' | 'settings' | null }> = [
  { href: '/admin',          label: 'Dashboard', icon: LayoutDashboard, area: null },
  { href: '/admin/orders',   label: 'Orders',    icon: ShoppingBag,     area: 'orders' },
  { href: '/admin/products', label: 'Products',  icon: Package,         area: 'products' },
  { href: '/admin/settings', label: 'Settings',  icon: Settings,        area: 'settings' },
];

const ROLE_LABELS: Record<AdminRole, string> = { owner: 'Owner', manager: 'Manager', staff: 'Staff' };

export function AdminNav() {
  const path = usePathname();
  const [role, setRole] = useState<AdminRole | null>(() => {
    if (typeof window === 'undefined') return null;
    return getAdminRole();
  });
  const [name, setName] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return getAdminName();
  });

  useEffect(() => {
    setRole(getAdminRole());
    setName(getAdminName());
  }, [path]);

  function handleLogout() {
    clearAdminSession();
    window.location.href = '/admin';
  }

  const visibleNav = NAV.filter(item => item.area === null || canAccess(role, item.area));

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
          {visibleNav.map(({ href, label, icon: Icon }) => {
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
        <div className="flex items-center gap-3">
          {role && (
            <span className="hidden md:flex items-center gap-1.5 text-xs">
              <span className="text-white/50">{name}</span>
              <span className="bg-white/10 text-brand-yellow px-2 py-0.5 rounded-full font-bold uppercase tracking-wide text-[10px]">
                {ROLE_LABELS[role]}
              </span>
            </span>
          )}
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
