'use client';
// src/app/admin/products/page.tsx
import { useState, useCallback, useEffect, useRef } from 'react';
import { Upload, Package, AlertCircle, CheckCircle2, Loader2,
         Search, Pencil, Check, X, ToggleLeft, ToggleRight,
         ChevronLeft, ChevronRight, RefreshCw, Plus } from 'lucide-react';
import { normalizeCategory, formatCurrency } from '@/lib/utils';
import { Product } from '@/types';
import { useRouter } from 'next/navigation';

const ADMIN_TOKEN_KEY = 'grafton_admin_token';

interface ParsedProduct {
  category: string; sub_category: string; upc: string | null;
  description: string; pkg_size: string | null; uom: string | null;
  price: number; is_active: boolean;
}

function parsePrice(raw: string): number {
  if (!raw) return 0;
  const n = parseFloat(raw.toString().replace(/[$,\s]/g, ''));
  return isNaN(n) ? 0 : n;
}

function parseRow(headers: string[], values: string[]): ParsedProduct | null {
  const row: Record<string, string> = {};
  headers.forEach((h, i) => { row[h.toLowerCase().trim()] = (values[i] || '').trim(); });
  const description = row['description'] || row['item description'] || row['item name'] || row['name'] || '';
  if (!description) return null;
  const rawCategory = row['category'] || row['cat'] || row['department'] || row['dept'] || 'General';
  const subCategory = row['sub_category'] || row['sub category'] || row['subcategory'] || rawCategory;
  return {
    category: normalizeCategory(rawCategory),
    sub_category: subCategory || rawCategory,
    upc: row['upc'] || row['barcode'] || null,
    description,
    pkg_size: row['pkg_size'] || row['pkg size'] || row['pack size'] || row['size'] || null,
    uom: row['uom'] || row['unit'] || row['unit of measure'] || null,
    price: parsePrice(row['price'] || row['unit price'] || row['cost'] || '0'),
    is_active: true,
  };
}

interface EditState {
  description: string;
  category: string;
  sub_category: string;
  pkg_size: string;
  uom: string;
  price: string;
}

