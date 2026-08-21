'use client';
// src/components/catalog/SearchBar.tsx
//
// INSTANT SEARCH for the barge order form.
//
// Built for the actual users: cooks and captains on towboats with weak river
// cell service. The ~1,100-item order form is downloaded ONCE and cached, so
// every keystroke is answered on-device — no network, no lag, and it keeps
// working if the signal drops mid-order. Crews can add straight from the
// results without ever loading another page.
//
// The full ~20k Sinclair's store stays on server search ("see all results"),
// since shipping that to a phone would defeat the point.

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { Search, X, Loader2, Plus, Check, WifiOff, CornerDownLeft } from 'lucide-react';
import { buildIndex, searchProducts, type SearchProduct, type IndexedProduct } from '@/lib/product-search';
import { formatCurrency, productDisplayName } from '@/lib/utils';
import { addToCart } from '@/lib/cart';
import { useToast } from '@/hooks/use-toast';

interface SearchBarProps { initialSearch: string; }

const CACHE_KEY = 'gts_search_index_v1';

export function SearchBar({ initialSearch }: SearchBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [value, setValue] = useState(initialSearch);
  const [index, setIndex] = useState<IndexedProduct[] | null>(null);
  const [indexError, setIndexError] = useState(false);
  const [open, setOpen] = useState(false);
  // -1 = NOTHING SELECTED. Starting at 0 meant the first result was always
  // "selected" without the user ever choosing it, so pressing Enter after
  // typing silently added that item to the cart — searching "soap" put Dawn
  // Dish Soap in the order. Enter now searches; it only adds once you have
  // deliberately moved onto a row with the arrow keys or the mouse.
  const [active, setActive] = useState(-1);
  const [added, setAdded] = useState<string | null>(null);

  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setValue(initialSearch); }, [initialSearch]);

  // ── Load the index once (session-cached), then search is free forever ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cached = sessionStorage.getItem(CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached) as SearchProduct[];
          if (!cancelled && Array.isArray(parsed) && parsed.length) {
            setIndex(buildIndex(parsed));
            return;
          }
        }
      } catch { /* cache unreadable — fall through to fetch */ }
      try {
        const res = await fetch('/api/search-index');
        if (!res.ok) throw new Error('index fetch failed');
        const { products } = await res.json();
        if (cancelled) return;
        setIndex(buildIndex(products as SearchProduct[]));
        try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(products)); } catch { /* quota — fine */ }
      } catch {
        if (!cancelled) setIndexError(true);   // fall back to server search
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const results = useMemo(
    () => (index && value.trim() ? searchProducts(index, value, 12) : []),
    [index, value],
  );

  // ── Server search — the "see everything, including the full store" path ──
  const submitToServer = useCallback((term: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (term) { params.set('search', term); params.delete('category'); }
    else params.delete('search');
    params.delete('page');
    setOpen(false);
    router.push(`/catalog?${params.toString()}`);
  }, [router, searchParams]);

  // Close on outside click
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  function quickAdd(p: SearchProduct) {
    addToCart({
      product_id: p.id,
      description: productDisplayName(p as never),
      category: p.category,
      pkg_size: p.pkg_size,
      uom: p.uom,
      price: p.price,
      quantity: 1,
      billed_by_weight: !!p.billed_by_weight,
      quantity_step: p.quantity_step ?? null,
      image_url: p.image_url,
      paid_by: 'vessel',
    });
    setAdded(p.id);
    toast({ title: 'Added to cart', description: `1× ${productDisplayName(p as never)}`, variant: 'success', duration: 1800 });
    setTimeout(() => setAdded(a => (a === p.id ? null : a)), 1400);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter') && results.length) { setOpen(true); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(i - 1, -1)); }
    else if (e.key === 'Escape') { setOpen(false); setActive(-1); inputRef.current?.blur(); }
    else if (e.key === 'Enter') {
      // Only add when a row is genuinely selected (active > -1). Otherwise
      // Enter does what Enter in a search box should do: search.
      const hit = active >= 0 ? results[active] : undefined;
      if (open && hit) { e.preventDefault(); quickAdd(hit); }
      else { setOpen(false); submitToServer(value); }
    }
  }

  const showPanel = open && !!value.trim() && !!index;

  return (
    <div ref={boxRef} className="relative max-w-2xl">
      <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none">
        {index === null && !indexError
          ? <Loader2 className="w-4 h-4 text-gray-300 animate-spin" />
          : <Search className="w-4 h-4 text-gray-400" />}
      </div>
      {/* type="text", NOT "search": type="search" makes the browser render its
          OWN clear button, which sat next to our custom X below — two × icons
          side by side, one of which we can't style or control. */}
      <input
        ref={inputRef}
        type="text"
        value={value}
        // setActive(-1) on every keystroke: arrowing to a row and then typing
        // more would otherwise leave a stale row armed, and Enter would add
        // something the user is no longer looking at.
        onChange={e => { setValue(e.target.value); setActive(-1); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Search groceries & supplies (beef, coffee, paper towels…)"
        className="input-base pl-11 pr-10 py-3.5 text-sm rounded-xl shadow-sm border-gray-200 focus:shadow-md transition-shadow"
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={showPanel}
      />
      {value && (
        <button onClick={() => { setValue(''); setOpen(false); submitToServer(''); }}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 transition-colors"
          aria-label="Clear search">
          <X className="w-4 h-4" />
        </button>
      )}

      {/* ── Instant results ── */}
      {showPanel && (
        <div className="absolute z-40 mt-2 w-full bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
          {results.length === 0 ? (
            <div className="p-4 text-center">
              <p className="text-sm text-gray-500">Nothing on the order form matches &ldquo;{value}&rdquo;</p>
              <button onClick={() => submitToServer(value)}
                className="mt-2 text-xs font-bold text-brand-river hover:underline">
                Search the full Sinclair&apos;s store →
              </button>
            </div>
          ) : (
            <>
              <ul className="max-h-[22rem] overflow-y-auto divide-y divide-gray-50">
                {results.map((p, i) => (
                  <li key={p.id}>
                    <div
                      onMouseEnter={() => setActive(i)}
                      className={`flex items-center gap-3 px-3 py-2 ${i === active ? 'bg-brand-sand/40' : ''}`}
                    >
                      <div className="relative w-10 h-10 bg-white border border-gray-100 rounded-lg overflow-hidden shrink-0">
                        {p.image_url
                          ? <Image src={p.image_url} alt="" fill className="object-contain p-0.5" unoptimized />
                          : <span className="absolute inset-0 flex items-center justify-center text-[9px] text-gray-300">no photo</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-brand-navy truncate">{productDisplayName(p as never)}</p>
                        <p className="text-[11px] text-gray-400 truncate">
                          {p.category}{p.pkg_size ? ` · ${p.pkg_size}` : ''} · {formatCurrency(p.price)}
                          {p.billed_by_weight ? '/lb' : ''}
                        </p>
                      </div>
                      <button onClick={() => quickAdd(p)}
                        className={`shrink-0 flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-lg transition-colors ${
                          added === p.id ? 'bg-green-500 text-white' : 'bg-brand-green text-white hover:bg-brand-gmed'
                        }`}>
                        {added === p.id ? <><Check className="w-3 h-3" /> Added</> : <><Plus className="w-3 h-3" /> Add</>}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-50 border-t border-gray-100">
                <span className="text-[10px] text-gray-400 flex items-center gap-1">
                  <CornerDownLeft className="w-3 h-3" /> Enter searches · ↑↓ then Enter adds
                </span>
                <button onClick={() => submitToServer(value)}
                  className="text-[11px] font-bold text-brand-river hover:underline">
                  See all results →
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Offline / index unavailable — server search still works */}
      {indexError && value.trim() && (
        <p className="absolute -bottom-5 left-1 text-[10px] text-amber-600 flex items-center gap-1">
          <WifiOff className="w-3 h-3" /> Instant search unavailable — press Enter to search.
        </p>
      )}
    </div>
  );
}
