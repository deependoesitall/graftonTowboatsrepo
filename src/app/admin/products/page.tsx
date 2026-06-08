'use client';
// src/app/admin/products/page.tsx
import { useState, useCallback } from 'react';
import { Upload, Package, AlertCircle, CheckCircle2, Loader2, Download } from 'lucide-react';
import { normalizeCategory } from '@/lib/utils';

const ADMIN_TOKEN_KEY = 'grafton_admin_token';

interface ParsedProduct {
  category: string;
  sub_category: string;
  upc: string | null;
  description: string;
  pkg_size: string | null;
  uom: string | null;
  price: number;
  is_active: boolean;
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
  const category = normalizeCategory(rawCategory);

  return {
    category,
    sub_category: subCategory || category,
    upc: row['upc'] || row['barcode'] || null,
    description,
    pkg_size: row['pkg_size'] || row['pkg size'] || row['pack size'] || row['size'] || null,
    uom: row['uom'] || row['unit'] || row['unit of measure'] || null,
    price: parsePrice(row['price'] || row['unit price'] || row['cost'] || '0'),
    is_active: true,
  };
}

export default function AdminProductsPage() {
  const [isDragging, setIsDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<ParsedProduct[]>([]);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const adminToken = typeof window !== 'undefined'
    ? sessionStorage.getItem(ADMIN_TOKEN_KEY) || ''
    : '';

  function handleFile(file: File) {
    setParsing(true);
    setResult(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      try {
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        const sep = text.includes('\t') ? '\t' : ',';
        const headers = lines[0].split(sep).map(h => h.replace(/['"]/g, '').toLowerCase().trim());
        const products: ParsedProduct[] = [];
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(sep).map(v => v.replace(/^["']|["']$/g, '').trim());
          const p = parseRow(headers, values);
          if (p && p.description) products.push(p);
        }
        setPreview(products.slice(0, 20));
        setParsing(false);
      } catch (err) {
        setResult({ success: false, message: `Parse error: ${err}` });
        setParsing(false);
      }
    };
    reader.readAsText(file);
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, []);

  async function uploadProducts() {
    if (!preview.length) return;
    setUploading(true);
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': adminToken,
        },
        body: JSON.stringify({ products: preview }),
      });
      if (res.ok) {
        const data = await res.json();
        setResult({ success: true, message: `Successfully imported ${data.count} products.` });
        setPreview([]);
      } else {
        const err = await res.json();
        setResult({ success: false, message: err.error || 'Import failed' });
      }
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-brand-navy">Product Catalog</h1>
        <p className="text-gray-400 text-sm">Import products from the Sinclair Foods spreadsheet</p>
      </div>

      {/* Upload area */}
      <div
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors mb-6 ${
          isDragging ? 'border-brand-river bg-blue-50' : 'border-gray-300 bg-white'
        }`}
      >
        <Upload className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <h3 className="font-display text-lg font-bold text-brand-navy mb-2">
          Drop your CSV/TSV file here
        </h3>
        <p className="text-gray-400 text-sm mb-4">
          Supports .csv and .tsv files. Headers auto-detected.
        </p>
        <label className="btn-outline cursor-pointer inline-block">
          Browse File
          <input
            type="file"
            accept=".csv,.tsv,.txt"
            className="hidden"
            onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
        </label>
        <p className="text-xs text-gray-300 mt-4">
          Expected columns: category, sub_category, upc, description, pkg_size, uom, price
        </p>
      </div>

      {/* Result message */}
      {result && (
        <div className={`flex items-center gap-3 p-4 rounded-lg mb-6 ${
          result.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
        }`}>
          {result.success
            ? <CheckCircle2 className="w-5 h-5 text-green-500" />
            : <AlertCircle className="w-5 h-5 text-red-500" />}
          <p className={`text-sm font-medium ${result.success ? 'text-green-700' : 'text-red-700'}`}>
            {result.message}
          </p>
        </div>
      )}

      {/* Parsing indicator */}
      {parsing && (
        <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg mb-6">
          <Loader2 className="w-5 h-5 text-brand-river animate-spin" />
          <p className="text-sm text-brand-river">Parsing file…</p>
        </div>
      )}

      {/* Preview */}
      {preview.length > 0 && (
        <div className="card-base overflow-hidden mb-6">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="font-display text-lg font-bold text-brand-navy">
                Preview ({preview.length} rows shown)
              </h2>
              <p className="text-gray-400 text-xs mt-0.5">
                Showing first 20 rows. Full import will include all rows.
              </p>
            </div>
            <button
              onClick={uploadProducts}
              disabled={uploading}
              className="btn-gold text-sm flex items-center gap-2"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />}
              {uploading ? 'Importing…' : 'Import All Products'}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  {['Category', 'Sub-Category', 'UPC', 'Description', 'Pack Size', 'UOM', 'Price'].map(h => (
                    <th key={h} className="px-3 py-2 text-xs font-bold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {preview.map((p, i) => (
                  <tr key={i} className={i % 2 === 0 ? '' : 'bg-gray-50'}>
                    <td className="px-3 py-2 text-xs">{p.category}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">{p.sub_category}</td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-400">{p.upc || '—'}</td>
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

      {/* Column mapping guide */}
      <div className="card-base p-6">
        <h3 className="font-display text-base font-bold text-brand-navy mb-4 flex items-center gap-2">
          <Download className="w-5 h-5 text-brand-gold" />
          CSV Format Guide
        </h3>
        <p className="text-sm text-gray-500 mb-4">
          The importer auto-detects common column names. Use any of these header names:
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            { field: 'category', aliases: 'category, cat, department, dept' },
            { field: 'sub_category', aliases: 'sub_category, subcategory, sub category' },
            { field: 'upc', aliases: 'upc, barcode' },
            { field: 'description', aliases: 'description, item description, item name, name' },
            { field: 'pkg_size', aliases: 'pkg_size, pkg size, pack size, size' },
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
  );
}
