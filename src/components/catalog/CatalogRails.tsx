'use client';
// src/components/catalog/CatalogRails.tsx
//
// "What's on sale" and "Best sellers" — the two horizontal rails on /catalog.
//
// Mirrors the layout of Sinclair's own homepage so a crew that already browses
// their site recognizes it, and reuses the density of the old coupon strip
// rather than inventing a third card size.
//
// ⚠️ THESE ARE NOT COUPONS. No clip button, no code, no Sinclair login. The
// nightly job filters clip/loyalty offers out before they ever reach here (see
// isClipOnly in lib/catalog-rails.ts), because an offer needing a Sinclair's
// account rings up at full price for a vessel that hasn't got one.
//
// Prices are estimates, exactly like everywhere else in the catalog — the
// Sinclair's register total is what gets billed, per the Terms.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Tag, TrendingUp, Plus, ChevronRight } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { addToCart } from '@/lib/cart';
import type { Product } from '@/types';

type RailProduct = Product & {
  rail_sale_price: number | null;
  rail_regular_price: number | null;
};

export default function CatalogRails() {
  const [rails, setRails] = useState<{ on_sale: RailProduct[]; best_sellers: RailProduct[] } | null>(null);

  useEffect(() => {
    fetch('/api/catalog-rails')
      .then(r => (r.ok ? r.json() : null))
      .then(d => setRails(d && !d.error ? d : { on_sale: [], best_sellers: [] }))
      // A failed rail is not worth an error message on a page someone is
      // trying to order from. It just isn't there.
      .catch(() => setRails({ on_sale: [], best_sellers: [] }));
  }, []);

  // NO SKELETON. Rails are supplementary — the catalog below is the page.
  // A skeleton that never resolves (rail switched off, Freshop empty) leaves a
  // permanent grey ghost, which looks broken. Nothing renders until there is
  // something real to render.
  if (!rails) return null;

  const hasSale = rails.on_sale.length > 0;
  const hasBest = rails.best_sellers.length > 0;
  if (!hasSale && !hasBest) return null;

  return (
    <div className="space-y-4 mb-5">
      {hasSale && (
        <Rail
          title="What's on sale"
          icon={Tag}
          accent="text-brand-orange"
          items={rails.on_sale}
          viewAll={{
            href: `/catalog?ids=${rails.on_sale.map(p => p.id).join(',')}`,
            label: 'View all on sale',
          }}
        />
      )}
      {hasBest && (
        <Rail
          title="Best sellers"
          icon={TrendingUp}
          accent="text-brand-green"
          items={rails.best_sellers}
        />
      )}
    </div>
  );
}

function Rail({ title, icon: Icon, accent, items, viewAll }: {
  title: string;
  icon: typeof Tag;
  accent: string;
  items: RailProduct[];
  viewAll?: { href: string; label: string };
}) {
  return (
    <section className="bg-white border border-gray-200 rounded-xl px-4 py-3">
      <div className="flex items-baseline justify-between gap-2 mb-2.5 flex-wrap">
        <p className="flex items-center gap-1.5 text-xs font-bold text-brand-navy uppercase tracking-wide">
          <Icon className={`w-3.5 h-3.5 ${accent}`} /> {title}
          <span className="font-normal normal-case text-gray-400">
            — from Sinclair&apos;s this week
          </span>
        </p>
        {viewAll && (
          <Link href={viewAll.href}
            className="text-xs font-bold text-brand-river hover:underline whitespace-nowrap inline-flex items-center gap-0.5">
            {viewAll.label} <ChevronRight className="w-3 h-3" />
          </Link>
        )}
      </div>

      {/* Snap scrolling, same density as the coupon strip it replaces. */}
      <div className="flex gap-2.5 overflow-x-auto pb-1 -mx-1 px-1 snap-x">
        {items.map(p => <RailCard key={p.id} product={p} />)}
      </div>
    </section>
  );
}

function RailCard({ product }: { product: RailProduct }) {
  const [added, setAdded] = useState(false);

  const sale = product.rail_sale_price;
  const regular = product.rail_regular_price;
  // Only strike a price through when it's genuinely higher. A struck-through
  // number equal to the sale price reads as a fake discount.
  const showStrike = sale != null && regular != null && regular > sale;
  const display = sale ?? product.price;

  function add() {
    // Same shape ProductGrid uses, so a rail add and a grid add are
    // indistinguishable downstream — one cart, one pick sheet, one register.
    //
    // NOTE: `price` is the product's own catalog price, NOT the rail's sale
    // price. The sale figure is a shop-window estimate from last night's
    // Freshop pull; the register total is what actually gets billed, per the
    // Terms. Writing an estimate into the cart line would make the order
    // confirmation quietly disagree with the receipt.
    addToCart({
      product_id: product.id,
      description: product.description,
      category: product.category,
      pkg_size: product.pkg_size,
      uom: product.uom,
      price: product.price,
      quantity: 1,
      billed_by_weight: !!product.billed_by_weight,
      quantity_step: product.quantity_step,
      image_url: product.image_url,
      paid_by: 'vessel',
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 1400);
  }

  return (
    <div className="shrink-0 w-40 snap-start border border-gray-100 rounded-lg p-2.5 bg-gray-50/50 flex flex-col">
      {product.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={product.image_url} alt=""
          className="w-full h-20 object-contain mb-1.5 mix-blend-multiply" />
      ) : (
        <div className="w-full h-20 mb-1.5 rounded bg-gray-100" aria-hidden="true" />
      )}

      <p className="text-[11px] font-semibold text-brand-navy leading-snug line-clamp-2 min-h-[28px]">
        {product.description}
      </p>

      {(product.pkg_size || product.uom) && (
        <p className="text-[10px] text-gray-400 mt-0.5 truncate">
          {[product.pkg_size, product.uom].filter(Boolean).join(' / ')}
        </p>
      )}

      <div className="mt-1.5 mb-2 flex items-baseline gap-1.5 flex-wrap">
        <span className={`text-sm font-bold ${sale != null ? 'text-red-600' : 'text-brand-navy'}`}>
          {formatCurrency(Number(display) || 0)}
        </span>
        {showStrike && (
          <span className="text-[11px] text-gray-400 line-through">
            {formatCurrency(Number(regular))}
          </span>
        )}
        {product.billed_by_weight && (
          <span className="text-[9px] text-gray-400">/lb</span>
        )}
      </div>

      <button onClick={add}
        className={`mt-auto w-full py-1.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition-colors ${
          added ? 'bg-green-600 text-white' : 'bg-brand-navy text-white hover:bg-brand-steel'
        }`}>
        <Plus className="w-3 h-3" />
        {added ? 'Added' : 'Add'}
      </button>
    </div>
  );
}
