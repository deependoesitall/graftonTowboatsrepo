// src/app/catalog/page.tsx
import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { ProductGrid } from '@/components/catalog/ProductGrid';
import { CategoryFilter } from '@/components/catalog/CategoryFilter';
import { SearchBar } from '@/components/catalog/SearchBar';
import { MAIN_CATEGORIES } from '@/lib/utils';

interface PageProps {
  searchParams: Promise<{
    search?: string;
    category?: string;
    page?: string;
  }>;
}

export default async function CatalogPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const search = params.search?.trim() || '';
  const category = params.category || '';
  const page = Math.max(1, parseInt(params.page || '1'));
  const perPage = 60;
  const offset = (page - 1) * perPage;

  const supabase = await createClient();

  let query = supabase
    .from('products')
    .select('*', { count: 'exact' })
    .eq('is_active', true)
    .eq('is_available', true)
    .order('category', { ascending: true })
    .order('description', { ascending: true })
    .range(offset, offset + perPage - 1);

  // Use full-text search when query present, ilike for short strings
  if (search) {
    if (search.length >= 3) {
      // Full-text search — uses the GIN index for speed
      query = query.textSearch('description', search, {
        type: 'websearch',
        config: 'english',
      });
    } else {
      // For very short terms, prefix match
      query = query.ilike('description', `${search}%`);
    }
  }

  if (category && category !== 'All') {
    query = query.eq('category', category);
  }

  const [{ data: products, count }, { data: catCounts }] = await Promise.all([
    query,
    supabase.rpc('get_category_counts'),
  ]);

  const totalPages = Math.ceil((count || 0) / perPage);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Page header */}
      <div className="mb-5">
        <h1 className="font-display text-2xl md:text-3xl text-brand-navy font-bold">
          Order Groceries &amp; Supplies
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Partnered with Sinclair&apos;s Foods &middot; {count?.toLocaleString() || '0'} items available
        </p>
      </div>

      {/* Search */}
      <SearchBar initialSearch={search} />

      <div className="flex flex-col md:flex-row gap-5 mt-5">
        {/* Sidebar */}
        <aside className="w-full md:w-52 shrink-0">
          <CategoryFilter
            categories={MAIN_CATEGORIES}
            counts={catCounts || []}
            activeCategory={category}
          />
        </aside>

        {/* Grid */}
        <div className="flex-1 min-w-0">
          <Suspense fallback={<ProductGridSkeleton />}>
            <ProductGrid
              products={products || []}
              totalCount={count || 0}
              page={page}
              totalPages={totalPages}
              search={search}
              category={category}
            />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

function ProductGridSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="card-base p-3 animate-pulse">
          <div className="h-2.5 bg-gray-200 rounded w-1/3 mb-2" />
          <div className="h-4 bg-gray-200 rounded w-4/5 mb-1" />
          <div className="h-3 bg-gray-200 rounded w-1/2 mb-3" />
          <div className="flex justify-between items-center">
            <div className="h-5 bg-gray-200 rounded w-14" />
            <div className="h-8 bg-gray-200 rounded w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}
