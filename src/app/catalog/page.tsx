// src/app/catalog/page.tsx
import { Suspense } from 'react';
import Link from 'next/link';
import { Newspaper, BadgePercent, Ship, Truck, Anchor, Phone } from 'lucide-react';
import { CouponStrip } from '@/components/catalog/CouponStrip';
import { createClient } from '@/lib/supabase/server';
import { ProductGrid } from '@/components/catalog/ProductGrid';
import { CategoryFilter } from '@/components/catalog/CategoryFilter';
import { SearchBar } from '@/components/catalog/SearchBar';
import { CatalogTabBar } from '@/components/catalog/CatalogTabBar';
import { AdditionalServicesTab } from '@/components/catalog/AdditionalServicesTab';
import { OtherPickupCard } from '@/components/catalog/OtherPickupCard';
import { fetchSinclairCoupons } from '@/lib/sinclair-coupons';
import { MAIN_CATEGORIES } from '@/lib/utils';

interface PageProps {
  searchParams: Promise<{
    search?: string;
    category?: string;
    page?: string;
    tab?: string;
  }>;
}

// ── Promos (coupons strip + manager coupons) ────────────────────────────
// Rendered inside <Suspense> so the product grid never waits on Sinclair's
// coupon API — the strip streams in after the page paints.
// The full /coupons page intentionally stays UNFILTERED (Jen uses it as a
// conversation piece with Dave about expanding the catalog). This filter only
// applies to the 12-coupon preview strip: keep coupons out of it when they're
// clearly for goods we don't carry on the boat catalog (diapers, pet care, …).
const COUPON_STRIP_BLOCKLIST = [
  'diaper', 'baby', 'infant', 'toddler', 'pull-ups', 'pullups', 'huggies', 'pampers', 'luvs',
  'pet ', 'dog ', 'cat ', 'puppy', 'kitten', 'litter', 'purina', 'pedigree', 'friskies', 'iams', 'milk-bone',
];

function couponFitsCatalog(c: { name: string; description: string | null; brand: string | null; department: string | null }): boolean {
  const haystack = [c.name, c.description, c.brand, c.department]
    .filter(Boolean).join(' ').toLowerCase();
  return !COUPON_STRIP_BLOCKLIST.some(term => haystack.includes(term));
}

