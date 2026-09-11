'use client';
// src/components/admin/PaperFormUnknowns.tsx
//
// THE MARKS NOBODY CAN READ FOR YOU.
//
// Most of a scanned form resolves itself: a printed row, a pencilled 3, a
// catalogue match by UPC. What is left over is the part a machine must not
// decide — a mark reading "Cs", a write-in for something Sinclair's stocks but
// never printed, a quantity too smudged to call, a COD scribbled in a margin.
//
// Those used to sit in the same list as everything else wearing a slightly
// warmer border, which is the same as not flagging them: a long review list
// with a few amber rows gets skimmed, and skimming is exactly the behaviour
// that puts the wrong food on a boat.
//
// So they get their own panel, above the rest, and each one carries the two
// things that actually let somebody settle it in a couple of seconds:
//
//   · WHERE IT IS — the page number, and the row drawn large enough to read,
//     with the mark itself outlined. Staff have the paper in their hand; the
//     job is to get their eye to the right line of it.
//   · WHAT TO DO — three buttons, because there are only ever three answers.
//     It is a catalogue item, it is something we will hand-write onto the
//     order, or it is a note for whoever shops it.
//
// Every one of those lands in the SAME draft the rest of the import feeds, and
// that draft is submitted through POST /api/orders like any other order. There
// is no second path out of this screen, and nothing here ever sets a quantity
// on its own — the existing confirm-before-Apply rule is untouched.

import { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, Check, ChevronDown, ChevronUp, FileText, Package,
  PencilLine, Search, SkipForward, X, ZoomIn,
} from 'lucide-react';
import type { AnyCandidate, CatalogItem } from '@/lib/paper-form-scan';
import { decisionReason } from '@/lib/paper-form-scan';

/* ── the four answers a person can give ── */
export type Resolution =
  | { kind: 'pending' }
  | { kind: 'catalog'; product: CatalogItem; qty: number }
  | { kind: 'custom'; description: string; qty: number; price: number }
  | { kind: 'note'; text: string }
  | { kind: 'skip' };

