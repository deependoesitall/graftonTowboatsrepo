'use client';
// src/components/admin/AdminNav.tsx
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LayoutDashboard, ShoppingBag, Settings, LogOut, Package, BarChart3, Users, Truck, Menu, X } from 'lucide-react';
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

const ROLE_LABELS: Record<AdminRole, string> = {
  owner: 'Owner', gts_manager: 'GTS Manager', manager: "Sinclair's Manager", staff: 'Staff',
};

export function AdminNav() {
  const path = usePathname();
  // Start empty on BOTH server and client, then fill in after mount — reading
  // localStorage in the useState initializer made the client's first render
  // differ from the server's HTML (React hydration error #418 on every admin page).
  const [role, setRole] = useState<AdminRole | null>(null);
  const [name, setName] = useState<string>('');
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setRole(getAdminRole());
    setName(getAdminName());
    setMenuOpen(false);
  }, [path]);

  async function handleLogout() {
    await logoutAdmin();
    window.location.href = '/admin';
  }

  const visibleNav = NAV.filter(item => item.area === null || canAccess(role, item.area));
  // GTS owner sees 7 destinations — icons eat the name on a phone. Sinclair's
  // sees fewer, so the icon row can stay. Collapse only when it would clip
  // the staff name Deepen asked to keep visible.
  const collapseNav = visibleNav.length > 5;

  return (
    <header className="sticky top-0 z-30 shadow-md">
      {/* Brand gradient accent strip */}
      <div className="h-1 bg-gts-gradient" />

      <div className="bg-brand-green text-white">
        <div className="w-full max-w-none mx-auto px-3 sm:px-4 lg:px-6 h-16 flex items-center justify-between gap-2 lg:gap-4">
          {/* Logo / title */}
          <Link href="/admin" className="flex items-center gap-3 shrink-0">
            {/* ⚠️ THE EMBLEM, NOT THE FULL LOGO. gts-logo.png carries the
                wordmark stacked under the badge, and at 56px on this bar that
                is three lines of type nobody can read — sitting next to the
                same words set in HTML right beside it. The badge on its own is
                the mark at this size. */}
            <img
              src="/branding/gts-badge.png"
              alt="Grafton Towboat Services"
              className="h-14 w-auto object-contain shrink-0"
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

          {/* Nav links — icon row on desktop / Sinclair; hamburger on GTS phones */}
          <nav className={cn(
            'items-center gap-1 min-w-0 flex-1 justify-center',
            collapseNav
              ? 'hidden lg:flex'
              : 'flex overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden',
          )}>
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

          {/* Right side — name + role stay visible on a phone (Deepen, Sept 2026) */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {role && (
              <span className="flex items-center gap-1.5 text-xs min-w-0">
                <span className="text-white/85 truncate max-w-[5.5rem] sm:max-w-[10rem]">{name}</span>
                <span className="bg-white/10 text-brand-yellow px-1.5 sm:px-2 py-0.5 rounded-full font-bold uppercase tracking-wide text-[9px] sm:text-[10px] shrink-0">
                  {ROLE_LABELS[role]}
                </span>
              </span>
            )}
            <Link href="/catalog" target="_blank"
              className="text-white/60 hover:text-white text-xs font-body transition-colors hidden md:block">
              View Store →
            </Link>
            {collapseNav && (
              <button type="button" onClick={() => setMenuOpen(o => !o)}
                className="lg:hidden p-1.5 rounded hover:bg-white/10 text-white"
                aria-label={menuOpen ? 'Close menu' : 'Open menu'}
                aria-expanded={menuOpen}>
                {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            )}
            <button onClick={handleLogout}
              className="flex items-center gap-1 text-white/60 hover:text-white text-xs font-body transition-colors p-1.5 rounded hover:bg-white/10">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {collapseNav && menuOpen && (
          <nav className="lg:hidden border-t border-white/10 px-3 py-2 grid grid-cols-2 gap-1">
            {visibleNav.map(({ href, label, icon: Icon }) => {
              const active = path === href || (href !== '/admin' && path.startsWith(href));
              return (
                <Link key={href} href={href}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wide',
                    active ? 'bg-brand-yellow text-brand-green' : 'text-white/85 hover:bg-white/10'
                  )}>
                  <Icon className="w-4 h-4 shrink-0" />
                  {label}
                </Link>
              );
            })}
          </nav>
        )}
      </div>
    </header>
  );
}
