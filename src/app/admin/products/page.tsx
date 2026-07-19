'use client';
// src/app/admin/products/page.tsx
import { useState, useCallback, useEffect, useRef } from 'react';
import { Upload, Package, AlertCircle, CheckCircle2, Loader2,
         Search, Pencil, Check, X, ToggleLeft, ToggleRight,
         ChevronLeft, ChevronRight, RefreshCw, Plus, Lock,
         Download, Trash2, Layers, PackageX, PackageCheck, Filter,
         ImagePlus, Tag, ListOrdered } from 'lucide-react';
import Image from 'next/image';
import { formatCurrency, MAIN_CATEGORIES } from '@/lib/utils';
import { Product } from '@/types';
import { useRouter } from 'next/navigation';
import { fetchAdminSession, canAccess, adminFetch } from '@/lib/admin-auth';
import { ImportWizard } from '@/components/admin/ImportWizard';
import { EnrichFromSinclair } from '@/components/admin/EnrichFromSinclair';


// -- Apply the paper order form's layout (form_section/subsection/seq) to the catalog.
// Barges shop the form top-to-bottom — this stamps that exact sequence onto products.
function ApplyFormLayoutButton({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<null | {
    form_rows: number; matched: number;
    matched_by: { upc: number; desc_pkg: number; desc: number };
    unmatched_count: number;
    unmatched: Array<{ seq: number; description: string; pkg_size: string | null; upc: string | null }>;
  }>(null);

  async function run() {
    setRunning(true); setError('');
    try {
      const res = await adminFetch('/api/admin/apply-form-layout', { method: 'POST' });
      const r = await res.json();
      if (!res.ok) throw new Error(r?.error || 'Apply failed');
      setResult(r);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Apply failed');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="relative">
      <button onClick={() => { setOpen(o => !o); setError(''); }}
        className="btn-outline text-sm px-3 py-2 flex items-center gap-1.5"
        title="Stamp the paper order form's section/sequence onto matched products">
        <ListOrdered className="w-4 h-4" /> Apply Order-Form Layout
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-40 w-[380px] bg-white border border-gray-200 rounded-xl shadow-2xl p-4">
          <div className="flex items-start justify-between gap-3 mb-2">
            <p className="font-bold text-brand-navy text-sm">Order-Form Layout</p>
            <button onClick={() => { setOpen(false); setResult(null); setError(''); }}
              className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
          </div>

          {!result && (
            <>
              <p className="text-xs text-gray-500 leading-relaxed mb-3">
                Stamps every matched product with its position on the paper order form
                (section · subsection · sequence) so barges see items in the exact order
                of the form. Safe to re-run any time the catalog changes.
              </p>
              {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5 mb-2">{error}</p>}
              <button onClick={run} disabled={running}
                className="w-full flex items-center justify-center gap-1.5 bg-brand-navy text-white text-xs font-bold uppercase tracking-wide px-4 py-2.5 rounded-lg hover:bg-brand-steel transition-colors disabled:opacity-60">
                {running ? <><Loader2 className="w-4 h-4 animate-spin" /> Matching catalog…</> : 'Apply Layout Now'}
              </button>
              <p className="text-[10px] text-gray-400 mt-2">
                Also runs automatically after every nightly catalog sync.
              </p>
            </>
          )}

          {result && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-brand-green text-sm font-bold">
                <CheckCircle2 className="w-4 h-4" /> Layout applied
              </div>
              <div className="grid grid-cols-3 gap-1.5 text-center">
                <div className="bg-gray-50 rounded-lg py-1.5">
                  <p className="text-base font-bold text-brand-navy">{result.form_rows}</p>
                  <p className="text-[10px] text-gray-400 uppercase">Form rows</p>
                </div>
                <div className="bg-green-50 rounded-lg py-1.5">
                  <p className="text-base font-bold text-green-700">{result.matched}</p>
                  <p className="text-[10px] text-gray-400 uppercase">Matched</p>
                </div>
                <div className={`rounded-lg py-1.5 ${result.unmatched_count ? 'bg-amber-50' : 'bg-gray-50'}`}>
                  <p className={`text-base font-bold ${result.unmatched_count ? 'text-amber-700' : 'text-gray-400'}`}>{result.unmatched_count}</p>
                  <p className="text-[10px] text-gray-400 uppercase">Unmatched</p>
                </div>
              </div>
              <p className="text-[10px] text-gray-400">
                Matched by: UPC {result.matched_by.upc} · description + pack {result.matched_by.desc_pkg} · description {result.matched_by.desc}
              </p>
              {result.unmatched_count > 0 && (
                <div className="border border-amber-200 bg-amber-50/60 rounded-lg max-h-44 overflow-y-auto divide-y divide-amber-100">
                  {result.unmatched.map(u => (
                    <div key={u.seq} className="px-2.5 py-1.5">
                      <p className="text-[11px] font-semibold text-amber-900">{u.description}</p>
                      <p className="text-[10px] text-amber-700/70">
                        form row #{u.seq}{u.pkg_size ? ` · ${u.pkg_size}` : ''}{u.upc ? ` · UPC ${u.upc}` : ' · no UPC on form'}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              {result.unmatched_count > 0 && (
                <p className="text-[10px] text-gray-400 leading-relaxed">
                  Usually duplicate form rows sharing one UPC (Blue Bell flavors, Coffeemate) or
                  UPC-less items with names that differ from the catalog. Edit those products&apos;
                  names/UPCs to match the form, then re-apply.
                </p>
              )}
              <button onClick={run} disabled={running}
                className="w-full text-xs font-bold text-brand-river hover:text-brand-navy py-1.5">
                {running ? 'Re-running…' : 'Run again'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// -- Shared image upload cell
function ProductImageCell({ productId, imageUrl, onUploaded }: {
  productId: string | null;
  imageUrl: string | null;
  onUploaded: (url: string | null) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(imageUrl);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setPreview(imageUrl); }, [imageUrl]);

  async function handleFile(file: File) {
    if (!productId) { setError('Save the product first, then add an image.'); return; }
    setUploading(true); setError(null);
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    const form = new FormData();
    form.append('file', file);
    const res = await adminFetch(`/api/products/${productId}/image`, { method: 'POST', body: form });
    if (res.ok) {
      const data = await res.json();
      URL.revokeObjectURL(objectUrl);
      setPreview(data.image_url);
      onUploaded(data.image_url);
    } else {
      const err = await res.json().catch(() => ({ error: 'Upload failed' }));
      setError(err.error || 'Upload failed');
      setPreview(imageUrl);
    }
    setUploading(false);
  }

  async function handleRemove(e: React.MouseEvent) {
    e.stopPropagation();
    if (!productId) return;
    setUploading(true);
    const res = await adminFetch(`/api/products/${productId}/image`, { method: 'DELETE' });
    if (res.ok) { setPreview(null); onUploaded(null); }
    setUploading(false);
  }

  return (
    <div className="relative w-12 h-12 flex-shrink-0 group">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
      />
      <button
        type="button"
        title={preview ? 'Replace image' : 'Upload image'}
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className={`w-12 h-12 rounded border-2 overflow-hidden flex items-center justify-center transition-colors
          ${preview ? 'border-gray-200 hover:border-brand-river' : 'border-dashed border-gray-300 hover:border-brand-river bg-gray-50'}`}
      >
        {uploading ? (
          <Loader2 className="w-4 h-4 animate-spin text-brand-river" />
        ) : preview ? (
          <Image src={preview} alt="product" width={48} height={48} className="object-cover w-full h-full" unoptimized />
        ) : (
          <ImagePlus className="w-5 h-5 text-gray-300 group-hover:text-brand-river" />
        )}
      </button>
      {preview && !uploading && (
        <button
          type="button"
          title="Remove image"
          onClick={handleRemove}
          className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
        >
          <X className="w-2.5 h-2.5 text-white" />
        </button>
      )}
      {error && (
        <div className="absolute top-full left-0 mt-1 z-20 bg-red-50 border border-red-200 rounded text-[10px] text-red-600 px-2 py-1 whitespace-nowrap max-w-[180px] shadow-md">
          {error}
        </div>
      )}
    </div>
  );
}


// ── Tag chip editor ──────────────────────────────────────────────────
function TagEditor({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [input, setInput] = useState('');

  function addTag(raw: string) {
    const tag = raw.trim().toLowerCase().replace(/,/g, '');
    if (!tag || tags.includes(tag)) { setInput(''); return; }
    onChange([...tags, tag]);
    setInput('');
  }

  function removeTag(tag: string) {
    onChange(tags.filter(t => t !== tag));
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1 mb-1.5">
        {tags.map(tag => (
          <span key={tag}
            className="inline-flex items-center gap-1 bg-brand-river/10 text-brand-river text-[11px] font-semibold px-2 py-0.5 rounded-full">
            <Tag className="w-2.5 h-2.5" />
            {tag}
            <button type="button" onClick={() => removeTag(tag)}
              className="ml-0.5 text-brand-river/50 hover:text-red-500 transition-colors">
              <X className="w-2.5 h-2.5" />
            </button>
          </span>
        ))}
      </div>
      <input
        type="text"
        className="input-base text-xs py-1 w-full"
        placeholder="Add tag, press Enter (e.g. spices, baking)"
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(input); }
          if (e.key === 'Backspace' && !input && tags.length) { onChange(tags.slice(0, -1)); }
        }}
        onBlur={() => { if (input.trim()) addTag(input); }}
      />
    </div>
  );
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
  details: string;
  category: string;
  sub_category: string;
  location: string;
  pkg_size: string;
  uom: string;
  price: string;
  tags: string[];
  image_url: string | null;
  billed_by_weight: boolean;
}

function AddProductRow({ onAdded }: {
  onAdded: (p: Product) => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newProductId, setNewProductId] = useState<string | null>(null);
  const [form, setForm] = useState({
    description: '', details: '', category: 'Pantry & Grocery', sub_category: '',
    location: '', pkg_size: '', uom: '', price: '', tags: [] as string[], image_url: null as string | null,
    billed_by_weight: false,
  });
  const descRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (open) descRef.current?.focus(); }, [open]);

  function reset() { setForm({ description: '', details: '', category: 'Pantry & Grocery', sub_category: '', location: '', pkg_size: '', uom: '', price: '', tags: [], image_url: null, billed_by_weight: false }); setNewProductId(null); setOpen(false); }

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
          details: form.details || null,
          category: form.category,
          sub_category: form.sub_category || form.category,
          location: form.location || null,
          pkg_size: form.pkg_size || null,
          uom: form.uom || null,
          price: parseFloat(form.price) || 0,
          tags: form.tags,
          is_active: true,
          is_available: true,
          billed_by_weight: form.billed_by_weight,
          upc: null,
        }],
      }),
    });
    if (res.ok) {
      const listRes = await adminFetch(`/api/products?search=${encodeURIComponent(form.description)}&per_page=1`);
      if (listRes.ok) {
        const data = await listRes.json();
        if (data.products?.[0]) {
          setNewProductId(data.products[0].id);
          onAdded(data.products[0]);
        }
      }
    }
    setSaving(false);
  }

  if (!open) {
    return (
      <tr>
        <td colSpan={10} className="px-3 py-2 border-b border-dashed border-gray-200">
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
        <ProductImageCell
          productId={newProductId}
          imageUrl={form.image_url}
          onUploaded={url => setForm(f => ({ ...f, image_url: url }))}
        />
      </td>
      <td className="px-2 py-2">
        <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value, sub_category: '' }))}
          className="input-base text-xs py-1.5 w-full">
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </td>
      <td className="px-2 py-2">
        <input className="input-base text-xs py-1.5 w-full" placeholder="Sub-category"
          value={form.sub_category} onChange={e => setForm(f => ({ ...f, sub_category: e.target.value }))} />
        <input className="input-base text-xs py-1 w-full mt-1" placeholder="Location (e.g. Cold Deli)"
          value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
      </td>
      <td className="px-2 py-2">
        <input ref={descRef} className="input-base text-xs py-1.5 w-full font-medium"
          placeholder="Product name (required)" value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') reset(); }} />
        <textarea className="input-base text-xs py-1 w-full mt-1 resize-none" rows={2}
          placeholder="Description (optional — shown to customers)"
          value={form.details} onChange={e => setForm(f => ({ ...f, details: e.target.value }))} />
        <div className="mt-1">
          <TagEditor tags={form.tags} onChange={tags => setForm(f => ({ ...f, tags }))} />
        </div>
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
        <label className="flex items-center gap-1.5 mt-1.5 cursor-pointer" title="Customer enters a quantity; final price is by actual weight">
          <input type="checkbox" checked={form.billed_by_weight}
            onChange={e => setForm(f => ({ ...f, billed_by_weight: e.target.checked }))}
            className="w-3.5 h-3.5 rounded border-gray-300" />
          <span className="text-[10px] font-semibold text-gray-500 whitespace-nowrap">/lb</span>
        </label>
      </td>
      <td className="px-2 py-2"></td>
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
    details: product.details || '',
    category: product.category,
    sub_category: product.sub_category || '',
    location: product.location || '',
    pkg_size: product.pkg_size || '',
    uom: product.uom || '',
    price: product.price.toFixed(2),
    tags: product.tags || [],
    image_url: product.image_url ?? null,
    billed_by_weight: !!product.billed_by_weight,
  });

  async function save() {
    setSaving(true);
    const res = await adminFetch('/api/products', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: product.id,
        description: form.description,
        details: form.details || null,
        category: form.category,
        sub_category: form.sub_category,
        pkg_size: form.pkg_size || null,
        uom: form.uom || null,
        price: parseFloat(form.price) || 0,
        tags: form.tags,
        billed_by_weight: form.billed_by_weight,
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
          <ProductImageCell
            productId={product.id}
            imageUrl={form.image_url}
            onUploaded={url => setForm(f => ({ ...f, image_url: url }))}
          />
        </td>
        <td className="px-3 py-2">
          <input className="input-base text-xs py-1 w-full" value={form.category}
            onChange={e => setForm(f => ({ ...f, category: e.target.value }))} />
        </td>
        <td className="px-3 py-2">
          <input className="input-base text-xs py-1 w-full" value={form.sub_category}
            onChange={e => setForm(f => ({ ...f, sub_category: e.target.value }))} />
          <input className="input-base text-xs py-1 w-full mt-1" placeholder="Location"
            value={form.location}
            onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
        </td>
        <td className="px-3 py-2">
          <input className="input-base text-xs py-1 w-full font-medium" value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          <textarea className="input-base text-xs py-1 w-full mt-1 resize-none" rows={2}
            placeholder="Description (optional — shown to customers)"
            value={form.details} onChange={e => setForm(f => ({ ...f, details: e.target.value }))} />
          <div className="mt-1.5">
            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-1">Search Tags</p>
            <TagEditor tags={form.tags} onChange={tags => setForm(f => ({ ...f, tags }))} />
          </div>
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
          <label className="flex items-center gap-1.5 mt-1.5 cursor-pointer" title="Customer enters a quantity; final price is by actual weight">
            <input type="checkbox" checked={form.billed_by_weight}
              onChange={e => setForm(f => ({ ...f, billed_by_weight: e.target.checked }))}
              className="w-3.5 h-3.5 rounded border-gray-300" />
            <span className="text-[10px] font-semibold text-gray-500 whitespace-nowrap">Billed by weight (/lb)</span>
          </label>
        </td>
        <td className="px-3 py-2"></td>
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
      <td className="px-3 py-2.5">
        <div className="group">
          <ProductImageCell
            productId={product.id}
            imageUrl={product.image_url ?? null}
            onUploaded={url => onSaved({ ...product, image_url: url })}
          />
        </div>
      </td>
      <td className="px-3 py-2.5 text-xs text-brand-river font-medium">{product.category}</td>
      <td className="px-3 py-2.5 text-xs text-gray-400">
        <div>{product.sub_category}</div>
        {product.location && (
          <div className="text-[10px] text-teal-600 font-medium mt-0.5">📍 {product.location}</div>
        )}
      </td>
      <td className="px-3 py-2.5 text-sm font-medium text-brand-navy max-w-xs">
        <span className="line-clamp-1">{product.description}</span>
        <div className="flex flex-wrap items-center gap-1 mt-0.5">
          {!product.is_active && (
            <span className="inline-block text-[10px] font-bold uppercase tracking-wide text-gray-400 bg-gray-100 rounded px-1.5 py-0.5">Inactive</span>
          )}
          {product.billed_by_weight && (
            <span className="inline-block text-[10px] font-bold uppercase tracking-wide text-amber-700 bg-amber-50 rounded px-1.5 py-0.5">/lb</span>
          )}
          {(product.tags || []).map(tag => (
            <span key={tag} className="inline-flex items-center gap-0.5 text-[10px] text-brand-river/70 bg-blue-50 rounded-full px-1.5 py-0.5 font-semibold">
              <Tag className="w-2 h-2" />{tag}
            </span>
          ))}
        </div>
      </td>
      <td className="px-3 py-2.5 text-xs text-gray-500">{product.pkg_size || '—'}</td>
      <td className="px-3 py-2.5 text-xs text-gray-500">{product.uom || '—'}</td>
      <td className="px-3 py-2.5 text-sm font-bold text-brand-navy">{formatCurrency(product.price)}</td>
      {/* One-tap in/out-of-stock pill — the most frequent daily action */}
      <td className="px-3 py-2.5">
        <button
          onClick={() => onToggleAvailable(product)}
          title={product.is_available ? 'Tap to mark Out of Stock' : 'Tap to mark In Stock'}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide border-2 whitespace-nowrap transition-all active:scale-95 ${
            product.is_available
              ? 'bg-green-50 text-green-700 border-green-300 hover:bg-green-100'
              : 'bg-red-50 text-red-600 border-red-300 hover:bg-red-100'
          }`}>
          {product.is_available
            ? <><PackageCheck className="w-3.5 h-3.5" /> In Stock</>
            : <><PackageX className="w-3.5 h-3.5" /> Out of Stock</>}
        </button>
      </td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <button onClick={() => setEditing(true)} title="Edit"
            className="p-1.5 text-gray-400 hover:text-brand-river hover:bg-blue-50 rounded transition-colors">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => onToggleActive(product)} title={product.is_active ? 'Deactivate (hide from catalog)' : 'Activate'}
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

  // Duplicates tab state
  const [dupGroups, setDupGroups] = useState<any[]>([]);
  const [dupLoading, setDupLoading] = useState(false);
  const [dupSelected, setDupSelected] = useState<Set<string>>(new Set());
  const [dupFilter, setDupFilter] = useState<'all' | 'upc' | 'name_pack' | 'upc_conflict'>('all');

  const [denied, setDenied] = useState(false);

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
  const deletableGroups = filteredDupGroups.filter(g => g.type !== 'upc_conflict');

  async function deleteAllDuplicates() {
    // Keep the first (oldest) item in each true-duplicate group, delete the rest.
    // "upc_conflict" groups (same UPC, different products) are never auto-deleted.
    const idsToDelete: string[] = [];
    for (const group of deletableGroups) {
      const [, ...rest] = group.items;
      for (const item of rest) idsToDelete.push(item.id);
    }
    if (!idsToDelete.length) return;
    if (!confirm(`Delete ${idsToDelete.length} duplicate item${idsToDelete.length === 1 ? '' : 's'} across ${deletableGroups.length} group${deletableGroups.length === 1 ? '' : 's'}? The first item in each group will be kept. This cannot be undone.`)) return;
    setDupLoading(true);
    const res = await adminFetch('/api/products', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: idsToDelete }),
    });
    if (res.ok) {
      await fetchDuplicates();
      fetchProducts();
    } else {
      setDupLoading(false);
    }
  }

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
          <ApplyFormLayoutButton onDone={() => fetchProducts()} />
          <EnrichFromSinclair onDone={() => fetchProducts()} />
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
          { key: 'import', label: 'Import File', icon: Upload },
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
                    {['Image', 'Category', 'Sub-Category', 'Description', 'Pack Size', 'UOM', 'Price', 'Stock', 'Actions'].map(h => (
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

      {/* ── IMPORT TAB — 4-step wizard (CSV / TSV / XLSX / XLS) ── */}
      {tab === 'import' && (
        <ImportWizard onComplete={() => { setTab('catalog'); fetchProducts('', 1, category, status); }} />
      )}

      {/* ── DUPLICATES TAB ── */}
      {tab === 'duplicates' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-500">Filter:</span>
              {[
                { key: 'all', label: 'All' },
                { key: 'upc', label: 'Same UPC + Name (true dupes)' },
                { key: 'name_pack', label: 'Same Name & Pack & Price' },
                { key: 'upc_conflict', label: 'Reused UPC, different items' },
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
              {deletableGroups.length > 0 && (
                <button onClick={deleteAllDuplicates} disabled={dupLoading}
                  className="text-sm px-3 py-2 rounded font-medium bg-red-600 text-white hover:bg-red-700 flex items-center gap-1.5 transition-colors disabled:opacity-50">
                  {dupLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  Delete All True Duplicates
                </button>
              )}
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
              <div key={group.key} className={`card-base overflow-hidden ${group.type === 'upc_conflict' ? 'ring-1 ring-amber-300' : ''}`}>
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-brand-navy">
                      {group.type === 'upc' && `Same UPC & Name: ${group.items[0].upc}`}
                      {group.type === 'name_pack' && 'Same Name, Pack Size & Price'}
                      {group.type === 'upc_conflict' && `Reused UPC ${group.items[0].upc} — different items`}
                    </p>
                    {group.type === 'upc_conflict' && (
                      <p className="text-xs text-amber-600 mt-0.5">
                        These products share a UPC in the source catalog but are different items. Not deleted automatically — review manually if needed.
                      </p>
                    )}
                  </div>
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