export interface UnknownRow {
  /** Stable across re-renders: `${'f'|'w'}${index}` from the parent's lists. */
  key: string;
  candidate: AnyCandidate;
  resolution: Resolution;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const digitsOnly = (s: string) => s.replace(/\D+/g, '');

export function PaperFormUnknowns({ rows, catalog, onResolve }: {
  rows: UnknownRow[];
  catalog: CatalogItem[];
  onResolve: (key: string, r: Resolution) => void;
}) {
  const [zoom, setZoom] = useState<string | null>(null);

  const outstanding = rows.filter(r => r.resolution.kind === 'pending').length;
  if (!rows.length) return null;

  return (
    <section className="rounded-xl border border-amber-300 bg-amber-50/60 overflow-hidden">
      <header className="px-4 py-3 bg-amber-100/70 border-b border-amber-200 flex items-center gap-2.5">
        <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-amber-900">
            {outstanding > 0
              ? `${outstanding} mark${outstanding === 1 ? '' : 's'} need${outstanding === 1 ? 's' : ''} you`
              : 'All marks settled'}
          </h3>
          <p className="text-xs text-amber-800/80 leading-relaxed">
            {outstanding > 0
              ? 'These could not be read with confidence. Nothing here is on the order until you say what it is.'
              : 'Every flagged mark has an answer. They are included below with the rest.'}
          </p>
        </div>
      </header>

      <div className="divide-y divide-amber-200/70">
        {rows.map(row => (
          <UnknownItem
            key={row.key}
            row={row}
            catalog={catalog}
            onResolve={onResolve}
            onZoom={setZoom}
          />
        ))}
      </div>

      {zoom && (
        <div
          role="dialog" aria-modal="true" aria-label="Scan close-up"
          className="fixed inset-0 z-50 bg-brand-navy/80 flex items-center justify-center p-4"
          onClick={() => setZoom(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom} alt="Close-up of the scanned form"
               className="max-w-full max-h-full rounded-lg shadow-2xl" />
          <button onClick={() => setZoom(null)} aria-label="Close"
                  className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/10 text-white flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </section>
  );
}

/* ───────────────────────────── one flagged mark ───────────────────────── */

function UnknownItem({ row, catalog, onResolve, onZoom }: {
  row: UnknownRow;
  catalog: CatalogItem[];
  onResolve: (key: string, r: Resolution) => void;
  onZoom: (src: string) => void;
}) {
  const c = row.candidate;
  const [open, setOpen] = useState<'catalog' | 'custom' | 'note' | null>(null);

  const pageNo = c.pageIndex + 1;
  const crop = c.contextCropDataUrl || (c.kind === 'form_row' ? c.cropDataUrl : c.cropDataUrl);
  const printed = c.kind === 'form_row'
    ? (c.layout?.description || c.match?.description || 'Row on the form')
    : (c.description || c.rawText || 'Write-in');

  const settled = row.resolution.kind !== 'pending';

  return (
    <div className={`px-4 py-3.5 ${settled ? 'bg-white/70' : ''}`}>
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${settled ? 'bg-green-500' : 'bg-amber-500'}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 flex-wrap">
            <p className="text-sm font-semibold text-brand-navy leading-snug">{printed}</p>
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700 bg-amber-100 rounded px-1.5 py-0.5">
              Page {pageNo}
            </span>
            {c.kind === 'write_in' && (
              <span className="text-[11px] font-bold uppercase tracking-wider text-brand-navy/60 bg-gray-100 rounded px-1.5 py-0.5">
                Write-in
              </span>
            )}
            {c.kind === 'write_in' && c.isCod && (
              <span className="text-[11px] font-bold uppercase tracking-wider text-purple-700 bg-purple-100 rounded px-1.5 py-0.5">
                COD{c.codName ? ` · ${c.codName}` : ''}
              </span>
            )}
          </div>
          <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">{decisionReason(c)}</p>
        </div>
      </div>

      {/* WHERE IT IS ON THE PAPER. Big enough to read at arm's length, and
          clickable for anyone who wants it bigger still. */}
      {crop && (
        <button
          type="button"
          onClick={() => onZoom(crop)}
          className="mt-3 block w-full group relative rounded-lg overflow-hidden border border-amber-200 bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={crop} alt={`Page ${pageNo} of the scan, around this mark`}
               className="w-full h-auto max-h-56 object-contain bg-white" />
          <span className="absolute bottom-1.5 right-1.5 inline-flex items-center gap-1 text-[11px]
                           bg-brand-navy/75 text-white rounded px-1.5 py-0.5 opacity-80 group-hover:opacity-100">
            <ZoomIn className="w-3 h-3" /> Bigger
          </span>
        </button>
      )}

      {settled ? (
        <ResolvedRow resolution={row.resolution} onUndo={() => { onResolve(row.key, { kind: 'pending' }); setOpen(null); }} />
      ) : (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            <ActionButton icon={Package} label="It's a catalogue item"
                          active={open === 'catalog'} onClick={() => setOpen(open === 'catalog' ? null : 'catalog')} />
            <ActionButton icon={PencilLine} label="Add as custom line"
                          active={open === 'custom'} onClick={() => setOpen(open === 'custom' ? null : 'custom')} />
            <ActionButton icon={FileText} label="Just a note"
                          active={open === 'note'} onClick={() => setOpen(open === 'note' ? null : 'note')} />
            <button
              type="button"
              onClick={() => onResolve(row.key, { kind: 'skip' })}
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg
                         text-gray-500 hover:text-gray-700 hover:bg-white border border-transparent">
              <SkipForward className="w-3.5 h-3.5" /> Ignore this mark
            </button>
          </div>

          {open === 'catalog' && (
            <CatalogPicker
              catalog={catalog}
              initialQuery={c.kind === 'write_in' ? c.description : (c.layout?.description || '')}
              initialQty={c.suggestedQty}
              onPick={(product, qty) => { onResolve(row.key, { kind: 'catalog', product, qty }); setOpen(null); }}
            />
          )}

          {open === 'custom' && (
            <CustomLineForm
              initialDescription={
                c.kind === 'write_in' ? (c.description || c.rawText) : (c.layout?.description || '')
              }
              initialQty={c.suggestedQty}
              onAdd={(description, qty, price) => {
                onResolve(row.key, { kind: 'custom', description, qty, price });
                setOpen(null);
              }}
            />
          )}

          {open === 'note' && (
            <NoteForm
              initialText={
                c.kind === 'form_row'
                  ? `${printed}: ${c.markNote || c.ocrText || 'see scan'}`.slice(0, 200)
                  : (c.rawText || printed).slice(0, 200)
              }
              onAdd={(text) => { onResolve(row.key, { kind: 'note', text }); setOpen(null); }}
            />
          )}
        </>
      )}
    </div>
  );
}

function ActionButton({ icon: Icon, label, active, onClick }: {
  icon: typeof Package; label: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button" onClick={onClick}
      className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-colors ${
        active
          ? 'bg-brand-navy text-white border-brand-navy'
          : 'bg-white text-brand-navy border-amber-200 hover:border-amber-300'
      }`}>
      <Icon className="w-3.5 h-3.5" /> {label}
      {active ? <ChevronUp className="w-3 h-3 opacity-60" /> : <ChevronDown className="w-3 h-3 opacity-40" />}
    </button>
  );
}

function ResolvedRow({ resolution, onUndo }: { resolution: Resolution; onUndo: () => void }) {
  let text = '';
  if (resolution.kind === 'catalog') text = `${resolution.qty} × ${resolution.product.description}`;
  else if (resolution.kind === 'custom') text = `${resolution.qty} × ${resolution.description} (custom line)`;
  else if (resolution.kind === 'note') text = `Note: ${resolution.text}`;
  else if (resolution.kind === 'skip') text = 'Ignored — not on the order';

  return (
    <div className="mt-3 flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-3 py-2">
      <Check className="w-4 h-4 text-green-600 shrink-0" />
      <p className="text-xs text-green-800 min-w-0 flex-1 break-words">{text}</p>
      <button type="button" onClick={onUndo}
              className="text-xs font-semibold text-green-700 hover:text-green-900 shrink-0">
        Change
      </button>
    </div>
  );
}

/* ── resolve: catalogue ── */

function CatalogPicker({ catalog, initialQuery, initialQty, onPick }: {
  catalog: CatalogItem[];
  initialQuery: string;
  initialQty: number | null;
  onPick: (product: CatalogItem, qty: number) => void;
}) {
  const [q, setQ] = useState(initialQuery || '');
  const [qty, setQty] = useState(initialQty != null ? String(initialQty) : '1');
  const qtyRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const raw = q.trim();
    if (raw.length < 2) return [];
    const d = digitsOnly(raw);
    if (d.length >= 6) {
      const byUpc = catalog.filter(i => digitsOnly(i.upc || '').replace(/^0+/, '') === d.replace(/^0+/, ''));
      if (byUpc.length) return byUpc.slice(0, 6);
    }
    const n = norm(raw);
    return catalog.filter(i => norm(i.description).includes(n)).slice(0, 6);
  }, [q, catalog]);

  const n = Number(qty.replace(/[^\d.]/g, ''));

  return (
    <div className="mt-3 rounded-lg border border-amber-200 bg-white p-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            className="input-base pl-8 text-sm py-1.5" autoFocus autoComplete="off"
            placeholder="Name or UPC from the form"
            value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <input
          ref={qtyRef} className="input-base w-16 text-center text-sm py-1.5 tabular-nums"
          inputMode="decimal" aria-label="Quantity"
          value={qty} onChange={e => setQty(e.target.value)}
          onFocus={e => e.currentTarget.select()} />
      </div>
      {/* The quantity is never taken from OCR without being shown: it is sitting
          in an editable box next to the crop it came from, and nothing is added
          until a product is chosen with that number visible. */}
      {n > 0 ? null : <p className="text-xs text-amber-700 mt-1.5">Enter a quantity to add a line.</p>}
      <div className="divide-y divide-gray-100 mt-1">
        {results.map(p => (
          <button
            key={p.id} type="button" disabled={!(n > 0)}
            onClick={() => onPick(p, n)}
            className="w-full text-left py-2 flex items-center gap-2 hover:bg-gray-50 disabled:opacity-40">
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-gray-900 truncate">{p.description}</span>
              <span className="block text-xs text-gray-400 truncate">
                {[p.pkg_size, p.upc].filter(Boolean).join(' · ')}
              </span>
            </span>
            <Check className="w-4 h-4 text-gray-300 shrink-0" />
          </button>
        ))}
        {q.trim().length >= 2 && results.length === 0 && (
          <p className="text-xs text-gray-500 py-2">
            Nothing in the catalogue matches. Use <b>Add as custom line</b> instead.
          </p>
        )}
      </div>
    </div>
  );
}

/* ── resolve: custom line ── */

function CustomLineForm({ initialDescription, initialQty, onAdd }: {
  initialDescription: string;
  initialQty: number | null;
  onAdd: (description: string, qty: number, price: number) => void;
}) {
  const [desc, setDesc] = useState((initialDescription || '').slice(0, 120));
  const [qty, setQty] = useState(initialQty != null ? String(initialQty) : '1');
  const [price, setPrice] = useState('');

  const n = Number(qty.replace(/[^\d.]/g, ''));
  const p = Number(price.replace(/[^\d.]/g, '')) || 0;
  const ok = desc.trim().length > 1 && n > 0;

  return (
    <div className="mt-3 rounded-lg border border-amber-200 bg-white p-3 space-y-2">
      <input
        className="input-base text-sm py-1.5" autoFocus
        placeholder="What is it? — as you'd write it on the order"
        value={desc} onChange={e => setDesc(e.target.value)} />
      <div className="flex gap-2">
        <input className="input-base w-20 text-center text-sm py-1.5 tabular-nums" inputMode="decimal"
               aria-label="Quantity" value={qty} onChange={e => setQty(e.target.value)}
               onFocus={e => e.currentTarget.select()} />
        <input className="input-base flex-1 text-sm py-1.5 tabular-nums" inputMode="decimal"
               aria-label="Price each, if known" placeholder="Price each — leave blank if unknown"
               value={price} onChange={e => setPrice(e.target.value)} />
      </div>
      {/* Sinclair's register is the authority on what this costs; a blank price
          here is normal and becomes a $0 line that the till corrects. Saying so
          stops people inventing a number to fill the box. */}
      <p className="text-xs text-gray-500 leading-relaxed">
        Leave the price blank if you don&rsquo;t know it — the register total at pick-up is what gets billed.
      </p>
      <button
        type="button" disabled={!ok}
        onClick={() => onAdd(desc.trim(), n, p)}
        className="btn-primary text-xs px-3 py-1.5 disabled:opacity-40">
        Add this line
      </button>
    </div>
  );
}

/* ── resolve: note ── */

function NoteForm({ initialText, onAdd }: {
  initialText: string;
  onAdd: (text: string) => void;
}) {
  const [text, setText] = useState(initialText || '');
  return (
    <div className="mt-3 rounded-lg border border-amber-200 bg-white p-3 space-y-2">
      <textarea
        className="input-base text-sm min-h-[64px]" autoFocus
        placeholder="What should the shopper know?"
        value={text} onChange={e => setText(e.target.value)} />
      <p className="text-xs text-gray-500">
        Goes onto the order notes, where the pick sheet and both emails show it.
      </p>
      <button
        type="button" disabled={!text.trim()}
        onClick={() => onAdd(text.trim().slice(0, 300))}
        className="btn-primary text-xs px-3 py-1.5 disabled:opacity-40">
        Add as a note
      </button>
    </div>
  );
}
