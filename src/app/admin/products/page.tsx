'use client';
// src/app/admin/products/page.tsx
import { useState, useCallback, useEffect, useRef } from 'react';
import { Upload, Package, AlertCircle, CheckCircle2, Loader2,
         Search, Pencil, Check, X, ToggleLeft, ToggleRight,
         ChevronLeft, ChevronRight, RefreshCw, Plus, Lock,
         Download, Trash2, Layers, PackageX, PackageCheck, Filter } from 'lucide-react';
import { normalizeCategory, formatCurrency, MAIN_CATEGORIES } from '@/lib/utils';
import { Product } from '@/types';
import { useRouter } from 'next/navigation';
import { fetchAdminSession, getAdminRole, canAccess, adminFetch } from '@/lib/admin-auth';

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

const CATEGORIES = [...MAIN_CATEGORIES];

const STATUS_FILTERS: { key: string; label: string }[] = [
  { key: '', label: 'All Statuses' },
  { key: 'active', label: 'Active' },
  { key: 'inactive', label: 'Inactive (hidden)' },
  { key: 'available', label: 'In Stock' },
  { key: 'unavailable', label: 'Out of Stock' },
];

interface EditState {
  description: string;
  category: string;
  sub_category: string;
  pkg_size: string;
  uom: string;
  price: string;
}

