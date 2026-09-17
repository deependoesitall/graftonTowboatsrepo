'use client';
// src/components/catalog/ProductDetailModal.tsx
// Shared product detail / recommended-items modal — used by ProductGrid and CatalogRails.
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { Product } from '@/types';
import { formatCurrency, formatLb, lbStepsFor, usesLbSteps, productDisplayName, buildVariantSet } from '@/lib/utils';
import { addToCart } from '@/lib/cart';
import { Plus, Minus, ShoppingCart, Package, Check, X, Scale, Tag } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// ─── Product detail modal ─────────────────────────────────────
export function ProductDetailModal({ product, variants, onClose, onSelectProduct }: {
  product: Product; variants?: Product[]; onClose: () => void; onSelectProduct: (p: Product) => void;
}) {
  const set = variants && variants.length > 1
    ? buildVariantSet(variants, p => productDisplayName(p))
    : null;
  const [selectedId, setSelectedId] = useState<string>(product.id);
  const active = set ? (set.options.find(o => o.id === selectedId) ?? set.options[0]) : product;

  const [qty, setQty] = useState(1);
  const [justAdded, setJustAdded] = useState(false);
  const { toast } = useToast();
  const byWeight = !!active.billed_by_weight;
  const lbSteps = usesLbSteps(active.quantity_step) ? lbStepsFor(active.quantity_step!) : null;
  const image = active.image_url || set?.options.find(o => o.image_url)?.image_url || null;
  const cartName = set ? `${set.baseName} — ${active.variant_label}` : productDisplayName(product);

  // Reset the stepper whenever the modal swaps to a different product
  // (tapping through the also-bought row keeps the modal open).
  useEffect(() => { setQty(1); setJustAdded(false); setSelectedId(product.id); }, [product.id]);

  function handleAdd() {
    addToCart({
      product_id: active.id,
      description: cartName,
      category: active.category,
      pkg_size: active.pkg_size,
      uom: active.uom,
      price: active.price,
      quantity: qty,
      billed_by_weight: byWeight,
      quantity_step: active.quantity_step,
      image_url: image,
      paid_by: 'vessel',
    });
    setJustAdded(true);
    toast({ title: 'Added to cart', description: `${lbSteps ? formatLb(qty) : `${qty}×`} ${cartName}`, variant: 'success', duration: 2000 });
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
          {image ? (
            <div className="relative w-full aspect-square bg-gray-50">
              <Image src={image} alt={active.description} fill className="object-contain p-4" unoptimized />
            </div>
          ) : (
            <div className={`h-2 w-full ${getCategoryColor(active.category)} rounded-t-xl`} />
          )}
          <button onClick={onClose} aria-label="Close"
            className="absolute top-3 right-3 w-8 h-8 bg-white/90 border border-gray-200 rounded-full flex items-center justify-center text-gray-500 hover:text-brand-navy shadow-sm">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <div>
            <p className="text-[11px] font-bold text-brand-river uppercase tracking-wide">{active.category}</p>
            <h2 className="font-display text-lg font-bold text-brand-navy leading-snug mt-0.5">
              {set ? set.baseName : productDisplayName(product)}
            </h2>
          </div>

          {/* Size chooser — same options as the card, bigger tap targets */}
          {set && (
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase mb-1.5">Choose a size</p>
              <div className="flex flex-wrap gap-1.5">
                {set.options.map(opt => {
                  const on = opt.id === active.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => { setSelectedId(opt.id); setQty(1); }}
                      aria-pressed={on}
                      className={`px-3 py-2 rounded-lg text-sm font-bold border transition-colors ${
                        on
                          ? 'bg-brand-navy text-white border-brand-navy'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-brand-steel'
                      }`}
                    >
                      {opt.variant_label}
                      <span className={`block text-[10px] font-semibold ${on ? 'text-white/70' : 'text-gray-400'}`}>
                        {formatCurrency(opt.price)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {active.details && active.details.trim() !== productDisplayName(active) && (
            <p className="text-sm text-gray-600 leading-relaxed">{active.details}</p>
          )}

          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-500">
            {active.pkg_size && <span><strong className="text-gray-600">Pack:</strong> {active.pkg_size}</span>}
            {active.uom && <span><strong className="text-gray-600">Unit:</strong> {active.uom}</span>}
          </div>

          {active.tags && active.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {active.tags.map(tag => (
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
{active.regular_price != null && Number(active.regular_price) > Number(active.price) && (
                <span className="text-sm font-semibold text-gray-400 line-through mr-1.5">{formatCurrency(Number(active.regular_price))}</span>
              )}
              {formatCurrency(active.price)}{byWeight && <span className="text-xs font-semibold text-gray-400"> /lb</span>}
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
              {formatLb(qty)} · ~{formatCurrency(active.price * qty)} est. — final price by actual weight
            </p>
          )}
          {!lbSteps && byWeight && active.quantity_size_ratio && (
            <p className="text-xs text-gray-400 -mt-1">
              ≈{active.quantity_size_ratio} lb each · billed at actual weight
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
  const [source, setSource] = useState<'boats' | 'sinclair' | 'mixed'>('sinclair');

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    fetch(`/api/products/${productId}/also-bought`)
      .then(r => (r.ok ? r.json() : { products: [] }))
      .then(d => {
        if (cancelled) return;
        setItems(d.products || []);
        setSource(d.source === 'boats' || d.source === 'mixed' ? d.source : 'sinclair');
      })
      .catch(() => { if (!cancelled) setItems([]); });
    return () => { cancelled = true; };
  }, [productId]);

  if (items !== null && items.length === 0) return null;

  const heading = source === 'sinclair'
    ? 'People who bought this also bought'
    : 'Boats buying this also buy';

  return (
    <div className="border-t border-gray-100 bg-gray-50/60 px-5 py-4">
      <h3 className="font-display text-sm font-bold text-brand-navy mb-3">
        {heading}
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

export function getCategoryColor(category: string): string {
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
