'use client';
// src/components/catalog/CategoryFilter.tsx
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';

interface CategoryFilterProps {
  categories: string[];
  counts: Array<{ category: string; count: number }>;
  activeCategory: string;
}

const CATEGORY_ICONS: Record<string, string> = {
  'Meat & Seafood': '🥩',
  'Dairy & Eggs': '🥚',
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

  function buildHref(cat: string) {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (cat && cat !== 'All') params.set('category', cat);
    const qs = params.toString();
    return `/catalog${qs ? `?${qs}` : ''}`;
  }

  const getCount = (cat: string) => counts.find(c => c.category === cat)?.count ?? 0;
  const totalCount = counts.reduce((s, c) => s + c.count, 0);
  const isAll = !activeCategory || activeCategory === 'All';

  return (
    <div className="card-base overflow-hidden">
      <div className="bg-brand-navy px-4 py-3">
        <h2 className="font-display text-sm font-bold text-white tracking-wide uppercase">Categories</h2>
      </div>
      <nav className="p-2">
        <Link
          href={buildHref('All')}
          className={cn(
            'flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all mb-1',
            isAll ? 'bg-brand-steel text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'
          )}
        >
          <span className="flex items-center gap-2">
            <span className="text-base">🛒</span>
            <span>All Items</span>
          </span>
          <span className={cn('text-xs rounded-full px-2 py-0.5', isAll ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500')}>
            {totalCount}
          </span>
        </Link>

        <div className="border-t border-gray-100 my-2" />

        {categories.map(cat => {
          const count = getCount(cat);
          if (count === 0) return null;
          const isActive = activeCategory === cat;
          return (
            <Link
              key={cat}
              href={buildHref(cat)}
              className={cn(
                'flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all mb-0.5',
                isActive ? 'bg-brand-steel text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'
              )}
            >
              <span className="flex items-center gap-2 min-w-0">
                <span className="text-base shrink-0">{CATEGORY_ICONS[cat] || '📦'}</span>
                <span className="truncate">{cat}</span>
              </span>
              <span className={cn('text-xs rounded-full px-2 py-0.5 shrink-0 ml-1', isActive ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500')}>
                {count}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