function AddProductRow({ onAdded }: {
  onAdded: (p: Product) => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    description: '', category: 'Pantry & Grocery', sub_category: '',
    pkg_size: '', uom: '', price: '',
  });
  const descRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (open) descRef.current?.focus(); }, [open]);

  function reset() { setForm({ description: '', category: 'Pantry & Grocery', sub_category: '', pkg_size: '', uom: '', price: '' }); setOpen(false); }

  async function save() {
    if (!form.description || !form.price) return;
    setSaving(true);
    const res = await adminFetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'add_anyway',
        products: [{
          description: form.description.toUpperCase(),
          category: form.category,
          sub_category: form.sub_category || form.category,
          pkg_size: form.pkg_size || null,
          uom: form.uom || null,
          price: parseFloat(form.price) || 0,
          is_active: true,
          is_available: true,
          upc: null,
        }],
      }),
    });
    if (res.ok) {
      reset();
      // Fetch the newly added product to get its ID
      const listRes = await adminFetch(`/api/products?search=${encodeURIComponent(form.description)}&per_page=1`);
      if (listRes.ok) {
        const data = await listRes.json();
        if (data.products?.[0]) onAdded(data.products[0]);
      }
    }
    setSaving(false);
  }

  if (!open) {
    return (
      <tr>
        <td colSpan={8} className="px-3 py-2 border-b border-dashed border-gray-200">
          <button onClick={() => setOpen(true)}
            className="flex items-center gap-2 text-sm text-brand-river hover:text-brand-navy font-medium transition-colors w-full py-1">
            <Plus className="w-4 h-4" /> Add new product
          </button>
        </td>
      </tr>
    );
  }

  return (
    <tr className="bg-green-50 border-b border-green-200">
      <td className="px-2 py-2"></td>
      <td className="px-2 py-2">
        <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value, sub_category: '' }))}
          className="input-base text-xs py-1.5 w-full">
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </td>
      <td className="px-2 py-2">
        <input className="input-base text-xs py-1.5 w-full" placeholder="Sub-category"
          value={form.sub_category} onChange={e => setForm(f => ({ ...f, sub_category: e.target.value }))} />
      </td>
      <td className="px-2 py-2">
        <input ref={descRef} className="input-base text-xs py-1.5 w-full font-medium"
          placeholder="Product name (required)" value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') reset(); }} />
      </td>
      <td className="px-2 py-2">
        <input className="input-base text-xs py-1.5 w-24" placeholder="e.g. 48 OZ"
          value={form.pkg_size} onChange={e => setForm(f => ({ ...f, pkg_size: e.target.value }))} />
      </td>
      <td className="px-2 py-2">
        <input className="input-base text-xs py-1.5 w-16" placeholder="e.g. CS"
          value={form.uom} onChange={e => setForm(f => ({ ...f, uom: e.target.value }))} />
      </td>
      <td className="px-2 py-2">
        <input className="input-base text-xs py-1.5 w-20" placeholder="0.00" type="number" min="0" step="0.01"
          value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') reset(); }} />
      </td>
      <td className="px-2 py-2">
        <div className="flex items-center gap-1.5">
          <button onClick={save} disabled={saving || !form.description || !form.price}
            className="p-1.5 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-40 transition-colors">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          </button>
          <button onClick={reset} className="p-1.5 bg-gray-200 text-gray-600 rounded hover:bg-gray-300 transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function EditableRow({ product, selected, onSelect, onSaved, onToggleActive, onToggleAvailable }: {
  product: Product;
  selected: boolean;
  onSelect: (id: string, checked: boolean) => void;
  onSaved: (p: Product) => void;
  onToggleActive: (p: Product) => void;
  onToggleAvailable: (p: Product) => void;
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
    const res = await adminFetch('/api/products', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
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
        <td className="px-3 py-2"></td>
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
      <td className="px-3 py-2.5">
        <input type="checkbox" checked={selected}
          onChange={e => onSelect(product.id, e.target.checked)}
          className="w-4 h-4 rounded border-gray-300 text-brand-river focus:ring-brand-river" />
      </td>
      <td className="px-3 py-2.5 text-xs text-brand-river font-medium">{product.category}</td>
      <td className="px-3 py-2.5 text-xs text-gray-400">{product.sub_category}</td>
      <td className="px-3 py-2.5 text-sm font-medium text-brand-navy max-w-xs">
        <span className="line-clamp-1">{product.description}</span>
        <div className="flex items-center gap-1.5 mt-0.5">
          {!product.is_active && (
            <span className="inline-block text-[10px] font-bold uppercase tracking-wide text-gray-400 bg-gray-100 rounded px-1.5 py-0.5">Inactive</span>
          )}
          {!product.is_available && (
            <span className="inline-block text-[10px] font-bold uppercase tracking-wide text-red-500 bg-red-50 rounded px-1.5 py-0.5">Out of Stock</span>
          )}
        </div>
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
          <button onClick={() => onToggleAvailable(product)}
            title={product.is_available ? 'Mark Out of Stock' : 'Mark In Stock'}
            className={`p-1.5 rounded transition-colors ${product.is_available
              ? 'text-blue-400 hover:text-red-500 hover:bg-red-50'
              : 'text-red-400 hover:text-blue-500 hover:bg-blue-50'}`}>
            {product.is_available
              ? <PackageCheck className="w-4 h-4" />
              : <PackageX className="w-4 h-4" />}
          </button>
          <button onClick={() => onToggleActive(product)} title={product.is_active ? 'Deactivate' : 'Activate'}
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

interface ImportSummary {
  total: number;
  new_items: number;
  strong_duplicates: number;
  weak_duplicates: number;
}

type ImportMode = 'skip_duplicates' | 'update_duplicates' | 'add_anyway';

export default function AdminProductsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<'catalog' | 'import' | 'duplicates'>('catalog');

  // Catalog state
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const searchRef = useRef<ReturnType<typeof setTimeout>>();
  const perPage = 50;

  // Selection state
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkCategory, setBulkCategory] = useState('');

  // Import state
  const [isDragging, setIsDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewAll, setPreviewAll] = useState<ParsedProduct[]>([]);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>('skip_duplicates');
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  // Duplicates tab state
  const [dupGroups, setDupGroups] = useState<any[]>([]);
  const [dupLoading, setDupLoading] = useState(false);
  const [dupSelected, setDupSelected] = useState<Set<string>>(new Set());
  const [dupFilter, setDupFilter] = useState<'all' | 'upc' | 'name_pack'>('all');

  const [denied, setDenied] = useState(false);
  const role = typeof window !== 'undefined' ? getAdminRole() : null;

  // Auth guard — verify the session cookie with the server
  useEffect(() => {
    (async () => {
      const session = await fetchAdminSession();
      if (!session) { router.push('/admin'); return; }
      if (!canAccess(session.role, 'products')) { setDenied(true); return; }
    })();
  }, [router]);

  const fetchProducts = useCallback(async (q = search, p = page, cat = category, st = status) => {
    setLoading(true);
    const params = new URLSearchParams({ search: q, page: String(p), per_page: '50' });
    if (cat) params.set('category', cat);
    if (st) params.set('status', st);
    const res = await adminFetch(`/api/products?${params}`);
    if (res.ok) {
      const data = await res.json();
      setProducts(data.products || []);
      setTotal(data.total || 0);
    }
    setLoading(false);
  }, [search, page, category, status]);

  useEffect(() => { fetchProducts(); }, [page, category, status]);

  useEffect(() => {
    clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => { setPage(1); fetchProducts(search, 1, category, status); }, 350);
  }, [search]);

  // Clear selection whenever the visible product list changes
  useEffect(() => { setSelected(new Set()); }, [products]);

  async function toggleActive(product: Product) {
    const res = await adminFetch('/api/products', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: product.id, is_active: !product.is_active }),
    });
    if (res.ok) {
      setProducts(ps => ps.map(p => p.id === product.id ? { ...p, is_active: !p.is_active } : p));
    }
  }

  async function toggleAvailable(product: Product) {
    const res = await adminFetch('/api/products', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: product.id, is_available: !product.is_available }),
    });
    if (res.ok) {
      setProducts(ps => ps.map(p => p.id === product.id ? { ...p, is_available: !p.is_available } : p));
    }
  }

  function handleSaved(updated: Product) {
    setProducts(ps => ps.map(p => p.id === updated.id ? updated : p));
  }

  function handleAdded(newProduct: Product) {
    setProducts(ps => [newProduct, ...ps]);
    setTotal(t => t + 1);
  }

  function toggleSelect(id: string, checked: boolean) {
    setSelected(prev => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  }

  function toggleSelectAll(checked: boolean) {
    setSelected(checked ? new Set(products.map(p => p.id)) : new Set());
  }

  // ── Bulk actions on the catalog tab ──
  async function bulkDelete() {
    if (!selected.size) return;
    if (!confirm(`Delete ${selected.size} selected product${selected.size === 1 ? '' : 's'}? This cannot be undone.`)) return;
    setBulkBusy(true);
    const res = await adminFetch('/api/products', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: Array.from(selected) }),
    });
    if (res.ok) {
      setProducts(ps => ps.filter(p => !selected.has(p.id)));
      setTotal(t => Math.max(0, t - selected.size));
      setSelected(new Set());
    }
    setBulkBusy(false);
  }

  async function bulkUpdate(updates: Record<string, any>) {
    if (!selected.size) return;
    setBulkBusy(true);
    const res = await adminFetch('/api/products', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: Array.from(selected), updates }),
    });
    if (res.ok) {
      setProducts(ps => ps.map(p => selected.has(p.id) ? { ...p, ...updates } : p));
    }
    setBulkBusy(false);
  }

  async function exportCatalog() {
    const res = await adminFetch('/api/products/export');
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `grafton-towboat-catalog-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // ── CSV parsing ──
  function handleFile(file: File) {
    setParsing(true); setResult(null); setImportSummary(null); setPreviewAll([]);
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
        setParsing(false);
        analyzeImport(all);
      } catch (err) {
        setResult({ success: false, message: `Parse error: ${err}` });
        setParsing(false);
      }
    };
    reader.readAsText(file);
  }

  async function analyzeImport(rows: ParsedProduct[]) {
    if (!rows.length) return;
    setAnalyzing(true);
    try {
      const res = await adminFetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'preview', products: rows }),
      });
      if (res.ok) {
        const data = await res.json();
        setImportSummary(data.summary);
        // Default mode: if there are duplicates, default to skipping them
        if (data.summary.strong_duplicates + data.summary.weak_duplicates > 0) {
          setImportMode('skip_duplicates');
        } else {
          setImportMode('add_anyway');
        }
      }
    } finally {
      setAnalyzing(false);
    }
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
      const res = await adminFetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products: previewAll, mode: importMode }),
      });
      if (res.ok) {
        const data = await res.json();
        const parts: string[] = [];
        if (data.inserted) parts.push(`${data.inserted} added`);
        if (data.updated) parts.push(`${data.updated} updated`);
        if (data.skipped) parts.push(`${data.skipped} skipped`);
        setResult({ success: true, message: `Import complete — ${parts.join(', ') || 'no changes'}.` });
        setPreviewAll([]); setImportSummary(null);
        setTab('catalog'); fetchProducts('', 1, category, status);
      } else {
        const err = await res.json();
        setResult({ success: false, message: err.error || 'Import failed' });
      }
    } finally { setUploading(false); }
  }

  // ── Duplicates review tab ──
  const fetchDuplicates = useCallback(async () => {
    setDupLoading(true);
    setDupSelected(new Set());
    const res = await adminFetch('/api/products/duplicates');
    if (res.ok) {
      const data = await res.json();
      setDupGroups(data.groups || []);
    }
    setDupLoading(false);
  }, []);

  useEffect(() => { if (tab === 'duplicates') fetchDuplicates(); }, [tab, fetchDuplicates]);

  function toggleDupSelect(id: string, checked: boolean) {
    setDupSelected(prev => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  }

  async function deleteDupSelected() {
    if (!dupSelected.size) return;
    if (!confirm(`Delete ${dupSelected.size} selected duplicate item${dupSelected.size === 1 ? '' : 's'}? This cannot be undone.`)) return;
    setDupLoading(true);
    const res = await adminFetch('/api/products', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: Array.from(dupSelected) }),
    });
    if (res.ok) {
      await fetchDuplicates();
      fetchProducts();
    } else {
      setDupLoading(false);
    }
  }

  const filteredDupGroups = dupGroups.filter(g => dupFilter === 'all' || g.type === dupFilter);

  const totalPages = Math.ceil(total / perPage);
  const allSelectedOnPage = products.length > 0 && products.every(p => selected.has(p.id));

  if (denied) return (
    <div className="flex flex-col items-center justify-center py-32 text-center px-4">
      <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mb-4">
        <Lock className="w-6 h-6 text-red-400" />
      </div>
      <h2 className="font-bold text-brand-navy text-lg mb-1">Access Restricted</h2>
      <p className="text-gray-400 text-sm max-w-xs">
        Staff accounts can view orders only. Contact a manager or owner for product catalog access.
      </p>
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-brand-navy">Product Catalog</h1>
          <p className="text-gray-400 text-sm">{total.toLocaleString()} products total</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportCatalog} className="btn-outline text-sm px-3 py-2 flex items-center gap-1.5">
            <Download className="w-4 h-4" /> Export CSV
          </button>
          <button onClick={() => fetchProducts()} className="btn-outline text-sm px-3 py-2 flex items-center gap-1.5">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white border border-gray-200 rounded-xl p-1 mb-6 w-fit">
        {[{ key: 'catalog', label: 'Browse & Edit', icon: Package },
          { key: 'import', label: 'Import CSV', icon: Upload },
          { key: 'duplicates', label: 'Duplicates', icon: Layers }].map(({ key, label, icon: Icon }) => (
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
          {/* Search + filters */}
          <div className="p-4 border-b border-gray-100 flex flex-wrap items-center gap-3">
            <div className="relative max-w-md flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="search" placeholder="Search by name or UPC…" value={search}
                onChange={e => setSearch(e.target.value)}
                className="input-base pl-9 text-sm w-full" />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-400" />
              <select value={category} onChange={e => { setCategory(e.target.value); setPage(1); }}
                className="input-base text-sm py-2">
                <option value="">All Categories</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}
                className="input-base text-sm py-2">
                {STATUS_FILTERS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
          </div>

          {/* Bulk action bar */}
          {selected.size > 0 && (
            <div className="px-4 py-3 bg-brand-sand/40 border-b border-gray-100 flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-brand-navy mr-2">
                {selected.size} selected
              </span>
              <button onClick={() => bulkUpdate({ is_active: true })} disabled={bulkBusy}
                className="btn-outline text-xs px-3 py-1.5 flex items-center gap-1.5">
                <ToggleRight className="w-3.5 h-3.5" /> Activate
              </button>
              <button onClick={() => bulkUpdate({ is_active: false })} disabled={bulkBusy}
                className="btn-outline text-xs px-3 py-1.5 flex items-center gap-1.5">
                <ToggleLeft className="w-3.5 h-3.5" /> Deactivate
              </button>
              <button onClick={() => bulkUpdate({ is_available: true })} disabled={bulkBusy}
                className="btn-outline text-xs px-3 py-1.5 flex items-center gap-1.5">
                <PackageCheck className="w-3.5 h-3.5" /> Mark In Stock
              </button>
              <button onClick={() => bulkUpdate({ is_available: false })} disabled={bulkBusy}
                className="btn-outline text-xs px-3 py-1.5 flex items-center gap-1.5">
                <PackageX className="w-3.5 h-3.5" /> Mark Out of Stock
              </button>
              <div className="flex items-center gap-1.5">
                <select value={bulkCategory} onChange={e => setBulkCategory(e.target.value)}
                  className="input-base text-xs py-1.5">
                  <option value="">Set category…</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <button onClick={() => bulkCategory && bulkUpdate({ category: bulkCategory })}
                  disabled={bulkBusy || !bulkCategory}
                  className="btn-outline text-xs px-3 py-1.5 disabled:opacity-40">
                  Apply
                </button>
              </div>
              <button onClick={bulkDelete} disabled={bulkBusy}
                className="ml-auto text-xs px-3 py-1.5 rounded font-medium bg-red-50 text-red-600 hover:bg-red-100 flex items-center gap-1.5 transition-colors">
                {bulkBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Delete Selected
              </button>
            </div>
          )}

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
                    <th className="px-3 py-3">
                      <input type="checkbox" checked={allSelectedOnPage}
                        onChange={e => toggleSelectAll(e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300" />
                    </th>
                    {['Category', 'Sub-Category', 'Description', 'Pack Size', 'UOM', 'Price', 'Actions'].map(h => (
                      <th key={h} className="px-3 py-3 text-xs font-bold text-brand-sky uppercase tracking-wide whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <AddProductRow onAdded={handleAdded} />
                  {products.map(product => (
                    <EditableRow
                      key={product.id}
                      product={product}
                      selected={selected.has(product.id)}
                      onSelect={toggleSelect}
                      onSaved={handleSaved}
                      onToggleActive={toggleActive}
                      onToggleAvailable={toggleAvailable}
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
          {analyzing && (
            <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg">
              <Loader2 className="w-5 h-5 text-brand-river animate-spin" />
              <p className="text-sm text-brand-river">Checking for duplicates…</p>
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

          {/* Import summary + duplicate handling */}
          {importSummary && !analyzing && (
            <div className="card-base overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="font-display text-lg font-bold text-brand-navy">
                  Import Summary — {importSummary.total.toLocaleString()} rows detected
                </h2>
              </div>
              <div className="p-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-green-50 rounded-lg p-4">
                  <p className="text-2xl font-bold text-green-600">{importSummary.new_items.toLocaleString()}</p>
                  <p className="text-xs text-green-700 mt-1">New items will be added</p>
                </div>
                <div className="bg-amber-50 rounded-lg p-4">
                  <p className="text-2xl font-bold text-amber-600">{importSummary.strong_duplicates.toLocaleString()}</p>
                  <p className="text-xs text-amber-700 mt-1">Potential duplicates (UPC + Price match)</p>
                </div>
                <div className="bg-orange-50 rounded-lg p-4">
                  <p className="text-2xl font-bold text-orange-600">{importSummary.weak_duplicates.toLocaleString()}</p>
                  <p className="text-xs text-orange-700 mt-1">Items with matching name/pack/price but different UPC</p>
                </div>
              </div>

              {(importSummary.strong_duplicates + importSummary.weak_duplicates > 0) && (
                <div className="px-6 pb-2">
                  <p className="text-sm font-semibold text-brand-navy mb-2">How should duplicates be handled?</p>
                  <div className="space-y-2">
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input type="radio" name="importMode" className="mt-1"
                        checked={importMode === 'skip_duplicates'}
                        onChange={() => setImportMode('skip_duplicates')} />
                      <span className="text-sm text-gray-600">
                        <span className="font-medium text-brand-navy">Skip all duplicates</span> — only add the {importSummary.new_items.toLocaleString()} new items
                      </span>
                    </label>
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input type="radio" name="importMode" className="mt-1"
                        checked={importMode === 'update_duplicates'}
                        onChange={() => setImportMode('update_duplicates')} />
                      <span className="text-sm text-gray-600">
                        <span className="font-medium text-brand-navy">Update existing items</span> — refresh matched items with the new file&apos;s data (e.g. price changes), and add the new items
                      </span>
                    </label>
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input type="radio" name="importMode" className="mt-1"
                        checked={importMode === 'add_anyway'}
                        onChange={() => setImportMode('add_anyway')} />
                      <span className="text-sm text-gray-600">
                        <span className="font-medium text-brand-navy">Add anyway</span> — import everything as new items, even possible duplicates (you can review and merge later in the Duplicates tab)
                      </span>
                    </label>
                  </div>
                </div>
              )}

              <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
                <p className="text-gray-400 text-xs">Nothing has been saved yet — review the summary above before importing.</p>
                <button onClick={uploadProducts} disabled={uploading}
                  className="btn-gold text-sm flex items-center gap-2">
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  {uploading ? 'Importing…' : 'Confirm Import'}
                </button>
              </div>

              {/* Preview rows */}
              <div className="overflow-x-auto border-t border-gray-100">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left">
                      {['Category', 'Description', 'Pack Size', 'UOM', 'Price'].map(h => (
                        <th key={h} className="px-3 py-2 text-xs font-bold text-gray-500 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {previewAll.slice(0, 20).map((p, i) => (
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
                <p className="text-gray-400 text-xs px-3 py-2">Showing first 20 of {previewAll.length.toLocaleString()} rows</p>
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

      {/* ── DUPLICATES TAB ── */}
      {tab === 'duplicates' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-500">Filter:</span>
              {[
                { key: 'all', label: 'All' },
                { key: 'upc', label: 'Same UPC' },
                { key: 'name_pack', label: 'Same Name & Pack Size' },
              ].map(f => (
                <button key={f.key} onClick={() => setDupFilter(f.key as any)}
                  className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                    dupFilter === f.key ? 'bg-brand-navy text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                  {f.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={fetchDuplicates} className="btn-outline text-sm px-3 py-2 flex items-center gap-1.5">
                <RefreshCw className="w-4 h-4" /> Refresh
              </button>
              {dupSelected.size > 0 && (
                <button onClick={deleteDupSelected} disabled={dupLoading}
                  className="text-sm px-3 py-2 rounded font-medium bg-red-50 text-red-600 hover:bg-red-100 flex items-center gap-1.5 transition-colors">
                  <Trash2 className="w-4 h-4" /> Delete {dupSelected.size} Selected
                </button>
              )}
            </div>
          </div>

          {dupLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-brand-river" />
            </div>
          ) : filteredDupGroups.length === 0 ? (
            <div className="card-base text-center py-16">
              <Layers className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-gray-400">No duplicates found</p>
            </div>
          ) : (
            filteredDupGroups.map(group => (
              <div key={group.key} className="card-base overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <p className="text-sm font-semibold text-brand-navy">
                    {group.type === 'upc' ? `Same UPC: ${group.items[0].upc}` : 'Same Name & Pack Size'}
                  </p>
                  <span className="text-xs text-gray-400">{group.items.length} items</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-left">
                        <th className="px-3 py-2"></th>
                        {['UPC', 'Name', 'Pack Size', 'Category', 'Price', 'Status'].map(h => (
                          <th key={h} className="px-3 py-2 text-xs font-bold text-gray-500 uppercase tracking-wide">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {group.items.map((item: any) => (
                        <tr key={item.id} className={dupSelected.has(item.id) ? 'bg-red-50' : ''}>
                          <td className="px-3 py-2">
                            <input type="checkbox" checked={dupSelected.has(item.id)}
                              onChange={e => toggleDupSelect(item.id, e.target.checked)}
                              className="w-4 h-4 rounded border-gray-300 text-brand-river focus:ring-brand-river" />
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-500">{item.upc || '—'}</td>
                          <td className="px-3 py-2 font-medium text-brand-navy max-w-xs truncate">{item.description}</td>
                          <td className="px-3 py-2 text-xs text-gray-500">{item.pkg_size || '—'}</td>
                          <td className="px-3 py-2 text-xs text-brand-river">{item.category}</td>
                          <td className="px-3 py-2 font-bold text-brand-navy">{formatCurrency(item.price)}</td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1">
                              {!item.is_active && (
                                <span className="inline-block text-[10px] font-bold uppercase tracking-wide text-gray-400 bg-gray-100 rounded px-1.5 py-0.5">Inactive</span>
                              )}
                              {!item.is_available && (
                                <span className="inline-block text-[10px] font-bold uppercase tracking-wide text-red-500 bg-red-50 rounded px-1.5 py-0.5">Out of Stock</span>
                              )}
                              {item.is_active && item.is_available && (
                                <span className="inline-block text-[10px] font-bold uppercase tracking-wide text-green-600 bg-green-50 rounded px-1.5 py-0.5">Active</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
