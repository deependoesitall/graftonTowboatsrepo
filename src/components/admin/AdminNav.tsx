'use client';
// src/components/admin/AdminNav.tsx
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LayoutDashboard, ShoppingBag, Settings, LogOut, Package, BarChart3, Users, Truck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getAdminRole, getAdminName, logoutAdmin, canAccess, AdminRole } from '@/lib/admin-auth';

const NAV: Array<{ href: string; label: string; icon: any; area: 'orders' | 'products' | 'settings' | 'reports' | null }> = [
  { href: '/admin',          label: 'Dashboard', icon: LayoutDashboard, area: null },
  { href: '/admin/orders',   label: 'Orders',    icon: ShoppingBag,     area: 'orders' },
  { href: '/admin/products', label: 'Products',  icon: Package,         area: 'products' },
  { href: '/admin/customers',label: 'Customers', icon: Users,           area: 'reports' },
  { href: '/admin/deliveries',label: 'Deliveries', icon: Truck,         area: 'reports' },
  { href: '/admin/reports',  label: 'Reports',   icon: BarChart3,       area: 'reports' },
  { href: '/admin/settings', label: 'Settings',  icon: Settings,        area: 'settings' },
];

const ROLE_LABELS: Record<AdminRole, string> = { owner: 'Owner', manager: 'Manager', staff: 'Staff' };

export function AdminNav() {
  const path = usePathname();
  // Start empty on BOTH server and client, then fill in after mount — reading
  // localStorage in the useState initializer made the client's first render
  // differ from the server's HTML (React hydration error #418 on every admin page).
  const [role, setRole] = useState<AdminRole | null>(null);
  const [name, setName] = useState<string>('');

  useEffect(() => {
    setRole(getAdminRole());
    setName(getAdminName());
  }, [path]);

  async function handleLogout() {
    await logoutAdmin();
    window.location.href = '/admin';
  }

  const visibleNav = NAV.filter(item => item.area === null || canAccess(role, item.area));

  return (
    <header className="sticky top-0 z-30 shadow-md">
      {/* Brand gradient accent strip */}
      <div className="h-1 bg-gts-gradient" />

      <div className="bg-brand-green text-white">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          {/* Logo / title */}
          <Link href="/admin" className="flex items-center gap-3 shrink-0">
            <img
              src="/branding/gts-logo.png"
              alt="Grafton Towboat Services"
              className="h-14 w-14 object-contain shrink-0"
            />
            <div className="hidden sm:flex flex-col justify-center leading-tight">
              <span className="font-display font-bold text-white text-base uppercase tracking-wide">
                Grafton Towboat
              </span>
              <span className="font-display text-white/70 text-xs uppercase tracking-wider">
                Services
              </span>
              <span className="text-brand-yellow text-[10px] uppercase tracking-[0.2em] font-bold mt-0.5">
                Admin Console
              </span>
            </div>
          </Link>

          {/* Nav links */}
          <nav className="flex items-center gap-1 overflow-x-auto">
            {visibleNav.map(({ href, label, icon: Icon }) => {
              const active = path === href || (href !== '/admin' && path.startsWith(href));
              return (
                <Link key={href} href={href}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide transition-colors whitespace-nowrap',
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
          <div className="flex items-center gap-3 shrink-0">
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
      </div>
    </header>
  );
}
