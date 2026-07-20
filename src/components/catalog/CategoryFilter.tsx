'use client';
// src/components/catalog/CategoryFilter.tsx
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ShoppingBag } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CategoryFilterProps {
  categories: string[];
  counts: Array<{ category: string; count: number }>;
  activeCategory: string;
}

const CATEGORY_ICONS: Record<string, string> = {
  'Meat & Seafood': '🥩',
  'Dairy': '🥚',
  'Produce': '🥦',
  'Frozen Foods': '🧊',
  'Bakery & Deli': '🍞',
  'Beverages': '☕',
  'Snacks & Sweets': '🍫',
  'Pantry & Grocery': '🥫',
  'Household & Cleaning': '🧹',
  'Health & Personal Care': '💊',
  'Boat Supplies': '⚓',
  'General': '📦',
};

export function CategoryFilter({ categories, counts, activeCategory }: CategoryFilterProps) {
  const searchParams = useSearchParams();
  const search = searchParams.get('search') || '';
  const storeAll = searchParams.get('store') === 'all';

  function buildHref(cat: string) {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (cat && cat !== 'All') params.set('category', cat);
    if (storeAll) params.set('store', 'all');   // stay in full-store mode while switching categories
    const qs = params.toString();
    return `/catalog${qs ? `?${qs}` : ''}`;
  }

  const getCount = (cat: string) => counts.find(c => c.category === cat)?.count ?? 0;
  const totalCount = counts.reduce((s, c) => s + c.count, 0);
  const isAll = !activeCategory || activeCategory === 'All';

  return (
    <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-brand-green/10 shadow-sm overflow-hidden">
      <div className="bg-brand-green px-4 py-3">
        <h2 className="font-display font-bold text-brand-yellow text-xs uppercase tracking-widest">Categories</h2>
      </div>
      <nav className="p-2">
        <Link href={buildHref('All')}
          className={cn(
            'flex items-center justify-between px-3 py-2 rounded-xl text-sm font-bold uppercase tracking-wide transition-all mb-1',
            isAll ? 'bg-brand-green text-white' : 'text-brand-green hover:bg-brand-green/10'
          )}>
          <span className="flex items-center gap-2">
            <span className="text-base">🛒</span>
            <span>All Items</span>
          </span>
          <span className={cn('text-xs rounded-full px-2 py-0.5', isAll ? 'bg-white/20 text-white' : 'bg-brand-green/10 text-brand-green')}>
            {totalCount}
          </span>
        </Link>

        <div className="border-t border-brand-green/10 my-2" />

        {categories.map(cat => {
          const count = getCount(cat);
          if (count === 0) return null;
          const isActive = activeCategory === cat;
          return (
            <Link key={cat} href={buildHref(cat)}
              className={cn(
                'flex items-center justify-between px-3 py-2 rounded-xl text-sm font-semibold transition-all mb-0.5',
                isActive ? 'bg-brand-green text-white' : 'text-brand-green hover:bg-brand-green/10'
              )}>
              <span className="flex items-center gap-2 min-w-0">
                <span className="text-base shrink-0">{CATEGORY_ICONS[cat] || '📦'}</span>
                <span className="truncate text-xs uppercase tracking-wide">{cat}</span>
              </span>
              <span className={cn('text-xs rounded-full px-2 py-0.5 shrink-0 ml-1', isActive ? 'bg-white/20 text-white' : 'bg-brand-green/10 text-brand-green')}>
                {count}
              </span>
            </Link>
          );
        })}

        {/* Anchor to the "Need something we don't carry" form at the page bottom */}
        <div className="border-t border-brand-green/10 my-2" />
        <button
          type="button"
          onClick={() => document.getElementById('other-pickup')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wide text-brand-orange hover:bg-brand-orange/10 transition-all text-left"
        >
          <ShoppingBag className="w-4 h-4 shrink-0" />
          <span>Need something we don&apos;t carry?</span>
        </button>
      </nav>
    </div>
  );
}
