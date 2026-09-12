// src/app/catalog/page.tsx
import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Newspaper, BadgePercent, Ship, Truck, Anchor, Phone } from 'lucide-react';
import { CouponStrip } from '@/components/catalog/CouponStrip';
import CatalogRails from '@/components/catalog/CatalogRails';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { applyEffectiveCatalogPricingList } from '@/lib/catalog-price';
import { ProductGrid } from '@/components/catalog/ProductGrid';
import { CategoryFilter } from '@/components/catalog/CategoryFilter';
import { SearchBar } from '@/components/catalog/SearchBar';
import { CatalogTabBar } from '@/components/catalog/CatalogTabBar';
import { StoreScopeToggle } from '@/components/catalog/StoreScopeToggle';
import { AdditionalServicesTab } from '@/components/catalog/AdditionalServicesTab';
import { OtherPickupCard } from '@/components/catalog/OtherPickupCard';
import { fetchSinclairCoupons } from '@/lib/sinclair-coupons';
import { MAIN_CATEGORIES, formatCalendarDate } from '@/lib/utils';
import { isUpcLikeQuery } from '@/lib/product-search';


export const metadata: Metadata = {
  title: "Order Groceries & Supplies for Your Vessel | Grafton Towboat Services",
  description:
    "Browse Sinclair's Foods groceries and towboat supplies, then order delivery to your vessel at Grafton, Illinois ? Mississippi MM 219 / Illinois MM 0. Parts pickup, package delivery, and crew change available.",
  openGraph: {
    title: "Order for your vessel | Grafton Towboat Services",
    description:
      "Groceries from Sinclair's Foods, towboat supplies, and crew support ? ordered online, delivered to your boat.",
    url: "https://graftontowboatservices.com/catalog",
    siteName: "Grafton Towboat Services",
    images: [{ url: "/branding/gts-lockup.png", width: 1178, height: 492, alt: "Grafton Towboat Services" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Order for your vessel | Grafton Towboat Services",
    description:
      "Groceries, supplies, and crew support delivered to your vessel at Grafton, IL.",
    images: ["/branding/gts-lockup.png"],
  },
};

interface PageProps {
  searchParams: Promise<{
    search?: string;
    category?: string;
    page?: string;
    tab?: string;
    /** 'all' = include full-store items (the "browse everything Sinclair's carries" flows) */
    store?: string;
    /** Comma-separated product ids — "View all on sale" from the rails. */
    ids?: string;
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
  // SERVICE client, not anon: admin_settings (and coupons) are RLS-locked to
  // the service role. The anon read silently returned null and `?? true`
  // turned "couldn't read the toggle" into "coupons ON" — the July 19 bug
  // where switching coupons off did nothing on the catalog.
  const supabase = createServiceClient();
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
                {c.expires_at && <span className="text-amber-600/70"> · through {formatCalendarDate(c.expires_at)}</span>}
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
  // FULL-STORE BROWSING (Round 8 P1-3): the barge order form is the default
  // view; ?store=all opens the whole Sinclair's catalog ("Don't see it?
  // Browse everything Sinclair's carries").
  const storeAll = params.store === 'all';
  // "View all on sale" from the rail — an explicit id list rather than a
  // re-query, because the rail already decided which items qualify (genuine
  // shelf sales, no clip-only offers) and re-deriving that here would risk the
  // two disagreeing.
  const ids = (params.ids || '')
    .split(',').map(s => s.trim()).filter(Boolean)
    .slice(0, 200);   // cap — this arrives from a URL anyone can edit
  const perPage  = 60;
  const offset   = (page - 1) * perPage;

  const supabase = await createClient();

  // PAPER ORDER FORM SEQUENCE (July 10 demo — "it is very key that the barges
  // see the order as they see it on paper now"): form items sort by their
  // position on the paper form, top to bottom; anything not on the form
  // (curated extras, then full-store items) sorts after, alphabetically.
  // ⚠️ READS products_catalog, NOT products.
  //
  // This page is the one customers actually browse, and it queries Supabase
  // directly from the server component — it never goes through /api/products.
  // That bit me: `browse_rank` was added to the API route and had no effect
  // here, so the grey Freshop placeholder baskets kept appearing on page 1
  // while the API returned a perfectly sorted list nobody was looking at.
  //
  // products_catalog is `products` plus browse_rank / has_real_image
  // (migration 071). It's a security_invoker view, so the RLS on products
  // still applies exactly as before — same rows, three extra columns.
  let query = supabase
    .from('products_catalog')
    .select('*', { count: 'exact' })
    .eq('is_active', true)
    .eq('is_available', true)
    .order('form_seq', { ascending: true, nullsFirst: false })
    // AFTER form_seq, so the paper order form's sequence is untouched — every
    // barge-list row is browse_rank 0 by definition and this is a no-op across
    // them. It only moves the full-store items, which is where the placeholders
    // are: 670 of them, against 10 on the barge list.
    .order('browse_rank', { ascending: true })
    .order('category', { ascending: true })
    .order('description', { ascending: true })
    .range(offset, offset + perPage - 1);

  // The two views are mutually exclusive: the barge order form shows the
  // curated list, the store view shows ONLY what's beyond it. Overlapping them
  // meant the store view opened on barge items (ground chuck, beef liver…),
  // which is exactly what the order form is already for.
  //
  // An explicit id list overrides that split — a sale spans both, and someone
  // following "View all on sale" wants the sale, not one half of it.
  // Digit/UPC/PLU search must hit the FULL catalog (barge + store). The barge
  // view's store_only=false filter otherwise hides Wright's bacon etc.
  const upcLike = isUpcLikeQuery(search);
  if (ids.length) query = query.in('id', ids);
  else if (!upcLike) query = query.eq('store_only', storeAll);
  // upcLike: leave store_only unfiltered

  if (search) {
    if (upcLike) {
      const digits = search.replace(/\D/g, '');
      // search_text may omit UPC — match upc column too (contains + exact).
      query = query.or(
        `search_text.ilike.%${search}%,upc.ilike.%${digits}%,upc.eq.${digits}`,
      );
    } else {
      // search_text is a stored generated column: lower(description || ' ' || category || ' ' || tags).
      query = query.ilike('search_text', `%${search}%`);
    }
  }

  if (category && category !== 'All') {
    query = query.eq('category', category);
  }

  // Scope-toggle tab counts = FULL unfiltered barge/store totals.
  // Never search-scoped — a UPC miss must not read as "0 everyday items"
  // (empty-store feel). Match counts for search live separately near results.
  const scopeTotalCount = (storeOnly: boolean) =>
    supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)
      .eq('is_available', true)
      .eq('store_only', storeOnly);

  // Expander CTA ("N more matches in the full store") stays search/category
  // scoped so cooks aren't dumped into all 20k items (Dave).
  const scopedMatchCount = (storeOnly: boolean) => {
    let q = supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)
      .eq('is_available', true)
      .eq('store_only', storeOnly);
    if (search) q = q.ilike('search_text', `%${search}%`);
    if (category && category !== 'All') q = q.eq('category', category);
    return q;
  };

  // Sidebar counts must match the view you're in. get_category_counts is scoped
  // to the barge form, so the store view counts its own categories.
  const storeCategoryCounts = storeAll
    ? Promise.all(MAIN_CATEGORIES.map(async c => {
        let q = supabase.from('products')
          .select('id', { count: 'exact', head: true })
          .eq('is_active', true).eq('is_available', true).eq('store_only', true)
          .eq('category', c);
        if (search) q = q.ilike('search_text', `%${search}%`);
        const { count } = await q;
        return { category: c, count: count || 0 };
      }))
    : Promise.resolve(null);

  const [{ data: products, count }, { data: catCounts }, { data: pageSettings }, bargeCountRes, storeCountRes, storeMatchRes, storeCats] = await Promise.all([
    query,
    supabase.rpc('get_category_counts'),
    // admin_settings is RLS-locked to the service role — the anon client read
    // null here, which meant the fleet CTA toggle silently never worked.
    createServiceClient().from('admin_settings').select('fleet_cta_enabled').single(),
    scopeTotalCount(false),  // barge tab — full everyday total
    scopeTotalCount(true),   // store tab — full "more items" total
    scopedMatchCount(true),  // expander CTA only (search/category aware)
    storeCategoryCounts,
  ]);
  const fleetCtaEnabled = !!pageSettings?.fleet_cta_enabled;
  const bargeCount = bargeCountRes?.count || 0;
  const storeCount = storeCountRes?.count || 0;
  const storeMatchCount = storeMatchRes?.count || 0;
  const matchCount = count || 0;
  const sidebarCounts = storeAll ? (storeCats || []) : (catCounts || []);

  // Helper to rebuild the current URL with store=all (keeps search/category)
  const storeAllHref = (() => {
    const p = new URLSearchParams();
    if (search) p.set('search', search);
    if (category) p.set('category', category);
    p.set('store', 'all');
    return `/catalog?${p.toString()}`;
  })();
  const bargeHref = (() => {
    const p = new URLSearchParams();
    if (search) p.set('search', search);
    if (category) p.set('category', category);
    const qs = p.toString();
    return `/catalog${qs ? `?${qs}` : ''}`;
  })();

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

      {/* Boat / Land delivery reminder — refrigerated vans called out (Jen, July 9):
          crews should know cold & frozen goods ride cold the whole way */}
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 bg-brand-navy/5 border border-brand-navy/10 rounded-xl px-4 py-2.5 text-xs text-brand-navy">
        <span className="flex items-center gap-1 font-bold shrink-0">
          <Ship className="w-3.5 h-3.5" /> Boat
          <span className="text-gray-400 font-normal px-0.5">·</span>
          <Truck className="w-3.5 h-3.5" /> Land
        </span>
        <span className="inline-flex items-center gap-1 bg-sky-100 text-sky-800 border border-sky-200 font-bold rounded-full px-2.5 py-0.5 shrink-0">
          ❄ Refrigerated vans
        </span>
        <span className="text-gray-500">
          We deliver by boat <em>and</em> by land — and our vans are refrigerated, so cold &amp; frozen goods arrive cold.
          Mile Marker 219 Mississippi River / Mile Marker 0 Illinois River.
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
          {/* Barge order form ↔ full store — prominent, up top (Jen, Jul 20) */}
          <StoreScopeToggle
            storeAll={storeAll}
            bargeHref={bargeHref}
            storeAllHref={storeAllHref}
            bargeCount={bargeCount}
            fullCount={storeCount}
          />

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

          {/* SINCLAIR'S RAILS — sale first, then best sellers, mirroring their
              own homepage order. Client component: it fetches its own data and
              renders NOTHING until there's something real, so a switched-off
              rail or an empty sale week leaves no gap and no skeleton.

              Deliberately below the weekly-ad banner. The ad is the thing
              crews already know to look for; these are the additions. */}
          <CatalogRails />

          {/* Full-store mode banner — the barge form is home base */}
          {storeAll && (
            <div className="mb-4 flex flex-wrap items-center gap-3 bg-teal-600 text-white rounded-xl px-4 py-3">
              <div className="flex-1 min-w-[220px]">
                <p className="text-sm font-bold">You&apos;re browsing the full Sinclair&apos;s store</p>
                <p className="text-xs text-white/75">
                  {/* Deliberately not "everything Sinclair's carries". The store
                      mirror fills in over several nightly sweeps, and a cook who
                      searches for something we haven't imported yet shouldn't be
                      told it doesn't exist. Promise more, not all. */}
                  More from Sinclair&apos;s — beyond the barge order form. Add anything to your order like normal.
                  Don&apos;t see it? Use &ldquo;Need something we don&apos;t carry?&rdquo; and we&apos;ll get it.
                </p>
              </div>
              <Link href={bargeHref}
                className="bg-white text-teal-700 text-xs font-bold uppercase tracking-wide px-4 py-2 rounded-full shrink-0 hover:bg-teal-50 transition-colors">
                &larr; Back to the order form
              </Link>
            </div>
          )}

          <SearchBar initialSearch={search} />
          {search && (
            <p className="mt-2 text-sm text-gray-600">
              <span className="font-bold text-brand-navy">{matchCount.toLocaleString()}</span>
              {' '}match{matchCount === 1 ? '' : 'es'} for &ldquo;{search}&rdquo;
              {upcLike
                ? ' across barge + full store (UPC/PLU)'
                : storeAll
                  ? " in More from Sinclair's"
                  : ' on the barge order form'}
              {category && category !== 'All' ? ` · ${category}` : ''}
            </p>
          )}
          <div className="flex flex-col md:flex-row gap-5 mt-5">
            <aside className="w-full md:w-52 shrink-0">
              <CategoryFilter
                categories={MAIN_CATEGORIES}
                counts={sidebarCounts}
                activeCategory={category}
              />
            </aside>
            <div className="flex-1 min-w-0">
              <Suspense fallback={<ProductGridSkeleton />}>
                <ProductGrid
                  products={applyEffectiveCatalogPricingList(products || [])}
                  totalCount={count || 0}
                  page={page}
                  totalPages={totalPages}
                  search={search}
                  category={category}
                  storeAll={storeAll}
                />
              </Suspense>
              {/* Full-store expander — "Don't see it? We carry way more than the
                  order form." Scoped to the active category/search so cooks are
                  never dumped into all 20,000 items at once (Dave's ask). */}
              {!storeAll && storeMatchCount > 0 && (
                <Link href={storeAllHref}
                  className="mt-5 flex items-center gap-3 border-2 border-dashed border-teal-300 bg-teal-50/60 hover:bg-teal-50 rounded-xl px-4 py-3.5 transition-colors group">
                  <span className="w-9 h-9 rounded-lg bg-teal-600 text-white flex items-center justify-center font-bold shrink-0">+</span>
                  <span className="flex-1">
                    <span className="block text-sm font-bold text-teal-800">
                      {search
                        ? `${storeMatchCount.toLocaleString()} more match${storeMatchCount === 1 ? '' : 'es'} for “${search}” in the full store`
                        : category && category !== 'All'
                        ? `Don't see it? Browse all ${storeMatchCount.toLocaleString()} ${category} items Sinclair's carries`
                        : `Shop the rest of the store — ${storeMatchCount.toLocaleString()} more items Sinclair's carries`}
                    </span>
                    <span className="block text-xs text-teal-700/70">
                      The order form is just the everyday list — the whole store is available.
                    </span>
                  </span>
                  <span className="text-teal-600 font-bold group-hover:translate-x-0.5 transition-transform">&rarr;</span>
                </Link>
              )}
              {/* "Other" third-party item — Sinclair-handled pickup */}
              <OtherPickupCard />
            </div>
          </div>
        </>
      )}

      {/* ── ADDITIONAL SERVICES TAB ── */}
      {tab === 'services' && (
        <div className="mt-5 max-w-2xl space-y-4">
          <AdditionalServicesTab />
          {/* Off-catalog requests ARE an additional service — they're stored in
              services.other_pickup and counted by the Additional Services
              badge. Rendering it only on the groceries tab meant the badge
              said "1" while the tab showed nothing that could account for it,
              and Edit sent people to a tab where the card sat below the entire
              product grid. Also rendered on the groceries tab so the sidebar's
              "Need something we don't carry?" anchor still works; the two never
              mount at once, and the card persists its own state either way. */}
          <OtherPickupCard />
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
