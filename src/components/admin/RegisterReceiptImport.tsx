'use client';
// src/components/admin/RegisterReceiptImport.tsx
// Staff upload of Sinclair's itemized REGISTER receipt (PLU tape).
// Human reviews matches; unmatched stay in Needs you. Never auto-submits.

import { useState, useEffect, useRef } from 'react';
import { FileUp, Loader2, Check, AlertTriangle, Trash2 } from 'lucide-react';
import { adminFetch } from '@/lib/admin-auth';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { extractPdfText } from '@/lib/register-receipt-pdf';
import {
  parseRegisterReceiptText,
  parseReceiptMeta,
  formatReceiptDate,
  matchReceiptToCatalog,
  type CatalogRow,
  type MatchedReceiptLine,
  type UnmatchedReceiptLine,
} from '@/lib/register-receipt-parse';

export interface RegisterReceiptImportProps {
  catalog: CatalogRow[];
  setLine?: (productId: string, qty: number) => void;
  applyLines?: (lines: {
    productId: string;
    qty: number;
    description?: string;
    price?: number;
    category?: string;
    pkg_size?: string | null;
    uom?: string | null;
    image_url?: string | null;
    upc?: string | null;
  }[]) => void;
  addCustomLines?: (lines: { description: string; qty: number; price: number }[]) => void;
  appendNotes?: (note: string) => void;
  onApplied?: (count: number) => void;
  vesselId?: string;
  companyName?: string;
  vesselName?: string;
  /**
   * File chosen by the Items-step shortcut (page-level picker). Consumed once
   * then the parent clears it. Same path as the in-panel upload button.
   */
  incomingFile?: File | null;
  onIncomingConsumed?: () => void;
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
  incomingFile,
  onIncomingConsumed,
}: RegisterReceiptImportProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [matched, setMatched] = useState<MatchRow[] | null>(null);
  const [needsYou, setNeedsYou] = useState<NeedRow[] | null>(null);
  const [meta, setMeta] = useState<{ vesselHint: string | null; amount: number | null; dateHint: string | null } | null>(null);
  const matchTopRef = useRef<HTMLDivElement>(null);
  const incomingSeen = useRef<File | null>(null);
  const [lastImport, setLastImport] = useState<{ id: string; number: string } | null>(null);
  const { confirm: confirmDialog, dialog: confirmDialogEl } = useConfirm();

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
      requestAnimationFrame(() => {
        matchTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to read PDF');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!incomingFile || incomingSeen.current === incomingFile) return;
    incomingSeen.current = incomingFile;
    onIncomingConsumed?.();
    void onFile(incomingFile);
  }, [incomingFile]);

  function applyToDraft() {
    if (!matched) return;
    setError(''); setOk('');
    const lines = matched
      .filter(r => r.include)
      .map(r => ({
        productId: r.productId,
        qty: Math.max(0, parseFloat(r.qtyInput) || 0),
        // Full-store / inactive rows are not on the paper sheet. Description +
        // tape price must ride along or the builder writes qty against an id
        // it never renders and the sticky bar stays at 0 lines / $0.00.
        description: r.catalogDescription || r.description,
        price: r.unitPrice ?? r.catalogPrice,
        category: r.category || undefined,
        pkg_size: r.pkg_size ?? null,
        uom: r.uom ?? null,
        image_url: r.image_url ?? null,
        upc: r.upc || r.plu,
      }))
      .filter(l => l.qty > 0);

    if (!lines.length && !(needsYou || []).some(r => r.include)) {
      setError('Nothing checked to add. Tick the lines you want, then try again.');
      return;
    }

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
      meta?.dateHint ? `date ${formatReceiptDate(meta.dateHint) || meta.dateHint}` : null,
      meta?.amount != null ? `tape total $${meta.amount.toFixed(2)}` : null,
      meta?.vesselHint ? `boat ${meta.vesselHint}` : null,
      (needsYou || []).filter(n => !n.include).length
        ? `skipped ${(needsYou || []).filter(n => !n.include).length} unmatched PLUs`
        : null,
    ].filter(Boolean);
    if (noteBits.length && appendNotes) appendNotes(noteBits.join(' · '));

    const count = lines.length + customs.length;
    setOk(`Added ${count} line${count === 1 ? '' : 's'} to this new order. Review in the bar below is now available.`);
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
          notes: meta?.dateHint ? `Receipt date ${formatReceiptDate(meta.dateHint) || meta.dateHint}` : '',
          lines,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || 'Import failed'); return; }
      setLastImport({ id: json.order_id, number: json.order_number });
      setOk(`Saved ${json.order_number} (${json.line_count} lines) to ${ves}'s order history. No email sent. This new order is still empty — tap Add to order draft to put the same lines here.`);
    } finally {
      setBusy(false);
    }
  }

  async function undoLastImport() {
    if (!lastImport) return;
    if (!(await confirmDialog({
      title: `Remove ${lastImport.number}?`,
      message: 'Takes it off the boat’s history. No email was sent.',
      danger: true,
    }))) return;
    setBusy(true); setError('');
    try {
      const res = await adminFetch(`/api/orders/${lastImport.id}`, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json.error || 'Could not remove that import'); return; }
      setOk(`Removed ${lastImport.number} from history.`);
      setLastImport(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={matchTopRef} id="register-receipt-panel" className="rounded-2xl border border-brand-green/15 bg-white p-4 space-y-4">
      {confirmDialogEl}
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
          onChange={e => {
            const f = e.target.files?.[0] || null;
            e.target.value = '';
            void onFile(f);
          }} />
      </label>

      {busy && (
        <div className="flex items-center gap-2 text-sm text-brand-green/60">
          <Loader2 className="w-4 h-4 animate-spin" /> Parsing PLUs + matching store catalog…
        </div>
      )}
      {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
      {ok && (
        <div className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0" />
          <span className="flex-1">{ok}</span>
          {lastImport && (
            <button type="button" className="text-red-700 text-xs font-bold uppercase tracking-wide shrink-0 hover:underline disabled:opacity-40"
              disabled={busy} onClick={undoLastImport}>
              Remove it
            </button>
          )}
        </div>
      )}

      {meta && (meta.amount != null || meta.vesselHint || meta.dateHint) && (
        <div className="text-xs text-brand-green/70 bg-brand-sand/40 border border-brand-gold/20 rounded-lg px-3 py-2">
          {[
            meta.vesselHint && `Boat: ${meta.vesselHint}`,
            meta.dateHint && `Date: ${formatReceiptDate(meta.dateHint) || meta.dateHint}`,
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
        <div className="space-y-2">
          <p className="text-[11px] text-brand-green/60 leading-snug">
            <b>Add to order draft</b> puts these lines on the order you are building now (Review unlocks).
            {' '}<b>Save as past boat order</b> only writes history — it does not fill this draft.
          </p>
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
        </div>
      )}
    </div>
  );
}