async function PromoSections() {
  const supabase = await createClient();
  const [{ data: settings }, { data: coupons }] = await Promise.all([
    supabase.from('admin_settings').select('show_digital_coupons').single(),
    supabase.from('coupons')
      .select('id, name, description, discount_type, discount_value, discount_text, applies_to, category, expires_at')
      .order('created_at', { ascending: false })
      .limit(6),
  ]);

  let sinclairCoupons: Awaited<ReturnType<typeof fetchSinclairCoupons>>['items'] = [];
  let couponTotal = 0;
  if (settings?.show_digital_coupons ?? true) {
    // Over-fetch so the strip still fills 12 slots after filtering
    const { items, total } = await fetchSinclairCoupons(60);
    sinclairCoupons = items
      .filter(couponFitsCatalog)
      .sort((a, b) => b.popularity - a.popularity)
      .slice(0, 12);
    couponTotal = total;
  }

  return (
    <>
      {sinclairCoupons.length > 0 && (
        <CouponStrip coupons={sinclairCoupons} total={couponTotal} />
      )}
      {coupons && coupons.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <p className="flex items-center gap-1.5 text-xs font-bold text-amber-800 uppercase tracking-wide mb-1.5">
            <BadgePercent className="w-3.5 h-3.5" /> Current Coupons — applied by Sinclair&apos;s when your order is shopped
          </p>
          <ul className="space-y-1">
            {coupons.map((c: { id: string; name: string; description: string | null; discount_type: string; discount_value: number | null; discount_text: string | null; applies_to: string; category: string | null; expires_at: string | null }) => (
              <li key={c.id} className="text-xs text-amber-900">
                <span className="font-bold">{c.name}</span>
                {' — '}
                <span className="font-semibold text-brand-orange">
                  {c.discount_type === 'amount' ? `$${Number(c.discount_value || 0).toFixed(2)} off`
                    : c.discount_type === 'percent' ? `${Number(c.discount_value || 0)}% off`
                    : (c.discount_text || 'special deal')}
                </span>
                {c.applies_to === 'category' && c.category && <span> on {c.category}</span>}
                {c.description && <span className="text-amber-700"> · {c.description}</span>}
                {c.expires_at && <span className="text-amber-600/70"> · through {new Date(c.expires_at + 'T00:00:00').toLocaleDateString()}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

export default async function CatalogPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const search   = params.search?.trim() || '';
  const category = params.category || '';
  const page     = Math.max(1, parseInt(params.page || '1'));
  const tab      = params.tab === 'services' ? 'services' : 'groceries';
  const perPage  = 60;
  const offset   = (page - 1) * perPage;

  const supabase = await createClient();

  let query = supabase
    .from('products')
    .select('*', { count: 'exact' })
    .eq('is_active', true)
    .eq('is_available', true)
    .order('category', { ascending: true })
    .order('description', { ascending: true })
    .range(offset, offset + perPage - 1);

  if (search) {
    // search_text is a stored generated column: lower(description || ' ' || category || ' ' || tags).
    // A single ilike covers product name, category, AND admin-defined keyword tags.
    query = query.ilike('search_text', `%${search}%`);
  }

  if (category && category !== 'All') {
    query = query.eq('category', category);
  }

  const [{ data: products, count }, { data: catCounts }, { data: pageSettings }] = await Promise.all([
    query,
    supabase.rpc('get_category_counts'),
    supabase.from('admin_settings').select('fleet_cta_enabled').single(),
  ]);
  const fleetCtaEnabled = !!pageSettings?.fleet_cta_enabled;

  const totalPages = Math.ceil((count || 0) / perPage);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Page header */}
      <div className="mb-5">
        <h1 className="font-display text-2xl md:text-3xl text-brand-navy font-bold">
          Place an Order
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Grafton Towboat Services &middot; Groceries, supplies &amp; more
        </p>
      </div>

      {/* Boat / Land delivery reminder — subtle, site-wide catalog banner
          (replaces the old non-clickable info blocks in Additional Services) */}
      <div className="mb-4 flex items-center gap-2.5 bg-brand-navy/5 border border-brand-navy/10 rounded-xl px-4 py-2.5 text-xs text-brand-navy">
        <span className="flex items-center gap-1 font-bold shrink-0">
          <Ship className="w-3.5 h-3.5" /> Boat
          <span className="text-gray-400 font-normal px-0.5">·</span>
          <Truck className="w-3.5 h-3.5" /> Land
        </span>
        <span className="text-gray-500">
          Remember — we deliver by boat <em>and</em> by land. Mile Marker 219 Mississippi River / Mile Marker 0 Illinois River,
          plus vans to terminals, locks, and fleeting areas near Grafton.
        </span>
      </div>

      {/* Fleet pricing CTA (toggleable in Settings → Features; wording is draft copy for Jen) */}
      {fleetCtaEnabled && (
        <div className="mb-4 flex flex-wrap items-center gap-3 bg-brand-green text-white rounded-xl px-4 py-3">
          <Anchor className="w-5 h-5 text-brand-yellow shrink-0" />
          <div className="flex-1 min-w-[220px]">
            <p className="text-sm font-bold">Run a fleet? Get fleet pricing.</p>
            <p className="text-xs text-white/70">
              Sign your whole fleet up with Grafton Towboat Services and every boat in your company gets special contract pricing.
            </p>
          </div>
          <a href="tel:6185560290"
            className="flex items-center gap-1.5 bg-brand-yellow text-brand-green text-xs font-bold uppercase tracking-wide px-4 py-2 rounded-full shrink-0 hover:opacity-90 transition-opacity">
            <Phone className="w-3.5 h-3.5" /> Call (618) 556-0290
          </a>
        </div>
      )}

      {/* ── TAB BAR ── */}
      <CatalogTabBar activeTab={tab} />

      {/* ── GROCERIES TAB ── */}
      {tab === 'groceries' && (
        <>
          {/* Weekly ad + coupons strip */}
          <div className="mb-4 space-y-2">
            <Link href="/weekly-ad"
              className="flex items-center gap-3 bg-brand-navy text-white rounded-xl px-4 py-3 hover:bg-brand-steel transition-colors">
              <Newspaper className="w-5 h-5 text-brand-gold shrink-0" />
              <span className="text-sm font-bold">View Sinclair&apos;s Weekly Ad</span>
              <span className="text-xs text-white/60 hidden sm:inline">— this week&apos;s specials, right here on the ordering site</span>
            </Link>
            {/* Coupons stream in after the products — never block the page */}
            <Suspense fallback={null}>
              <PromoSections />
            </Suspense>
          </div>

          <SearchBar initialSearch={search} />
          <div className="flex flex-col md:flex-row gap-5 mt-5">
            <aside className="w-full md:w-52 shrink-0">
              <CategoryFilter
                categories={MAIN_CATEGORIES}
                counts={catCounts || []}
                activeCategory={category}
              />
            </aside>
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
              {/* "Other" third-party item — Sinclair-handled pickup */}
              <OtherPickupCard />
            </div>
          </div>
        </>
      )}

      {/* ── ADDITIONAL SERVICES TAB ── */}
      {tab === 'services' && (
        <div className="mt-5 max-w-2xl">
          <AdditionalServicesTab />
        </div>
      )}

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
