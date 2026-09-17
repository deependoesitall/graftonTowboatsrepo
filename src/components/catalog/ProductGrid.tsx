'use client';
// src/components/catalog/ProductGrid.tsx
import { useState, useCallback, useEffect, type ReactNode } from 'react';
import { Product } from '@/types';
import { formatCurrency, formatLb, lbStepsFor, usesLbSteps, productDisplayName, buildVariantSet } from '@/lib/utils';
import { applyEffectiveCatalogPricing } from '@/lib/catalog-price';
import { addToCart } from '@/lib/cart';
import { Plus, Minus, ShoppingCart, Package, Check, Star, Scale } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/lib/auth-context';
import { getFavoriteIds, addFavorite, removeFavorite } from '@/lib/favorites';
import { ProductDetailModal, getCategoryColor } from '@/components/catalog/ProductDetailModal';

interface ProductGridProps {
  products: Product[];
  totalCount: number;
  page: number;
  totalPages: number;
  search: string;
  category: string;
  /** True when browsing the full store (?store=all) — kept across pagination. */
  storeAll?: boolean;
}


export function ProductGrid({ products, totalCount, page, totalPages, search, category, storeAll }: ProductGridProps) {
  const { user } = useAuth();
  const [favIds, setFavIds] = useState<Set<string>>(new Set());
  // Detail modal carries the whole variant set, so the size chooser survives
  // the jump from card to modal instead of silently dropping to one size.
  const [detailProduct, setDetailProduct] = useState<{ product: Product; variants?: Product[] } | null>(null);

  useEffect(() => {
    if (!user) { setFavIds(new Set()); return; }
    getFavoriteIds().then(setFavIds);
    const refresh = () => getFavoriteIds().then(setFavIds);
    window.addEventListener('favorites-updated', refresh);
    return () => window.removeEventListener('favorites-updated', refresh);
  }, [user]);

  if (products.length === 0) {
    return (
      <div className="text-center py-24">
        <Package className="w-14 h-14 text-gray-200 mx-auto mb-4" />
        <h3 className="font-display text-xl text-gray-400 mb-2">No items found</h3>
        <p className="text-gray-300 text-sm">Try a different search term or category.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Results bar */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-gray-400">
          <span className="font-semibold text-brand-navy">{totalCount.toLocaleString()}</span> items
          {search && <> matching &ldquo;<span className="text-brand-river font-medium">{search}</span>&rdquo;</>}
          {category && category !== 'All' && <> in <span className="text-brand-river font-medium">{category}</span></>}
        </p>
        <p className="text-xs text-gray-400">Page {page} of {totalPages || 1}</p>
      </div>

      {/* Grid — 2 cols mobile, 3 tablet, 4 desktop.
          Products arrive in PAPER ORDER-FORM sequence; when consecutive items
          share a form subsection (Beef, Pork, Condiments, …) we render the
          form's own row label as a full-width header — the electronic version
          of the paper form's section lines. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
        {(() => {
          const out: ReactNode[] = [];
          let lastHeader: string | null = null;

          // SIZE VARIANTS (migration 061): the order form lists the same cut
          // once per weight/pack. Bucket those rows so the grid draws ONE card
          // with a size chooser instead of three photos of the same steak.
          // The group renders at the position of its FIRST row, so the paper
          // form's sequence — which the barges shop top to bottom — is intact.
          const byGroup = new Map<string, Product[]>();
          for (const p of products) {
            if (!p.variant_group) continue;
            const bucket = byGroup.get(p.variant_group);
            if (bucket) bucket.push(p);
            else byGroup.set(p.variant_group, [p]);
          }
          const drawnGroups = new Set<string>();

          for (const product of products) {
            // Later rows of an already-drawn group fold into its chooser.
            if (product.variant_group) {
              if (drawnGroups.has(product.variant_group)) continue;
              drawnGroups.add(product.variant_group);
            }
            if (product.form_subsection && product.form_subsection !== lastHeader) {
              lastHeader = product.form_subsection;
              out.push(
                <div key={`hdr-${product.id}`}
                  className="col-span-2 sm:col-span-3 lg:col-span-4 flex items-center gap-2 mt-2 first:mt-0">
                  <span className="text-[11px] font-bold uppercase tracking-widest text-brand-navy bg-brand-sand/60 border border-brand-gold/30 rounded px-2 py-0.5">
                    {product.form_subsection}
                  </span>
                  <span className="flex-1 border-t border-brand-gold/20" />
                </div>
              );
            } else if (!product.form_subsection && product.form_seq == null && lastHeader !== null && lastHeader !== '__offform__') {
              // Transition from order-form items to off-form (full store) items
              lastHeader = '__offform__';
              out.push(
                <div key={`hdr-off-${product.id}`}
                  className="col-span-2 sm:col-span-3 lg:col-span-4 flex items-center gap-2 mt-2">
                  <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400 bg-gray-50 border border-gray-200 rounded px-2 py-0.5">
                    More from the store
                  </span>
                  <span className="flex-1 border-t border-gray-200" />
                </div>
              );
            }
            const variants = product.variant_group ? byGroup.get(product.variant_group) : undefined;
            out.push(
              <ProductCard key={product.id} product={product}
                variants={variants && variants.length > 1 ? variants : undefined}
                isLoggedIn={!!user}
                favIds={favIds}
                onOpenDetail={(p, v) => setDetailProduct({ product: p, variants: v })} />
            );
          }
          return out;
        })()}
      </div>

      {/* Product detail modal */}
      {detailProduct && (
        <ProductDetailModal
          product={detailProduct.product}
          variants={detailProduct.variants}
          onClose={() => setDetailProduct(null)}
          onSelectProduct={p => setDetailProduct({ product: p })} />
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-2 mt-10 pb-4">
          {page > 1 && (
            <PaginationLink href={buildUrl(search, category, page - 1, storeAll)} label="← Prev" />
          )}
          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              const p = totalPages <= 7 ? i + 1 : page <= 4 ? i + 1 : page >= totalPages - 3 ? totalPages - 6 + i : page - 3 + i;
              return (
                <Link
                  key={p}
                  href={buildUrl(search, category, p, storeAll)}
                  className={`w-8 h-8 flex items-center justify-center rounded text-xs font-bold transition-colors ${
                    p === page ? 'bg-brand-steel text-white' : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  {p}
                </Link>
              );
            })}
          </div>
          {page < totalPages && (
            <PaginationLink href={buildUrl(search, category, page + 1, storeAll)} label="Next →" />
          )}
        </div>
      )}
    </div>
  );
}

function buildUrl(search: string, category: string, page: number, storeAll?: boolean) {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (category && category !== 'All') params.set('category', category);
  if (page > 1) params.set('page', String(page));
  if (storeAll) params.set('store', 'all');   // preserve full-store browsing across pagination
  const qs = params.toString();
  return `/catalog${qs ? `?${qs}` : ''}`;
}

function PaginationLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="px-3 py-1.5 border border-brand-steel text-brand-steel rounded text-xs font-semibold hover:bg-brand-steel hover:text-white transition-colors"
    >
      {label}
    </Link>
  );
}

function ProductCard({ product, variants, isLoggedIn, favIds, onOpenDetail }: {
  product: Product; variants?: Product[]; isLoggedIn: boolean;
  favIds: Set<string>; onOpenDetail: (p: Product, variants?: Product[]) => void;
}) {
  // Defence in depth: even if a server path forgot to apply Chicago sale
  // expiry, never let an expired regular_price keep charging the sale.
  const pricedProduct = applyEffectiveCatalogPricing(product);
  const pricedVariants = variants?.map(v => applyEffectiveCatalogPricing(v));

  // ── Size chooser ────────────────────────────────────────────
  // When this card stands for a group, `active` is the size the cook has
  // picked and everything below — price, photo, cart line — follows it. The
  // other sizes stay real rows in the database; we're only choosing which one
  // this card is currently offering.
  const set = pricedVariants ? buildVariantSet(pricedVariants, p => productDisplayName(p)) : null;
  const [selectedId, setSelectedId] = useState<string>(set ? set.options[0].id : pricedProduct.id);
  const active = set ? (set.options.find(o => o.id === selectedId) ?? set.options[0]) : pricedProduct;

  const [qty, setQty] = useState(1);
  const [justAdded, setJustAdded] = useState(false);
  const { toast } = useToast();
  const byWeight = !!active.billed_by_weight;
  const isFavorite = favIds.has(active.id);
  // lb dropdown ONLY for items Sinclair's own site sells in fractional-lb
  // steps (deli scale items). Produce counts whole units even when billed
  // by weight — bananas are "3 bananas", not "3 lb".
  const lbSteps = usesLbSteps(active.quantity_step) ? lbStepsFor(active.quantity_step!) : null;

  // Photo fallback across the group. The barge list is still 23% short on
  // photos; when the 8 lb roast has no picture but the 5 lb does, they are
  // literally the same cut of meat, so show it rather than a grey band.
  const image = active.image_url || set?.options.find(o => o.image_url)?.image_url || null;

  // Cart lines carry the CHOSEN size's name, so the pick sheet and the
  // register still see the exact SKU Sinclair's has to ring up.
  const cartName = set
    ? `${set.baseName} — ${active.variant_label}`
    : productDisplayName(product);

  const handleAdd = useCallback(() => {
    addToCart({
      product_id: active.id,
      // Customers see the full website name everywhere (cart, emails,
      // receipts) — not the POS abbreviation ("YOP STRWBRY YOG").
      description: cartName,
      category: active.category,
      pkg_size: active.pkg_size,
      uom: active.uom,
      price: active.price,
      quantity: qty,
      billed_by_weight: !!active.billed_by_weight,
      quantity_step: active.quantity_step,
      image_url: image,
      paid_by: 'vessel',
    });
    setJustAdded(true);
    toast({
      title: 'Added to cart',
      description: `${lbSteps ? formatLb(qty) : `${qty}×`} ${cartName}`,
      variant: 'success',
      duration: 2000,
    });
    setTimeout(() => {
      setJustAdded(false);
      setQty(1);
    }, 1800);
  }, [active, cartName, image, lbSteps, qty, toast]);

  async function toggleFavorite(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation();
    if (!isLoggedIn) {
      toast({ title: 'Sign in to save favorites', description: 'Create a free account to star items', duration: 2500 });
      return;
    }
    if (isFavorite) { await removeFavorite(active.id); }
    else { await addFavorite(active.id); }
  }

  return (
    <div className="product-card card-base flex flex-col overflow-hidden group relative">
      {/* Star / favorite button */}
      <button
        onClick={toggleFavorite}
        aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        className={`absolute top-2.5 right-2 z-10 p-1 rounded-full transition-colors ${
          isFavorite ? 'text-brand-orange' : 'text-gray-300 hover:text-brand-orange'
        }`}
      >
        <Star className={`w-4 h-4 ${isFavorite ? 'fill-brand-orange' : ''}`} />
      </button>
      {/* Product image or category color band — click opens detail modal */}
      <button type="button" onClick={() => onOpenDetail(active, set?.options)} className="block w-full text-left cursor-pointer" aria-label={`View details for ${active.description}`}>
        {image ? (
          <div className="relative w-full aspect-square bg-gray-50 overflow-hidden">
            <Image
              src={image}
              alt={active.description}
              fill
              className="object-contain p-2"
              unoptimized
            />
            <div className={`absolute bottom-0 left-0 right-0 h-0.5 ${getCategoryColor(active.category)}`} />
          </div>
        ) : (
          <div className={`h-1.5 w-full ${getCategoryColor(active.category)}`} />
        )}
      </button>

      <div className="p-3 flex flex-col gap-2 flex-1">
        {/* Clickable info area — opens detail modal */}
        <button type="button" onClick={() => onOpenDetail(active, set?.options)} className="text-left flex flex-col gap-2 cursor-pointer">
          {/* Category label — show main category only, not internal Sinclair sub-category */}
          <span className="text-[10px] font-bold text-brand-river uppercase tracking-wide leading-none truncate">
            {active.category}
          </span>

          {/* Product name — the FULL website name, like Sinclair's own site
              ("Yoplait Low Fat Strawberry Yogurt"), never the POS abbreviation.
              Grouped cards drop the size token; the chips below carry it. */}
          <h3 className="font-body font-semibold text-brand-navy text-sm leading-tight line-clamp-2 min-h-[2.5rem]">
            {set ? set.baseName : productDisplayName(product)}
          </h3>

          {/* Pack size — redundant once the size chips are showing */}
          {!set && active.pkg_size && (
            <p className="text-[11px] text-gray-400 -mt-1">
              {active.pkg_size}{active.uom ? ` / ${active.uom}` : ''}
            </p>
          )}
        </button>

        {/* ── Size chips ──────────────────────────────────────────
            Replaces N near-identical cards. Two taps to order 8 lb of
            ground chuck instead of hunting the right row in a wall of
            repeats — the whole point of the exercise for a cook who is
            doing this on a phone with the boat moving. */}
        {set && (
          <div className="-mt-0.5">
            <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Size</p>
            <div className="flex flex-wrap gap-1">
              {set.options.map(opt => {
                const on = opt.id === active.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => { setSelectedId(opt.id); setQty(1); }}
                    aria-pressed={on}
                    className={`px-2 py-1 rounded text-[11px] font-bold border transition-colors ${
                      on
                        ? 'bg-brand-navy text-white border-brand-navy'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-brand-steel'
                    }`}
                  >
                    {opt.variant_label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Price + controls */}
        <div className="border-t border-gray-100 pt-2 mt-auto">
          {byWeight && (
            <p className="flex items-center gap-1 text-[10px] font-semibold text-amber-700 mb-1">
              <Scale className="w-3 h-3" /> Sold by weight — billed at actual weight
            </p>
          )}
          <div className="flex items-center justify-between gap-1 mb-2">
            <span className="text-base font-bold text-brand-navy font-body inline-flex items-baseline gap-1.5">
              {active.regular_price != null && Number(active.regular_price) > Number(active.price) && (
                <span className="text-xs font-semibold text-gray-400 line-through">{formatCurrency(Number(active.regular_price))}</span>
              )}
              {formatCurrency(active.price)}{byWeight && <span className="text-[10px] font-semibold text-gray-400"> /lb</span>}
            </span>
            {/* Qty stepper (count items) — fractional-lb items pick pounds below */}
            {!lbSteps && (
              <div className="flex items-center border border-gray-200 rounded overflow-hidden">
                <button
                  onClick={() => setQty(q => Math.max(1, Math.floor(q) - 1))}
                  className="w-6 h-6 flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors"
                  aria-label="Decrease quantity"
                >
                  <Minus className="w-2.5 h-2.5" />
                </button>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={qty}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^0-9]/g, '');
                    if (val === '') { setQty(0); return; }
                    setQty(Math.min(999, parseInt(val, 10)));
                  }}
                  onBlur={() => { if (!qty || qty < 1) setQty(1); }}
                  onFocus={(e) => e.target.select()}
                  className="w-8 text-center text-xs font-bold text-brand-navy bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-brand-steel rounded"
                  aria-label="Quantity"
                />
                <button
                  onClick={() => setQty(q => Math.min(999, Math.floor(q) + 1))}
                  className="w-6 h-6 flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors"
                  aria-label="Increase quantity"
                >
                  <Plus className="w-2.5 h-2.5" />
                </button>
              </div>
            )}
          </div>
          {lbSteps && (
            <div className="mb-2">
              <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">How much?</p>
              <div className="grid grid-cols-3 gap-1">
                {lbSteps.map(w => (
                  <button key={w} type="button" onClick={() => setQty(w)}
                    className={`py-1 rounded text-[11px] font-bold border transition-colors ${
                      qty === w
                        ? 'bg-brand-navy text-white border-brand-navy'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                    }`}>
                    {formatLb(w)}
                  </button>
                ))}
              </div>
            </div>
          )}
          {lbSteps && qty > 0 && (
            <p className="text-[10px] text-gray-400 mb-1.5 -mt-1">
              {formatLb(qty)} · ~{formatCurrency(active.price * qty)} est. — billed at actual weight
            </p>
          )}
          {!lbSteps && byWeight && active.quantity_size_ratio && (
            <p className="text-[10px] text-gray-400 mb-1.5 -mt-1">
              ≈{active.quantity_size_ratio} lb each · billed at actual weight
            </p>
          )}

          {/* Add to cart button — full width */}
          <button
            onClick={handleAdd}
            disabled={justAdded}
            className={`w-full flex items-center justify-center gap-1.5 py-1.5 rounded text-xs font-bold transition-all duration-200 ${
              justAdded
                ? 'bg-green-500 text-white'
                : 'bg-brand-green text-white hover:bg-brand-gmed active:scale-95'
            }`}
          >
            {justAdded ? (
              <><Check className="w-3 h-3" /> Added!</>
            ) : (
              <><ShoppingCart className="w-3 h-3" /> Add to Cart</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
