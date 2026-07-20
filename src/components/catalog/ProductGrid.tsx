'use client';
// src/components/catalog/ProductGrid.tsx
import { useState, useCallback, useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Product } from '@/types';
import { formatCurrency, formatLb, lbStepsFor, usesLbSteps, productDisplayName } from '@/lib/utils';
import { addToCart } from '@/lib/cart';
import { Plus, Minus, ShoppingCart, Package, Check, Star, X, Scale, Tag } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/lib/auth-context';
import { getFavoriteIds, addFavorite, removeFavorite } from '@/lib/favorites';

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
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);

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
          for (const product of products) {
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
            out.push(
              <ProductCard key={product.id} product={product}
                isLoggedIn={!!user}
                isFavorite={favIds.has(product.id)}
                onOpenDetail={() => setDetailProduct(product)} />
            );
          }
          return out;
        })()}
      </div>

      {/* Product detail modal */}
      {detailProduct && (
        <ProductDetailModal
          product={detailProduct}
          onClose={() => setDetailProduct(null)}
          onSelectProduct={p => setDetailProduct(p)} />
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

function ProductCard({ product, isLoggedIn, isFavorite, onOpenDetail }: {
  product: Product; isLoggedIn: boolean; isFavorite: boolean; onOpenDetail: () => void;
}) {
  const [qty, setQty] = useState(1);
  const [justAdded, setJustAdded] = useState(false);
  const { toast } = useToast();
  const byWeight = !!product.billed_by_weight;
  // lb dropdown ONLY for items Sinclair's own site sells in fractional-lb
  // steps (deli scale items). Produce counts whole units even when billed
  // by weight — bananas are "3 bananas", not "3 lb".
  const lbSteps = usesLbSteps(product.quantity_step) ? lbStepsFor(product.quantity_step!) : null;

  const handleAdd = useCallback(() => {
    addToCart({
      product_id: product.id,
      // Customers see the full website name everywhere (cart, emails,
      // receipts) — not the POS abbreviation ("YOP STRWBRY YOG").
      description: productDisplayName(product),
      category: product.category,
      pkg_size: product.pkg_size,
      uom: product.uom,
      price: product.price,
      quantity: qty,
      billed_by_weight: !!product.billed_by_weight,
      quantity_step: product.quantity_step,
      image_url: product.image_url,
      paid_by: 'vessel',
    });
    setJustAdded(true);
    toast({
      title: 'Added to cart',
      description: `${lbSteps ? formatLb(qty) : `${qty}×`} ${productDisplayName(product)}`,
      variant: 'success',
      duration: 2000,
    });
    setTimeout(() => {
      setJustAdded(false);
      setQty(1);
    }, 1800);
  }, [product, qty, toast]);

  async function toggleFavorite(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation();
    if (!isLoggedIn) {
      toast({ title: 'Sign in to save favorites', description: 'Create a free account to star items', duration: 2500 });
      return;
    }
    if (isFavorite) { await removeFavorite(product.id); }
    else { await addFavorite(product.id); }
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
      <button type="button" onClick={onOpenDetail} className="block w-full text-left cursor-pointer" aria-label={`View details for ${product.description}`}>
        {product.image_url ? (
          <div className="relative w-full aspect-square bg-gray-50 overflow-hidden">
            <Image
              src={product.image_url}
              alt={product.description}
              fill
              className="object-contain p-2"
              unoptimized
            />
            <div className={`absolute bottom-0 left-0 right-0 h-0.5 ${getCategoryColor(product.category)}`} />
          </div>
        ) : (
          <div className={`h-1.5 w-full ${getCategoryColor(product.category)}`} />
        )}
      </button>

      <div className="p-3 flex flex-col gap-2 flex-1">
        {/* Clickable info area — opens detail modal */}
        <button type="button" onClick={onOpenDetail} className="text-left flex flex-col gap-2 cursor-pointer">
          {/* Category label — show main category only, not internal Sinclair sub-category */}
          <span className="text-[10px] font-bold text-brand-river uppercase tracking-wide leading-none truncate">
            {product.category}
          </span>

          {/* Product name — the FULL website name, like Sinclair's own site
              ("Yoplait Low Fat Strawberry Yogurt"), never the POS abbreviation */}
          <h3 className="font-body font-semibold text-brand-navy text-sm leading-tight line-clamp-2 min-h-[2.5rem]">
            {productDisplayName(product)}
          </h3>

          {/* Pack size */}
          {product.pkg_size && (
            <p className="text-[11px] text-gray-400 -mt-1">
              {product.pkg_size}{product.uom ? ` / ${product.uom}` : ''}
            </p>
          )}
        </button>

        {/* Price + controls */}
        <div className="border-t border-gray-100 pt-2 mt-auto">
          {byWeight && (
            <p className="flex items-center gap-1 text-[10px] font-semibold text-amber-700 mb-1">
              <Scale className="w-3 h-3" /> Sold by weight — billed at actual weight
            </p>
          )}
          <div className="flex items-center justify-between gap-1 mb-2">
            <span className="text-base font-bold text-brand-navy font-body">
              {formatCurrency(product.price)}{byWeight && <span className="text-[10px] font-semibold text-gray-400"> /lb</span>}
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
              {formatLb(qty)} · ~{formatCurrency(product.price * qty)} est. — billed at actual weight
            </p>
          )}
          {!lbSteps && byWeight && product.quantity_size_ratio && (
            <p className="text-[10px] text-gray-400 mb-1.5 -mt-1">
              ≈{product.quantity_size_ratio} lb each · billed at actual weight
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

// ─── Product detail modal ─────────────────────────────────────
function ProductDetailModal({ product, onClose, onSelectProduct }: {
  product: Product; onClose: () => void; onSelectProduct: (p: Product) => void;
}) {
  const [qty, setQty] = useState(1);
  const [justAdded, setJustAdded] = useState(false);
  const { toast } = useToast();
  const byWeight = !!product.billed_by_weight;
  const lbSteps = usesLbSteps(product.quantity_step) ? lbStepsFor(product.quantity_step!) : null;

  // Reset the stepper whenever the modal swaps to a different product
  // (tapping through the also-bought row keeps the modal open).
  useEffect(() => { setQty(1); setJustAdded(false); }, [product.id]);

  function handleAdd() {
    addToCart({
      product_id: product.id,
      description: productDisplayName(product),
      category: product.category,
      pkg_size: product.pkg_size,
      uom: product.uom,
      price: product.price,
      quantity: qty,
      billed_by_weight: byWeight,
      quantity_step: product.quantity_step,
      image_url: product.image_url,
      paid_by: 'vessel',
    });
    setJustAdded(true);
    toast({ title: 'Added to cart', description: `${lbSteps ? formatLb(qty) : `${qty}×`} ${productDisplayName(product)}`, variant: 'success', duration: 2000 });
    setTimeout(() => { setJustAdded(false); }, 1500);
  }

  // PORTAL to <body> — house rule for every fixed-position overlay in this
  // codebase (transformed/animated ancestors otherwise trap position:fixed).
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-8" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto animate-fade-in"
        onClick={e => e.stopPropagation()}>
        {/* Image */}
        <div className="relative">
          {product.image_url ? (
            <div className="relative w-full aspect-square bg-gray-50">
              <Image src={product.image_url} alt={product.description} fill className="object-contain p-4" unoptimized />
            </div>
          ) : (
            <div className={`h-2 w-full ${getCategoryColor(product.category)} rounded-t-xl`} />
          )}
          <button onClick={onClose} aria-label="Close"
            className="absolute top-3 right-3 w-8 h-8 bg-white/90 border border-gray-200 rounded-full flex items-center justify-center text-gray-500 hover:text-brand-navy shadow-sm">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <div>
            <p className="text-[11px] font-bold text-brand-river uppercase tracking-wide">{product.category}</p>
            <h2 className="font-display text-lg font-bold text-brand-navy leading-snug mt-0.5">{productDisplayName(product)}</h2>
          </div>

          {product.details && product.details.trim() !== productDisplayName(product) && (
            <p className="text-sm text-gray-600 leading-relaxed">{product.details}</p>
          )}

          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-500">
            {product.pkg_size && <span><strong className="text-gray-600">Pack:</strong> {product.pkg_size}</span>}
            {product.uom && <span><strong className="text-gray-600">Unit:</strong> {product.uom}</span>}
          </div>

          {product.tags && product.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {product.tags.map(tag => (
                <span key={tag} className="inline-flex items-center gap-1 text-[10px] font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                  <Tag className="w-2.5 h-2.5" /> {tag}
                </span>
              ))}
            </div>
          )}

          {byWeight && (
            <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <Scale className="w-3.5 h-3.5 shrink-0" />
              Sold by weight — you&apos;ll be billed for the actual weight packed.
            </p>
          )}

          <div className="flex items-center justify-between border-t border-gray-100 pt-3">
            <span className="text-xl font-bold text-brand-navy">
              {formatCurrency(product.price)}{byWeight && <span className="text-xs font-semibold text-gray-400"> /lb</span>}
            </span>
            {!lbSteps && (
              <div className="flex items-center border border-gray-200 rounded overflow-hidden">
                <button onClick={() => setQty(q => Math.max(1, Math.floor(q) - 1))} aria-label="Decrease quantity"
                  className="w-8 h-8 flex items-center justify-center text-gray-400 hover:bg-gray-100"><Minus className="w-3 h-3" /></button>
                <input type="text" inputMode="numeric" pattern="[0-9]*" value={qty} aria-label="Quantity"
                  onChange={e => {
                    const val = e.target.value.replace(/[^0-9]/g, '');
                    setQty(val === '' ? 0 : Math.min(999, parseInt(val, 10)));
                  }}
                  onBlur={() => { if (!qty || qty < 1) setQty(1); }}
                  onFocus={e => e.target.select()}
                  className="w-10 text-center text-sm font-bold text-brand-navy bg-transparent border-0 focus:outline-none" />
                <button onClick={() => setQty(q => Math.min(999, Math.floor(q) + 1))} aria-label="Increase quantity"
                  className="w-8 h-8 flex items-center justify-center text-gray-400 hover:bg-gray-100"><Plus className="w-3 h-3" /></button>
              </div>
            )}
          </div>

          {lbSteps && (
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">How much?</p>
              <div className="grid grid-cols-3 gap-1.5">
                {lbSteps.map(w => (
                  <button key={w} type="button" onClick={() => setQty(w)}
                    className={`py-2 rounded-lg text-sm font-bold border transition-colors ${
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
            <p className="text-xs text-gray-400 -mt-1">
              {formatLb(qty)} · ~{formatCurrency(product.price * qty)} est. — final price by actual weight
            </p>
          )}
          {!lbSteps && byWeight && product.quantity_size_ratio && (
            <p className="text-xs text-gray-400 -mt-1">
              ≈{product.quantity_size_ratio} lb each · billed at actual weight
            </p>
          )}

          <button onClick={handleAdd} disabled={justAdded}
            className={`w-full flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-bold transition-all ${
              justAdded ? 'bg-green-500 text-white' : 'bg-brand-green text-white hover:bg-brand-gmed active:scale-[0.98]'
            }`}>
            {justAdded ? <><Check className="w-4 h-4" /> Added!</> : <><ShoppingCart className="w-4 h-4" /> Add to Cart</>}
          </button>
        </div>

        {/* People who bought this also bought */}
        <AlsoBought productId={product.id} onSelect={onSelectProduct} />
      </div>
    </div>,
    document.body
  );
}

// ─── "People who bought this also bought" ─────────────────────
// Mirrors the row on Sinclair's own product pages. Driven by the Freshop
// popularity rank we sync nightly (same signal their storefront sorts by),
// weighted to the current item's category first.
function AlsoBought({ productId, onSelect }: {
  productId: string; onSelect: (p: Product) => void;
}) {
  const [items, setItems] = useState<Product[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    fetch(`/api/products/${productId}/also-bought`)
      .then(r => (r.ok ? r.json() : { products: [] }))
      .then(d => { if (!cancelled) setItems(d.products || []); })
      .catch(() => { if (!cancelled) setItems([]); });
    return () => { cancelled = true; };
  }, [productId]);

  if (items !== null && items.length === 0) return null;

  return (
    <div className="border-t border-gray-100 bg-gray-50/60 px-5 py-4">
      <h3 className="font-display text-sm font-bold text-brand-navy mb-3">
        People who bought this also bought
      </h3>

      {items === null ? (
        <div className="flex gap-3 overflow-hidden">
          {[0, 1, 2].map(i => (
            <div key={i} className="w-24 shrink-0 animate-pulse">
              <div className="aspect-square bg-gray-200 rounded-lg mb-1.5" />
              <div className="h-2.5 bg-gray-200 rounded w-full mb-1" />
              <div className="h-2.5 bg-gray-200 rounded w-2/3" />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 snap-x">
          {items.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelect(p)}
              className="w-24 shrink-0 text-left snap-start group"
              aria-label={`View ${productDisplayName(p)}`}
            >
              <div className="relative w-24 h-24 bg-white border border-gray-200 rounded-lg overflow-hidden mb-1.5 group-hover:border-brand-steel transition-colors">
                {p.image_url ? (
                  <Image src={p.image_url} alt={p.description} fill className="object-contain p-1.5" unoptimized />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Package className="w-6 h-6 text-gray-200" />
                  </div>
                )}
              </div>
              <p className="text-[11px] font-semibold text-brand-navy leading-tight line-clamp-2 group-hover:text-brand-steel transition-colors">
                {productDisplayName(p)}
              </p>
              <p className="text-[11px] font-bold text-brand-navy mt-0.5">
                {formatCurrency(p.price)}
                {p.billed_by_weight && <span className="font-semibold text-gray-400"> /lb</span>}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function getCategoryColor(category: string): string {
  const map: Record<string, string> = {
    'Meat & Seafood': 'bg-brand-orange',
    'Dairy': 'bg-yellow-300',
    'Produce': 'bg-brand-glight',
    'Frozen Foods': 'bg-cyan-400',
    'Bakery & Deli': 'bg-amber-400',
    'Beverages': 'bg-brand-green',
    'Snacks & Sweets': 'bg-pink-400',
    'Pantry & Grocery': 'bg-orange-400',
    'Household & Cleaning': 'bg-teal-400',
    'Health & Personal Care': 'bg-purple-400',
    'Boat Supplies': 'bg-brand-gmed',
    // Stray spreadsheet category names (pre-normalization) — same colors as
    // their standard equivalents so cards don't fall back to grey.
    'Frozen Goods': 'bg-cyan-400',
    'Dairy & Eggs': 'bg-yellow-300',
  };
  return map[category] ?? 'bg-gray-300';
}
