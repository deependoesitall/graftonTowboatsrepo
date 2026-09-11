'use client';
// src/components/admin/RegisterReceiptImport.tsx
// Staff upload of Sinclair's itemized REGISTER receipt (PLU tape).
// Human reviews matches; unmatched stay in Needs you. Never auto-submits.

import { useState } from 'react';
import { FileUp, Loader2, Check, AlertTriangle, Trash2 } from 'lucide-react';
import { adminFetch } from '@/lib/admin-auth';
import { extractPdfText } from '@/lib/register-receipt-pdf';
import {
  parseRegisterReceiptText,
  parseReceiptMeta,
  matchReceiptToCatalog,
  type CatalogRow,
  type MatchedReceiptLine,
  type UnmatchedReceiptLine,
} from '@/lib/register-receipt-parse';

export interface RegisterReceiptImportProps {
  catalog: CatalogRow[];
  setLine?: (productId: string, qty: number) => void;
  applyLines?: (lines: { productId: string; qty: number }[]) => void;
  addCustomLines?: (lines: { description: string; qty: number; price: number }[]) => void;
  appendNotes?: (note: string) => void;
  onApplied?: (count: number) => void;
  vesselId?: string;
  companyName?: string;
  vesselName?: string;
}

type MatchRow = MatchedReceiptLine & { include: boolean; qtyInput: string };
type NeedRow = UnmatchedReceiptLine & {
  include: boolean;
  qtyInput: string;
  asCustom: boolean;
};

