'use client';
// src/components/admin/ImportWizard.tsx
// 4-step catalog import wizard for non-technical managers:
//   1. Drop/browse file (CSV, TSV, XLSX, XLS — parsed with SheetJS)
//   2. Column mapping with auto-suggestions
//   3. Color-coded preview (green = new, amber = update w/ diff, gray = skip)
//   4. Progress bar + success screen; import recorded in the activity log
import { useState, useCallback } from 'react';
import * as XLSX from 'xlsx';
import {
  Upload, FileSpreadsheet, ArrowRight, ArrowLeft, Check, X,
  Loader2, AlertCircle, CheckCircle2, Columns3, Eye, Rocket, Scale,
} from 'lucide-react';
import { normalizeCategory } from '@/lib/utils';
import { adminFetch } from '@/lib/admin-auth';

// ─── Types ────────────────────────────────────────────────────
interface ParsedProduct {
  category: string; sub_category: string; upc: string | null;
  description: string; pkg_size: string | null; uom: string | null;
  price: number; is_active: boolean; billed_by_weight?: boolean;
}
interface ClassifiedRow {
  row: ParsedProduct;
  match: { id: string; description: string; pkg_size: string | null; price: number; category: string; upc: string | null } | null;
  matchType: 'upc_price' | 'name_pack_price' | null;
}
type ImportMode = 'skip_duplicates' | 'update_duplicates' | 'add_anyway';

const TARGETS: { key: string; label: string; required?: boolean; aliases: string[] }[] = [
  { key: 'description', label: 'Product Name / Description', required: true,
    aliases: ['description', 'item description', 'item name', 'name', 'product', 'product name', 'item'] },
  { key: 'price', label: 'Price', required: true,
    aliases: ['price', 'unit price', 'retail', 'retail price', 'cost', 'amount'] },
  { key: 'category', label: 'Category',
    aliases: ['category', 'cat', 'department', 'dept'] },
  { key: 'sub_category', label: 'Sub-Category',
    aliases: ['sub_category', 'sub category', 'subcategory', 'sub cat', 'sub-dept'] },
  { key: 'upc', label: 'UPC / Barcode',
    aliases: ['upc', 'barcode', 'upc code', 'item #', 'item number', 'sku'] },
  { key: 'pkg_size', label: 'Pack Size',
    aliases: ['pkg_size', 'pkg size', 'pack size', 'size', 'pack'] },
  { key: 'uom', label: 'Unit of Measure',
    aliases: ['uom', 'unit', 'unit of measure', 'um'] },
  { key: 'billed_by_weight', label: 'Billed by Weight (yes/no)',
    aliases: ['billed_by_weight', 'by weight', 'weight item', 'per lb', 'weighed'] },
];

function parsePrice(raw: string): number {
  if (!raw) return 0;
  const n = parseFloat(String(raw).replace(/[$,\s]/g, ''));
  return isNaN(n) ? 0 : n;
}
function parseBool(raw: string): boolean {
  return /^(y|yes|true|1|x|lb)$/i.test(String(raw).trim());
}

const BATCH_SIZE = 250;

