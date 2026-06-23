'use client';
// src/components/catalog/ProductGrid.tsx
import { useState, useCallback, useEffect } from 'react';
import { Product } from '@/types';
import { formatCurrency } from '@/lib/utils';
import { addToCart } from '@/lib/cart';
import { Plus, Minus, ShoppingCart, Package, Check, Star } from 'lucide-react';
import Link from 'next/link';
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
}

export function ProductGrid({ products, totalCount, page, totalPages, search, category }: ProductGridProps) {
  const { user } = useAuth();
  const [favIds, setFavIds] = useState<Set<string>>(new Set());

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

      {/* Grid — 2 cols mobile, 3 tablet, 4 desktop */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
        {products.map(product => (
          <ProductCard key={product.id} product={product}
            isLoggedIn={!!user}
            isFavorite={favIds.has(product.id)} />
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-2 mt-10 pb-4">
          {page > 1 && (
            <PaginationLink href={buildUrl(search, category, page - 1)} label="← Prev" />
          )}
          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              const p = totalPages <= 7 ? i + 1 : page <= 4 ? i + 1 : page >= totalPages - 3 ? totalPages - 6 + i : page - 3 + i;
              return (
                <Link
                  key={p}
                  href={buildUrl(search, category, p)}
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
            <PaginationLink href={buildUrl(search, category, page + 1)} label="Next →" />
          )}
        </div>
      )}
    </div>
  );
}

function buildUrl(search: string, category: string, page: number) {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (category && category !== 'All') params.set('category', category);
  if (page > 1) params.set('page', String(page));
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

function ProductCard({ product, isLoggedIn, isFavorite }: { product: Product; isLoggedIn: boolean; isFavorite: boolean }) {
  const [qty, setQty] = useState(1);
  const [justAdded, setJustAdded] = useState(false);
  const { toast } = useToast();

  const handleAdd = useCallback(() => {
    addToCart({
      product_id: product.id,
      description: product.description,
      category: product.category,
      pkg_size: product.pkg_size,
      uom: product.uom,
      price: product.price,
      quantity: qty,
    });
    setJustAdded(true);
    toast({
      title: 'Added to cart',
      description: `${qty}× ${product.description}`,
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
      {/* Top color band by category */}
      <div className={`h-1 w-full ${getCategoryColor(product.category)}`} />

      <div className="p-3 flex flex-col gap-2 flex-1">
        {/* Category label — show main category only, not internal Sinclair sub-category */}
        <span className="text-[10px] font-bold text-brand-river uppercase tracking-wide leading-none truncate">
          {product.category}
        </span>

        {/* Product name */}
        <h3 className="font-body font-semibold text-brand-navy text-sm leading-tight line-clamp-2 min-h-[2.5rem]">
          {product.description}
        </h3>

        {/* Customer-facing description */}
        {product.details && (
          <p className="text-[11px] text-gray-500 leading-snug line-clamp-3 -mt-1">
            {product.details}
          </p>
        )}

        {/* Pack size */}
        {product.pkg_size && (
          <p className="text-[11px] text-gray-400 -mt-1">
            {product.pkg_size}{product.uom ? ` / ${product.uom}` : ''}
          </p>
        )}

        {/* Price + controls */}
        <div className="border-t border-gray-100 pt-2 mt-auto">
          <div className="flex items-center justify-between gap-1 mb-2">
            <span className="text-base font-bold text-brand-navy font-body">
              {formatCurrency(product.price)}
            </span>
            {/* Qty stepper */}
            <div className="flex items-center border border-gray-200 rounded overflow-hidden">
              <button
                onClick={() => setQty(q => Math.max(1, q - 1))}
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
                onClick={() => setQty(q => Math.min(999, q + 1))}
                className="w-6 h-6 flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors"
                aria-label="Increase quantity"
              >
                <Plus className="w-2.5 h-2.5" />
              </button>
            </div>
          </div>

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

function getCategoryColor(category: string): string {
  const map: Record<string, string> = {
    'Meat & Seafood': 'bg-brand-orange',
    'Dairy & Eggs': 'bg-yellow-300',
    'Produce': 'bg-brand-glight',
    'Frozen Foods': 'bg-cyan-400',
    'Bakery & Deli': 'bg-amber-400',
    'Beverages': 'bg-brand-green',
    'Snacks & Sweets': 'bg-pink-400',
    'Pantry & Grocery': 'bg-orange-400',
    'Household & Cleaning': 'bg-teal-400',
    'Health & Personal Care': 'bg-purple-400',
    'Boat Supplies': 'bg-brand-gmed',
  };
  return map[category] ?? 'bg-gray-300';
}