export function RegisterReceiptImport({
  catalog,
  setLine,
  applyLines,
  addCustomLines,
  appendNotes,
  onApplied,
  vesselId,
  companyName,
  vesselName,
}: RegisterReceiptImportProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [matched, setMatched] = useState<MatchRow[] | null>(null);
  const [needsYou, setNeedsYou] = useState<NeedRow[] | null>(null);
  const [meta, setMeta] = useState<{ vesselHint: string | null; amount: number | null; dateHint: string | null } | null>(null);

  async function onFile(file: File | null) {
    if (!file) return;
    setError(''); setOk(''); setMatched(null); setNeedsYou(null); setMeta(null);
    setBusy(true);
    try {
      const text = await extractPdfText(file);
      const lines = parseRegisterReceiptText(text);
      if (!lines.length) {
        setError('No Plu# lines found. Use the itemized Sinclair register PDF.');
        return;
      }
      const m = parseReceiptMeta(text);
      setMeta(m);

      // Match against the FULL store UPC catalog (includes store_only).
      // Order Builder still passes the lean paper-form sheet as `catalog` for
      // draft UI — that filter must stay lean — but register PLUs live on
      // store-only rows that never appear on the barge form.
      let matchCatalog = catalog;
      try {
        const res = await adminFetch('/api/admin/register-receipt/catalog');
        if (res.ok) {
          const json = await res.json();
          const full = (json.items || []) as CatalogRow[];
          if (full.length) matchCatalog = full;
        }
      } catch {
        // Fall back to the sheet catalog if the full fetch fails.
      }

      const { matched: hits, needsYou: miss } = matchReceiptToCatalog(lines, matchCatalog);
      setMatched(hits.map(h => ({ ...h, include: true, qtyInput: String(h.qty) })));
      setNeedsYou(miss.map(n => ({ ...n, include: false, qtyInput: String(n.qty), asCustom: true })));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to read PDF');
    } finally {
      setBusy(false);
    }
  }

  function applyToDraft() {
    if (!matched) return;
    setError(''); setOk('');
    const lines = matched
      .filter(r => r.include)
      .map(r => ({ productId: r.productId, qty: Math.max(0, parseFloat(r.qtyInput) || 0) }))
      .filter(l => l.qty > 0);

    if (applyLines) applyLines(lines);
    else if (setLine) lines.forEach(l => setLine(l.productId, l.qty));

    const customs = (needsYou || [])
      .filter(r => r.include && r.asCustom)
      .map(r => ({
        description: r.description || `PLU ${r.plu}`,
        qty: Math.max(0, parseFloat(r.qtyInput) || 0),
        price: r.unitPrice ?? 0,
      }))
      .filter(c => c.qty > 0);
    if (customs.length && addCustomLines) addCustomLines(customs);

    const noteBits = [
      'Sinclair register receipt import',
      meta?.dateHint ? `date ${meta.dateHint}` : null,
      meta?.amount != null ? `tape total $${meta.amount.toFixed(2)}` : null,
      meta?.vesselHint ? `vessel hint ${meta.vesselHint}` : null,
      (needsYou || []).filter(n => !n.include).length
        ? `skipped ${(needsYou || []).filter(n => !n.include).length} unmatched PLUs`
        : null,
    ].filter(Boolean);
    if (noteBits.length && appendNotes) appendNotes(noteBits.join(' · '));

    const count = lines.length + customs.length;
    setOk(`Added ${count} line${count === 1 ? '' : 's'} to the draft. Review before submitting.`);
    onApplied?.(count);
  }

  async function saveAsPastOrder() {
    if (!matched) return;
    const co = companyName?.trim();
    const ves = vesselName?.trim() || meta?.vesselHint || '';
    if (!co || !ves) {
      setError('Company and boat name required to save as a past order.');
      return;
    }
    setBusy(true); setError(''); setOk('');
    try {
      const lines = [
        ...matched.filter(r => r.include).map(r => ({
          product_id: r.productId,
          description: r.catalogDescription || r.description,
          qty: Math.max(0, parseFloat(r.qtyInput) || 0),
          unit_price: r.unitPrice ?? r.catalogPrice,
        })),
        ...(needsYou || []).filter(r => r.include && r.asCustom).map(r => ({
          product_id: null as string | null,
          description: r.description || `PLU ${r.plu}`,
          qty: Math.max(0, parseFloat(r.qtyInput) || 0),
          unit_price: r.unitPrice ?? 0,
        })),
      ].filter(l => l.qty > 0);

      const res = await adminFetch('/api/admin/register-receipt/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vessel_id: vesselId || null,
          company_name: co,
          vessel_name: ves,
          register_total: meta?.amount ?? null,
          notes: meta?.dateHint ? `Receipt date ${meta.dateHint}` : '',
          lines,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || 'Import failed'); return; }
      setOk(`Saved past order ${json.order_number} (${json.line_count} lines). No email sent.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-brand-green/15 bg-white p-4 space-y-4">
      <div>
        <h3 className="font-display font-bold text-brand-navy text-base">Sinclair register receipt</h3>
        <p className="text-xs text-brand-green/50 mt-0.5">
          Upload the itemized register PDF (PLU tape). Matched lines apply to the draft; unmatched stay in Needs you.
        </p>
      </div>

      <label className="flex items-center gap-2 btn-outline text-sm px-3 py-2 cursor-pointer w-fit">
        <FileUp className="w-4 h-4" />
        {busy ? 'Matching…' : 'Upload register PDF'}
        <input type="file" accept="application/pdf,.pdf" className="hidden"
          disabled={busy}
          onChange={e => onFile(e.target.files?.[0] || null)} />
      </label>

      {busy && (
        <div className="flex items-center gap-2 text-sm text-brand-green/60">
          <Loader2 className="w-4 h-4 animate-spin" /> Parsing PLUs + matching store catalog…
        </div>
      )}
      {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
      {ok && (
        <div className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 flex items-center gap-2">
          <Check className="w-4 h-4" /> {ok}
        </div>
      )}

      {meta && (meta.amount != null || meta.vesselHint || meta.dateHint) && (
        <div className="text-xs text-brand-green/70 bg-brand-sand/40 border border-brand-gold/20 rounded-lg px-3 py-2">
          {[
            meta.vesselHint && `Boat hint: ${meta.vesselHint}`,
            meta.dateHint && `Date: ${meta.dateHint}`,
            meta.amount != null && `Tape total: $${meta.amount.toFixed(2)}`,
          ].filter(Boolean).join(' · ')}
        </div>
      )}

      {matched && (
        <div className="space-y-2">
          <div className="text-[11px] font-bold uppercase tracking-widest text-brand-green/50">
            Matched ({matched.filter(m => m.include).length}/{matched.length})
          </div>
          <ul className="max-h-56 overflow-y-auto divide-y divide-brand-green/10 border border-brand-green/10 rounded-xl">
            {matched.map((r, i) => (
              <li key={`${r.plu}-${i}`} className="px-3 py-2 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={r.include}
                  onChange={e => setMatched(rows => rows && rows.map((x, j) => j === i ? { ...x, include: e.target.checked } : x))} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-brand-navy truncate">{r.catalogDescription}</div>
                  <div className="text-[11px] text-brand-green/50">PLU {r.plu} · tape: {r.description}</div>
                </div>
                <input className="input-base w-16 text-center text-sm py-1" value={r.qtyInput}
                  onChange={e => setMatched(rows => rows && rows.map((x, j) => j === i ? { ...x, qtyInput: e.target.value } : x))} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {needsYou && needsYou.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-amber-700">
            <AlertTriangle className="w-3.5 h-3.5" /> Needs you ({needsYou.length})
          </div>
          <ul className="max-h-40 overflow-y-auto divide-y divide-amber-100 border border-amber-200 rounded-xl bg-amber-50/40">
            {needsYou.map((r, i) => (
              <li key={`n-${r.plu}-${i}`} className="px-3 py-2 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={r.include}
                  onChange={e => setNeedsYou(rows => rows && rows.map((x, j) => j === i ? { ...x, include: e.target.checked } : x))} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-brand-navy truncate">{r.description}</div>
                  <div className="text-[11px] text-amber-800/70">PLU {r.plu} — no UPC match in store catalog</div>
                </div>
                <input className="input-base w-16 text-center text-sm py-1" value={r.qtyInput}
                  onChange={e => setNeedsYou(rows => rows && rows.map((x, j) => j === i ? { ...x, qtyInput: e.target.value } : x))} />
                <button type="button" className="text-gray-400 hover:text-red-500" title="Skip"
                  onClick={() => setNeedsYou(rows => rows && rows.filter((_, j) => j !== i))}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-amber-800/70">Checked unmatched lines add as custom (off-catalog) lines.</p>
        </div>
      )}

      {matched && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-primary text-sm" disabled={busy} onClick={applyToDraft}>
            Add to order draft
          </button>
          {(vesselId || (companyName && vesselName)) && (
            <button type="button" className="btn-outline text-sm" disabled={busy} onClick={saveAsPastOrder}>
              Save as past boat order
            </button>
          )}
        </div>
      )}
    </div>
  );
}