export function ImportWizard({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [error, setError] = useState('');

  // Step 1 — file
  const [isDragging, setIsDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);

  // Step 2 — mapping (target field key → source column index, -1 = not mapped)
  const [mapping, setMapping] = useState<Record<string, number>>({});

  // Step 3 — preview
  const [analyzing, setAnalyzing] = useState(false);
  const [classified, setClassified] = useState<ClassifiedRow[]>([]);
  const [importMode, setImportMode] = useState<ImportMode>('skip_duplicates');

  // Step 4 — import progress
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [importing, setImporting] = useState(false);
  const [finished, setFinished] = useState(false);
  const [counts, setCounts] = useState({ added: 0, updated: 0, skipped: 0 });
  const [batchError, setBatchError] = useState('');

  // ─── Step 1: parse any supported file with SheetJS ──────────
  const handleFile = useCallback((file: File) => {
    setError(''); setParsing(true); setFileName(file.name);
    const reader = new FileReader();
    reader.onerror = () => { setError('Could not read the file.'); setParsing(false); };
    reader.onload = (e) => {
      try {
        const data = e.target?.result as ArrayBuffer;
        // SheetJS handles XLSX, XLS, CSV, and TSV from the same entry point —
        // including quoted CSV fields the old split-based parser broke on.
        const wb = XLSX.read(data, { type: 'array', raw: false });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const grid: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
        const nonEmpty = grid.filter(r => r.some(c => String(c).trim() !== ''));
        if (nonEmpty.length < 2) {
          setError('That file looks empty — it needs a header row plus at least one product row.');
          setParsing(false);
          return;
        }
        const hdrs = nonEmpty[0].map(h => String(h).trim());
        const body = nonEmpty.slice(1).map(r => hdrs.map((_, i) => String(r[i] ?? '').trim()));
        setHeaders(hdrs);
        setRows(body);

        // Auto-suggest column mapping
        const auto: Record<string, number> = {};
        const lower = hdrs.map(h => h.toLowerCase().trim());
        for (const target of TARGETS) {
          const idx = lower.findIndex(h => target.aliases.includes(h));
          auto[target.key] = idx; // -1 when not found
        }
        setMapping(auto);
        setStep(2);
      } catch (err) {
        setError(`Couldn't parse that file: ${err instanceof Error ? err.message : err}`);
      } finally {
        setParsing(false);
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  // ─── Step 2 → 3: build products from mapping + classify ─────
  function buildProducts(): ParsedProduct[] {
    const get = (r: string[], key: string) => (mapping[key] >= 0 ? r[mapping[key]] || '' : '');
    const products: ParsedProduct[] = [];
    for (const r of rows) {
      const description = get(r, 'description');
      if (!description) continue;
      const rawCategory = get(r, 'category') || 'General';
      const uom = get(r, 'uom') || null;
      const byWeightCol = mapping['billed_by_weight'] >= 0 ? parseBool(get(r, 'billed_by_weight')) : undefined;
      products.push({
        category: normalizeCategory(rawCategory),
        sub_category: get(r, 'sub_category') || rawCategory,
        upc: get(r, 'upc') || null,
        description,
        pkg_size: get(r, 'pkg_size') || null,
        uom,
        price: parsePrice(get(r, 'price')),
        is_active: true,
        // Explicit column wins; otherwise LB unit-of-measure implies by-weight
        billed_by_weight: byWeightCol !== undefined ? byWeightCol : (uom || '').toUpperCase() === 'LB',
      });
    }
    return products;
  }

  async function goPreview() {
    const products = buildProducts();
    if (!products.length) { setError('No usable rows found with this mapping — check the Product Name column.'); return; }
    setError(''); setAnalyzing(true); setStep(3);
    try {
      const res = await adminFetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'preview', products }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Preview failed');
      const data = await res.json();
      setClassified(data.rows || []);
      const dupes = (data.summary?.strong_duplicates ?? 0) + (data.summary?.weak_duplicates ?? 0);
      setImportMode(dupes > 0 ? 'skip_duplicates' : 'add_anyway');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview failed');
      setStep(2);
    } finally {
      setAnalyzing(false);
    }
  }

  // Row status under the current mode
  function rowStatus(c: ClassifiedRow): 'add' | 'update' | 'skip' {
    if (!c.match) return 'add';
    if (importMode === 'skip_duplicates') return 'skip';
    if (importMode === 'update_duplicates') return 'update';
    return 'add';
  }
  function rowDiff(c: ClassifiedRow): string[] {
    if (!c.match) return [];
    const diffs: string[] = [];
    if (Number(c.match.price) !== Number(c.row.price)) diffs.push(`price $${Number(c.match.price).toFixed(2)} → $${c.row.price.toFixed(2)}`);
    if ((c.match.category || '') !== c.row.category) diffs.push(`category ${c.match.category} → ${c.row.category}`);
    if ((c.match.pkg_size || '') !== (c.row.pkg_size || '')) diffs.push(`pack ${c.match.pkg_size || '—'} → ${c.row.pkg_size || '—'}`);
    if ((c.match.upc || '') !== (c.row.upc || '')) diffs.push(`UPC ${c.match.upc || '—'} → ${c.row.upc || '—'}`);
    return diffs;
  }

  const statusCounts = classified.reduce(
    (acc, c) => { acc[rowStatus(c)]++; return acc; },
    { add: 0, update: 0, skip: 0 } as Record<'add' | 'update' | 'skip', number>
  );

  // ─── Step 4: batched import with progress ────────────────────
  async function runImport() {
    const products = classified.map(c => c.row);
    setStep(4); setImporting(true); setFinished(false); setBatchError('');
    setProgress({ done: 0, total: products.length });
    let added = 0, updated = 0, skipped = 0;

    try {
      for (let i = 0; i < products.length; i += BATCH_SIZE) {
        const batch = products.slice(i, i + BATCH_SIZE);
        const res = await adminFetch('/api/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: importMode, products: batch }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          const batchNo = Math.floor(i / BATCH_SIZE) + 1;
          const totalBatches = Math.ceil(products.length / BATCH_SIZE);
          throw new Error(
            `Batch ${batchNo} of ${totalBatches} failed (rows ${i + 1}–${Math.min(i + BATCH_SIZE, products.length)}): ` +
            `${err.error || res.statusText}. Rows in earlier batches were saved; rows from this batch on were NOT imported.`
          );
        }
        const data = await res.json();
        added += data.inserted || 0;
        updated += data.updated || 0;
        skipped += data.skipped || 0;
        setProgress({ done: Math.min(i + BATCH_SIZE, products.length), total: products.length });
        setCounts({ added, updated, skipped });
      }

      // One activity-log entry for the whole import
      await adminFetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'log_import',
          import_meta: { filename: fileName, added, updated, skipped },
        }),
      }).catch(() => {});

      setCounts({ added, updated, skipped });
      setFinished(true);
    } catch (err) {
      setBatchError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  }

  function resetAll() {
    setStep(1); setError(''); setFileName(''); setHeaders([]); setRows([]);
    setMapping({}); setClassified([]); setBatchError(''); setFinished(false);
    setCounts({ added: 0, updated: 0, skipped: 0 });
  }

  // ─── Render ──────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {[
          { n: 1, label: 'Upload File', icon: Upload },
          { n: 2, label: 'Match Columns', icon: Columns3 },
          { n: 3, label: 'Preview', icon: Eye },
          { n: 4, label: 'Import', icon: Rocket },
        ].map(({ n, label, icon: Icon }, i) => (
          <div key={n} className="flex items-center gap-2 flex-1 last:flex-none">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap ${
              step === n ? 'bg-brand-navy text-white'
                : step > n ? 'bg-brand-green/10 text-brand-green'
                : 'bg-gray-100 text-gray-400'
            }`}>
              {step > n ? <Check className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />}
              {n}. {label}
            </div>
            {i < 3 && <div className={`flex-1 h-0.5 ${step > n ? 'bg-brand-green/40' : 'bg-gray-200'}`} />}
          </div>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* ── STEP 1: Upload ── */}
      {step === 1 && (
        <div
          onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          className={`border-2 border-dashed rounded-xl p-14 text-center transition-colors ${
            isDragging ? 'border-brand-river bg-blue-50' : 'border-gray-300 bg-white'}`}>
          {parsing ? (
            <>
              <Loader2 className="w-12 h-12 text-brand-river mx-auto mb-4 animate-spin" />
              <p className="text-sm text-brand-river font-semibold">Reading {fileName}…</p>
            </>
          ) : (
            <>
              <FileSpreadsheet className="w-14 h-14 text-gray-300 mx-auto mb-4" />
              <h3 className="font-display text-lg font-bold text-brand-navy mb-2">
                Drop your price file here
              </h3>
              <p className="text-gray-400 text-sm mb-5">
                Excel files (.xlsx, .xls) and text files (.csv, .tsv) all work — headers are detected automatically.
              </p>
              <label className="btn-gold cursor-pointer inline-flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-bold">
                <Upload className="w-4 h-4" /> Browse for a File
                <input type="file" accept=".csv,.tsv,.txt,.xlsx,.xls" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
              </label>
              <p className="text-xs text-gray-300 mt-5">
                Nothing is saved until the final step — you&apos;ll review everything first.
              </p>
            </>
          )}
        </div>
      )}

      {/* ── STEP 2: Column mapping ── */}
      {step === 2 && (
        <div className="card-base overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="font-display text-lg font-bold text-brand-navy">Match your columns</h2>
              <p className="text-xs text-gray-400">
                <span className="font-semibold text-brand-navy">{fileName}</span> · {rows.length.toLocaleString()} rows ·
                we&apos;ve suggested matches — adjust anything that looks wrong.
              </p>
            </div>
            <button onClick={resetAll} className="text-xs text-gray-400 hover:text-red-500 flex items-center gap-1">
              <X className="w-3.5 h-3.5" /> Start over
            </button>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            {TARGETS.map(target => {
              const idx = mapping[target.key] ?? -1;
              const samples = idx >= 0 ? rows.slice(0, 3).map(r => r[idx]).filter(Boolean) : [];
              return (
                <div key={target.key} className={`border rounded-lg p-4 ${
                  target.required && idx < 0 ? 'border-red-300 bg-red-50/50' : 'border-gray-200'
                }`}>
                  <label className="text-xs font-bold text-gray-600 uppercase tracking-wide">
                    {target.label}{target.required && <span className="text-red-400 ml-0.5">*</span>}
                  </label>
                  <select
                    className="input-base text-sm mt-1.5 w-full"
                    value={idx}
                    onChange={e => setMapping(m => ({ ...m, [target.key]: parseInt(e.target.value, 10) }))}>
                    <option value={-1}>— not in this file —</option>
                    {headers.map((h, i) => (
                      <option key={i} value={i}>{h || `(column ${i + 1})`}</option>
                    ))}
                  </select>
                  {samples.length > 0 && (
                    <p className="text-[11px] text-gray-400 mt-1.5 truncate">
                      e.g. {samples.slice(0, 3).join(' · ')}
                    </p>
                  )}
                  {target.required && idx < 0 && (
                    <p className="text-[11px] text-red-500 mt-1">Required — pick the matching column.</p>
                  )}
                </div>
              );
            })}
          </div>
          <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
            <button onClick={resetAll} className="btn-outline text-sm px-4 py-2 flex items-center gap-1.5">
              <ArrowLeft className="w-4 h-4" /> Different file
            </button>
            <button
              onClick={goPreview}
              disabled={(mapping['description'] ?? -1) < 0 || (mapping['price'] ?? -1) < 0}
              className="btn-gold text-sm px-5 py-2.5 rounded-lg font-bold flex items-center gap-2 disabled:opacity-40">
              Preview Import <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3: Color-coded preview ── */}
      {step === 3 && (
        <div className="card-base overflow-hidden">
          {analyzing ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-brand-river" />
              <p className="text-sm text-brand-river">Comparing against the current catalog…</p>
            </div>
          ) : (
            <>
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="font-display text-lg font-bold text-brand-navy">Review before importing</h2>
                <div className="flex flex-wrap gap-2 mt-2">
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-green-100 text-green-700">
                    {statusCounts.add.toLocaleString()} will be added
                  </span>
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">
                    {statusCounts.update.toLocaleString()} will be updated
                  </span>
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-gray-100 text-gray-500">
                    {statusCounts.skip.toLocaleString()} will be skipped
                  </span>
                </div>
              </div>

              {/* Mode toggle */}
              <div className="px-6 py-3 bg-gray-50 border-b border-gray-100">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">When a row matches an existing product:</p>
                <div className="flex flex-wrap gap-2">
                  {([
                    ['skip_duplicates', 'Skip it (only add new items)'],
                    ['update_duplicates', 'Update it (refresh price & details)'],
                    ['add_anyway', 'Add anyway (import everything as new)'],
                  ] as const).map(([mode, label]) => (
                    <button key={mode} onClick={() => setImportMode(mode)}
                      className={`text-xs font-bold px-3 py-1.5 rounded-full transition-colors ${
                        importMode === mode ? 'bg-brand-navy text-white' : 'bg-white border border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}>{label}</button>
                  ))}
                </div>
              </div>

              {/* Preview table */}
              <div className="overflow-x-auto max-h-[28rem] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr className="text-left">
                      {['Status', 'Description', 'Category', 'Pack', 'UOM', 'Price', 'Changes'].map(h => (
                        <th key={h} className="px-3 py-2 text-xs font-bold text-gray-500 uppercase tracking-wide bg-gray-50">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {classified.slice(0, 200).map((c, i) => {
                      const status = rowStatus(c);
                      const diffs = status === 'update' ? rowDiff(c) : [];
                      const rowClass = status === 'add' ? 'bg-green-50/60' : status === 'update' ? 'bg-amber-50/60' : 'bg-gray-50 opacity-60';
                      const chip = status === 'add'
                        ? <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-green-100 text-green-700">New</span>
                        : status === 'update'
                        ? <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">Update</span>
                        : <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-gray-200 text-gray-500">Skip</span>;
                      return (
                        <tr key={i} className={rowClass}>
                          <td className="px-3 py-2">{chip}</td>
                          <td className="px-3 py-2 font-medium text-brand-navy max-w-xs truncate">
                            {c.row.description}
                            {c.row.billed_by_weight && (
                              <span className="inline-flex items-center gap-0.5 ml-1.5 text-[10px] text-amber-700"><Scale className="w-2.5 h-2.5" />/lb</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-xs text-brand-river">{c.row.category}</td>
                          <td className="px-3 py-2 text-xs text-gray-500">{c.row.pkg_size || '—'}</td>
                          <td className="px-3 py-2 text-xs text-gray-500">{c.row.uom || '—'}</td>
                          <td className="px-3 py-2 font-bold text-brand-navy whitespace-nowrap">
                            {c.row.price > 0 ? `$${c.row.price.toFixed(2)}` : '—'}
                          </td>
                          <td className="px-3 py-2 text-[11px] text-amber-700">
                            {diffs.length > 0 ? diffs.join(' · ') : status === 'skip' ? 'matches existing item' : ''}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {classified.length > 200 && (
                  <p className="text-gray-400 text-xs px-3 py-2">
                    Showing first 200 of {classified.length.toLocaleString()} rows — counts above cover the whole file.
                  </p>
                )}
              </div>

              <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
                <button onClick={() => setStep(2)} className="btn-outline text-sm px-4 py-2 flex items-center gap-1.5">
                  <ArrowLeft className="w-4 h-4" /> Back to columns
                </button>
                <div className="flex items-center gap-3">
                  <p className="text-xs text-gray-400">Nothing saved yet.</p>
                  <button onClick={runImport}
                    className="btn-gold text-sm px-5 py-2.5 rounded-lg font-bold flex items-center gap-2">
                    <Rocket className="w-4 h-4" />
                    Import {(statusCounts.add + statusCounts.update).toLocaleString()} rows
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── STEP 4: Progress + success ── */}
      {step === 4 && (
        <div className="card-base p-8">
          {importing && (
            <div className="max-w-md mx-auto text-center">
              <Loader2 className="w-10 h-10 animate-spin text-brand-river mx-auto mb-4" />
              <h2 className="font-display text-lg font-bold text-brand-navy mb-1">Importing…</h2>
              <p className="text-sm text-gray-400 mb-4">
                {progress.done.toLocaleString()} of {progress.total.toLocaleString()} rows processed
              </p>
              <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                <div className="bg-brand-green h-3 rounded-full transition-all duration-300"
                  style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%` }} />
              </div>
              <p className="text-xs text-gray-300 mt-3">Please keep this tab open until the import finishes.</p>
            </div>
          )}

          {batchError && !importing && (
            <div className="max-w-lg mx-auto text-center">
              <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
              <h2 className="font-display text-lg font-bold text-brand-navy mb-2">Import stopped</h2>
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-4 mb-4 text-left">{batchError}</p>
              <p className="text-xs text-gray-400 mb-4">
                Saved so far: {counts.added} added · {counts.updated} updated · {counts.skipped} skipped
              </p>
              <div className="flex justify-center gap-2">
                <button onClick={() => setStep(3)} className="btn-outline text-sm px-4 py-2">Back to preview</button>
                <button onClick={resetAll} className="btn-primary text-sm px-4 py-2">Start over</button>
              </div>
            </div>
          )}

          {finished && (
            <div className="max-w-md mx-auto text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-9 h-9 text-green-500" />
              </div>
              <h2 className="font-display text-xl font-bold text-brand-navy mb-1">Import complete!</h2>
              <p className="text-sm text-gray-400 mb-5">
                <span className="font-semibold text-brand-navy">{fileName}</span> — recorded in the activity log.
              </p>
              <div className="grid grid-cols-3 gap-3 mb-6">
                <div className="bg-green-50 rounded-lg p-4">
                  <p className="text-2xl font-bold text-green-600">{counts.added.toLocaleString()}</p>
                  <p className="text-xs text-green-700 mt-1">Added</p>
                </div>
                <div className="bg-amber-50 rounded-lg p-4">
                  <p className="text-2xl font-bold text-amber-600">{counts.updated.toLocaleString()}</p>
                  <p className="text-xs text-amber-700 mt-1">Updated</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-2xl font-bold text-gray-500">{counts.skipped.toLocaleString()}</p>
                  <p className="text-xs text-gray-500 mt-1">Skipped</p>
                </div>
              </div>
              <div className="flex justify-center gap-2">
                <button onClick={resetAll} className="btn-outline text-sm px-4 py-2">Import another file</button>
                <button onClick={onComplete} className="btn-primary text-sm px-4 py-2 flex items-center gap-1.5">
                  <Check className="w-4 h-4" /> View Catalog
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