function EditableRow({ product, adminToken, onSaved, onToggle }: {
  product: Product;
  adminToken: string;
  onSaved: (p: Product) => void;
  onToggle: (p: Product) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<EditState>({
    description: product.description,
    category: product.category,
    sub_category: product.sub_category || '',
    pkg_size: product.pkg_size || '',
    uom: product.uom || '',
    price: product.price.toFixed(2),
  });

  async function save() {
    setSaving(true);
    const res = await fetch('/api/products', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken },
      body: JSON.stringify({
        id: product.id,
        description: form.description,
        category: form.category,
        sub_category: form.sub_category,
        pkg_size: form.pkg_size || null,
        uom: form.uom || null,
        price: parseFloat(form.price) || 0,
      }),
    });
    if (res.ok) {
      const { product: updated } = await res.json();
      onSaved(updated);
      setEditing(false);
    }
    setSaving(false);
  }

  if (editing) {
    return (
      <tr className="bg-blue-50 border-b border-blue-100">
        <td className="px-3 py-2">
          <input className="input-base text-xs py-1 w-full" value={form.category}
            onChange={e => setForm(f => ({ ...f, category: e.target.value }))} />
        </td>
        <td className="px-3 py-2">
          <input className="input-base text-xs py-1 w-full" value={form.sub_category}
            onChange={e => setForm(f => ({ ...f, sub_category: e.target.value }))} />
        </td>
        <td className="px-3 py-2">
          <input className="input-base text-xs py-1 w-full font-medium" value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
        </td>
        <td className="px-3 py-2">
          <input className="input-base text-xs py-1 w-24" value={form.pkg_size}
            onChange={e => setForm(f => ({ ...f, pkg_size: e.target.value }))} />
        </td>
        <td className="px-3 py-2">
          <input className="input-base text-xs py-1 w-16" value={form.uom}
            onChange={e => setForm(f => ({ ...f, uom: e.target.value }))} />
        </td>
        <td className="px-3 py-2">
          <input className="input-base text-xs py-1 w-20" value={form.price}
            onChange={e => setForm(f => ({ ...f, price: e.target.value }))} />
        </td>
        <td className="px-3 py-2">
          <div className="flex items-center gap-1.5">
            <button onClick={save} disabled={saving}
              className="p-1.5 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            </button>
            <button onClick={() => setEditing(false)}
              className="p-1.5 bg-gray-200 text-gray-600 rounded hover:bg-gray-300">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${!product.is_active ? 'opacity-40' : ''}`}>
      <td className="px-3 py-2.5 text-xs text-brand-river font-medium">{product.category}</td>
      <td className="px-3 py-2.5 text-xs text-gray-400">{product.sub_category}</td>
      <td className="px-3 py-2.5 text-sm font-medium text-brand-navy max-w-xs">
        <span className="line-clamp-1">{product.description}</span>
      </td>
      <td className="px-3 py-2.5 text-xs text-gray-500">{product.pkg_size || '—'}</td>
      <td className="px-3 py-2.5 text-xs text-gray-500">{product.uom || '—'}</td>
      <td className="px-3 py-2.5 text-sm font-bold text-brand-navy">{formatCurrency(product.price)}</td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <button onClick={() => setEditing(true)} title="Edit"
            className="p-1.5 text-gray-400 hover:text-brand-river hover:bg-blue-50 rounded transition-colors">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => onToggle(product)} title={product.is_active ? 'Deactivate' : 'Activate'}
            className={`p-1.5 rounded transition-colors ${product.is_active
              ? 'text-green-500 hover:text-red-500 hover:bg-red-50'
              : 'text-gray-300 hover:text-green-500 hover:bg-green-50'}`}>
            {product.is_active
              ? <ToggleRight className="w-4 h-4" />
              : <ToggleLeft className="w-4 h-4" />}
          </button>
        </div>
      </td>
    </tr>
  );
}

export default function AdminProductsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<'catalog' | 'import'>('catalog');

  // Catalog state
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const searchRef = useRef<ReturnType<typeof setTimeout>>();
  const perPage = 50;

  // Import state
  const [isDragging, setIsDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<ParsedProduct[]>([]);
  const [previewAll, setPreviewAll] = useState<ParsedProduct[]>([]);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const adminToken = typeof window !== 'undefined'
    ? sessionStorage.getItem(ADMIN_TOKEN_KEY) || '' : '';

  useEffect(() => {
    if (!sessionStorage.getItem(ADMIN_TOKEN_KEY)) router.push('/admin');
  }, [router]);

  const fetchProducts = useCallback(async (q = search, p = page) => {
    setLoading(true);
    const params = new URLSearchParams({ search: q, page: String(p), per_page: '50' });
    const res = await fetch(`/api/products?${params}`, {
      headers: { 'x-admin-token': adminToken },
    });
    if (res.ok) {
      const data = await res.json();
      setProducts(data.products || []);
      setTotal(data.total || 0);
    }
    setLoading(false);
  }, [adminToken, search, page]);

  useEffect(() => { fetchProducts(); }, [page]);

  useEffect(() => {
    clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => { setPage(1); fetchProducts(search, 1); }, 350);
  }, [search]);

  async function toggleActive(product: Product) {
    const res = await fetch('/api/products', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken },
      body: JSON.stringify({ id: product.id, is_active: !product.is_active }),
    });
    if (res.ok) {
      setProducts(ps => ps.map(p => p.id === product.id ? { ...p, is_active: !p.is_active } : p));
    }
  }

  function handleSaved(updated: Product) {
    setProducts(ps => ps.map(p => p.id === updated.id ? updated : p));
  }

  // CSV parsing
  function handleFile(file: File) {
    setParsing(true); setResult(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      try {
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        const sep = text.includes('\t') ? '\t' : ',';
        const headers = lines[0].split(sep).map(h => h.replace(/['"]/g, '').toLowerCase().trim());
        const all: ParsedProduct[] = [];
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(sep).map(v => v.replace(/^["']|["']$/g, '').trim());
          const p = parseRow(headers, values);
          if (p && p.description) all.push(p);
        }
        setPreviewAll(all);
        setPreview(all.slice(0, 20));
        setParsing(false);
      } catch (err) {
        setResult({ success: false, message: `Parse error: ${err}` });
        setParsing(false);
      }
    };
    reader.readAsText(file);
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, []);

  async function uploadProducts() {
    if (!previewAll.length) return;
    setUploading(true);
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken },
        body: JSON.stringify({ products: previewAll }),
      });
      if (res.ok) {
        const data = await res.json();
        setResult({ success: true, message: `Successfully imported ${data.count} products.` });
        setPreview([]); setPreviewAll([]);
        setTab('catalog'); fetchProducts('', 1);
      } else {
        const err = await res.json();
        setResult({ success: false, message: err.error || 'Import failed' });
      }
    } finally { setUploading(false); }
  }

  const totalPages = Math.ceil(total / perPage);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-brand-navy">Product Catalog</h1>
          <p className="text-gray-400 text-sm">{total.toLocaleString()} products total</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => fetchProducts()} className="btn-outline text-sm px-3 py-2 flex items-center gap-1.5">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white border border-gray-200 rounded-xl p-1 mb-6 w-fit">
        {[{ key: 'catalog', label: 'Browse & Edit', icon: Package },
          { key: 'import', label: 'Import CSV', icon: Upload }].map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key as any)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === key ? 'bg-brand-navy text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {/* ── CATALOG TAB ── */}
      {tab === 'catalog' && (
        <div className="card-base overflow-hidden">
          {/* Search bar */}
          <div className="p-4 border-b border-gray-100">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="search" placeholder="Search products…" value={search}
                onChange={e => setSearch(e.target.value)}
                className="input-base pl-9 text-sm" />
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-brand-river" />
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-16">
              <Package className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-gray-400">No products found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-brand-navy text-left">
                    {['Category', 'Sub-Category', 'Description', 'Pack Size', 'UOM', 'Price', 'Actions'].map(h => (
                      <th key={h} className="px-3 py-3 text-xs font-bold text-brand-sky uppercase tracking-wide whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {products.map(product => (
                    <EditableRow
                      key={product.id}
                      product={product}
                      adminToken={adminToken}
                      onSaved={handleSaved}
                      onToggle={toggleActive}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
              <p className="text-xs text-gray-400">
                Showing {((page - 1) * perPage) + 1}–{Math.min(page * perPage, total)} of {total.toLocaleString()}
              </p>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                  className="p-1.5 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                  className="p-1.5 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── IMPORT TAB ── */}
      {tab === 'import' && (
        <div className="space-y-6">
          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
              isDragging ? 'border-brand-river bg-blue-50' : 'border-gray-300 bg-white'}`}>
            <Upload className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="font-display text-lg font-bold text-brand-navy mb-2">
              Drop your CSV/TSV file here
            </h3>
            <p className="text-gray-400 text-sm mb-4">Supports .csv and .tsv files. Headers auto-detected.</p>
            <label className="btn-outline cursor-pointer inline-block">
              Browse File
              <input type="file" accept=".csv,.tsv,.txt" className="hidden"
                onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
            </label>
            <p className="text-xs text-gray-300 mt-4">
              Expected columns: category, sub_category, upc, description, pkg_size, uom, price
            </p>
          </div>

          {/* Status messages */}
          {parsing && (
            <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg">
              <Loader2 className="w-5 h-5 text-brand-river animate-spin" />
              <p className="text-sm text-brand-river">Parsing file…</p>
            </div>
          )}
          {result && (
            <div className={`flex items-center gap-3 p-4 rounded-lg ${
              result.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
              {result.success
                ? <CheckCircle2 className="w-5 h-5 text-green-500" />
                : <AlertCircle className="w-5 h-5 text-red-500" />}
              <p className={`text-sm font-medium ${result.success ? 'text-green-700' : 'text-red-700'}`}>
                {result.message}
              </p>
            </div>
          )}

          {/* Preview */}
          {preview.length > 0 && (
            <div className="card-base overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h2 className="font-display text-lg font-bold text-brand-navy">
                    Preview — {previewAll.length.toLocaleString()} rows detected
                  </h2>
                  <p className="text-gray-400 text-xs mt-0.5">Showing first 20 rows</p>
                </div>
                <button onClick={uploadProducts} disabled={uploading}
                  className="btn-gold text-sm flex items-center gap-2">
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  {uploading ? 'Importing…' : `Import All ${previewAll.length.toLocaleString()} Products`}
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left">
                      {['Category', 'Description', 'Pack Size', 'UOM', 'Price'].map(h => (
                        <th key={h} className="px-3 py-2 text-xs font-bold text-gray-500 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {preview.map((p, i) => (
                      <tr key={i} className={i % 2 === 0 ? '' : 'bg-gray-50'}>
                        <td className="px-3 py-2 text-xs text-brand-river">{p.category}</td>
                        <td className="px-3 py-2 font-medium text-brand-navy max-w-xs truncate">{p.description}</td>
                        <td className="px-3 py-2 text-xs text-gray-500">{p.pkg_size || '—'}</td>
                        <td className="px-3 py-2 text-xs text-gray-500">{p.uom || '—'}</td>
                        <td className="px-3 py-2 font-bold text-brand-navy">
                          {p.price > 0 ? `$${p.price.toFixed(2)}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Format guide */}
          <div className="card-base p-6">
            <h3 className="font-display text-base font-bold text-brand-navy mb-3">CSV Format Guide</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {[
                { field: 'category', aliases: 'category, cat, department' },
                { field: 'sub_category', aliases: 'sub_category, subcategory' },
                { field: 'upc', aliases: 'upc, barcode' },
                { field: 'description', aliases: 'description, item description, name' },
                { field: 'pkg_size', aliases: 'pkg_size, pack size, size' },
                { field: 'uom', aliases: 'uom, unit, unit of measure' },
                { field: 'price', aliases: 'price, unit price, cost' },
              ].map(({ field, aliases }) => (
                <div key={field} className="bg-gray-50 rounded-lg p-3">
                  <p className="font-mono text-xs font-bold text-brand-steel mb-1">{field}</p>
                  <p className="text-xs text-gray-400">{aliases}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
